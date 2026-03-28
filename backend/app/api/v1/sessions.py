"""Session management API endpoints."""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.auth import get_optional_user, CurrentUser
from ...core.database import get_db
from ...models.session import ConversationSession
from ...services.session_service import (
    get_or_create_session,
    append_messages,
    get_session_history,
)

router = APIRouter()


class CreateSessionRequest(BaseModel):
    user_id: str | None = None


class SessionResponse(BaseModel):
    id: str
    user_id: str | None
    message_count: int
    scan_ids: list[str]
    expires_at: str | None

    @classmethod
    def from_orm(cls, s: ConversationSession) -> "SessionResponse":
        return cls(
            id=str(s.id),
            user_id=str(s.user_id) if s.user_id else None,
            message_count=len(s.messages or []),
            scan_ids=s.scan_ids or [],
            expires_at=s.expires_at.isoformat() if s.expires_at else None,
        )


class AppendMessagesRequest(BaseModel):
    messages: list[dict[str, Any]]


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: CreateSessionRequest = CreateSessionRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser | None = Depends(get_optional_user),
):
    """Create a new conversation session."""
    uid = str(current_user.user_id) if current_user else body.user_id
    session = await get_or_create_session(db, session_id=None, user_id=uid)
    await db.commit()
    return SessionResponse.from_orm(session)


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get session metadata."""
    result = await db.execute(
        select(ConversationSession).where(
            ConversationSession.id == uuid.UUID(session_id)
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionResponse.from_orm(session)


@router.get("/{session_id}/messages")
async def get_messages(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get conversation history for a session."""
    messages = await get_session_history(db, session_id)
    return {"session_id": session_id, "messages": messages, "count": len(messages)}


@router.patch("/{session_id}/messages")
async def append_to_session(
    session_id: str,
    body: AppendMessagesRequest,
    db: AsyncSession = Depends(get_db),
):
    """Append messages to a session (enforces 10-message cap)."""
    try:
        updated = await append_messages(db, session_id, body.messages)
        await db.commit()
        return {"session_id": session_id, "messages": updated, "count": len(updated)}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a session and its history."""
    result = await db.execute(
        delete(ConversationSession).where(
            ConversationSession.id == uuid.UUID(session_id)
        )
    )
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Session not found")
