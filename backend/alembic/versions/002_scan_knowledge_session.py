"""Scan records, knowledge graph, conversation sessions — pgvector support

Revision ID: 002
Revises: 001
Create Date: 2026-03-19
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Enable pgvector extension
    # ------------------------------------------------------------------
    conn = op.get_bind()
    conn.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))

    # ------------------------------------------------------------------
    # 2. scan_records — use raw SQL to avoid SQLAlchemy Enum auto-creation
    # ------------------------------------------------------------------
    conn = op.get_bind()
    conn.execute(sa.text(
        "DO $$ BEGIN CREATE TYPE content_type_enum AS ENUM "
        "('code', 'architecture-diagram', 'dense-text', 'data-visualization', "
        "'ui-design', 'mathematical', 'image', 'table', 'unknown'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
    ))
    conn.execute(sa.text(
        "DO $$ BEGIN CREATE TYPE mode_enum AS ENUM "
        "('eli5', 'technical', 'summary', 'code-review', 'translate'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
    ))

    conn.execute(sa.text("""
        CREATE TABLE scan_records (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID,
            session_id UUID,
            content_type content_type_enum NOT NULL DEFAULT 'unknown',
            mode mode_enum NOT NULL DEFAULT 'summary',
            image_hash VARCHAR(64) NOT NULL,
            result_text TEXT NOT NULL DEFAULT '',
            key_points JSONB,
            specialized_analysis JSONB,
            reasoning_trace JSONB,
            page_url VARCHAR(2048),
            page_title VARCHAR(512),
            page_domain VARCHAR(255),
            tags TEXT[],
            starred BOOLEAN NOT NULL DEFAULT false,
            is_deleted BOOLEAN NOT NULL DEFAULT false,
            latency_ms INTEGER,
            model_used VARCHAR(128),
            provider_used VARCHAR(64),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))
    conn.execute(sa.text("CREATE INDEX ix_scan_records_user_id ON scan_records (user_id)"))
    conn.execute(sa.text("CREATE INDEX ix_scan_records_session_id ON scan_records (session_id)"))
    conn.execute(sa.text("CREATE INDEX ix_scan_records_image_hash ON scan_records (image_hash)"))

    # ------------------------------------------------------------------
    # 3. knowledge_nodes — vector column added via raw ALTER after table creation
    # ------------------------------------------------------------------
    op.create_table(
        'knowledge_nodes',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text('gen_random_uuid()'),
        ),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            'scan_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('scan_records.id', ondelete='SET NULL'),
            nullable=True,
        ),
        sa.Column('content_type', sa.String(64), nullable=False),
        sa.Column('title', sa.String(256), nullable=False),
        sa.Column('summary', sa.String(512), nullable=False, server_default=''),
        sa.Column('domain', sa.String(255), nullable=True),
        sa.Column('tags', sa.ARRAY(sa.String()), nullable=True),
        # Placeholder TEXT — immediately converted to vector(1024) below
        sa.Column('embedding', sa.Text(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text('NOW()'),
        ),
    )

    # Convert placeholder TEXT to proper pgvector type now that extension is active
    conn.execute(sa.text(
        "ALTER TABLE knowledge_nodes "
        "ALTER COLUMN embedding TYPE vector(1024) "
        "USING NULL::vector(1024)"
    ))
    conn.execute(sa.text(
        "ALTER TABLE knowledge_nodes "
        "ALTER COLUMN embedding SET NOT NULL"
    ))

    op.create_index('ix_knowledge_nodes_user_id', 'knowledge_nodes', ['user_id'])

    # ------------------------------------------------------------------
    # 4. knowledge_edges
    # ------------------------------------------------------------------
    conn.execute(sa.text(
        "DO $$ BEGIN CREATE TYPE edge_label_enum AS ENUM "
        "('similar', 'related', 'sequential', 'contradicts'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
    ))
    conn.execute(sa.text("""
        CREATE TABLE knowledge_edges (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            source_id UUID NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
            target_id UUID NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
            label edge_label_enum NOT NULL DEFAULT 'similar',
            weight FLOAT NOT NULL DEFAULT 1.0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))
    conn.execute(sa.text("CREATE INDEX ix_knowledge_edges_source_id ON knowledge_edges (source_id)"))
    conn.execute(sa.text("CREATE INDEX ix_knowledge_edges_target_id ON knowledge_edges (target_id)"))

    # ------------------------------------------------------------------
    # 5. conversation_sessions
    # ------------------------------------------------------------------
    op.create_table(
        'conversation_sessions',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text('gen_random_uuid()'),
        ),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            'messages',
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default='[]',
        ),
        sa.Column('scan_ids', sa.ARRAY(sa.String()), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text('NOW()'),
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text('NOW()'),
        ),
    )
    op.create_index('ix_conversation_sessions_user_id', 'conversation_sessions', ['user_id'])

    # ------------------------------------------------------------------
    # 6. Composite / GIN / HNSW indexes
    # ------------------------------------------------------------------
    conn.execute(sa.text(
        "CREATE INDEX ix_scan_records_tags "
        "ON scan_records USING gin (tags)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX ix_scan_records_user_created "
        "ON scan_records (user_id, created_at)"
    ))
    conn.execute(sa.text(
        "CREATE INDEX ix_knowledge_nodes_embedding_hnsw "
        "ON knowledge_nodes USING hnsw (embedding vector_cosine_ops) "
        "WITH (m=16, ef_construction=64)"
    ))


def downgrade() -> None:
    op.drop_table('conversation_sessions')
    op.drop_table('knowledge_edges')
    op.drop_table('knowledge_nodes')
    op.drop_table('scan_records')

    op.execute('DROP TYPE IF EXISTS edge_label_enum')
    op.execute('DROP TYPE IF EXISTS mode_enum')
    op.execute('DROP TYPE IF EXISTS content_type_enum')
