"""
NVIDIA NIM AI client — sole processing provider.

Six specialised models cover every content type:
  Vision      → Llama 3.2 90B Vision  (screenshots, images)
  Code        → Qwen 2.5 Coder 32B   (code review, generation)
  Reasoning   → DeepSeek R1 Qwen 32B  (math, dense text, architecture)
  General     → Llama 3.3 70B         (fallback, dense text)
  Fast        → Llama 3.2 11B Vision  (classifier, quick answers)
  Embeddings  → NV-EmbedQA E5 V5     (knowledge graph)
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import AsyncIterator

import httpx
import structlog

from ..core.config import get_settings

settings = get_settings()
logger = structlog.get_logger('lensai.providers')


# ── Circuit Breaker ───────────────────────────────────────────────────────────

_CIRCUIT_FAILURE_THRESHOLD = 5    # failures before opening
_CIRCUIT_RESET_TIMEOUT     = 30.0  # seconds before half-open


class _CircuitState:
    """Simple per-model in-process circuit breaker."""
    def __init__(self) -> None:
        self.failures: int = 0
        self.opened_at: float = 0.0
        self.open: bool = False
        self._lock = asyncio.Lock()

    async def record_success(self) -> None:
        async with self._lock:
            self.failures = 0
            self.open = False

    async def record_failure(self) -> None:
        async with self._lock:
            self.failures += 1
            if self.failures >= _CIRCUIT_FAILURE_THRESHOLD:
                self.open = True
                self.opened_at = time.monotonic()

    def is_open(self) -> bool:
        if not self.open:
            return False
        if time.monotonic() - self.opened_at > _CIRCUIT_RESET_TIMEOUT:
            self.open = False
            self.failures = 0
            return False
        return True


_circuit_states: dict[str, _CircuitState] = {}


def _get_circuit(model: str) -> _CircuitState:
    if model not in _circuit_states:
        _circuit_states[model] = _CircuitState()
    return _circuit_states[model]


NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1'

_nvidia_client: httpx.AsyncClient | None = None


def _get_nvidia_client() -> httpx.AsyncClient:
    global _nvidia_client
    if _nvidia_client is None or _nvidia_client.is_closed:
        _nvidia_client = httpx.AsyncClient(
            base_url=NVIDIA_BASE_URL,
            timeout=httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=5.0),
            limits=httpx.Limits(
                max_connections=200,
                max_keepalive_connections=50,
                keepalive_expiry=30.0,
            ),
        )
    return _nvidia_client


async def close_nvidia_client() -> None:
    """Call on application shutdown to cleanly close the connection pool."""
    global _nvidia_client
    if _nvidia_client and not _nvidia_client.is_closed:
        await _nvidia_client.aclose()
        _nvidia_client = None


async def stream_nvidia(
    system: str,
    messages: list[dict],
    model: str,
    max_tokens: int = 4096,
    temperature: float = 0.3,
) -> AsyncIterator[str]:
    """Stream text chunks from NVIDIA NIM (OpenAI-compatible SSE, vision-capable)."""
    oai_messages = _to_openai_messages(system, messages)
    headers = {
        'Authorization': f'Bearer {settings.nvidia_api_key}',
        'Content-Type': 'application/json',
    }
    payload = {
        'model': model,
        'messages': oai_messages,
        'max_tokens': max_tokens,
        'stream': True,
        'temperature': temperature,
    }

    if 'qwen3' in model or 'qwen2' in model or 'qwq' in model:
        payload['chat_template_kwargs'] = {"enable_thinking": True}
    elif 'deepseek' in model:
        payload['chat_template_kwargs'] = {"thinking": True}

    circuit = _get_circuit(model)
    client = _get_nvidia_client()

    try:
        async with client.stream('POST', '/chat/completions',headers=headers, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith('data: '):
                    continue
                raw = line[6:]
                if raw == '[DONE]':
                    break
                try:
                    data = json.loads(raw)
                    delta = data['choices'][0].get('delta', {})
                    reasoning_content = delta.get('reasoning_content')
                    if reasoning_content:
                        yield reasoning_content
                    content = delta.get('content')
                    if content:
                        yield content
                except Exception:
                    continue
        await circuit.record_success()
    except Exception as exc:
        await circuit.record_failure()
        raise exc


async def embed_nvidia(texts: list[str]) -> list[list[float]]:
    """Get embeddings from NVIDIA NV-EmbedQA E5 V5 (1024-dim)."""
    headers = {
        'Authorization': f'Bearer {settings.nvidia_api_key}',
        'Content-Type': 'application/json',
    }
    payload = {
        'input': texts,
        'model': settings.nvidia_embed_model,
        'encoding_format': 'float',
        'input_type': 'query',
        'truncate': 'END',
    }
    client = _get_nvidia_client()
    resp = await client.post('/embeddings', headers=headers, json=payload)
    resp.raise_for_status()
    data = resp.json()
    return [item['embedding'] for item in data['data']]


# ── Provider Router ───────────────────────────────────────────────────────────


class ProviderRouter:
    """
    Routes all analysis requests through NVIDIA NIM.

    Model selection is delegated to the pipeline / select_model() helper.
    The router handles circuit breaking, retries with the fast fallback model,
    and structured error reporting.
    """

    def available_providers(self) -> list[str]:
        return settings.available_providers()

    async def stream(
        self,
        system: str,
        messages: list[dict],
        *,
        requires_vision: bool = False,
        fast: bool = False,
        max_tokens: int = 4096,
        model_override: str | None = None,
    ) -> AsyncIterator[str]:
        """
        Stream from the best NVIDIA model for the task.

        model_override: use this specific NVIDIA model (bypass auto-selection).
        fast: use the fast vision model (Llama 3.2 11B) instead of the primary.
        """
        if not settings.nvidia_api_key:
            raise RuntimeError(
                'NVIDIA_API_KEY is not set. Add it to backend/.env — '
                'get your key at https://build.nvidia.com'
            )

        if model_override:
            model = model_override
        elif fast:
            model = settings.nvidia_vision_fast_model
        else:
            has_images = _messages_have_images(messages)
            model = settings.nvidia_vision_model if has_images else settings.nvidia_primary_model

        circuit = _get_circuit(model)
        if circuit.is_open():
            # Circuit open on primary — gracefully fall back to alternative
            fallbacks = {
                settings.nvidia_code_model: settings.nvidia_code_fallback,
                settings.nvidia_ultra_model: settings.nvidia_ultra_fallback,
                settings.nvidia_reasoning_model: settings.nvidia_reasoning_fallback,
                settings.nvidia_primary_model: settings.nvidia_fast_model,
                settings.nvidia_vision_model: settings.nvidia_vision_fast_model,
            }
            fallback = fallbacks.get(model, settings.nvidia_vision_fast_model)
            logger.warning('circuit_open_using_fallback', primary=model, fallback=fallback)
            model = fallback

        t0 = time.monotonic()
        chunk_count = 0
        logger.info('nvidia_stream_start', model=model, max_tokens=max_tokens, fast=fast)

        try:
            async for chunk in stream_nvidia(system, messages, model, max_tokens):
                chunk_count += 1
                yield chunk
            logger.info('nvidia_stream_done', model=model, chunks=chunk_count,
                        ms=round((time.monotonic() - t0) * 1000))
        except Exception as exc:
            logger.error('nvidia_stream_failed', model=model, error=str(exc))
            raise RuntimeError(
                f'NVIDIA NIM streaming failed (model={model}): {exc}. '
                'Check your NVIDIA_API_KEY and network connectivity.'
            ) from exc

    async def classify(self, system: str, messages: list[dict]) -> str:
        """Non-streaming classification call — uses fast vision model."""
        full_text = ''
        async for chunk in self.stream(
            system, messages,
            requires_vision=True, fast=True, max_tokens=512,
            model_override=settings.nvidia_vision_fast_model,
        ):
            full_text += chunk
        return full_text


# ── Helpers ───────────────────────────────────────────────────────────────────

def _messages_have_images(messages: list[dict]) -> bool:
    return any(
        isinstance(m.get('content'), list) and
        any(p.get('type') == 'image' for p in m['content'] if isinstance(p, dict))
        for m in messages
    )


def _to_openai_messages(system: str, messages: list[dict]) -> list[dict]:
    """Convert internal message format to OpenAI-compatible chat format for NVIDIA NIM."""
    result: list[dict] = [{'role': 'system', 'content': system}]
    for msg in messages:
        role = msg.get('role', 'user')
        content = msg.get('content', '')
        if isinstance(content, list):
            parts: list[dict] = []
            for p in content:
                if not isinstance(p, dict):
                    continue
                if p.get('type') == 'text':
                    parts.append({'type': 'text', 'text': p.get('text', '')})
                elif p.get('type') == 'image':
                    src = p.get('source', {})
                    if src.get('type') == 'base64':
                        parts.append({
                            'type': 'image_url',
                            'image_url': {
                                'url': f"data:{src.get('media_type', 'image/jpeg')};base64,{src.get('data', '')}",
                                'detail': 'high',
                            },
                        })
            result.append({'role': role, 'content': parts if parts else ''})
        else:
            result.append({'role': role, 'content': str(content)})
    return result


# ── Singleton ─────────────────────────────────────────────────────────────────

_router: ProviderRouter | None = None


def get_provider_router() -> ProviderRouter:
    global _router
    if _router is None:
        _router = ProviderRouter()
    return _router
