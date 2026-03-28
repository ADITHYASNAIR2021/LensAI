"""
pytest fixtures for LensAI backend test suite.

Uses:
- aiosqlite in-memory SQLite (via SQLAlchemy async) for fast, isolated DB tests
- httpx AsyncClient against the FastAPI app with overridden dependencies
- unittest.mock for Redis and AI pipeline

SQLite compatibility notes:
- PostgreSQL UUID(as_uuid=False) stores plain VARCHAR strings — SQLite handles this fine.
- SAEnum is overridden on the metadata to use VARCHAR(32) so SQLite doesn't try to
  CREATE TYPE statements that only exist in PostgreSQL.
"""

import uuid
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import BigInteger, Integer, String, Text, event
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import TypeDecorator

try:
    from pgvector.sqlalchemy import Vector as PgVector
except ImportError:
    PgVector = None

from app.core.auth import create_access_token, create_refresh_token
from app.core.config import get_settings
from app.core.database import get_db
from app.main import app
from app.models.user import Base, Subscription, SubscriptionStatusEnum, TierEnum, User

settings = get_settings()


# ─── SQLite-compatible UUID type ─────────────────────────────────────────────
# The models use sqlalchemy.dialects.postgresql.UUID which is unknown to SQLite.
# We register a TypeDecorator that makes it behave as a VARCHAR(36) on any
# non-PostgreSQL backend, keeping values as plain strings.

class _SQLiteUUID(TypeDecorator):
    """Store UUID values as plain strings in SQLite."""
    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return str(value) if value is not None else None

    def process_result_value(self, value, dialect):
        return value


@event.listens_for(Base.metadata, "before_create")
def _patch_pg_types_for_sqlite(target, connection, **kw):
    """
    Before DDL is emitted, replace PostgreSQL-only column types with
    SQLite-compatible alternatives so CREATE TABLE succeeds.
    """
    if connection.dialect.name == "sqlite":
        for table in target.tables.values():
            for col in table.columns:
                if isinstance(col.type, PG_UUID):
                    col.type = _SQLiteUUID()
                elif PgVector is not None and isinstance(col.type, PgVector):
                    col.type = Text()
                elif isinstance(col.type, BigInteger) and col.primary_key:
                    # SQLite only auto-increments INTEGER PRIMARY KEY,
                    # not BIGINT PRIMARY KEY.
                    col.type = Integer()

            # Remove PostgreSQL-only indexes (GIN, HNSW, etc.)
            pg_only = [
                idx for idx in list(table.indexes)
                if idx.kwargs.get("postgresql_using") or any(
                    k.startswith("postgresql_") for k in idx.kwargs
                )
            ]
            for idx in pg_only:
                table.indexes.discard(idx)


# ─── In-memory SQLite engine ─────────────────────────────────────────────────

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    echo=False,
)

TestSessionLocal = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ─── Session-scoped table creation ───────────────────────────────────────────

@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_tables():
    """Create all tables once per test session using the in-memory engine."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


# ─── Per-test async DB session ───────────────────────────────────────────────

@pytest_asyncio.fixture
async def async_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide a transactional test DB session that rolls back after each test."""
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.rollback()  # always roll back — keeps tests isolated
        except Exception:
            await session.rollback()
            raise


# ─── Override get_db dependency ──────────────────────────────────────────────

async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            # Do NOT re-raise — re-raising after athrow() causes
            # "generator didn't stop after athrow()" in FastAPI's
            # dependency cleanup when an HTTPException is thrown.


# ─── mock_redis fixture ───────────────────────────────────────────────────────

@pytest.fixture
def mock_redis():
    """Return a mock Redis client with common async methods stubbed out."""
    redis = AsyncMock()
    redis.ping = AsyncMock(return_value=True)
    redis.get = AsyncMock(return_value=None)
    redis.set = AsyncMock(return_value=True)
    redis.delete = AsyncMock(return_value=1)
    redis.incr = AsyncMock(return_value=1)
    redis.expire = AsyncMock(return_value=True)
    redis.exists = AsyncMock(return_value=0)
    redis.hgetall = AsyncMock(return_value={})
    redis.hset = AsyncMock(return_value=1)
    return redis


# ─── test_client fixture ─────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def test_client(mock_redis) -> AsyncGenerator[AsyncClient, None]:
    """
    AsyncClient wired to the FastAPI app with:
    - DB dependency overridden to use in-memory SQLite
    - Redis patched to avoid real network calls
    - Lifespan skipped via direct dependency override
    """
    app.dependency_overrides[get_db] = _override_get_db

    with patch("app.core.redis_client.get_redis", new=AsyncMock(return_value=mock_redis)), \
         patch("app.main.get_redis", new=AsyncMock(return_value=mock_redis)), \
         patch("app.main.close_redis", new_callable=AsyncMock), \
         patch("app.main.init_db", new_callable=AsyncMock), \
         patch("app.main.close_db", new_callable=AsyncMock):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            yield client

    app.dependency_overrides.clear()


# ─── sample_user fixture ─────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def sample_user(async_session: AsyncSession) -> User:
    """Create and persist a free-tier user in the test DB."""
    uid = uuid.uuid4().hex[:8]
    user = User(
        id=str(uuid.uuid4()),
        google_id=f"google_free_{uid}",
        email=f"free_{uid}@example.com",
        name="Free User",
        avatar_url=None,
        tier=TierEnum.free,
        is_active=True,
    )
    async_session.add(user)
    await async_session.commit()
    await async_session.refresh(user)
    return user


# ─── sample_pro_user fixture ─────────────────────────────────────────────────

@pytest_asyncio.fixture
async def sample_pro_user(async_session: AsyncSession) -> User:
    """Create and persist a pro-tier user with an active Subscription."""
    uid = uuid.uuid4().hex[:8]
    user = User(
        id=str(uuid.uuid4()),
        google_id=f"google_pro_{uid}",
        email=f"pro_{uid}@example.com",
        name="Pro User",
        avatar_url="https://example.com/avatar.png",
        tier=TierEnum.pro,
        stripe_customer_id=f"cus_test_pro_{uid}",
        is_active=True,
    )
    async_session.add(user)
    await async_session.flush()

    sub = Subscription(
        id=str(uuid.uuid4()),
        user_id=user.id,
        stripe_subscription_id=f"sub_test_pro_{uid}",
        stripe_price_id=f"price_test_pro_{uid}",
        status=SubscriptionStatusEnum.active,
        tier=TierEnum.pro,
        cancel_at_period_end=False,
    )
    async_session.add(sub)
    await async_session.commit()
    await async_session.refresh(user)
    return user


# ─── Token helpers ────────────────────────────────────────────────────────────

def make_access_token(user: User) -> str:
    return create_access_token(
        {"sub": user.id, "email": user.email, "name": user.name, "tier": user.tier.value}
    )


def make_refresh_token_for(user: User) -> str:
    return create_refresh_token(
        {"sub": user.id, "email": user.email, "name": user.name, "tier": user.tier.value}
    )


# ─── mock_ai_pipeline fixture ─────────────────────────────────────────────────

@pytest.fixture
def mock_ai_pipeline():
    """
    Patch get_pipeline() so analyze endpoint returns a fast fake SSE stream
    instead of calling a real AI provider.
    """

    async def _fake_stream(**kwargs):
        import json
        yield f'data: {json.dumps({"type": "metadata", "contentType": "code", "cached": False})}\n\n'
        yield f'data: {json.dumps({"type": "chunk", "text": "This is a test response."})}\n\n'
        yield f'data: {json.dumps({"type": "complete", "explanation": "This is a test response.", "id": "scan_test_123"})}\n\n'
        yield "data: [DONE]\n\n"

    pipeline = MagicMock()
    pipeline.analyze_stream = _fake_stream

    with patch("app.api.v1.analyze.get_pipeline", return_value=pipeline):
        yield pipeline
