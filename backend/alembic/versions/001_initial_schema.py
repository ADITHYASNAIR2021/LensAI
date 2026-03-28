"""Initial schema — users, subscriptions, usage_stats, api_keys, teams

Revision ID: 001
Revises:
Create Date: 2026-03-15
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Create enums via raw SQL — PostgreSQL has no CREATE TYPE IF NOT EXISTS,
    # so use DO block with exception handling for idempotency.
    conn.execute(sa.text(
        "DO $$ BEGIN CREATE TYPE tier_enum AS ENUM ('free', 'pro', 'team'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
    ))
    conn.execute(sa.text(
        "DO $$ BEGIN CREATE TYPE subscription_status_enum AS ENUM "
        "('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
    ))
    conn.execute(sa.text(
        "DO $$ BEGIN CREATE TYPE subscription_tier_enum AS ENUM ('free', 'pro', 'team'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
    ))

    if not conn.dialect.has_table(conn, 'users'):
        # Use raw SQL to avoid SQLAlchemy Enum auto-creation conflicts
        conn.execute(sa.text("""
            CREATE TABLE users (
                id VARCHAR(36) PRIMARY KEY,
                google_id VARCHAR(128) NOT NULL,
                email VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL DEFAULT '',
                avatar_url VARCHAR(512),
                tier tier_enum NOT NULL DEFAULT 'free',
                stripe_customer_id VARCHAR(128),
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(sa.text("CREATE UNIQUE INDEX ix_users_google_id ON users (google_id)"))
        conn.execute(sa.text("CREATE UNIQUE INDEX ix_users_email ON users (email)"))
        conn.execute(sa.text("CREATE UNIQUE INDEX ix_users_stripe_customer_id ON users (stripe_customer_id)"))

    if not conn.dialect.has_table(conn, 'subscriptions'):
        conn.execute(sa.text("""
            CREATE TABLE subscriptions (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                stripe_subscription_id VARCHAR(128) NOT NULL,
                stripe_price_id VARCHAR(128) NOT NULL,
                status subscription_status_enum NOT NULL DEFAULT 'active',
                tier subscription_tier_enum NOT NULL DEFAULT 'pro',
                current_period_start TIMESTAMPTZ,
                current_period_end TIMESTAMPTZ,
                cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
                canceled_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(sa.text("CREATE UNIQUE INDEX ix_subscriptions_user_id ON subscriptions (user_id)"))
        conn.execute(sa.text("CREATE UNIQUE INDEX ix_subscriptions_stripe_sub_id ON subscriptions (stripe_subscription_id)"))

    if not conn.dialect.has_table(conn, 'usage_stats'):
        conn.execute(sa.text("""
            CREATE TABLE usage_stats (
                id BIGSERIAL PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                date VARCHAR(10) NOT NULL,
                scan_count INTEGER NOT NULL DEFAULT 0,
                followup_count INTEGER NOT NULL DEFAULT 0,
                tokens_used BIGINT NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(sa.text("CREATE INDEX ix_usage_user_date ON usage_stats (user_id, date)"))

    if not conn.dialect.has_table(conn, 'api_keys'):
        conn.execute(sa.text("""
            CREATE TABLE api_keys (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(128) NOT NULL DEFAULT 'My API Key',
                key_hash VARCHAR(128) NOT NULL,
                key_prefix VARCHAR(12) NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT true,
                last_used_at TIMESTAMPTZ,
                scans_used BIGINT NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                expires_at TIMESTAMPTZ
            )
        """))
        conn.execute(sa.text("CREATE INDEX ix_api_keys_user_id ON api_keys (user_id)"))
        conn.execute(sa.text("CREATE UNIQUE INDEX ix_api_keys_key_hash ON api_keys (key_hash)"))

    if not conn.dialect.has_table(conn, 'teams'):
        conn.execute(sa.text("""
            CREATE TABLE teams (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                slug VARCHAR(128) NOT NULL,
                owner_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                stripe_subscription_id VARCHAR(128),
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(sa.text("CREATE UNIQUE INDEX ix_teams_slug ON teams (slug)"))
        conn.execute(sa.text("CREATE INDEX ix_teams_owner_id ON teams (owner_id)"))

    if not conn.dialect.has_table(conn, 'team_members'):
        conn.execute(sa.text("""
            CREATE TABLE team_members (
                id VARCHAR(36) PRIMARY KEY,
                team_id VARCHAR(36) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role VARCHAR(32) NOT NULL DEFAULT 'member',
                joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """))
        conn.execute(sa.text("CREATE UNIQUE INDEX ix_team_member_unique ON team_members (team_id, user_id)"))


def downgrade() -> None:
    op.drop_table('team_members')
    op.drop_table('teams')
    op.drop_table('api_keys')
    op.drop_table('usage_stats')
    op.drop_table('subscriptions')
    op.drop_table('users')
    op.execute('DROP TYPE IF EXISTS subscription_tier_enum')
    op.execute('DROP TYPE IF EXISTS subscription_status_enum')
    op.execute('DROP TYPE IF EXISTS tier_enum')
