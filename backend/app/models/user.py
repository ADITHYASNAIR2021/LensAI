"""
SQLAlchemy ORM models for LensAI.
All tables are created/migrated via Alembic.
"""

import uuid
from datetime import datetime, UTC
from typing import Optional

from sqlalchemy import (
    String, Integer, Boolean, DateTime, ForeignKey, Text, BigInteger, Index,
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base  # single shared Base for all models


# ─── Enums ──────────────────────────────────────────────────────────────────

import enum

class TierEnum(str, enum.Enum):
    free = 'free'
    pro = 'pro'
    team = 'team'

class SubscriptionStatusEnum(str, enum.Enum):
    active = 'active'
    trialing = 'trialing'
    past_due = 'past_due'
    canceled = 'canceled'
    unpaid = 'unpaid'
    incomplete = 'incomplete'


# ─── User ────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = 'users'

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    google_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), default='')
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    tier: Mapped[TierEnum] = mapped_column(
        SAEnum(TierEnum, name='tier_enum', create_type=False), default=TierEnum.free
    )
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(
        String(128), unique=True, nullable=True, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    # Relationships
    subscription: Mapped[Optional['Subscription']] = relationship(
        'Subscription', back_populates='user', uselist=False, cascade='all, delete-orphan'
    )
    usage_stats: Mapped[list['UsageStat']] = relationship(
        'UsageStat', back_populates='user', cascade='all, delete-orphan'
    )
    api_keys: Mapped[list['ApiKey']] = relationship(
        'ApiKey', back_populates='user', cascade='all, delete-orphan'
    )
    team_memberships: Mapped[list['TeamMember']] = relationship(
        'TeamMember', back_populates='user', cascade='all, delete-orphan'
    )

    def __repr__(self) -> str:
        return f'<User {self.email} tier={self.tier}>'

    @property
    def is_pro(self) -> bool:
        return self.tier in (TierEnum.pro, TierEnum.team)


# ─── Subscription ─────────────────────────────────────────────────────────────

class Subscription(Base):
    __tablename__ = 'subscriptions'

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey('users.id', ondelete='CASCADE'), unique=True, index=True
    )
    stripe_subscription_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    stripe_price_id: Mapped[str] = mapped_column(String(128))
    status: Mapped[SubscriptionStatusEnum] = mapped_column(
        SAEnum(SubscriptionStatusEnum, name='subscription_status_enum', create_type=False),
        default=SubscriptionStatusEnum.active,
    )
    tier: Mapped[TierEnum] = mapped_column(
        SAEnum(TierEnum, name='subscription_tier_enum', create_type=False), default=TierEnum.pro
    )
    current_period_start: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    current_period_end: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)
    canceled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    user: Mapped['User'] = relationship('User', back_populates='subscription')

    @property
    def is_active(self) -> bool:
        return self.status in (SubscriptionStatusEnum.active, SubscriptionStatusEnum.trialing)


# ─── Usage Stats ──────────────────────────────────────────────────────────────

class UsageStat(Base):
    __tablename__ = 'usage_stats'
    __table_args__ = (
        Index('ix_usage_user_date', 'user_id', 'date'),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey('users.id', ondelete='CASCADE'), index=True
    )
    date: Mapped[str] = mapped_column(String(10), index=True)  # YYYY-MM-DD
    scan_count: Mapped[int] = mapped_column(Integer, default=0)
    followup_count: Mapped[int] = mapped_column(Integer, default=0)
    tokens_used: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    user: Mapped['User'] = relationship('User', back_populates='usage_stats')


# ─── API Keys ────────────────────────────────────────────────────────────────

class ApiKey(Base):
    __tablename__ = 'api_keys'

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey('users.id', ondelete='CASCADE'), index=True
    )
    name: Mapped[str] = mapped_column(String(128), default='My API Key')
    key_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)  # SHA-256 of key
    key_prefix: Mapped[str] = mapped_column(String(12))  # First 12 chars for display
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    scans_used: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped['User'] = relationship('User', back_populates='api_keys')


# ─── Teams ───────────────────────────────────────────────────────────────────

class Team(Base):
    __tablename__ = 'teams'

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    owner_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey('users.id', ondelete='CASCADE'), index=True
    )
    stripe_subscription_id: Mapped[Optional[str]] = mapped_column(
        String(128), unique=True, nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    members: Mapped[list['TeamMember']] = relationship(
        'TeamMember', back_populates='team', cascade='all, delete-orphan'
    )


class TeamMember(Base):
    __tablename__ = 'team_members'
    __table_args__ = (
        Index('ix_team_member_unique', 'team_id', 'user_id', unique=True),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    team_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey('teams.id', ondelete='CASCADE'), index=True
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey('users.id', ondelete='CASCADE'), index=True
    )
    role: Mapped[str] = mapped_column(String(32), default='member')  # 'owner' | 'admin' | 'member'
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )

    team: Mapped['Team'] = relationship('Team', back_populates='members')
    user: Mapped['User'] = relationship('User', back_populates='team_memberships')
