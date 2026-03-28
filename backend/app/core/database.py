"""
Async SQLAlchemy database session management.
"""

import os
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool


class Base(DeclarativeBase):
    """Shared declarative base — all ORM models inherit from this."""
    pass

from .config import get_settings

settings = get_settings()

_is_testing = settings.environment == 'testing'

_engine_kwargs: dict = {
    'echo': settings.debug,
    'pool_pre_ping': True,   # discard stale connections before use
}

if _is_testing:
    # SQLite in-memory can't share connections; NullPool creates a new one per request
    _engine_kwargs['poolclass'] = NullPool
else:
    # Tune via env vars without changing code (defaults suit a single-server deploy)
    _engine_kwargs['pool_size']    = int(os.getenv('DB_POOL_SIZE',    '20'))
    _engine_kwargs['max_overflow'] = int(os.getenv('DB_MAX_OVERFLOW', '10'))
    _engine_kwargs['pool_recycle'] = 3600   # recycle connections after 1 hour
    _engine_kwargs['pool_timeout'] = 30     # raise after 30 s waiting for a slot

engine = create_async_engine(settings.database_url, **_engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db() -> AsyncSession:
    """FastAPI dependency — yields a DB session, rolls back on error."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_db_optional():
    """FastAPI dependency — yields a DB session or None if DB is unavailable."""
    try:
        session = AsyncSessionLocal()
    except Exception:
        yield None
        return

    async with session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            # Do NOT re-raise — avoids "generator didn't stop after athrow()"
            # The HTTP response is already determined by this point.


async def init_db() -> None:
    """Create all tables (for dev/testing only — use Alembic in production)."""
    # Import all model modules so they register with Base.metadata before create_all
    from app.models import user, scan, knowledge, session  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    await engine.dispose()
