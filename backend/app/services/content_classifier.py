"""
Content Classifier — powered by NVIDIA NIM (Llama 3.2 11B Vision).

Fast, vision-capable classification that routes each screenshot
to the right specialized analysis chain.
"""

from __future__ import annotations

import json
import hashlib
import httpx

from ..core.config import get_settings
from ..core.redis_client import get_redis

settings = get_settings()

NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1'
CLASSIFIER_CACHE_TTL = 6 * 60 * 60  # 6 hours

ContentType = str  # 'code' | 'architecture-diagram' | 'dense-text' | etc.

CLASSIFIER_PROMPT = """You are a visual content classification expert analyzing a screenshot.

Examine the image carefully and classify it into exactly one primary content type.

Respond with ONLY valid JSON — no markdown, no explanation, no extra text:
{
  "content_type": "<type>",
  "confidence": <0.0-1.0>,
  "detected_language": "<programming language if code, spoken language if text, null otherwise>",
  "signals": ["<top 3 visual signals that determined the classification>"],
  "secondary_type": "<secondary content type if clearly present, else null>"
}

Content types (pick the MOST DOMINANT):
- "quiz"                 — ANY page with questions and answer options. MCQ, multiple choice, true/false, fill-in-blank, exam, test, assessment, analogy questions, reasoning questions, aptitude tests, competitive exam practice. If you see A/B/C/D options, radio buttons, checkboxes next to answers, or numbered questions with choices — this is ALWAYS "quiz".
- "code"                 — Source code, terminal, config files, JSON/YAML/XML
- "architecture-diagram" — System diagrams, flowcharts, sequence diagrams, ER, UML, cloud infra
- "dense-text"           — Articles, documentation, academic papers, reports, long paragraphs (NO questions with answer choices)
- "data-visualization"   — Charts, graphs, dashboards, plots, metrics, KPI displays
- "ui-design"            — App UI, wireframes, mockups, design systems, component libraries
- "mathematical"         — Math equations, proofs, formulas, scientific notation, LaTeX
- "table"                — Spreadsheets, data tables, comparison grids, structured lists
- "image"                — Photos, illustrations, icons, memes, purely visual content
- "unknown"              — Cannot determine with confidence

CRITICAL RULES:
1. If you see ANY numbered questions with answer options (A, B, C, D) or radio buttons or checkboxes next to answer choices, ALWAYS classify as "quiz" — NEVER as "dense-text" or anything else.
2. Exam sites like examveda, testbook, indiabix, geeksforgeeks practice, hackerearth assessments = "quiz".
3. Even if there is surrounding text, if the PRIMARY content shows questions with selectable answers, it is "quiz".

Be decisive. Confidence below 0.6 only for genuinely ambiguous content."""


class ContentClassifier:
    """
    Classifies visual content using NVIDIA NIM Llama 3.2 11B Vision.
    Fast, cheap, and vision-native — no Anthropic dependency.
    """

    def _image_hash(self, image_b64: str) -> str:
        return hashlib.md5(image_b64[:5000].encode()).hexdigest()

    async def classify(self, image_b64: str) -> dict:
        cache_key = f"classifier:{self._image_hash(image_b64)}"

        # Try Redis hot cache first
        try:
            redis = await get_redis()
            cached = await redis.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass  # Redis unavailable — proceed to classify

        try:
            result = await self._classify_nvidia(image_b64)
            # Store in Redis with 6h TTL
            try:
                redis = await get_redis()
                await redis.setex(cache_key, CLASSIFIER_CACHE_TTL, json.dumps(result))
            except Exception:
                pass  # Cache write failure is non-fatal
            return result
        except Exception as e:
            return {
                'content_type': 'unknown',
                'confidence': 0.0,
                'detected_language': None,
                'signals': [f'Classification error: {str(e)}'],
                'secondary_type': None,
            }

    async def _classify_nvidia(self, image_b64: str) -> dict:
        """Use NVIDIA Llama 3.2 11B Vision for fast classification."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f'{NVIDIA_BASE_URL}/chat/completions',
                headers={
                    'Authorization': f'Bearer {settings.nvidia_api_key}',
                    'Content-Type': 'application/json',
                },
                json={
                    'model': settings.nvidia_vision_fast_model,
                    'max_tokens': 300,
                    'temperature': 0.1,
                    'messages': [{
                        'role': 'user',
                        'content': [
                            {
                                'type': 'image_url',
                                'image_url': {
                                    'url': f'data:image/jpeg;base64,{image_b64}',
                                },
                            },
                            {
                                'type': 'text',
                                'text': CLASSIFIER_PROMPT,
                            },
                        ],
                    }],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            text = data['choices'][0]['message']['content'].strip()

        # Strip markdown code fences if present
        if '```json' in text:
            text = text.split('```json')[1].split('```')[0].strip()
        elif '```' in text:
            text = text.split('```')[1].split('```')[0].strip()

        parsed = json.loads(text)

        # Validate content_type
        valid_types = {
            'code', 'architecture-diagram', 'quiz', 'dense-text', 'data-visualization',
            'ui-design', 'mathematical', 'table', 'image', 'unknown',
        }
        if parsed.get('content_type') not in valid_types:
            parsed['content_type'] = 'unknown'

        return parsed


# Singleton
_classifier: ContentClassifier | None = None


def get_classifier() -> ContentClassifier:
    global _classifier
    if _classifier is None:
        _classifier = ContentClassifier()
    return _classifier
