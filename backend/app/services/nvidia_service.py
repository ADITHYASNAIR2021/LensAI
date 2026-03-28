"""
NVIDIA NIM Specialized Services.

Provides:
- Real semantic embeddings (nv-embedqa-e5-v5) for the knowledge graph
- Cosine similarity over dense vectors
- Helper to pick the best NVIDIA model per task
"""

from __future__ import annotations

import math
import httpx

from ..core.config import get_settings

settings = get_settings()
NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1'


# ── Embeddings ────────────────────────────────────────────────────────────────

async def get_embedding(text: str, input_type: str = 'passage') -> list[float]:
    """
    Get a semantic embedding vector from NVIDIA NIM.

    input_type: 'passage' when indexing, 'query' when searching.
    Returns a normalized float vector (1024-dim for nv-embedqa-e5-v5).
    """
    text = text[:2000].strip()
    if not text:
        return []

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f'{NVIDIA_BASE_URL}/embeddings',
            headers={
                'Authorization': f'Bearer {settings.nvidia_api_key}',
                'Content-Type': 'application/json',
            },
            json={
                'input': text,
                'model': settings.nvidia_embed_model,
                'input_type': input_type,
                'encoding_format': 'float',
                'truncate': 'END',
            },
        )
        resp.raise_for_status()
        data = resp.json()
        vec = data['data'][0]['embedding']
        return _l2_normalize(vec)


def _l2_normalize(vec: list[float]) -> list[float]:
    """Normalize a vector to unit length so dot-product == cosine similarity."""
    magnitude = math.sqrt(sum(v * v for v in vec))
    if magnitude == 0:
        return vec
    return [v / magnitude for v in vec]


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """
    Fast cosine similarity for dense float vectors.
    Assumes both vectors are already L2-normalized (dot product = cosine sim).
    """
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    return max(0.0, min(1.0, sum(a * b for a, b in zip(vec_a, vec_b))))


# ── Model Selector ────────────────────────────────────────────────────────────

def select_model(
    content_type: str,
    mode: str,
    has_vision: bool = True,
    fast: bool = False,
) -> str:
    """
    Return the best NVIDIA NIM model for a given analysis task.

    12-model routing with task-based selection:
    1. Code content / code-review mode  → Qwen3 Coder 480B (fallback: Qwen3.5 397B)
    2. Mathematical / deep reasoning    → DeepSeek V3.2 (fallback: Qwen3.5 397B)
    3. Technical + dense/architecture   → QwQ-32B reasoning (fallback: DeepSeek V3.1)
    4. Quiz / exam questions            → Vision model (needs to see the options)
    5. Vision content (images/UI/data)  → Llama 3.2 90B Vision (fast: 11B)
    6. Fast flag                        → Mistral Nemotron
    7. Default                          → Llama 3.3 70B
    """
    is_code = content_type == 'code' or mode == 'code-review'
    is_math = content_type == 'mathematical'
    is_deep_reasoning = mode == 'technical' and content_type in (
        'dense-text', 'architecture-diagram',
    )
    is_vision_content = content_type in (
        'ui-design', 'data-visualization', 'image', 'table', 'quiz',
    )

    # Code analysis — strongest coding model
    if is_code:
        return settings.nvidia_code_model

    # Math / deep reasoning — thinking-capable model
    if is_math:
        return settings.nvidia_ultra_model

    # Technical deep dives on text/architecture — reasoning chain model
    if is_deep_reasoning:
        return settings.nvidia_reasoning_model

    # Vision-required content types — must use vision model
    if has_vision and is_vision_content:
        if fast:
            return settings.nvidia_vision_fast_model
        return settings.nvidia_vision_model

    # Generic vision (screenshots with text) — vision model
    if has_vision:
        if fast:
            return settings.nvidia_vision_fast_model
        return settings.nvidia_vision_model

    # Text-only fast mode
    if fast:
        return settings.nvidia_fast_model

    # Default general purpose
    return settings.nvidia_primary_model
