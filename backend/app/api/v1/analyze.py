"""
/api/v1/analyze — Core analysis endpoint with SSE streaming.

Accepts camelCase JSON from the Chrome extension (alias_generator=to_camel)
and snake_case from Swagger/curl (populate_by_name=True).
"""

import asyncio
import base64
import structlog
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.auth import get_current_user, CurrentUser
from ...core.config import get_settings
from ...core.redis_client import get_redis
from ...core.database import get_db_optional
from ...services.ai_pipeline import get_pipeline
from ...services.user_service import resolve_tier, check_scan_limit, increment_scan_count

router = APIRouter()
settings = get_settings()
logger = structlog.get_logger('lensai.analyze')


# ── Pydantic models — accept both camelCase (extension) & snake_case (Swagger) ─

class _CamelModel(BaseModel):
    """Base model that accepts camelCase input from the Chrome extension."""
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,   # also accept snake_case field names
    )


class SelectionRect(_CamelModel):
    x: float
    y: float
    width: float
    height: float
    device_pixel_ratio: float = 1.0
    scroll_x: float = 0.0
    scroll_y: float = 0.0


class PageContext(_CamelModel):
    url: str = ''
    title: str = ''
    domain: str = ''
    breadcrumbs: list[str] = []
    surrounding_text: str = ''
    page_language: str = 'en'
    meta_description: str = ''


class ConversationMessage(_CamelModel):
    role: str   # 'user' | 'assistant'
    content: str
    timestamp: int = 0


class AnalyzeRequest(_CamelModel):
    image_data: str = Field(..., description='Base64-encoded JPEG image')
    selection: SelectionRect
    page_context: PageContext
    mode: str = 'technical'
    session_id: str = ''
    comparison_image_data: Optional[str] = None
    follow_up_question: Optional[str] = None
    conversation_history: list[ConversationMessage] = []

    @field_validator('image_data')
    @classmethod
    def validate_image(cls, v: str) -> str:
        try:
            # Strip data-URI prefix if the extension sends it
            if v.startswith('data:'):
                v = v.split(',', 1)[1]
            decoded = base64.b64decode(v)
            if len(decoded) > settings.max_image_size_bytes:
                raise ValueError(f'Image too large ({len(decoded)} bytes, max {settings.max_image_size_bytes})')
        except ValueError:
            raise
        except Exception as e:
            raise ValueError(f'Invalid base64 image data: {e}')
        return v

    @field_validator('mode')
    @classmethod
    def validate_mode(cls, v: str) -> str:
        valid = {'eli5', 'technical', 'summary', 'code-review', 'translate'}
        if v not in valid:
            raise ValueError(f'mode must be one of {valid}, got "{v}"')
        return v


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post('')
async def analyze(
    request: AnalyzeRequest,
    http_request: Request,
    user: Optional[CurrentUser] = Depends(get_current_user),
    db: Optional[AsyncSession] = Depends(get_db_optional),
):
    """
    Stream AI analysis of a selected screen region.
    Returns Server-Sent Events (SSE).

    Accepts camelCase (Chrome extension) or snake_case (API clients).
    """
    client_ip = http_request.client.host if http_request.client else 'unknown'
    origin = http_request.headers.get('origin', 'no-origin')
    user_id = user.user_id if user else None

    log = logger.bind(
        user_id=user_id,
        mode=request.mode,
        session_id=request.session_id or '(none)',
        image_bytes=len(base64.b64decode(request.image_data)),
        has_comparison=bool(request.comparison_image_data),
        has_followup=bool(request.follow_up_question),
        history_len=len(request.conversation_history),
        domain=request.page_context.domain,
        client_ip=client_ip,
        origin=origin,
    )
    log.info('analyze_request_received')

    # ── Rate / scan limit ─────────────────────────────────────────────────────
    if user and db is not None:
        try:
            tier = await resolve_tier(db, user.user_id)
            used, limit = await check_scan_limit(db, user.user_id, tier)
            log.info('scan_limit_check', used=used, limit=limit, tier=tier.value)
            if used >= limit:
                log.warning('scan_limit_exceeded', used=used, limit=limit)
                raise HTTPException(
                    status_code=429,
                    detail=f'Daily scan limit ({limit}) reached. Upgrade to Pro for unlimited scans.',
                )
            await increment_scan_count(db, user.user_id)
        except HTTPException:
            raise
        except Exception as e:
            log.warning('scan_limit_check_failed', error=str(e))
    else:
        log.info('anonymous_request', rate_limit_mode='redis')
        await _check_rate_limit(user, http_request, log)

    pipeline = get_pipeline()
    log.info('pipeline_starting')

    async def generate():
        event_count = 0
        try:
            async for chunk in pipeline.analyze_stream(
                image_b64=request.image_data,
                page_context=request.page_context.model_dump(),
                mode=request.mode,
                session_id=request.session_id,
                user_id=user_id,
                conversation_history=[m.model_dump() for m in request.conversation_history],
                follow_up=request.follow_up_question,
                comparison_image_b64=request.comparison_image_data,
            ):
                event_count += 1
                yield chunk
        except Exception as e:
            import json
            log.error('pipeline_stream_error', error=str(e), events_emitted=event_count)
            yield f'data: {json.dumps({"type": "error", "error": str(e)})}\n\n'
        finally:
            log.info('stream_complete', events_emitted=event_count)
            yield 'data: [DONE]\n\n'

    # Echo the exact request origin so chrome-extension:// origins are allowed
    # by FastAPI's CORSMiddleware, rather than falling back to a wildcard '*'
    # which would conflict with nginx's strict CORS policy.
    origin = http_request.headers.get('origin', '')

    return StreamingResponse(
        generate(),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
            **({"Access-Control-Allow-Origin": origin} if origin else {}),
        },
    )


# ── Rate limiting (anonymous) ─────────────────────────────────────────────────

async def _check_rate_limit(
    user: Optional[CurrentUser],
    request: Request,
    log: structlog.BoundLogger,
) -> None:
    """Sliding window rate limiter backed by Redis. Skips silently when Redis is down."""
    if user and user.is_pro:
        return

    try:
        redis = await get_redis()
        identifier = (
            user.user_id if user
            else request.client.host if request.client
            else 'anonymous'
        )
        key = f'rate:{identifier}:{date.today().isoformat()}'

        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, 86_400)

        limit = settings.free_scans_per_day
        log.info('rate_limit_check', identifier=identifier, current=current, limit=limit)

        if current > limit:
            log.warning('rate_limit_exceeded', identifier=identifier, current=current)
            raise HTTPException(
                status_code=429,
                detail=f'Daily scan limit ({limit}) reached. Upgrade to Pro for unlimited scans.',
            )
    except HTTPException:
        raise
    except Exception as e:
        log.warning('rate_limit_redis_unavailable', error=str(e))
        # Redis unavailable — allow request rather than blocking users
