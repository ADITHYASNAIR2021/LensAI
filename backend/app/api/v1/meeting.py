"""
Meeting Whisperer, Coding Copilot, and Quiz Solver endpoints.

All three share the same pattern: receive a screenshot (+ optional context),
stream AI analysis back via SSE.
"""

from __future__ import annotations

import base64

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter(tags=['smart-features'])


# ── Meeting Whisperer ────────────────────────────────────────────────────────

class MeetingAnalyzeRequest(BaseModel):
    transcript: str = Field(..., max_length=10_000)
    screenshot_data: str | None = None      # base64 JPEG
    meeting_context: dict = Field(default_factory=dict)

    class Config:
        populate_by_name = True


@router.post('/meeting/analyze')
async def meeting_analyze(req: MeetingAnalyzeRequest, http_request: Request):
    """Stream real-time meeting suggestions (SSE)."""
    from ...services.meeting_assistant import stream_meeting_analysis

    # Validate screenshot if provided
    if req.screenshot_data:
        try:
            raw = base64.b64decode(req.screenshot_data[:100])
            if len(req.screenshot_data) > 7_000_000:
                return {'error': 'Screenshot too large (max 5MB)'}
        except Exception:
            return {'error': 'Invalid base64 screenshot'}

    origin = http_request.headers.get('origin', '')
    return StreamingResponse(
        stream_meeting_analysis(req.transcript, req.screenshot_data, req.meeting_context),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
            **({"Access-Control-Allow-Origin": origin} if origin else {}),
        },
    )


# ── Coding Copilot ───────────────────────────────────────────────────────────

class CodingSolveRequest(BaseModel):
    screenshot_data: str                    # base64 JPEG of the problem
    platform: str = 'generic'              # leetcode, hackerrank, etc.
    preferred_language: str = 'python'

    class Config:
        populate_by_name = True


@router.post('/coding/solve')
async def coding_solve(req: CodingSolveRequest, http_request: Request):
    """Stream a coding problem solution (SSE)."""
    from ...services.meeting_assistant import stream_coding_solution

    if len(req.screenshot_data) > 7_000_000:
        return {'error': 'Screenshot too large (max 5MB)'}

    origin = http_request.headers.get('origin', '')
    return StreamingResponse(
        stream_coding_solution(req.screenshot_data, req.platform, req.preferred_language),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
            **({"Access-Control-Allow-Origin": origin} if origin else {}),
        },
    )


# ── Quiz Solver ──────────────────────────────────────────────────────────────

class QuizSolveRequest(BaseModel):
    screenshot_data: str                    # base64 JPEG of the question
    question_id: str = ''

    class Config:
        populate_by_name = True


@router.post('/quiz/solve')
async def quiz_solve(req: QuizSolveRequest, http_request: Request):
    """Stream a quiz answer (SSE)."""
    from ...services.meeting_assistant import stream_quiz_answer

    if len(req.screenshot_data) > 7_000_000:
        return {'error': 'Screenshot too large (max 5MB)'}

    origin = http_request.headers.get('origin', '')
    return StreamingResponse(
        stream_quiz_answer(req.screenshot_data),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
            **({"Access-Control-Allow-Origin": origin} if origin else {}),
        },
    )
