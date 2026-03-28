"""
AI Pipeline — NVIDIA NIM powered intelligence layer.

Model routing:
  code / code-review  → Qwen 2.5 Coder 32B   (best coding model)
  technical + math    → Nemotron Ultra 253B   (maximum reasoning depth)
  all vision tasks    → Llama 3.2 90B Vision  (screenshot understanding)
  fast / classifier   → Llama 3.2 11B Vision  (fast, still vision-capable)
  fallback            → Llama 3.3 70B         (general purpose)

Knowledge graph uses real NVIDIA NIM embeddings (nv-embedqa-e5-v5).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
import uuid
from typing import AsyncIterator, Any

import structlog

from ..core.config import get_settings
from ..core.redis_client import get_redis
from ..services.ai_providers import get_provider_router
from ..services.content_classifier import get_classifier
from ..services.nvidia_service import select_model
from ..services.prompt_chains import (
    build_prompt, build_comparison_prompt,
    ContentType, ExplanationMode,
)
from ..services.knowledge_graph import KnowledgeGraphService
from ..services.learning_paths import LearningPathService

settings = get_settings()
logger = structlog.get_logger('lensai.pipeline')


class AIPipeline:
    def __init__(self):
        self.router = get_provider_router()
        self.kg_service = KnowledgeGraphService()
        self.lp_service = LearningPathService()

    async def analyze_stream(
        self,
        image_b64: str,
        page_context: dict,
        mode: ExplanationMode,
        session_id: str,
        user_id: str | None = None,
        conversation_history: list | None = None,
        follow_up: str | None = None,
        comparison_image_b64: str | None = None,
    ) -> AsyncIterator[str]:
        start_time = time.monotonic()
        scan_id = str(uuid.uuid4())
        log = logger.bind(scan_id=scan_id, mode=mode, user_id=user_id,
                          domain=page_context.get('domain', ''))

        log.info('pipeline_analyze_start', image_bytes=len(image_b64),
                 comparison=bool(comparison_image_b64), followup=bool(follow_up))

        # ── 1. Cache check ─────────────────────────────────────────────────────
        cache_key = self._cache_key(image_b64, mode, follow_up)
        cached = await self._check_cache(cache_key)
        if cached and not follow_up:
            log.info('cache_hit', cache_key=cache_key[:16])
            yield self._sse('metadata', {'contentType': cached['content_type'], 'cached': True})
            yield self._sse('chunk', cached['explanation'])
            yield self._sse('complete', {**cached, 'id': scan_id, 'cached': True, 'latency': 50})
            return

        log.info('cache_miss', cache_key=cache_key[:16])

        # ── 2. Classify content ────────────────────────────────────────────────
        classifier = get_classifier()
        if comparison_image_b64:
            classification = {
                'content_type': 'unknown', 'confidence': 1.0,
                'detected_language': None, 'signals': ['comparison mode'],
            }
        else:
            log.info('classifier_start')
            classification = await classifier.classify(image_b64)
            log.info('classifier_done', result=classification)

        content_type: ContentType = classification.get('content_type', 'unknown')
        confidence = classification.get('confidence', 0.5)
        detected_language = classification.get('detected_language')
        signals = classification.get('signals', [])

        # ── 3. Select the best NVIDIA model for this content + mode ────────────
        has_vision = bool(image_b64)
        selected_model = select_model(
            content_type=content_type,
            mode=mode,
            has_vision=has_vision,
            fast=False,
        )

        log.info('model_selected', content_type=content_type, model=selected_model,
                 confidence=round(confidence, 2))

        reasoning_steps = self._build_reasoning_trace(
            content_type, confidence, signals, mode, selected_model
        )

        providers = self.router.available_providers()
        active_provider = providers[0] if providers else 'none'
        log.info('provider_chosen', provider=active_provider,
                 all_providers=providers)

        yield self._sse('metadata', {
            'scanId': scan_id,
            'contentType': content_type,
            'confidence': confidence,
            'detectedLanguage': detected_language,
            'reasoningTrace': reasoning_steps,
            'provider': active_provider,
            'model': selected_model,
            'cached': False,
        })

        # ── 4. Build specialized prompt ────────────────────────────────────────
        if comparison_image_b64:
            system_prompt, user_msg = build_comparison_prompt(mode, page_context)
        else:
            system_prompt, user_msg = build_prompt(
                content_type, mode, page_context, follow_up, conversation_history
            )

        messages = self._build_messages(
            image_b64, user_msg, conversation_history, comparison_image_b64
        )
        log.info('prompt_built', system_len=len(system_prompt), msgs=len(messages))

        # ── 5. Stream from the selected NVIDIA model ───────────────────────────
        # Quiz answers are short — cap tokens. Other content gets full 4096.
        max_tokens = 1024 if content_type == 'quiz' else 4096

        full_text = ''
        chunk_count = 0

        # ── Quiz two-step: vision extracts questions, reasoning model answers ──
        if content_type == 'quiz' and not follow_up and not comparison_image_b64:
            try:
                from .meeting_assistant import QUIZ_EXTRACT_PROMPT, QUIZ_REASON_PROMPT, _parse_quiz_extraction

                # Step 1: Vision model extracts text from screenshot
                log.info('quiz_step1_start', model=settings.nvidia_vision_model)
                extract_text = ''
                extract_messages = self._build_messages(image_b64, 'Extract all questions and answer options. Output JSON only.', None, None)
                async for chunk in self.router.stream(
                    QUIZ_EXTRACT_PROMPT, extract_messages,
                    requires_vision=True, max_tokens=2048,
                    model_override=settings.nvidia_vision_model,
                ):
                    extract_text += chunk

                extracted = _parse_quiz_extraction(extract_text)
                questions = extracted.get('questions', [])
                context = extracted.get('context', '')
                questions_json = json.dumps(questions, indent=2) if questions else extract_text
                log.info('quiz_step1_done', questions=len(questions))

                # Step 2: Reasoning model answers
                reasoning_model = settings.nvidia_reasoning_model
                reason_system = QUIZ_REASON_PROMPT.replace('{questions_json}', questions_json).replace('{context}', context)
                reason_messages = [{'role': 'user', 'content': f'Answer these questions correctly. Think step by step.\n\n{questions_json}'}]
                log.info('quiz_step2_start', model=reasoning_model)

                async for chunk in self.router.stream(
                    reason_system, reason_messages,
                    requires_vision=False, max_tokens=2048,
                    model_override=reasoning_model,
                ):
                    full_text += chunk
                    chunk_count += 1
                    yield self._sse('chunk', chunk)

                log.info('quiz_step2_done', chunks=chunk_count, chars=len(full_text))

            except Exception as exc:
                log.warning('quiz_twostep_failed', error=str(exc))
                # Fallback to single-step vision
                full_text = ''
                chunk_count = 0
                async for chunk in self.router.stream(
                    system_prompt, messages,
                    requires_vision=True, max_tokens=max_tokens,
                    model_override=selected_model,
                ):
                    full_text += chunk
                    chunk_count += 1
                    yield self._sse('chunk', chunk)

        # ── Normal (non-quiz) path ─────────────────────────────────────────────
        else:
            try:
                log.info('llm_stream_start', model=selected_model)
                async for chunk in self.router.stream(
                    system_prompt,
                    messages,
                    requires_vision=True,
                    fast=False,
                    max_tokens=max_tokens,
                    model_override=selected_model,
                ):
                    full_text += chunk
                    chunk_count += 1
                    yield self._sse('chunk', chunk)

                log.info('llm_stream_done', chunks=chunk_count,
                         chars=len(full_text), ms=round((time.monotonic()-start_time)*1000))

            except Exception as exc:
                log.warning('llm_primary_failed', error=str(exc), model=selected_model)
                # Fallback: fast vision model
                yield self._sse('metadata', {'fallback': True})
                fallback_model = settings.nvidia_vision_fast_model
                log.info('llm_fallback_start', model=fallback_model)
                try:
                    async for chunk in self.router.stream(
                        system_prompt, messages,
                        requires_vision=True, fast=True, max_tokens=2048,
                        model_override=fallback_model,
                    ):
                        full_text += chunk
                        chunk_count += 1
                        yield self._sse('chunk', chunk)
                    log.info('llm_fallback_done', chunks=chunk_count, chars=len(full_text))
                except Exception as err:
                    log.error('llm_fallback_failed', error=str(err))
                    yield self._sse('error', str(err))
                    return

        # ── 6. Extract structured data ─────────────────────────────────────────
        key_points = self._extract_key_points(full_text)
        code_analysis = (
            self._extract_code_analysis(full_text) if content_type == 'code' else None
        )
        diagram_analysis = (
            self._extract_diagram_analysis(full_text)
            if content_type == 'architecture-diagram' else None
        )
        data_insights = (
            self._extract_data_insights(full_text)
            if content_type == 'data-visualization' else None
        )
        translated_content = (
            self._extract_translation(full_text) if mode == 'translate' else None
        )

        # ── 7. Knowledge graph + learning paths (background, non-blocking) ─────
        related_scan_ids: list[str] = []
        learning_paths: list[dict] = []
        if user_id:
            try:
                # Run KG and learning paths concurrently
                related_scan_ids, learning_paths = await asyncio.gather(
                    self.kg_service.find_related(user_id, content_type, full_text[:500]),
                    self.lp_service.suggest(content_type, mode, full_text[:1000]),
                    return_exceptions=True,
                )
                if isinstance(related_scan_ids, Exception):
                    related_scan_ids = []
                if isinstance(learning_paths, Exception):
                    learning_paths = []

                # Add this scan to the knowledge graph (fire-and-forget)
                title = page_context.get('title', '')[:80] or content_type.replace('-', ' ').title()
                asyncio.create_task(
                    self.kg_service.add_node(
                        user_id=user_id,
                        scan_id=scan_id,
                        content_type=content_type,
                        title=title,
                        explanation=full_text[:2000],
                        domain=page_context.get('domain', ''),
                        tags=[content_type, mode] + (
                            [detected_language] if detected_language else []
                        ),
                    )
                )
            except Exception:
                pass

        # ── 8. Cache + emit complete ───────────────────────────────────────────
        latency_ms = round((time.monotonic() - start_time) * 1000)
        log.info('pipeline_complete', latency_ms=latency_ms,
                 content_type=content_type, chars=len(full_text))
        result = {
            'id': scan_id,
            'session_id': session_id,
            'content_type': content_type,
            'explanation': full_text,
            'confidence': confidence,
            'detected_language': detected_language,
            'key_points': key_points,
            'related_scan_ids': related_scan_ids,
            'suggested_learning_paths': learning_paths,
            'reasoning_trace': reasoning_steps,
            'translated_content': translated_content,
            'code_analysis': code_analysis,
            'diagram_analysis': diagram_analysis,
            'data_insights': data_insights,
            'timestamp': int(time.time() * 1000),
            'latency': latency_ms,
            'model': selected_model,
            'provider': active_provider,
            'cached': False,
        }
        await self._cache_result(cache_key, result)
        yield self._sse('complete', result)

    # ── Helpers ────────────────────────────────────────────────────────────────

    def _build_reasoning_trace(
        self,
        content_type: str,
        confidence: float,
        signals: list[str],
        mode: str,
        model: str,
    ) -> list[dict]:
        model_short = model.split('/')[-1] if '/' in model else model
        return [
            {
                'step': 1,
                'signal': f"Visual signals: {', '.join(signals[:3]) if signals else 'image analyzed'}",
                'decision': f"Classified as '{content_type}' — {round(confidence * 100)}% confidence",
                'confidence': confidence,
            },
            {
                'step': 2,
                'signal': f"Content type: {content_type} | Mode: {mode}",
                'decision': f"Selected specialized prompt chain for {content_type} + {mode}",
                'confidence': 0.95,
            },
            {
                'step': 3,
                'signal': f"Task requirements: vision={True}, mode={mode}",
                'decision': f"Routing to {model_short} — best model for this task",
                'confidence': 0.99,
            },
        ]

    def _build_messages(
        self,
        image_b64: str,
        user_msg: str,
        conversation_history: list | None,
        comparison_image_b64: str | None,
    ) -> list[dict]:
        content: list[dict] = [
            {'type': 'image', 'source': {
                'type': 'base64', 'media_type': 'image/jpeg', 'data': image_b64,
            }},
        ]
        if comparison_image_b64:
            content.append({'type': 'text', 'text': '**Image 1 above. Image 2 below:**'})
            content.append({'type': 'image', 'source': {
                'type': 'base64', 'media_type': 'image/jpeg', 'data': comparison_image_b64,
            }})
        content.append({'type': 'text', 'text': user_msg})

        messages: list[dict] = []
        if conversation_history:
            for msg in conversation_history[-10:]:
                messages.append({'role': msg['role'], 'content': msg['content']})
        messages.append({'role': 'user', 'content': content})
        return messages

    def _extract_key_points(self, text: str) -> list[str]:
        points = []
        for line in text.split('\n'):
            line = line.strip()
            if line.startswith(('- ', '* ', '• ')) and len(line) > 10:
                point = line[2:].strip()
                if len(point) > 20:
                    points.append(point)
        return points[:6]

    def _extract_code_analysis(self, text: str) -> dict | None:
        try:
            if '```json' in text:
                json_str = text.split('```json')[1].split('```')[0].strip()
                data = json.loads(json_str)
                if 'language' in data or 'complexity' in data:
                    return {
                        'language': data.get('language', 'unknown'),
                        'complexity': data.get('complexity', 'moderate'),
                        'potential_bugs': data.get('potential_bugs', []),
                        'optimizations': data.get('optimizations', []),
                        'dependencies': data.get('dependencies', []),
                        'execution_preview': data.get('execution_preview'),
                    }
        except Exception:
            pass
        return None

    def _extract_diagram_analysis(self, text: str) -> dict | None:
        try:
            if '```json' in text:
                json_str = text.split('```json')[1].split('```')[0].strip()
                data = json.loads(json_str)
                if 'diagram_type' in data or 'components' in data:
                    return data
        except Exception:
            pass
        return None

    def _extract_data_insights(self, text: str) -> list[dict] | None:
        try:
            if '```json' in text:
                json_str = text.split('```json')[1].split('```')[0].strip()
                data = json.loads(json_str)
                if 'insights' in data:
                    return data['insights']
        except Exception:
            pass
        return None

    def _extract_translation(self, text: str) -> str | None:
        if 'Translation:' in text:
            return text.split('Translation:')[-1].strip()[:500]
        return None

    def _cache_key(self, image_b64: str, mode: str, follow_up: str | None) -> str:
        content = image_b64[:8000] + mode + (follow_up or '')
        return f'lensai:analysis:{hashlib.sha256(content.encode()).hexdigest()[:32]}'

    async def _check_cache(self, key: str) -> dict | None:
        try:
            redis = await get_redis()
            value = await redis.get(key)
            if value:
                return json.loads(value)
        except Exception:
            pass
        return None

    async def _cache_result(self, key: str, result: dict) -> None:
        try:
            redis = await get_redis()
            cacheable = {
                'content_type': result['content_type'],
                'explanation': result['explanation'],
                'key_points': result['key_points'],
                'confidence': result['confidence'],
                'model': result.get('model', 'unknown'),
                'provider': result.get('provider', 'unknown'),
            }
            await redis.setex(key, settings.redis_ttl, json.dumps(cacheable))
        except Exception:
            pass

    @staticmethod
    def _sse(event_type: str, data: Any) -> str:
        if event_type == 'chunk':
            payload = json.dumps({'type': 'chunk', 'content': str(data)})
        elif event_type == 'metadata':
            payload = json.dumps({'type': 'metadata', 'metadata': data})
        elif event_type == 'complete':
            payload = json.dumps({'type': 'complete', 'result': data})
        else:
            payload = json.dumps({'type': 'error', 'error': str(data)})
        return f'data: {payload}\n\n'


_pipeline: AIPipeline | None = None


def get_pipeline() -> AIPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = AIPipeline()
    return _pipeline
