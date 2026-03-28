"""
User service — CRUD operations, tier resolution, usage tracking.
All DB interactions go through here; nothing else touches the ORM directly.
"""

import hashlib
import secrets
import string
from datetime import date, datetime, UTC
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.user import User, Subscription, UsageStat, ApiKey, TierEnum, SubscriptionStatusEnum
from ..core.config import get_settings

settings = get_settings()


# ─── User CRUD ────────────────────────────────────────────────────────────────

async def upsert_user(
    db: AsyncSession,
    *,
    google_id: str,
    email: str,
    name: str,
    avatar_url: Optional[str] = None,
) -> User:
    """Create user on first login, update name/avatar on subsequent logins."""
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            google_id=google_id,
            email=email,
            name=name,
            avatar_url=avatar_url,
            tier=TierEnum.free,
        )
        db.add(user)
        await db.flush()
    else:
        user.name = name
        if avatar_url:
            user.avatar_url = avatar_url
        user.updated_at = datetime.now(UTC)

    return user


async def get_user_by_id(db: AsyncSession, user_id: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_stripe_customer(db: AsyncSession, stripe_customer_id: str) -> Optional[User]:
    result = await db.execute(
        select(User).where(User.stripe_customer_id == stripe_customer_id)
    )
    return result.scalar_one_or_none()


async def set_stripe_customer_id(db: AsyncSession, user_id: str, customer_id: str) -> None:
    await db.execute(
        update(User)
        .where(User.id == user_id)
        .values(stripe_customer_id=customer_id, updated_at=datetime.now(UTC))
    )


async def resolve_tier(db: AsyncSession, user_id: str) -> TierEnum:
    """
    Source of truth for tier. Checks the subscription table.
    Falls back to users.tier if no active subscription.
    """
    result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == user_id,
            Subscription.status.in_([SubscriptionStatusEnum.active, SubscriptionStatusEnum.trialing]),
        )
    )
    sub = result.scalar_one_or_none()
    if sub:
        return sub.tier

    result = await db.execute(select(User.tier).where(User.id == user_id))
    row = result.first()
    return row[0] if row else TierEnum.free


async def update_user_tier(db: AsyncSession, user_id: str, tier: TierEnum) -> None:
    await db.execute(
        update(User)
        .where(User.id == user_id)
        .values(tier=tier, updated_at=datetime.now(UTC))
    )


# ─── Subscription CRUD ────────────────────────────────────────────────────────

async def upsert_subscription(
    db: AsyncSession,
    *,
    user_id: str,
    stripe_subscription_id: str,
    stripe_price_id: str,
    status: str,
    tier: TierEnum,
    current_period_start: Optional[datetime] = None,
    current_period_end: Optional[datetime] = None,
    cancel_at_period_end: bool = False,
) -> Subscription:
    result = await db.execute(
        select(Subscription).where(Subscription.user_id == user_id)
    )
    sub = result.scalar_one_or_none()

    status_enum = SubscriptionStatusEnum(status)

    if sub is None:
        sub = Subscription(
            user_id=user_id,
            stripe_subscription_id=stripe_subscription_id,
            stripe_price_id=stripe_price_id,
            status=status_enum,
            tier=tier,
            current_period_start=current_period_start,
            current_period_end=current_period_end,
            cancel_at_period_end=cancel_at_period_end,
        )
        db.add(sub)
    else:
        sub.stripe_subscription_id = stripe_subscription_id
        sub.stripe_price_id = stripe_price_id
        sub.status = status_enum
        sub.tier = tier
        sub.current_period_start = current_period_start
        sub.current_period_end = current_period_end
        sub.cancel_at_period_end = cancel_at_period_end
        sub.updated_at = datetime.now(UTC)

    # Sync tier on User table too
    await update_user_tier(db, user_id, tier if sub.is_active else TierEnum.free)
    await db.flush()
    return sub


async def cancel_subscription(db: AsyncSession, user_id: str) -> None:
    await db.execute(
        update(Subscription)
        .where(Subscription.user_id == user_id)
        .values(
            status=SubscriptionStatusEnum.canceled,
            canceled_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
    )
    await update_user_tier(db, user_id, TierEnum.free)


# ─── Usage Tracking ───────────────────────────────────────────────────────────

async def get_usage_today(db: AsyncSession, user_id: str) -> UsageStat:
    today = date.today().isoformat()
    result = await db.execute(
        select(UsageStat).where(UsageStat.user_id == user_id, UsageStat.date == today)
    )
    stat = result.scalar_one_or_none()
    if stat is None:
        stat = UsageStat(user_id=user_id, date=today)
        db.add(stat)
        await db.flush()
    return stat


async def increment_scan_count(db: AsyncSession, user_id: str, tokens: int = 0) -> int:
    """Increment scan counter and return new count."""
    stat = await get_usage_today(db, user_id)
    stat.scan_count += 1
    stat.tokens_used += tokens
    stat.updated_at = datetime.now(UTC)
    await db.flush()
    return stat.scan_count


async def increment_followup_count(db: AsyncSession, user_id: str) -> int:
    stat = await get_usage_today(db, user_id)
    stat.followup_count += 1
    stat.updated_at = datetime.now(UTC)
    await db.flush()
    return stat.followup_count


async def check_scan_limit(db: AsyncSession, user_id: str, tier: TierEnum) -> tuple[int, int]:
    """Return (used, limit). Raises nothing — caller decides what to do."""
    if tier in (TierEnum.pro, TierEnum.team):
        stat = await get_usage_today(db, user_id)
        return stat.scan_count, 999999  # effectively unlimited

    stat = await get_usage_today(db, user_id)
    return stat.scan_count, settings.free_scans_per_day


# ─── API Keys ─────────────────────────────────────────────────────────────────

_KEY_ALPHABET = string.ascii_letters + string.digits

def _generate_raw_key() -> str:
    return 'lak_' + ''.join(secrets.choice(_KEY_ALPHABET) for _ in range(40))

def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


async def create_api_key(db: AsyncSession, user_id: str, name: str) -> tuple[str, ApiKey]:
    """Returns (raw_key, ApiKey). raw_key is shown ONCE and never stored."""
    raw = _generate_raw_key()
    key = ApiKey(
        user_id=user_id,
        name=name,
        key_hash=_hash_key(raw),
        key_prefix=raw[:12],
    )
    db.add(key)
    await db.flush()
    return raw, key


async def verify_api_key(db: AsyncSession, raw_key: str) -> Optional[ApiKey]:
    key_hash = _hash_key(raw_key)
    result = await db.execute(
        select(ApiKey).where(
            ApiKey.key_hash == key_hash,
            ApiKey.is_active == True,  # noqa: E712
        )
    )
    key = result.scalar_one_or_none()
    if key:
        key.last_used_at = datetime.now(UTC)
        key.scans_used += 1
    return key


async def list_api_keys(db: AsyncSession, user_id: str) -> list[ApiKey]:
    result = await db.execute(
        select(ApiKey).where(ApiKey.user_id == user_id).order_by(ApiKey.created_at.desc())
    )
    return list(result.scalars().all())


async def revoke_api_key(db: AsyncSession, key_id: str, user_id: str) -> bool:
    result = await db.execute(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user_id)
    )
    key = result.scalar_one_or_none()
    if not key:
        return False
    key.is_active = False
    return True
