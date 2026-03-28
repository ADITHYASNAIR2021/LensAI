"""Conversation session service — persists sessions to PostgreSQL."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.session import ConversationSession

MAX_MESSAGES = 10  # cap per session (5 turns)


async def get_or_create_session(
    db: AsyncSession,
    session_id: str | None,
    user_id: str | None = None,
) -> ConversationSession:
    """Return existing session or create a fresh one. session_id may be None."""
    if session_id:
        result = await db.execute(
            select(ConversationSession).where(
                ConversationSession.id == uuid.UUID(session_id)
            )
        )
        session = result.scalar_one_or_none()
        if session:
            return session

    # Create new session
    new_session = ConversationSession(
        id=uuid.uuid4(),
        user_id=uuid.UUID(user_id) if user_id else None,
        messages=[],
        scan_ids=[],
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    )
    db.add(new_session)
    await db.flush()
    return new_session


async def append_messages(
    db: AsyncSession,
    session_id: str,
    new_messages: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Append messages to session and enforce MAX_MESSAGES cap. Returns updated list."""
    result = await db.execute(
        select(ConversationSession).where(
            ConversationSession.id == uuid.UUID(session_id)
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise ValueError(f"Session {session_id} not found")

    merged = (session.messages or []) + new_messages
    # Keep only the last MAX_MESSAGES (= 5 user+assistant pairs)
    capped = merged[-MAX_MESSAGES:]

    await db.execute(
        update(ConversationSession)
        .where(ConversationSession.id == uuid.UUID(session_id))
        .values(messages=capped)
    )
    return capped


async def get_session_history(
    db: AsyncSession,
    session_id: str,
) -> list[dict[str, Any]]:
    """Return message history for a session."""
    result = await db.execute(
        select(ConversationSession).where(
            ConversationSession.id == uuid.UUID(session_id)
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        return []
    return session.messages or []


async def link_scan_to_session(
    db: AsyncSession,
    session_id: str,
    scan_id: str,
) -> None:
    """Record that a scan was produced in this session."""
    result = await db.execute(
        select(ConversationSession).where(
            ConversationSession.id == uuid.UUID(session_id)
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        return
    existing = session.scan_ids or []
    if scan_id not in existing:
        await db.execute(
            update(ConversationSession)
            .where(ConversationSession.id == uuid.UUID(session_id))
            .values(scan_ids=existing + [scan_id])
        )
