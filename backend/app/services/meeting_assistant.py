"""
Meeting Whisperer — AI-powered real-time meeting assistant.

Takes a transcript + screenshot and generates:
  - Smart response suggestions
  - Questions to ask (to sound brilliant)
  - Key insights from slides / shared screen
  - Action items
  - Warnings (e.g. you're being asked something, someone disagrees)

Uses NVIDIA NIM Vision model to understand both audio context (transcript)
and visual context (screenshot of the meeting / shared screen).
"""

from __future__ import annotations

import json
import time
from typing import AsyncIterator, Any

import structlog

from ..core.config import get_settings
from ..services.ai_providers import get_provider_router

settings = get_settings()
logger = structlog.get_logger('lensai.meeting')


MEETING_SYSTEM_PROMPT = """You are an elite meeting assistant embedded in a Chrome extension.
You receive the live meeting transcript (from microphone) and a screenshot of the current
meeting tab (which shows shared screens, slides, or video feeds).

Your job is to SILENTLY help the user dominate the meeting. Output ONLY valid JSON — one
object per suggestion. Each object must have these fields:
  - "type": one of "response", "question", "insight", "action-item", "warning", "fact-check"
  - "content": the actual suggestion (1-3 sentences, ready to say or note down)
  - "context": what triggered this suggestion (brief)
  - "confidence": 0.0-1.0

Generate 2-5 suggestions per analysis. Focus on:
1. If someone asked a question → suggest a smart answer ("response")
2. If slides show data/claims → suggest a probing question ("question")
3. If important info is on screen → summarize the key point ("insight")
4. If a commitment or deadline is mentioned → capture it ("action-item")
5. If the user is being put on the spot or there's tension → warn them ("warning")

Output a JSON array of suggestion objects. Nothing else — no markdown, no preamble.
Previous suggestions (avoid repeating): {previous_suggestions}"""


CODING_SOLVE_PROMPT = """You are an elite competitive programming coach. You are looking at a screenshot of a coding problem from {platform}.

Read the problem from the screenshot carefully. Output ONLY valid JSON — no markdown, no explanation outside JSON.

Respond with this exact JSON structure:
{{
  "problem_title": "short title of the problem",
  "approach": "1-3 sentence explanation of the optimal approach",
  "solution": "complete, runnable {language} code — the EXACT function signature the platform expects. No example usage, no main(), just the solution function/class.",
  "time_complexity": "O(...)",
  "space_complexity": "O(...)",
  "explanation_steps": ["step 1...", "step 2...", "step 3..."],
  "edge_cases": ["edge case 1...", "edge case 2..."]
}}

CRITICAL RULES:
- The "solution" field must contain ONLY the solution code, nothing else
- Use the EXACT function signature shown in the problem (e.g. def twoSum(self, nums, target) for LeetCode)
- Match the platform's expected class/function format ({platform})
- The code must be correct, optimal, and ready to submit
- Keep explanation_steps to 3-5 items max
- Output raw JSON only — no ```json fences, no extra text
- **TEMPLATE RULE**: If the screenshot shows a pre-filled code template, boilerplate, or starter code (e.g. a class skeleton, function stubs, or import statements), you MUST use that EXACT template as the foundation. Fill in the solution WITHIN the given template structure — do NOT rewrite it from scratch or strip out the template. Preserve the class name, method signatures, and any existing code exactly as shown."""


QUIZ_EXTRACT_PROMPT = """You are a precise text extractor. Look at this screenshot of a quiz/exam/test page.

Extract ALL questions and their answer options EXACTLY as written. Output JSON only:
{
  "questions": [
    {
      "number": 1,
      "question": "exact question text",
      "options": {"A": "option text", "B": "option text", "C": "option text", "D": "option text"},
      "type": "mcq" or "true_false" or "short_answer" or "fill_blank"
    }
  ],
  "context": "any surrounding context (subject, topic, instructions)"
}

RULES:
- Copy text EXACTLY — do not paraphrase or summarize
- Include ALL visible questions, not just the first one
- For MCQs, map options to A/B/C/D letters
- If options use 1/2/3/4, map them to A/B/C/D
- Output raw JSON only — no markdown fences"""


QUIZ_REASON_PROMPT = """You are an expert quiz solver. Answer every question correctly and concisely.

Here are the extracted questions:
{questions_json}

Context: {context}

For EACH question, respond with:
- The correct answer (letter + text for MCQs)
- ONE sentence explaining why

Output JSON only:
{{
  "answers": [
    {{
      "number": 1,
      "answer": "B) thermometer",
      "explanation": "A thermometer measures temperature, which is the direct answer to the question.",
      "confidence": 0.95
    }}
  ]
}}

CRITICAL RULES:
- Think step by step before answering. For analogy questions, identify the relationship pattern first.
- For "X is to Y as Z is to ?" — find what X does for Y, then find what does that for Z.
- NEVER guess — reason through each option carefully.
- Output raw JSON only."""


async def stream_meeting_analysis(
    transcript: str,
    screenshot_b64: str | None,
    meeting_context: dict,
) -> AsyncIterator[str]:
    """
    Analyze meeting context and stream back suggestions as SSE events.

    Each event is a JSON line: {"type": "suggestion", "suggestion_type": "...", "content": "..."}
    """
    router = get_provider_router()
    start = time.monotonic()

    previous = ', '.join(meeting_context.get('previous_suggestions', [])[-5:]) or 'none'
    system = MEETING_SYSTEM_PROMPT.replace('{previous_suggestions}', previous)

    # Build message with both transcript and screenshot
    content: list[dict] = []
    if screenshot_b64:
        content.append({
            'type': 'image',
            'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': screenshot_b64},
        })
    content.append({
        'type': 'text',
        'text': (
            f"Meeting duration: {meeting_context.get('duration', 0)}s | "
            f"Platform: {meeting_context.get('platform', 'generic')}\n\n"
            f"--- LIVE TRANSCRIPT (last ~2 min) ---\n{transcript}\n---\n\n"
            "Analyze the transcript and screenshot. Generate suggestions as a JSON array."
        ),
    })

    messages = [{'role': 'user', 'content': content}]

    full_text = ''
    try:
        async for chunk in router.stream(
            system, messages,
            requires_vision=bool(screenshot_b64),
            max_tokens=2048,
            model_override=settings.nvidia_vision_model,
        ):
            full_text += chunk

        # Parse the JSON array of suggestions
        suggestions = _parse_suggestions(full_text)

        for s in suggestions:
            event = {
                'type': 'suggestion' if s.get('type') != 'action-item' else 'action_item',
                'suggestion_type': s.get('type', 'insight'),
                'content': s.get('content', ''),
                'context': s.get('context', ''),
                'confidence': s.get('confidence', 0.8),
            }
            yield f"data: {json.dumps(event)}\n\n"

        ms = round((time.monotonic() - start) * 1000)
        logger.info('meeting_analysis_done', suggestions=len(suggestions), ms=ms)
        yield f"data: {json.dumps({'type': 'complete', 'count': len(suggestions)})}\n\n"

    except Exception as exc:
        logger.error('meeting_analysis_failed', error=str(exc))
        yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"


async def stream_coding_solution(
    screenshot_b64: str,
    platform: str,
    preferred_language: str,
) -> AsyncIterator[str]:
    """Analyze a coding problem screenshot and stream the solution."""
    router = get_provider_router()
    start = time.monotonic()

    system = CODING_SOLVE_PROMPT.replace('{platform}', platform).replace('{language}', preferred_language)

    messages = [{'role': 'user', 'content': [
        {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': screenshot_b64}},
        {'type': 'text', 'text': f'Solve this coding problem. Use {preferred_language}. Output JSON only.'},
    ]}]

    # Send a "thinking" event immediately so the UI shows progress
    yield f"data: {json.dumps({'type': 'status', 'status': 'reading_problem'})}\n\n"

    full_text = ''
    try:
        # Must use a vision model — the code model (Qwen Coder) can't process images.
        async for chunk in router.stream(
            system, messages,
            requires_vision=True,
            max_tokens=4096,
            model_override=settings.nvidia_vision_model,
        ):
            full_text += chunk

        # Parse the structured JSON response
        result = _parse_coding_json(full_text, preferred_language)
        ms = round((time.monotonic() - start) * 1000)
        result['latency_ms'] = ms
        result['model'] = settings.nvidia_vision_model
        logger.info('coding_solve_done', ms=ms, platform=platform, lang=preferred_language)
        yield f"data: {json.dumps({'type': 'complete', 'result': result})}\n\n"

    except Exception as exc:
        logger.error('coding_solve_failed', error=str(exc))
        yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"


async def stream_quiz_answer(screenshot_b64: str) -> AsyncIterator[str]:
    """
    Two-step quiz pipeline:
      Step 1: Vision model (Llama 3.2 90B) extracts question text from screenshot
      Step 2: Reasoning model (QwQ-32B / DeepSeek V3.2) answers the questions accurately
    """
    router = get_provider_router()
    start = time.monotonic()

    # ── Step 1: Vision extraction ──────────────────────────────────────────────
    yield f"data: {json.dumps({'type': 'status', 'status': 'extracting_questions'})}\n\n"

    vision_messages = [{'role': 'user', 'content': [
        {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg', 'data': screenshot_b64}},
        {'type': 'text', 'text': 'Extract all questions and answer options from this screenshot. Output JSON only.'},
    ]}]

    extracted_text = ''
    try:
        async for chunk in router.stream(
            QUIZ_EXTRACT_PROMPT, vision_messages,
            requires_vision=True,
            max_tokens=2048,
            model_override=settings.nvidia_vision_model,
        ):
            extracted_text += chunk

        logger.info('quiz_step1_done', extracted_len=len(extracted_text))

        # Parse extraction result
        extracted = _parse_quiz_extraction(extracted_text)
        questions = extracted.get('questions', [])
        context = extracted.get('context', '')

        if not questions:
            # Fallback: couldn't parse structure, send raw text to reasoning model
            questions_json = extracted_text
        else:
            questions_json = json.dumps(questions, indent=2)

    except Exception as exc:
        logger.error('quiz_extract_failed', error=str(exc))
        yield f"data: {json.dumps({'type': 'error', 'error': f'Failed to read questions: {exc}'})}\n\n"
        return

    # ── Step 2: Reasoning model answers ────────────────────────────────────────
    yield f"data: {json.dumps({'type': 'status', 'status': 'solving'})}\n\n"

    reason_system = QUIZ_REASON_PROMPT.replace('{questions_json}', questions_json).replace('{context}', context)

    reason_messages = [{'role': 'user', 'content': (
        f"Answer these questions correctly. Think step by step.\n\n{questions_json}"
    )}]

    answer_text = ''
    try:
        # Use reasoning model — much better at logic/analogy than vision model
        reasoning_model = settings.nvidia_reasoning_model  # qwen/qwq-32b
        async for chunk in router.stream(
            reason_system, reason_messages,
            requires_vision=False,
            max_tokens=2048,
            model_override=reasoning_model,
        ):
            answer_text += chunk

        result = _parse_quiz_answer(answer_text)
        ms = round((time.monotonic() - start) * 1000)
        result['latency_ms'] = ms
        result['pipeline'] = 'two-step'
        result['extraction_model'] = settings.nvidia_vision_model
        result['reasoning_model'] = reasoning_model
        logger.info('quiz_step2_done', ms=ms, answers=len(result.get('answers', [])))
        yield f"data: {json.dumps({'type': 'complete', 'result': result})}\n\n"

    except Exception as exc:
        logger.error('quiz_reason_failed', error=str(exc))
        yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"


# ── Parsers ──────────────────────────────────────────────────────────────────

def _parse_suggestions(text: str) -> list[dict]:
    """Extract JSON array of suggestions from LLM output."""
    # Try direct JSON parse
    text = text.strip()
    if text.startswith('['):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

    # Try extracting JSON from markdown code block
    if '```' in text:
        try:
            json_str = text.split('```')[1]
            if json_str.startswith('json'):
                json_str = json_str[4:]
            return json.loads(json_str.strip())
        except (json.JSONDecodeError, IndexError):
            pass

    # Fallback: wrap the whole thing as a single insight
    return [{'type': 'insight', 'content': text[:500], 'context': 'raw response', 'confidence': 0.5}]


def _parse_coding_json(text: str, language: str) -> dict:
    """Parse structured JSON from the coding LLM response."""
    import re

    text = text.strip()

    # Strip markdown code fences if the model wrapped it
    if '```json' in text:
        text = text.split('```json')[1].split('```')[0].strip()
    elif '```' in text:
        text = text.split('```')[1].split('```')[0].strip()

    # Try direct JSON parse
    try:
        if '{' in text:
            # Find the JSON object boundaries
            start = text.index('{')
            depth = 0
            end = start
            for i in range(start, len(text)):
                if text[i] == '{': depth += 1
                elif text[i] == '}': depth -= 1
                if depth == 0:
                    end = i + 1
                    break
            parsed = json.loads(text[start:end])
            return {
                'problem_title': parsed.get('problem_title', ''),
                'approach': parsed.get('approach', ''),
                'solution': parsed.get('solution', ''),
                'language': language,
                'complexity': {
                    'time': parsed.get('time_complexity', 'unknown'),
                    'space': parsed.get('space_complexity', 'unknown'),
                },
                'explanation_steps': parsed.get('explanation_steps', []),
                'edge_cases': parsed.get('edge_cases', []),
            }
    except (json.JSONDecodeError, ValueError):
        pass

    # Fallback: parse markdown-style response
    result: dict[str, Any] = {'approach': '', 'language': language, 'solution': ''}

    code_match = re.search(r'```(?:\w+)?\n([\s\S]*?)```', text)
    if code_match:
        result['solution'] = code_match.group(1).strip()

    time_match = re.search(r'[Tt]ime\s*[Cc]omplexity[:\s]*(O\([^)]+\))', text)
    space_match = re.search(r'[Ss]pace\s*[Cc]omplexity[:\s]*(O\([^)]+\))', text)
    result['complexity'] = {
        'time': time_match.group(1) if time_match else 'unknown',
        'space': space_match.group(1) if space_match else 'unknown',
    }

    # Extract approach (text before first code block)
    if code_match:
        result['approach'] = text[:code_match.start()].strip().replace('## Approach', '').strip()
    else:
        result['approach'] = text[:300]

    edge_cases = re.findall(r'[-*]\s+(.+?)(?:\n|$)', text.split('Edge Case')[-1] if 'Edge Case' in text else '')
    result['edge_cases'] = edge_cases[:5]
    result['explanation_steps'] = []
    result['problem_title'] = ''

    return result


def _parse_quiz_extraction(text: str) -> dict:
    """Parse the vision model's question extraction output."""
    text = text.strip()

    # Strip markdown fences
    if '```json' in text:
        text = text.split('```json')[1].split('```')[0].strip()
    elif '```' in text:
        text = text.split('```')[1].split('```')[0].strip()

    try:
        if '{' in text:
            json_str = text[text.index('{'):text.rindex('}') + 1]
            return json.loads(json_str)
    except (json.JSONDecodeError, ValueError):
        pass

    # Fallback: return raw text as context so reasoning model can still work
    return {'questions': [], 'context': text[:2000]}


def _parse_quiz_answer(text: str) -> dict:
    """Extract answer(s) from the reasoning model's quiz response."""
    text = text.strip()

    # Strip markdown fences
    if '```json' in text:
        text = text.split('```json')[1].split('```')[0].strip()
    elif '```' in text:
        text = text.split('```')[1].split('```')[0].strip()

    try:
        if '{' in text:
            json_str = text[text.index('{'):text.rindex('}') + 1]
            parsed = json.loads(json_str)
            # Handle new multi-answer format
            if 'answers' in parsed:
                return parsed
            # Handle old single-answer format
            return {'answers': [parsed]}
    except (json.JSONDecodeError, ValueError):
        pass

    return {'answers': [{'answer': text[:300], 'explanation': text, 'confidence': 0.5}]}
