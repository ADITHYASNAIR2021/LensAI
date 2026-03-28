# LensAI Complete Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden LensAI from 7.2/10 MVP to production-grade 9.5/10 across backend persistence, feature quality, and a new Next.js 15 landing page.

**Architecture:** PostgreSQL-backed persistence (scans, knowledge graph, sessions) via pgvector; Redis remains hot cache only. Backend gains circuit breakers, structured tool-use extraction, dynamic learning paths, and PDF export. Next.js 15 landing page uses shadcn/ui + Tailwind v4.

**Tech Stack:** FastAPI, SQLAlchemy async, pgvector, Alembic, Redis, Anthropic SDK, tenacity, WeasyPrint, Next.js 15, Tailwind v4, shadcn/ui, Framer Motion

---

## Phase 1 — Database Foundation

### Task 1: Update Docker Infrastructure

**Files:**
- Modify: `backend/docker-compose.yml`
- Modify: `backend/docker-compose.prod.yml`

- [ ] Step 1: In `backend/docker-compose.yml`, change the `db` service image from `postgres:16-alpine` to `pgvector/pgvector:pg16`. The `db` service block currently reads:
```yaml
  db:
    image: postgres:16-alpine
```
Change to:
```yaml
  db:
    image: pgvector/pgvector:pg16
```

- [ ] Step 2: In `backend/docker-compose.prod.yml`, change the `postgres` service image from `postgres:16-alpine` to `pgvector/pgvector:pg16`. The `postgres` service block currently reads:
```yaml
  postgres:
    image: postgres:16-alpine
```
Change to:
```yaml
  postgres:
    image: pgvector/pgvector:pg16
```

- [ ] Step 3: Verify compose config is valid for both files:
```bash
cd backend
docker compose -f docker-compose.yml config --quiet && echo "dev compose OK"
docker compose -f docker-compose.prod.yml config --quiet && echo "prod compose OK"
```

- [ ] Step 4: Pull the new image to confirm it is available:
```bash
docker pull pgvector/pgvector:pg16
```

- [ ] Step 5: Commit:
```bash
git add backend/docker-compose.yml backend/docker-compose.prod.yml
git commit -m "infra: switch postgres image to pgvector/pgvector:pg16"
```

---

### Task 2: Update Dockerfile with WeasyPrint System Dependencies

**Files:**
- Modify: `backend/Dockerfile`

The runtime stage currently installs only `libpq5`, `postgresql-client`, and `curl`. WeasyPrint requires Pango, Cairo, GDK-PixBuf, and font libraries at runtime. These must be added to the **runtime stage** (Stage 2), not the builder, because WeasyPrint calls them at PDF generation time, not at pip install time.

- [ ] Step 1: In the runtime stage of `backend/Dockerfile`, extend the existing `apt-get install` block to include WeasyPrint's system dependencies. The current block reads:
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*
```
Replace with:
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    postgresql-client \
    curl \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libcairo2 \
    libffi-dev \
    libglib2.0-0 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
```

- [ ] Step 2: Verify the Dockerfile builds without errors (builder stage is unchanged, only runtime stage apt block changed):
```bash
cd backend
docker build -t lensai-api:weasyprint-test . --no-cache 2>&1 | tail -20
```

- [ ] Step 3: Commit:
```bash
git add backend/Dockerfile
git commit -m "infra: add WeasyPrint system libs to runtime Docker image"
```

---

### Task 3: Update requirements.txt

**Files:**
- Modify: `backend/requirements.txt`

Current requirements already include `tenacity==8.4.2`. Need to add: `pgvector==0.3.6`, `weasyprint==62.3`, `jinja2==3.1.4`.

- [ ] Step 1: Append the three new packages to `backend/requirements.txt`. Add them under a new `# PDF & Vector` comment section after the existing `# Utilities` block:
```
# PDF & Vector
pgvector==0.3.6
weasyprint==62.3
jinja2==3.1.4
```

- [ ] Step 2: Verify no version conflicts by doing a dry-run install inside the builder image (optional but recommended):
```bash
cd backend
pip install --dry-run pgvector==0.3.6 weasyprint==62.3 jinja2==3.1.4 2>&1 | grep -i conflict || echo "No conflicts"
```

- [ ] Step 3: Commit:
```bash
git add backend/requirements.txt
git commit -m "deps: add pgvector, weasyprint, jinja2 to requirements"
```

---

### Task 4: Create ScanRecord SQLAlchemy Model

**Files:**
- Create: `backend/app/models/scan.py`

The model uses the same `Base` from `app.models.user`, `JSONB` and `ARRAY` from `sqlalchemy.dialects.postgresql`, and Python's `enum` module for `ContentTypeEnum` and `ModeEnum`. These Python enums mirror the PostgreSQL ENUMs created in the migration (Task 7). The `UUID(as_uuid=False)` pattern matches `user.py` — IDs are stored as strings.

- [ ] Step 1: Create `backend/app/models/scan.py` with the following content:
```python
"""
ScanRecord model — persists every AI analysis result.
ContentTypeEnum and ModeEnum mirror the PostgreSQL ENUMs created in migration 002.
"""

import enum
import uuid
from datetime import datetime, UTC
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import (
    Boolean, DateTime, Index, Integer, String, Text,
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .user import Base


class ContentTypeEnum(str, enum.Enum):
    code = 'code'
    architecture_diagram = 'architecture-diagram'
    dense_text = 'dense-text'
    data_visualization = 'data-visualization'
    ui_design = 'ui-design'
    mathematical = 'mathematical'
    image = 'image'
    table = 'table'
    unknown = 'unknown'


class ModeEnum(str, enum.Enum):
    eli5 = 'eli5'
    technical = 'technical'
    summary = 'summary'
    code_review = 'code-review'
    translate = 'translate'


class ScanRecord(Base):
    __tablename__ = 'scan_records'
    __table_args__ = (
        Index('ix_scan_records_user_id', 'user_id'),
        Index('ix_scan_records_image_hash', 'image_hash'),
        Index('ix_scan_records_session_id', 'session_id'),
        # GIN index on tags is created in the Alembic migration (requires op.execute)
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    # Nullable — anonymous scans have no user_id
    user_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False),
        sa.ForeignKey('users.id', ondelete='SET NULL'),
        nullable=True,
    )
    session_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False), nullable=True,
    )
    content_type: Mapped[ContentTypeEnum] = mapped_column(
        SAEnum(
            ContentTypeEnum,
            name='content_type_enum',
            create_type=False,   # created by Alembic migration 002
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default='unknown',
    )
    mode: Mapped[ModeEnum] = mapped_column(
        SAEnum(
            ModeEnum,
            name='mode_enum',
            create_type=False,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default='technical',
    )
    # SHA-256 of first 8000 chars of base64 image — used for cache dedup
    image_hash: Mapped[str] = mapped_column(String(64), nullable=False, server_default='')

    # Core result fields
    result_text: Mapped[str] = mapped_column(Text, nullable=False, server_default='')

    # JSONB — structured extraction results
    # key_points: list[str]
    key_points: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # specialized_analysis: CodeAnalysis | DiagramAnalysis | DataInsight
    specialized_analysis: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # reasoning_trace: list[{step, signal, decision, confidence}]
    reasoning_trace: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    # Page provenance
    page_url: Mapped[str] = mapped_column(String(2048), nullable=False, server_default='')
    page_title: Mapped[str] = mapped_column(String(512), nullable=False, server_default='')
    page_domain: Mapped[str] = mapped_column(String(255), nullable=False, server_default='')

    # tags: list[str] — e.g. ['code', 'technical', 'python']
    tags: Mapped[Optional[list]] = mapped_column(ARRAY(String), nullable=True)

    # User actions
    starred: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default='false')
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default='false')

    # Provider telemetry
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, server_default='0')
    model_used: Mapped[str] = mapped_column(String(128), nullable=False, server_default='')
    provider_used: Mapped[str] = mapped_column(String(64), nullable=False, server_default='')

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.text('NOW()'),
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.text('NOW()'),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    def __repr__(self) -> str:
        return f'<ScanRecord {self.id[:8]} type={self.content_type} mode={self.mode}>'
```

- [ ] Step 2: Verify the file imports cleanly (no circular imports, Base resolves):
```bash
cd backend
python -c "from app.models.scan import ScanRecord, ContentTypeEnum, ModeEnum; print('scan model OK')"
```

- [ ] Step 3: Commit:
```bash
git add backend/app/models/scan.py
git commit -m "feat(models): add ScanRecord with ContentTypeEnum and ModeEnum"
```

---

### Task 5: Create KnowledgeNode and KnowledgeEdge Models

**Files:**
- Create: `backend/app/models/knowledge.py`

`KnowledgeNode.embedding` uses `pgvector.sqlalchemy.Vector(1024)` — the 1024-dim NVIDIA NIM embedding. `KnowledgeEdge` stores the computed cosine similarity and a human-readable label. Both models FK to `users.id` and `scan_records.id`.

- [ ] Step 1: Create `backend/app/models/knowledge.py`:
```python
"""
KnowledgeNode and KnowledgeEdge — pgvector-backed knowledge graph persistence.

KnowledgeNode.embedding is a 1024-dimensional vector from NVIDIA NIM
(nvidia/nv-embedqa-e5-v5). The HNSW index on this column is created in
migration 002 using vector_cosine_ops for fast ANN search.
"""

import enum
import uuid
from datetime import datetime, UTC
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import (
    DateTime, Float, Index, String,
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector

from .user import Base
from .scan import ContentTypeEnum  # reuse the same Python enum


class EdgeLabelEnum(str, enum.Enum):
    relates_to = 'relates to'
    extends = 'extends'
    contradicts = 'contradicts'
    exemplifies = 'exemplifies'


class KnowledgeNode(Base):
    __tablename__ = 'knowledge_nodes'
    __table_args__ = (
        Index('ix_knowledge_nodes_user_id', 'user_id'),
        Index('ix_knowledge_nodes_domain', 'domain'),
        # HNSW vector index created in migration 002 via op.execute()
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        sa.ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
    )
    # Nullable — node may be created from a scan or standalone
    scan_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False),
        sa.ForeignKey('scan_records.id', ondelete='SET NULL'),
        nullable=True,
    )
    content_type: Mapped[ContentTypeEnum] = mapped_column(
        SAEnum(
            ContentTypeEnum,
            name='content_type_enum',
            create_type=False,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default='unknown',
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False, server_default='')
    # First 500 chars of result_text
    summary: Mapped[str] = mapped_column(String(500), nullable=False, server_default='')
    domain: Mapped[str] = mapped_column(String(255), nullable=False, server_default='')
    tags: Mapped[Optional[list]] = mapped_column(ARRAY(String), nullable=True)

    # 1024-dim semantic embedding from nvidia/nv-embedqa-e5-v5
    # NULL allowed for nodes created before embedding service was available
    embedding: Mapped[Optional[list]] = mapped_column(Vector(1024), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.text('NOW()'),
        default=lambda: datetime.now(UTC),
    )

    def __repr__(self) -> str:
        return f'<KnowledgeNode {self.id[:8]} title={self.title[:30]!r}>'


class KnowledgeEdge(Base):
    __tablename__ = 'knowledge_edges'
    __table_args__ = (
        Index('ix_knowledge_edges_user_id', 'user_id'),
        Index('ix_knowledge_edges_source', 'source_node_id'),
        Index('ix_knowledge_edges_target', 'target_node_id'),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        sa.ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
    )
    source_node_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        sa.ForeignKey('knowledge_nodes.id', ondelete='CASCADE'),
        nullable=False,
    )
    target_node_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        sa.ForeignKey('knowledge_nodes.id', ondelete='CASCADE'),
        nullable=False,
    )
    # Cosine similarity score in [0, 1]
    similarity: Mapped[float] = mapped_column(Float, nullable=False, server_default='0.0')
    label: Mapped[EdgeLabelEnum] = mapped_column(
        SAEnum(
            EdgeLabelEnum,
            name='edge_label_enum',
            create_type=False,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default='relates to',
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.text('NOW()'),
        default=lambda: datetime.now(UTC),
    )

    def __repr__(self) -> str:
        return (
            f'<KnowledgeEdge {self.source_node_id[:8]} '
            f'--[{self.label}]--> {self.target_node_id[:8]}>'
        )
```

- [ ] Step 2: Verify imports (requires pgvector installed):
```bash
cd backend
python -c "from app.models.knowledge import KnowledgeNode, KnowledgeEdge, EdgeLabelEnum; print('knowledge models OK')"
```

- [ ] Step 3: Commit:
```bash
git add backend/app/models/knowledge.py
git commit -m "feat(models): add KnowledgeNode and KnowledgeEdge with pgvector embedding"
```

---

### Task 6: Create ConversationSession Model

**Files:**
- Create: `backend/app/models/session.py`

Session cap is 10 messages (5 turns). `scan_ids` is an `ARRAY(UUID)` — the list of ScanRecord IDs touched during this session. `expires_at` is set to `created_at + 7 days` at the application layer in `session_service.py` (Task 16).

- [ ] Step 1: Create `backend/app/models/session.py`:
```python
"""
ConversationSession — server-side persistence for multi-turn conversations.

Messages cap: 10 (5 turns). Enforced by session_service.append_messages().
expires_at: created_at + 7 days, set at creation time.
"""

import uuid
from datetime import datetime, UTC
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import DateTime, Index
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .user import Base


class ConversationSession(Base):
    __tablename__ = 'conversation_sessions'
    __table_args__ = (
        Index('ix_conversation_sessions_user_id', 'user_id'),
        Index('ix_conversation_sessions_expires_at', 'expires_at'),
    )

    # id = the session_id suggested by the extension client (or server-generated)
    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    # Nullable — anonymous sessions (no auth) are allowed
    user_id: Mapped[Optional[str]] = mapped_column(
        UUID(as_uuid=False),
        sa.ForeignKey('users.id', ondelete='SET NULL'),
        nullable=True,
    )
    # list[{role: "user"|"assistant", content: str}], max 10 entries
    messages: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, server_default='[]')

    # UUIDs of ScanRecord rows associated with this session
    scan_ids: Mapped[Optional[list]] = mapped_column(ARRAY(UUID(as_uuid=False)), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.text('NOW()'),
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=sa.text('NOW()'),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
    # Session auto-expires after 7 days
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )

    def __repr__(self) -> str:
        msg_count = len(self.messages) if isinstance(self.messages, list) else 0
        return f'<ConversationSession {self.id[:8]} messages={msg_count}>'
```

- [ ] Step 2: Verify import:
```bash
cd backend
python -c "from app.models.session import ConversationSession; print('session model OK')"
```

- [ ] Step 3: Commit:
```bash
git add backend/app/models/session.py
git commit -m "feat(models): add ConversationSession with JSONB messages and ARRAY scan_ids"
```

---

### Task 7: Update alembic/env.py and Write Migration 002

**Files:**
- Modify: `backend/alembic/env.py`
- Create: `backend/alembic/versions/002_scan_knowledge_session.py`

`env.py` currently only imports `from app.models.user import Base`. All three new model modules must be imported so Alembic's autogenerate sees all tables. The migration itself must: (1) enable pgvector extension, (2) create two PostgreSQL ENUM types, (3) create four tables, (4) add a GIN index on `scan_records.tags`, and (5) add an HNSW index on `knowledge_nodes.embedding` using `vector_cosine_ops`. The HNSW index is created with `op.execute()` because SQLAlchemy's `create_index` does not support the `USING hnsw` clause.

- [ ] Step 1: Update `backend/alembic/env.py`. Replace the current model import block:
```python
# Import models so Alembic can detect them
from app.models.user import Base  # noqa: F401
from app.core.config import get_settings
```
With:
```python
# Import models so Alembic can detect them — order matters (Base defined in user.py)
from app.models.user import Base      # noqa: F401 — defines Base
import app.models.scan                # noqa: F401 — registers ScanRecord
import app.models.knowledge           # noqa: F401 — registers KnowledgeNode, KnowledgeEdge
import app.models.session             # noqa: F401 — registers ConversationSession
from app.core.config import get_settings
```

- [ ] Step 2: Verify Alembic can see all tables after the env.py change:
```bash
cd backend
python -c "
from alembic.config import Config
from alembic import command
cfg = Config('alembic.ini')
# Just import env to check it loads without error
import alembic.env
print('env.py imports OK')
"
```
Or more directly:
```bash
cd backend
python -c "
from app.models.user import Base
import app.models.scan
import app.models.knowledge
import app.models.session
tables = list(Base.metadata.tables.keys())
print('Tables registered:', tables)
assert 'scan_records' in tables
assert 'knowledge_nodes' in tables
assert 'knowledge_edges' in tables
assert 'conversation_sessions' in tables
print('All 4 new tables present — OK')
"
```

- [ ] Step 3: Create `backend/alembic/versions/002_scan_knowledge_session.py`:
```python
"""Add scan_records, knowledge_nodes, knowledge_edges, conversation_sessions; enable pgvector.

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
    conn = op.get_bind()

    # ── 1. pgvector extension ──────────────────────────────────────────────────
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')

    # ── 2. PostgreSQL ENUM types ───────────────────────────────────────────────
    # Use DO $$ ... $$ to be idempotent (safe to run twice)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE content_type_enum AS ENUM (
                'code', 'architecture-diagram', 'dense-text', 'data-visualization',
                'ui-design', 'mathematical', 'image', 'table', 'unknown'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    op.execute("""
        DO $$ BEGIN
            CREATE TYPE mode_enum AS ENUM (
                'eli5', 'technical', 'summary', 'code-review', 'translate'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    op.execute("""
        DO $$ BEGIN
            CREATE TYPE edge_label_enum AS ENUM (
                'relates to', 'extends', 'contradicts', 'exemplifies'
            );
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # ── 3. scan_records ────────────────────────────────────────────────────────
    if not conn.dialect.has_table(conn, 'scan_records'):
        op.create_table(
            'scan_records',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('user_id', sa.String(36),
                      sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('session_id', sa.String(36), nullable=True),
            sa.Column('content_type',
                      sa.Enum('code', 'architecture-diagram', 'dense-text',
                              'data-visualization', 'ui-design', 'mathematical',
                              'image', 'table', 'unknown',
                              name='content_type_enum', create_type=False),
                      nullable=False, server_default='unknown'),
            sa.Column('mode',
                      sa.Enum('eli5', 'technical', 'summary', 'code-review', 'translate',
                              name='mode_enum', create_type=False),
                      nullable=False, server_default='technical'),
            sa.Column('image_hash', sa.String(64), nullable=False, server_default=''),
            sa.Column('result_text', sa.Text(), nullable=False, server_default=''),
            sa.Column('key_points', postgresql.JSONB(), nullable=True),
            sa.Column('specialized_analysis', postgresql.JSONB(), nullable=True),
            sa.Column('reasoning_trace', postgresql.JSONB(), nullable=True),
            sa.Column('page_url', sa.String(2048), nullable=False, server_default=''),
            sa.Column('page_title', sa.String(512), nullable=False, server_default=''),
            sa.Column('page_domain', sa.String(255), nullable=False, server_default=''),
            sa.Column('tags', postgresql.ARRAY(sa.String()), nullable=True),
            sa.Column('starred', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('latency_ms', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('model_used', sa.String(128), nullable=False, server_default=''),
            sa.Column('provider_used', sa.String(64), nullable=False, server_default=''),
            sa.Column('created_at', sa.DateTime(timezone=True),
                      nullable=False, server_default=sa.text('NOW()')),
            sa.Column('updated_at', sa.DateTime(timezone=True),
                      nullable=False, server_default=sa.text('NOW()')),
        )
        op.create_index('ix_scan_records_user_id', 'scan_records', ['user_id'])
        op.create_index('ix_scan_records_image_hash', 'scan_records', ['image_hash'])
        op.create_index('ix_scan_records_session_id', 'scan_records', ['session_id'])
        # GIN index for fast array containment queries on tags
        op.execute(
            "CREATE INDEX ix_scan_records_tags_gin "
            "ON scan_records USING GIN (tags)"
        )

    # ── 4. knowledge_nodes ────────────────────────────────────────────────────
    if not conn.dialect.has_table(conn, 'knowledge_nodes'):
        op.create_table(
            'knowledge_nodes',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('user_id', sa.String(36),
                      sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('scan_id', sa.String(36),
                      sa.ForeignKey('scan_records.id', ondelete='SET NULL'), nullable=True),
            sa.Column('content_type',
                      sa.Enum('code', 'architecture-diagram', 'dense-text',
                              'data-visualization', 'ui-design', 'mathematical',
                              'image', 'table', 'unknown',
                              name='content_type_enum', create_type=False),
                      nullable=False, server_default='unknown'),
            sa.Column('title', sa.String(255), nullable=False, server_default=''),
            sa.Column('summary', sa.String(500), nullable=False, server_default=''),
            sa.Column('domain', sa.String(255), nullable=False, server_default=''),
            sa.Column('tags', postgresql.ARRAY(sa.String()), nullable=True),
            # vector(1024) — pgvector column type; SQLAlchemy sees it as generic
            sa.Column('embedding', sa.Text(), nullable=True),  # overridden below
            sa.Column('created_at', sa.DateTime(timezone=True),
                      nullable=False, server_default=sa.text('NOW()')),
        )
        # Alter embedding column to proper vector type (pgvector DDL)
        op.execute('ALTER TABLE knowledge_nodes ALTER COLUMN embedding TYPE vector(1024) USING NULL')
        op.create_index('ix_knowledge_nodes_user_id', 'knowledge_nodes', ['user_id'])
        op.create_index('ix_knowledge_nodes_domain', 'knowledge_nodes', ['domain'])
        # HNSW index for fast approximate nearest neighbor cosine search
        op.execute(
            "CREATE INDEX ix_knowledge_nodes_embedding_hnsw "
            "ON knowledge_nodes "
            "USING hnsw (embedding vector_cosine_ops) "
            "WITH (m = 16, ef_construction = 64)"
        )

    # ── 5. knowledge_edges ────────────────────────────────────────────────────
    if not conn.dialect.has_table(conn, 'knowledge_edges'):
        op.create_table(
            'knowledge_edges',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('user_id', sa.String(36),
                      sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('source_node_id', sa.String(36),
                      sa.ForeignKey('knowledge_nodes.id', ondelete='CASCADE'), nullable=False),
            sa.Column('target_node_id', sa.String(36),
                      sa.ForeignKey('knowledge_nodes.id', ondelete='CASCADE'), nullable=False),
            sa.Column('similarity', sa.Float(), nullable=False, server_default='0.0'),
            sa.Column('label',
                      sa.Enum('relates to', 'extends', 'contradicts', 'exemplifies',
                              name='edge_label_enum', create_type=False),
                      nullable=False, server_default='relates to'),
            sa.Column('created_at', sa.DateTime(timezone=True),
                      nullable=False, server_default=sa.text('NOW()')),
        )
        op.create_index('ix_knowledge_edges_user_id', 'knowledge_edges', ['user_id'])
        op.create_index('ix_knowledge_edges_source', 'knowledge_edges', ['source_node_id'])
        op.create_index('ix_knowledge_edges_target', 'knowledge_edges', ['target_node_id'])

    # ── 6. conversation_sessions ──────────────────────────────────────────────
    if not conn.dialect.has_table(conn, 'conversation_sessions'):
        op.create_table(
            'conversation_sessions',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('user_id', sa.String(36),
                      sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('messages', postgresql.JSONB(), nullable=True,
                      server_default=sa.text("'[]'::jsonb")),
            sa.Column('scan_ids', postgresql.ARRAY(sa.String(36)), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True),
                      nullable=False, server_default=sa.text('NOW()')),
            sa.Column('updated_at', sa.DateTime(timezone=True),
                      nullable=False, server_default=sa.text('NOW()')),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index('ix_conversation_sessions_user_id', 'conversation_sessions', ['user_id'])
        op.create_index('ix_conversation_sessions_expires_at',
                        'conversation_sessions', ['expires_at'])


def downgrade() -> None:
    op.drop_table('conversation_sessions')
    op.drop_table('knowledge_edges')
    op.drop_table('knowledge_nodes')
    op.drop_table('scan_records')
    op.execute('DROP TYPE IF EXISTS edge_label_enum')
    op.execute('DROP TYPE IF EXISTS mode_enum')
    op.execute('DROP TYPE IF EXISTS content_type_enum')
    # Note: do NOT drop the vector extension — it may be used by other schemas
```

- [ ] Step 4: With Docker services running, apply the migration:
```bash
cd backend
# Ensure the pgvector image is running (Task 1 must be complete)
docker compose up -d db
sleep 5  # wait for postgres to be ready
alembic upgrade head
```

- [ ] Step 5: Verify all four tables exist in the database:
```bash
cd backend
python -c "
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from app.core.config import get_settings

settings = get_settings()

async def check():
    engine = create_async_engine(settings.database_url)
    async with engine.connect() as conn:
        result = await conn.execute(
            __import__('sqlalchemy').text(
                \"SELECT table_name FROM information_schema.tables \"
                \"WHERE table_schema='public' ORDER BY table_name\"
            )
        )
        tables = [r[0] for r in result]
        print('Tables:', tables)
        for t in ['scan_records', 'knowledge_nodes', 'knowledge_edges', 'conversation_sessions']:
            assert t in tables, f'MISSING: {t}'
        print('All 4 tables verified OK')
    await engine.dispose()

asyncio.run(check())
"
```

- [ ] Step 6: Verify the HNSW index and GIN index were created:
```bash
cd backend
python -c "
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from app.core.config import get_settings

settings = get_settings()

async def check():
    engine = create_async_engine(settings.database_url)
    async with engine.connect() as conn:
        result = await conn.execute(text(
            \"SELECT indexname, tablename FROM pg_indexes \"
            \"WHERE indexname IN (\"
            \"  'ix_scan_records_tags_gin',\"
            \"  'ix_knowledge_nodes_embedding_hnsw'\"
            \")\"
        ))
        idxs = [(r[0], r[1]) for r in result]
        print('Indexes found:', idxs)
        assert len(idxs) == 2, f'Expected 2 indexes, got {len(idxs)}'
        print('GIN and HNSW indexes verified OK')
    await engine.dispose()

asyncio.run(check())
"
```

- [ ] Step 7: Commit:
```bash
git add backend/alembic/env.py backend/alembic/versions/002_scan_knowledge_session.py
git commit -m "feat(db): migration 002 — pgvector extension, scan_records, knowledge graph, sessions"
```

---

## Phase 2 — Backend Services

### Task 8: Rewrite knowledge_graph.py with pgvector

**Files:**
- Modify: `backend/app/services/knowledge_graph.py`

Replace the Redis-only implementation with PostgreSQL as the primary store. `add_node()` writes to `knowledge_nodes` and `knowledge_edges` tables, then mirrors the node to Redis for 24h as a hot cache. `find_related()` uses pgvector's `<=>` cosine distance operator via a raw SQL query. `get_graph()` reads from PostgreSQL with a simple SELECT. Redis hot cache is checked first in `find_related()` for performance.

- [ ] Step 1: Overwrite `backend/app/services/knowledge_graph.py` with:
```python
"""
Knowledge Graph Service — pgvector-backed with Redis hot cache.

Primary store: PostgreSQL (knowledge_nodes, knowledge_edges tables).
Hot cache: Redis key kg:{user_id}:node:{node_id}, TTL 24h.

pgvector cosine distance operator: <=>
  ORDER BY embedding <=> :query_emb LIMIT 5
  (lower distance = more similar; threshold: distance < 0.28 ≈ similarity > 0.72)
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, UTC
from typing import Optional

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import AsyncSessionLocal
from ..core.redis_client import get_redis
from ..services.nvidia_service import get_embedding

log = structlog.get_logger()

# Cosine distance threshold: 1 - 0.72 = 0.28
_SIMILARITY_THRESHOLD = 0.72
_DISTANCE_THRESHOLD = 1.0 - _SIMILARITY_THRESHOLD   # 0.28
_REDIS_NODE_TTL = 3600 * 24        # 24h hot cache
_REDIS_INDEX_TTL = 3600 * 24 * 90  # 90d index


class KnowledgeGraphService:
    """
    Manages the user's personal knowledge graph.

    Nodes are stored in knowledge_nodes (PostgreSQL + pgvector).
    Edges are stored in knowledge_edges (PostgreSQL).
    Hot node cache lives in Redis (kg:{user_id}:node:{node_id}).
    """

    # ── Public API ─────────────────────────────────────────────────────────────

    async def add_node(
        self,
        user_id: str,
        scan_id: str,
        content_type: str,
        title: str,
        explanation: str,
        domain: str,
        tags: list[str],
    ) -> None:
        """
        Persist a new knowledge node from a completed scan.
        Steps:
          1. Generate embedding via NVIDIA NIM.
          2. Insert into knowledge_nodes.
          3. Mirror to Redis hot cache.
          4. Find and persist edges to similar existing nodes.
        """
        embed_text = f"{title}. {explanation[:1500]}"
        try:
            embedding = await get_embedding(embed_text, input_type='passage')
        except Exception as exc:
            log.warning('kg.embedding_failed', error=str(exc))
            embedding = None

        node_id = scan_id  # node ID = scan ID for direct lookup

        async with AsyncSessionLocal() as db:
            try:
                await self._insert_node(
                    db, node_id, user_id, scan_id, content_type,
                    title, explanation, domain, tags, embedding,
                )
                await db.commit()
            except Exception as exc:
                await db.rollback()
                log.error('kg.insert_node_failed', error=str(exc))
                return

        # Mirror to Redis hot cache (non-blocking; failure is acceptable)
        await self._cache_node(user_id, node_id, {
            'id': node_id,
            'scan_id': scan_id,
            'content_type': content_type,
            'title': title[:100],
            'domain': domain,
            'tags': tags,
            'embedding': embedding or [],
        })

        # Create edges to semantically similar existing nodes
        if embedding:
            await self._create_connections(user_id, node_id, embedding, content_type)

    async def find_related(
        self,
        user_id: str,
        content_type: str,
        text_snippet: str,
        limit: int = 5,
    ) -> list[str]:
        """
        Return up to `limit` scan IDs of semantically related nodes,
        using pgvector ANN search (HNSW index).

        Returns empty list on any failure — never raises.
        """
        try:
            query_vec = await get_embedding(text_snippet[:1000], input_type='query')
            if not query_vec:
                return []

            # Format as pgvector literal: '[0.1, 0.2, ...]'
            vec_literal = '[' + ','.join(str(v) for v in query_vec) + ']'

            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    text("""
                        SELECT id, (embedding <=> CAST(:query_emb AS vector)) AS distance
                        FROM knowledge_nodes
                        WHERE user_id = :user_id
                          AND embedding IS NOT NULL
                          AND (embedding <=> CAST(:query_emb AS vector)) < :threshold
                        ORDER BY distance ASC
                        LIMIT :limit
                    """),
                    {
                        'user_id': user_id,
                        'query_emb': vec_literal,
                        'threshold': _DISTANCE_THRESHOLD,
                        'limit': limit,
                    },
                )
                rows = result.fetchall()
                return [str(r[0]) for r in rows]
        except Exception as exc:
            log.warning('kg.find_related_failed', error=str(exc))
            return []

    async def get_graph(self, user_id: str) -> dict:
        """
        Return all nodes and edges for the user's knowledge graph.
        Embeddings are stripped — the browser does not need 1024-float vectors.
        """
        try:
            async with AsyncSessionLocal() as db:
                node_result = await db.execute(
                    text("""
                        SELECT id, scan_id, content_type, title, summary,
                               domain, tags, created_at
                        FROM knowledge_nodes
                        WHERE user_id = :user_id
                        ORDER BY created_at DESC
                        LIMIT 200
                    """),
                    {'user_id': user_id},
                )
                nodes = [
                    {
                        'id': str(r[0]),
                        'scan_id': str(r[1]) if r[1] else None,
                        'content_type': r[2],
                        'title': r[3],
                        'summary': r[4],
                        'domain': r[5],
                        'tags': r[6] or [],
                        'created_at': r[7].isoformat() if r[7] else None,
                    }
                    for r in node_result
                ]

                node_ids = [n['id'] for n in nodes]
                if not node_ids:
                    return {'nodes': [], 'edges': []}

                edge_result = await db.execute(
                    text("""
                        SELECT id, source_node_id, target_node_id, similarity, label, created_at
                        FROM knowledge_edges
                        WHERE user_id = :user_id
                          AND source_node_id = ANY(:node_ids)
                        ORDER BY similarity DESC
                        LIMIT 500
                    """),
                    {'user_id': user_id, 'node_ids': node_ids},
                )
                edges = [
                    {
                        'id': str(r[0]),
                        'source': str(r[1]),
                        'target': str(r[2]),
                        'similarity': float(r[3]),
                        'label': r[4],
                        'created_at': r[5].isoformat() if r[5] else None,
                    }
                    for r in edge_result
                ]

            return {'nodes': nodes, 'edges': edges}
        except Exception as exc:
            log.error('kg.get_graph_failed', error=str(exc))
            return {'nodes': [], 'edges': []}

    # ── Private helpers ────────────────────────────────────────────────────────

    async def _insert_node(
        self,
        db: AsyncSession,
        node_id: str,
        user_id: str,
        scan_id: str,
        content_type: str,
        title: str,
        explanation: str,
        domain: str,
        tags: list[str],
        embedding: Optional[list[float]],
    ) -> None:
        summary = explanation[:500]
        vec_literal = (
            '[' + ','.join(str(v) for v in embedding) + ']'
            if embedding else None
        )
        await db.execute(
            text("""
                INSERT INTO knowledge_nodes
                    (id, user_id, scan_id, content_type, title, summary, domain, tags, embedding, created_at)
                VALUES
                    (:id, :user_id, :scan_id, CAST(:content_type AS content_type_enum),
                     :title, :summary, :domain, :tags,
                     CAST(:embedding AS vector), NOW())
                ON CONFLICT (id) DO NOTHING
            """),
            {
                'id': node_id,
                'user_id': user_id,
                'scan_id': scan_id,
                'content_type': content_type,
                'title': title[:255],
                'summary': summary,
                'domain': domain,
                'tags': tags,
                'embedding': vec_literal,
            },
        )

    async def _create_connections(
        self,
        user_id: str,
        new_node_id: str,
        embedding: list[float],
        content_type: str,
    ) -> None:
        """
        Find similar existing nodes and persist edges.
        Edge label is assigned by simple heuristic; Task 8 extension point
        for Claude Haiku label assignment is in knowledge.py API (Task 15).
        """
        try:
            vec_literal = '[' + ','.join(str(v) for v in embedding) + ']'
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    text("""
                        SELECT id, content_type,
                               (embedding <=> CAST(:query_emb AS vector)) AS distance
                        FROM knowledge_nodes
                        WHERE user_id = :user_id
                          AND id != :new_node_id
                          AND embedding IS NOT NULL
                          AND (embedding <=> CAST(:query_emb AS vector)) < :threshold
                        ORDER BY distance ASC
                        LIMIT 10
                    """),
                    {
                        'user_id': user_id,
                        'query_emb': vec_literal,
                        'new_node_id': new_node_id,
                        'threshold': _DISTANCE_THRESHOLD,
                    },
                )
                similar = result.fetchall()

                for row in similar:
                    existing_id = str(row[0])
                    existing_ct = row[1]
                    distance = float(row[2])
                    similarity = round(1.0 - distance, 4)

                    # Heuristic label assignment
                    if existing_ct == content_type:
                        label = 'relates to'
                    else:
                        label = 'relates to'  # Claude Haiku label override via PATCH /edges/{id}

                    edge_id = str(uuid.uuid4())
                    rev_edge_id = str(uuid.uuid4())

                    await db.execute(
                        text("""
                            INSERT INTO knowledge_edges
                                (id, user_id, source_node_id, target_node_id, similarity, label, created_at)
                            VALUES
                                (:id, :user_id, :source, :target, :similarity,
                                 CAST(:label AS edge_label_enum), NOW()),
                                (:rev_id, :user_id, :target, :source, :similarity,
                                 CAST(:label AS edge_label_enum), NOW())
                            ON CONFLICT DO NOTHING
                        """),
                        {
                            'id': edge_id,
                            'rev_id': rev_edge_id,
                            'user_id': user_id,
                            'source': new_node_id,
                            'target': existing_id,
                            'similarity': similarity,
                            'label': label,
                        },
                    )
                await db.commit()
        except Exception as exc:
            log.warning('kg.create_connections_failed', error=str(exc))

    async def _cache_node(self, user_id: str, node_id: str, node_data: dict) -> None:
        """Mirror node to Redis hot cache (TTL 24h)."""
        try:
            redis = await get_redis()
            key = f'kg:{user_id}:node:{node_id}'
            await redis.setex(key, _REDIS_NODE_TTL, json.dumps(node_data))
        except Exception:
            pass  # Cache miss is acceptable
```

- [ ] Step 2: Verify import chain:
```bash
cd backend
python -c "from app.services.knowledge_graph import KnowledgeGraphService; print('kg service OK')"
```

- [ ] Step 3: Commit:
```bash
git add backend/app/services/knowledge_graph.py
git commit -m "feat(services): rewrite knowledge_graph.py with pgvector SQL queries and Redis hot cache"
```

---

### Task 9: Add Circuit Breaker and Tenacity Retry to ai_providers.py

**Files:**
- Modify: `backend/app/services/ai_providers.py`
- Modify: `backend/app/core/config.py`

The circuit breaker uses Redis as shared state so multiple Uvicorn workers respect the same open/closed state. The tenacity `@retry` decorator wraps each provider's individual stream function. Per-provider timeouts replace the hardcoded `timeout=120` on each `httpx.AsyncClient`. `tenacity` is already in `requirements.txt` at `==8.4.2`.

- [ ] Step 1: Add `PROVIDER_TIMEOUTS` to `backend/app/core/config.py`. Inside the `Settings` class, after the `sentry_dsn` field, add:
```python
    # Per-provider HTTP timeouts (seconds)
    PROVIDER_TIMEOUTS: dict = {
        'anthropic': 60,
        'openai': 45,
        'groq': 30,
        'google': 45,
        'nvidia': 60,
        'together': 30,
        'xai': 30,
        'openrouter': 30,
    }
```

- [ ] Step 2: Add the `CircuitBreaker` class and updated retry imports to the top of `backend/app/services/ai_providers.py`. After the existing imports block (after `from ..core.config import get_settings`), add:
```python
import json
import time as _time

import structlog
from tenacity import (
    retry, stop_after_attempt, wait_exponential, retry_if_exception_type,
)

log = structlog.get_logger()


class CircuitBreaker:
    """
    Redis-backed circuit breaker per AI provider.

    States:
      closed    — normal operation, all requests pass through
      open      — provider skipped; entered after 5 failures in 60s
      half-open — one trial request allowed after 30s in open state

    Redis key: circuit:{provider_name}
    Value: JSON {failures: int, last_failure: float, state: str}
    TTL: 60s (auto-refreshed on every write)
    """

    _FAILURE_THRESHOLD = 5
    _WINDOW_SECONDS = 60
    _HALF_OPEN_AFTER = 30

    def __init__(self, provider: str):
        self.provider = provider
        self._key = f'circuit:{provider}'

    async def _get_state(self) -> dict:
        try:
            redis = await get_redis()
            raw = await redis.get(self._key)
            if raw:
                return json.loads(raw)
        except Exception:
            pass
        return {'failures': 0, 'last_failure': 0.0, 'state': 'closed'}

    async def _set_state(self, state: dict) -> None:
        try:
            redis = await get_redis()
            await redis.setex(self._key, self._WINDOW_SECONDS, json.dumps(state))
        except Exception:
            pass

    async def is_open(self) -> bool:
        """Return True if provider should be skipped."""
        state = await self._get_state()
        if state['state'] == 'closed':
            return False
        if state['state'] == 'open':
            # Transition to half-open after 30s
            if _time.time() - state['last_failure'] > self._HALF_OPEN_AFTER:
                state['state'] = 'half-open'
                await self._set_state(state)
                return False  # Allow one trial request
            return True
        # half-open: allow request
        return False

    async def record_success(self) -> None:
        state = await self._get_state()
        if state['state'] in ('half-open', 'open'):
            log.info('circuit_breaker.closed', provider=self.provider)
        await self._set_state({'failures': 0, 'last_failure': 0.0, 'state': 'closed'})

    async def record_failure(self) -> None:
        state = await self._get_state()
        state['failures'] += 1
        state['last_failure'] = _time.time()
        if state['failures'] >= self._FAILURE_THRESHOLD:
            if state['state'] != 'open':
                log.warning('circuit_breaker.opened', provider=self.provider,
                            failures=state['failures'])
            state['state'] = 'open'
        await self._set_state(state)


# Per-provider circuit breakers (lazily instantiated)
_circuit_breakers: dict[str, CircuitBreaker] = {}


def get_circuit_breaker(provider: str) -> CircuitBreaker:
    if provider not in _circuit_breakers:
        _circuit_breakers[provider] = CircuitBreaker(provider)
    return _circuit_breakers[provider]


# Tenacity retry decorator — applies to individual provider stream calls
def _provider_retry():
    return retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.ConnectError)),
        reraise=True,
    )
```

- [ ] Step 3: Replace the hardcoded `timeout=120` in each `httpx.AsyncClient(timeout=120)` call throughout `ai_providers.py` with a lookup from `settings.PROVIDER_TIMEOUTS`. For example, `stream_openai` becomes:
```python
async with httpx.AsyncClient(timeout=settings.PROVIDER_TIMEOUTS.get('openai', 45)) as client:
```
Apply the same pattern to `stream_groq` (30), `stream_together` (30), `stream_xai` (30), `stream_openrouter` (30), `stream_nvidia` (60), `stream_gemini` (45). The `stream_anthropic` function uses the Anthropic SDK which has its own timeout mechanism — skip that one.

- [ ] Step 4: Wrap each provider stream function with the tenacity retry decorator. Add `@_provider_retry()` immediately above each `async def stream_*` function definition. Example:
```python
@_provider_retry()
async def stream_openai(system, messages, model, max_tokens=4096):
    ...
```
Apply to: `stream_openai`, `stream_gemini`, `stream_groq`, `stream_together`, `stream_xai`, `stream_openrouter`, `stream_nvidia`. Do NOT apply to `stream_anthropic` — the Anthropic SDK has its own retry mechanism.

- [ ] Step 5: Update `ProviderRouter.stream()` to check the circuit breaker before calling each provider. In the `for provider in ordered:` loop, add a circuit breaker check at the top of the loop body:
```python
for provider in ordered:
    cb = get_circuit_breaker(provider)
    if await cb.is_open():
        log.info('circuit_breaker.skipping', provider=provider)
        continue
    try:
        # ... existing provider dispatch code ...
        await cb.record_success()
        return
    except Exception as exc:
        await cb.record_failure()
        last_error = exc
        continue
```
The `await cb.record_success()` call must be placed just before each `return` inside the try block (after all chunks have been yielded). Since `stream()` is an async generator, use `return` after the loop over chunks.

- [ ] Step 6: Verify imports and syntax:
```bash
cd backend
python -c "from app.services.ai_providers import get_provider_router, CircuitBreaker, get_circuit_breaker; print('ai_providers OK')"
```

- [ ] Step 7: Commit:
```bash
git add backend/app/services/ai_providers.py backend/app/core/config.py
git commit -m "feat(services): add Redis circuit breaker and tenacity retry to ai_providers"
```

---

### Task 10: Upgrade content_classifier.py Cache to Redis

**Files:**
- Modify: `backend/app/services/content_classifier.py`

The in-process `self._cache: dict` is unbounded and lost on restart. Replace with Redis `setex` (6h TTL). The cache key uses `md5(image_b64[:5000])` — same hash used today but stored in Redis instead of a dict. Redis `allkeys-lru` policy (already configured in docker-compose) enforces the memory bound.

- [ ] Step 1: Remove the `self._cache: dict[str, dict] = {}` instance variable from `ContentClassifier.__init__()`. The constructor becomes:
```python
def __init__(self):
    pass  # no local cache — Redis is the cache
```

- [ ] Step 2: Replace the `classify()` method to use Redis get/set instead of `self._cache`:
```python
async def classify(self, image_b64: str) -> dict:
    cache_key = f'classifier:{self._image_hash(image_b64)}'

    # Check Redis cache first
    try:
        from ..core.redis_client import get_redis
        redis = await get_redis()
        cached_raw = await redis.get(cache_key)
        if cached_raw:
            return json.loads(cached_raw)
    except Exception:
        pass  # Redis unavailable — proceed to API call

    try:
        result = await self._classify_nvidia(image_b64)
        # Cache in Redis for 6 hours
        try:
            redis = await get_redis()
            await redis.setex(cache_key, 21600, json.dumps(result))
        except Exception:
            pass  # Cache write failure is non-fatal
        return result
    except Exception as e:
        return {
            'content_type': 'unknown',
            'confidence': 0.0,
            'detected_language': None,
            'signals': [f'Classification error: {str(e)}'],
            'secondary_type': None,
        }
```

- [ ] Step 3: Verify the module loads cleanly (no import of removed `_cache`):
```bash
cd backend
python -c "from app.services.content_classifier import get_classifier, ContentClassifier; c = get_classifier(); print('classifier OK, has _cache:', hasattr(c, '_cache'))"
```
Expected output: `classifier OK, has _cache: False`

- [ ] Step 4: Commit:
```bash
git add backend/app/services/content_classifier.py
git commit -m "feat(services): replace unbounded in-process classifier cache with Redis LRU (6h TTL)"
```

---

### Task 11: Replace Regex Extraction with Claude Tool-Use in ai_pipeline.py

**Files:**
- Modify: `backend/app/services/ai_pipeline.py`

The current `_extract_key_points`, `_extract_code_analysis`, `_extract_diagram_analysis`, `_extract_data_insights` methods use brittle regex/string splitting on the streamed text. Replace them with a single `_extract_structured()` async function that calls Claude Haiku with tool-use after streaming completes. Define four tool schemas as module-level constants.

- [ ] Step 1: Add the four tool definition constants at the top of `backend/app/services/ai_pipeline.py`, after the existing imports:
```python
# ── Claude Haiku Tool Definitions for Structured Extraction ───────────────────

KEY_POINTS_TOOL = {
    'name': 'extract_key_points',
    'description': 'Extract 3-7 key bullet points summarising the analysis',
    'input_schema': {
        'type': 'object',
        'properties': {
            'points': {
                'type': 'array',
                'items': {'type': 'string'},
                'minItems': 3,
                'maxItems': 7,
                'description': 'Each point is a concise actionable or informative sentence',
            }
        },
        'required': ['points'],
    },
}

CODE_ANALYSIS_TOOL = {
    'name': 'extract_code_analysis',
    'description': 'Extract structured code review data from the analysis text',
    'input_schema': {
        'type': 'object',
        'properties': {
            'language': {'type': 'string', 'description': 'Programming language detected'},
            'complexity': {
                'type': 'string',
                'enum': ['low', 'medium', 'high'],
            },
            'bugs': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'severity': {'type': 'string', 'enum': ['critical', 'warning', 'info']},
                        'description': {'type': 'string'},
                        'line': {'type': ['integer', 'null']},
                    },
                    'required': ['severity', 'description', 'line'],
                },
            },
            'optimizations': {'type': 'array', 'items': {'type': 'string'}},
            'dependencies': {'type': 'array', 'items': {'type': 'string'}},
        },
        'required': ['language', 'complexity', 'bugs', 'optimizations', 'dependencies'],
    },
}

DIAGRAM_ANALYSIS_TOOL = {
    'name': 'extract_diagram_analysis',
    'description': 'Extract structured architecture diagram analysis',
    'input_schema': {
        'type': 'object',
        'properties': {
            'components': {'type': 'array', 'items': {'type': 'string'}},
            'dataFlows': {'type': 'array', 'items': {'type': 'string'}},
            'patterns': {'type': 'array', 'items': {'type': 'string'}},
            'suggestions': {'type': 'array', 'items': {'type': 'string'}},
        },
        'required': ['components', 'dataFlows', 'patterns', 'suggestions'],
    },
}

DATA_INSIGHTS_TOOL = {
    'name': 'extract_data_insights',
    'description': 'Extract structured data visualization insights',
    'input_schema': {
        'type': 'object',
        'properties': {
            'trends': {'type': 'array', 'items': {'type': 'string'}},
            'outliers': {'type': 'array', 'items': {'type': 'string'}},
            'correlations': {'type': 'array', 'items': {'type': 'string'}},
            'actionableInsights': {'type': 'array', 'items': {'type': 'string'}},
        },
        'required': ['trends', 'outliers', 'correlations', 'actionableInsights'],
    },
}

_CONTENT_TYPE_TOOL_MAP: dict[str, dict] = {
    'code': CODE_ANALYSIS_TOOL,
    'architecture-diagram': DIAGRAM_ANALYSIS_TOOL,
    'data-visualization': DATA_INSIGHTS_TOOL,
}
```

- [ ] Step 2: Add the `_extract_structured()` async method to the `AIPipeline` class, replacing the four old `_extract_*` methods:
```python
    async def _extract_structured(
        self, accumulated_text: str, content_type: str
    ) -> dict:
        """
        Call Claude Haiku with tool-use to extract typed structured data.
        Always extracts key_points. Also extracts content-type-specific analysis
        if a tool is defined for that type.

        Returns dict with keys matching tool names:
          'extract_key_points' -> {points: list[str]}
          'extract_code_analysis' -> CodeAnalysis | None
          'extract_diagram_analysis' -> DiagramAnalysis | None
          'extract_data_insights' -> DataInsight | None
        """
        import anthropic

        specialized_tool = _CONTENT_TYPE_TOOL_MAP.get(content_type)
        tools = [KEY_POINTS_TOOL]
        if specialized_tool:
            tools.append(specialized_tool)

        try:
            client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
            response = await client.messages.create(
                model=settings.fast_model,   # claude-haiku-4-5-20251001
                max_tokens=800,
                tools=tools,
                tool_choice={'type': 'any'},
                messages=[{
                    'role': 'user',
                    'content': (
                        f'Extract structured data from this {content_type} analysis:\n\n'
                        f'{accumulated_text[:2000]}'
                    ),
                }],
            )
            results: dict = {}
            for block in response.content:
                if block.type == 'tool_use':
                    results[block.name] = block.input
            return results
        except Exception as exc:
            log.warning('pipeline.extract_structured_failed', error=str(exc))
            return {}
```

- [ ] Step 3: Update section `# ── 6. Extract structured data` in `analyze_stream()` to call `_extract_structured()` instead of the four old methods:
```python
        # ── 6. Extract structured data (Claude Haiku tool-use) ─────────────────
        structured = await self._extract_structured(full_text, content_type)

        kp_result = structured.get('extract_key_points', {})
        key_points = kp_result.get('points', [])

        code_analysis = structured.get('extract_code_analysis') if content_type == 'code' else None
        diagram_analysis = (
            structured.get('extract_diagram_analysis')
            if content_type == 'architecture-diagram' else None
        )
        data_insights = (
            structured.get('extract_data_insights')
            if content_type == 'data-visualization' else None
        )
        # Translation extraction is mode-based — keep existing string split approach
        translated_content = (
            self._extract_translation(full_text) if mode == 'translate' else None
        )
```

- [ ] Step 4: Delete (or comment out) the now-unused `_extract_key_points`, `_extract_code_analysis`, `_extract_diagram_analysis`, `_extract_data_insights` methods from the class. Keep `_extract_translation` — it is still used.

- [ ] Step 5: Add `import structlog` and `log = structlog.get_logger()` near the top of the file if not already present (check: `structlog` is already imported in other services). Also add `import anthropic` inside `_extract_structured` (already done in Step 2 — it is a local import to avoid circular issues).

- [ ] Step 6: Verify the pipeline module loads:
```bash
cd backend
python -c "from app.services.ai_pipeline import get_pipeline, KEY_POINTS_TOOL, CODE_ANALYSIS_TOOL; print('pipeline OK')"
```

- [ ] Step 7: Commit:
```bash
git add backend/app/services/ai_pipeline.py
git commit -m "feat(services): replace regex extraction with Claude Haiku tool-use in ai_pipeline"
```

---

### Task 12: Rewrite learning_paths.py with Dynamic Claude Haiku Generation

**Files:**
- Modify: `backend/app/services/learning_paths.py`

The current implementation returns static curated resources from a hardcoded dict. Replace with a Claude Haiku call that generates personalized resources from the actual analysis result text. Results are cached in Redis for 1 hour (key based on md5 of content_type + first 200 chars of result_text). The `LearningPath` dataclass is defined locally.

- [ ] Step 1: Overwrite `backend/app/services/learning_paths.py` with:
```python
"""
Learning Path Service — Dynamic Claude Haiku generation.

Replaces static curated resource dict with personalized suggestions
generated by claude-haiku-4-5-20251001 based on the actual analysis text.

Cache: Redis key lp:{md5(content_type + result[:200])}, TTL 1h.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Optional

import anthropic
import structlog

from ..core.config import get_settings
from ..core.redis_client import get_redis

settings = get_settings()
log = structlog.get_logger()

_CACHE_TTL = 3600  # 1 hour


@dataclass
class LearningPath:
    title: str
    url: str
    type: str          # 'documentation' | 'tutorial' | 'video' | 'paper' | 'course'
    difficulty: str    # 'beginner' | 'intermediate' | 'advanced'
    platform: str
    why_relevant: str  # one sentence

    def to_dict(self) -> dict:
        return {
            'title': self.title,
            'url': self.url,
            'type': self.type,
            'difficulty': self.difficulty,
            'platform': self.platform,
            'why_relevant': self.why_relevant,
        }


class LearningPathService:
    async def suggest(
        self,
        content_type: str,
        mode: str,
        result_text: str,
        user_tier: str = 'free',
    ) -> list[dict]:
        """
        Return 3 personalized learning resource suggestions.

        Falls back to empty list on any failure — never raises.
        """
        cache_key = self._cache_key(content_type, result_text)

        # Check Redis cache
        try:
            redis = await get_redis()
            cached = await redis.get(cache_key)
            if cached:
                items = json.loads(cached)
                return [LearningPath(**x).to_dict() for x in items]
        except Exception:
            pass

        # Generate with Claude Haiku
        try:
            items = await self._generate(content_type, mode, result_text)
            # Cache result
            try:
                redis = await get_redis()
                await redis.setex(cache_key, _CACHE_TTL, json.dumps(items))
            except Exception:
                pass
            return [LearningPath(**x).to_dict() for x in items]
        except Exception as exc:
            log.warning('learning_paths.generate_failed', error=str(exc))
            return []

    async def _generate(
        self, content_type: str, mode: str, result_text: str
    ) -> list[dict]:
        prompt = (
            f'Given this {content_type} content analysis (mode: {mode}):\n'
            f'{result_text[:800]}\n\n'
            'Suggest exactly 3 learning resources that would help the user go deeper. '
            'Return ONLY valid JSON array — no markdown, no explanation:\n'
            '[{"title": "...", "url": "https://...", '
            '"type": "documentation|tutorial|video|paper|course", '
            '"difficulty": "beginner|intermediate|advanced", '
            '"platform": "...", "why_relevant": "one sentence"}]'
        )

        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await client.messages.create(
            model='claude-haiku-4-5-20251001',
            max_tokens=600,
            messages=[{'role': 'user', 'content': prompt}],
        )
        text = response.content[0].text.strip()

        # Strip markdown code fences if present
        if '```json' in text:
            text = text.split('```json')[1].split('```')[0].strip()
        elif '```' in text:
            text = text.split('```')[1].split('```')[0].strip()

        items = json.loads(text)
        if not isinstance(items, list):
            return []

        # Validate and normalise each item
        valid = []
        for item in items[:3]:
            if not isinstance(item, dict):
                continue
            valid.append({
                'title': str(item.get('title', 'Unknown'))[:200],
                'url': str(item.get('url', 'https://example.com'))[:500],
                'type': item.get('type', 'tutorial'),
                'difficulty': item.get('difficulty', 'intermediate'),
                'platform': str(item.get('platform', 'Web'))[:100],
                'why_relevant': str(item.get('why_relevant', ''))[:300],
            })
        return valid

    @staticmethod
    def _cache_key(content_type: str, result_text: str) -> str:
        raw = f'{content_type}{result_text[:200]}'
        digest = hashlib.md5(raw.encode()).hexdigest()
        return f'lp:{digest}'
```

- [ ] Step 2: Update the call site in `ai_pipeline.py` — the `suggest()` signature now accepts `user_tier`. Find the existing call:
```python
self.lp_service.suggest(content_type, mode, full_text[:1000])
```
Update to:
```python
self.lp_service.suggest(content_type, mode, full_text[:1000], user_tier=user_id or 'anonymous')
```
(user_tier is a placeholder here — full tier resolution happens in Phase 3 auth integration. Pass `'free'` as default if `user_id` is None.)

- [ ] Step 3: Verify module loads:
```bash
cd backend
python -c "from app.services.learning_paths import LearningPathService, LearningPath; print('learning_paths OK')"
```

- [ ] Step 4: Commit:
```bash
git add backend/app/services/learning_paths.py backend/app/services/ai_pipeline.py
git commit -m "feat(services): rewrite learning_paths.py with dynamic Claude Haiku generation and Redis cache"
```

---

### Task 13: Add PDF Export to export_service.py

**Files:**
- Create: `backend/templates/scan_export.html`
- Modify: `backend/app/services/export_service.py`
- Modify: `backend/app/api/v1/export.py`

WeasyPrint converts HTML to PDF. Jinja2 renders the HTML template. The template directory is `backend/templates/` — WeasyPrint's `base_url` is set to this directory so relative CSS paths resolve.

- [ ] Step 1: Create the templates directory and Jinja2 HTML template at `backend/templates/scan_export.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>LensAI Export — {{ scan.content_type }}</title>
  <style>
    @page {
      margin: 2cm 2.5cm;
      @bottom-right {
        content: "Page " counter(page) " of " counter(pages);
        font-size: 9pt;
        color: #8890b4;
      }
    }
    body {
      font-family: 'Liberation Sans', Arial, sans-serif;
      font-size: 11pt;
      color: #1a1a2e;
      line-height: 1.6;
    }
    .header {
      border-bottom: 3px solid #6175f1;
      padding-bottom: 12px;
      margin-bottom: 24px;
    }
    .header h1 {
      font-size: 20pt;
      color: #6175f1;
      margin: 0 0 4px 0;
    }
    .header .meta {
      font-size: 9pt;
      color: #8890b4;
    }
    .badge {
      display: inline-block;
      background: #6175f1;
      color: white;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 9pt;
      font-weight: bold;
      margin-right: 6px;
    }
    h2 {
      font-size: 14pt;
      color: #6175f1;
      border-bottom: 1px solid #e0e0f0;
      padding-bottom: 4px;
      margin-top: 28px;
    }
    .result-text {
      background: #f8f8ff;
      border-left: 4px solid #6175f1;
      padding: 12px 16px;
      border-radius: 0 6px 6px 0;
      white-space: pre-wrap;
      font-size: 10.5pt;
    }
    .key-points ul {
      padding-left: 20px;
    }
    .key-points li {
      margin-bottom: 6px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 12px;
      border-top: 1px solid #e0e0f0;
      font-size: 9pt;
      color: #8890b4;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>LensAI Analysis Export</h1>
    <div class="meta">
      <span class="badge">{{ scan.content_type }}</span>
      <span class="badge">{{ scan.mode }}</span>
      &nbsp;|&nbsp;
      <strong>Source:</strong> {{ scan.page_domain or scan.page_url or 'Unknown' }}
      &nbsp;|&nbsp;
      <strong>Generated:</strong> {{ generated_at.strftime('%Y-%m-%d %H:%M UTC') }}
    </div>
  </div>

  {% if scan.page_title %}
  <p><strong>Page:</strong> {{ scan.page_title }}</p>
  {% endif %}

  <h2>Analysis</h2>
  <div class="result-text">{{ scan.result_text }}</div>

  {% if scan.key_points %}
  <div class="key-points">
    <h2>Key Points</h2>
    <ul>
      {% for point in scan.key_points %}
      <li>{{ point }}</li>
      {% endfor %}
    </ul>
  </div>
  {% endif %}

  {% if scan.specialized_analysis %}
  <h2>Detailed Analysis</h2>
  <pre style="background:#f0f0fa; padding:12px; border-radius:6px; font-size:9pt; overflow-x:auto;">{{ scan.specialized_analysis | tojson(indent=2) }}</pre>
  {% endif %}

  <div class="footer">
    Exported by LensAI &mdash; See more. Understand everything. &mdash; lensai.app
  </div>
</body>
</html>
```

- [ ] Step 2: Add `export_pdf()` to `backend/app/services/export_service.py`. Add these imports at the top of the file:
```python
from pathlib import Path
from datetime import datetime

from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML as WeasyHTML

_TEMPLATE_DIR = Path(__file__).parent.parent.parent / 'templates'
_jinja_env = Environment(loader=FileSystemLoader(str(_TEMPLATE_DIR)))
```
Then add the `export_pdf()` method to the `ExportService` class:
```python
    async def export_pdf(self, scan: dict) -> bytes:
        """Render scan to HTML via Jinja2, then convert to PDF with WeasyPrint."""
        template = _jinja_env.get_template('scan_export.html')
        html_str = template.render(scan=scan, generated_at=datetime.utcnow())
        pdf_bytes = WeasyHTML(
            string=html_str,
            base_url=str(_TEMPLATE_DIR),
        ).write_pdf()
        return pdf_bytes
```
Also update the `export()` method to handle `format == 'pdf'`:
```python
    async def export(self, scan: dict, format: str, options: dict) -> tuple:
        if format == 'pdf':
            pdf = await self.export_pdf(scan)
            return pdf, f'lensai-{scan["id"][:8]}.pdf'
        # ... existing elif branches unchanged ...
```

- [ ] Step 3: Update `backend/app/api/v1/export.py` to return a proper PDF `Response` when `format == 'pdf'`, instead of a JSON dict with the content. Add the import at the top:
```python
from fastapi.responses import Response
```
Update `export_scan()`:
```python
@router.post('/{scan_id}')
async def export_scan(
    scan_id: str,
    options: ExportOptions,
    user: CurrentUser = Depends(require_user),
):
    """Export a scan in the requested format."""
    redis = await get_redis()
    history_key = f'history:{user.user_id}'
    all_raw = await redis.lrange(history_key, 0, 499)
    scan = None
    for raw in all_raw:
        s = json.loads(raw)
        if s.get('id') == scan_id:
            scan = s
            break

    if not scan:
        raise HTTPException(status_code=404, detail='Scan not found')

    if options.format == 'pdf':
        pdf_bytes = await export_service.export_pdf(scan)
        return Response(
            content=pdf_bytes,
            media_type='application/pdf',
            headers={
                'Content-Disposition': f'attachment; filename="lensai-{scan_id[:8]}.pdf"',
                'Content-Length': str(len(pdf_bytes)),
            },
        )

    content, filename = await export_service.export(scan, options.format, options.model_dump())
    return {'content': content, 'filename': filename, 'format': options.format}
```

- [ ] Step 4: Verify WeasyPrint can render a minimal HTML string (confirms system libs from Task 2 are present):
```bash
cd backend
python -c "
from weasyprint import HTML
pdf = HTML(string='<html><body><h1>LensAI Test</h1></body></html>').write_pdf()
print(f'WeasyPrint OK — generated {len(pdf)} bytes')
"
```

- [ ] Step 5: Commit:
```bash
git add backend/templates/scan_export.html backend/app/services/export_service.py backend/app/api/v1/export.py
git commit -m "feat(services): add WeasyPrint PDF export with Jinja2 template"
```

---

### Task 14: Rewrite history.py API (PostgreSQL-backed)

**Files:**
- Modify: `backend/app/api/v1/history.py`

Complete rewrite. Old implementation reads/writes a Redis list. New implementation queries `scan_records` table via SQLAlchemy. Soft-delete uses `is_deleted = TRUE`. Pagination uses `LIMIT`/`OFFSET`. Filters support `content_type`, `starred`, `date_from`, `date_to`.

- [ ] Step 1: Overwrite `backend/app/api/v1/history.py` with:
```python
"""
History API — PostgreSQL-backed (replaces Redis list implementation).

All queries apply WHERE is_deleted = FALSE automatically.
Soft delete sets is_deleted = TRUE; row is never physically removed.
"""

from datetime import date, datetime, UTC
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text, select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.auth import require_user, CurrentUser
from ...core.database import get_db

router = APIRouter()


@router.get('')
async def get_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    content_type: Optional[str] = Query(None),
    starred: Optional[bool] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated scan history for authenticated user."""
    # Build dynamic WHERE clause
    conditions = ['user_id = :user_id', 'is_deleted = FALSE']
    params: dict = {'user_id': user.user_id, 'limit': limit, 'offset': offset}

    if content_type:
        conditions.append('content_type = CAST(:content_type AS content_type_enum)')
        params['content_type'] = content_type

    if starred is not None:
        conditions.append('starred = :starred')
        params['starred'] = starred

    if date_from:
        conditions.append('created_at >= :date_from')
        params['date_from'] = datetime(date_from.year, date_from.month, date_from.day,
                                       tzinfo=UTC)

    if date_to:
        conditions.append('created_at < :date_to')
        # Exclusive upper bound: end of the date_to day
        params['date_to'] = datetime(date_to.year, date_to.month, date_to.day + 1,
                                     tzinfo=UTC) if date_to.day < 28 else \
                            datetime(date_to.year, date_to.month, date_to.day,
                                     23, 59, 59, tzinfo=UTC)

    where = ' AND '.join(conditions)

    count_result = await db.execute(
        text(f'SELECT COUNT(*) FROM scan_records WHERE {where}'),
        params,
    )
    total = count_result.scalar_one()

    rows_result = await db.execute(
        text(f"""
            SELECT id, user_id, session_id, content_type, mode, image_hash,
                   result_text, key_points, specialized_analysis, reasoning_trace,
                   page_url, page_title, page_domain, tags,
                   starred, is_deleted, latency_ms, model_used, provider_used,
                   created_at, updated_at
            FROM scan_records
            WHERE {where}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    items = [_row_to_dict(r) for r in rows_result]

    return {
        'items': items,
        'total': total,
        'has_more': offset + limit < total,
    }


@router.get('/{scan_id}')
async def get_scan(
    scan_id: str,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a single scan record or 404."""
    result = await db.execute(
        text("""
            SELECT id, user_id, session_id, content_type, mode, image_hash,
                   result_text, key_points, specialized_analysis, reasoning_trace,
                   page_url, page_title, page_domain, tags,
                   starred, is_deleted, latency_ms, model_used, provider_used,
                   created_at, updated_at
            FROM scan_records
            WHERE id = :id AND user_id = :user_id AND is_deleted = FALSE
        """),
        {'id': scan_id, 'user_id': user.user_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail='Scan not found')
    return _row_to_dict(row)


@router.delete('/{scan_id}', status_code=204)
async def delete_scan(
    scan_id: str,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a scan (sets is_deleted = TRUE). Returns 204 No Content."""
    result = await db.execute(
        text("""
            UPDATE scan_records
            SET is_deleted = TRUE, updated_at = NOW()
            WHERE id = :id AND user_id = :user_id AND is_deleted = FALSE
        """),
        {'id': scan_id, 'user_id': user.user_id},
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail='Scan not found')
    # 204 — FastAPI returns empty body automatically


@router.post('/{scan_id}/star')
async def star_scan(
    scan_id: str,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle the starred flag. Returns {starred: bool}."""
    # Read current value first
    current = await db.execute(
        text('SELECT starred FROM scan_records WHERE id = :id AND user_id = :user_id AND is_deleted = FALSE'),
        {'id': scan_id, 'user_id': user.user_id},
    )
    row = current.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail='Scan not found')

    new_starred = not row[0]
    await db.execute(
        text('UPDATE scan_records SET starred = :starred, updated_at = NOW() WHERE id = :id'),
        {'starred': new_starred, 'id': scan_id},
    )
    return {'starred': new_starred}


def _row_to_dict(row) -> dict:
    return {
        'id': str(row[0]),
        'user_id': str(row[1]) if row[1] else None,
        'session_id': str(row[2]) if row[2] else None,
        'content_type': row[3],
        'mode': row[4],
        'image_hash': row[5],
        'result_text': row[6],
        'key_points': row[7],
        'specialized_analysis': row[8],
        'reasoning_trace': row[9],
        'page_url': row[10],
        'page_title': row[11],
        'page_domain': row[12],
        'tags': row[13] or [],
        'starred': row[14],
        'is_deleted': row[15],
        'latency_ms': row[16],
        'model_used': row[17],
        'provider_used': row[18],
        'created_at': row[19].isoformat() if row[19] else None,
        'updated_at': row[20].isoformat() if row[20] else None,
    }
```

- [ ] Step 2: Verify the router loads with no import errors:
```bash
cd backend
python -c "from app.api.v1.history import router; print('history router OK, routes:', [r.path for r in router.routes])"
```

- [ ] Step 3: Test the GET endpoint against the running database:
```bash
# With the API server running (uvicorn app.main:app --reload):
curl -s -H "Authorization: Bearer <token>" http://localhost:8000/api/v1/history?limit=5 | python -m json.tool
```

- [ ] Step 4: Commit:
```bash
git add backend/app/api/v1/history.py
git commit -m "feat(api): rewrite history.py with PostgreSQL queries, soft delete, and pagination filters"
```

---

### Task 15: Rewrite knowledge.py API (pgvector + edge PATCH)

**Files:**
- Modify: `backend/app/api/v1/knowledge.py`

Replace Redis-backed `KnowledgeGraphService.get_graph()` and `find_related()` calls with the new PostgreSQL-backed versions (Task 8 service is already updated). Add `PATCH /api/v1/knowledge/edges/{edge_id}` endpoint for label updates. Add `GET /api/v1/knowledge` with `limit`/`offset` pagination.

- [ ] Step 1: Overwrite `backend/app/api/v1/knowledge.py` with:
```python
"""
Knowledge Graph API — pgvector-backed.

Endpoints:
  GET  /api/v1/knowledge                      — paginated graph (nodes + edges)
  GET  /api/v1/knowledge/{node_id}/related    — top-5 related nodes by cosine similarity
  PATCH /api/v1/knowledge/edges/{edge_id}     — update edge label
"""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.auth import require_user, CurrentUser
from ...core.database import get_db
from ...services.knowledge_graph import KnowledgeGraphService

router = APIRouter()
kg = KnowledgeGraphService()

_VALID_LABELS = {'relates to', 'extends', 'contradicts', 'exemplifies'}
_SIMILARITY_THRESHOLD = 0.72


class EdgeLabelUpdate(BaseModel):
    label: Literal['relates to', 'extends', 'contradicts', 'exemplifies']


@router.get('')
async def get_graph(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: CurrentUser = Depends(require_user),
):
    """Return the user's knowledge graph (nodes + edges)."""
    graph = await kg.get_graph(user.user_id)
    nodes = graph.get('nodes', [])
    edges = graph.get('edges', [])

    # Apply pagination to nodes (edges are pre-filtered to match returned nodes)
    paginated_nodes = nodes[offset: offset + limit]
    node_ids = {n['id'] for n in paginated_nodes}
    filtered_edges = [
        e for e in edges
        if e['source'] in node_ids or e['target'] in node_ids
    ]

    return {
        'nodes': paginated_nodes,
        'edges': filtered_edges,
        'total_nodes': len(nodes),
    }


@router.get('/{node_id}/related')
async def get_related(
    node_id: str,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return top-5 nodes related to node_id using pgvector cosine similarity.
    Threshold: similarity >= 0.72 (distance <= 0.28).
    """
    # Fetch the source node's embedding
    result = await db.execute(
        text("""
            SELECT embedding, content_type
            FROM knowledge_nodes
            WHERE id = :node_id AND user_id = :user_id
        """),
        {'node_id': node_id, 'user_id': user.user_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail='Node not found')

    embedding_val = row[0]
    if embedding_val is None:
        return []

    # pgvector returns embeddings as a list or string depending on driver
    if isinstance(embedding_val, str):
        vec_literal = embedding_val  # already in '[...]' format from pgvector
    else:
        vec_literal = '[' + ','.join(str(v) for v in embedding_val) + ']'

    related_result = await db.execute(
        text("""
            SELECT id, content_type, title, summary, domain, tags, created_at,
                   (1.0 - (embedding <=> CAST(:query_emb AS vector))) AS similarity
            FROM knowledge_nodes
            WHERE user_id = :user_id
              AND id != :node_id
              AND embedding IS NOT NULL
              AND (embedding <=> CAST(:query_emb AS vector)) <= :distance_threshold
            ORDER BY similarity DESC
            LIMIT 5
        """),
        {
            'user_id': user.user_id,
            'node_id': node_id,
            'query_emb': vec_literal,
            'distance_threshold': 1.0 - _SIMILARITY_THRESHOLD,
        },
    )

    return [
        {
            'node': {
                'id': str(r[0]),
                'content_type': r[1],
                'title': r[2],
                'summary': r[3],
                'domain': r[4],
                'tags': r[5] or [],
                'created_at': r[6].isoformat() if r[6] else None,
            },
            'similarity': round(float(r[7]), 4),
        }
        for r in related_result
    ]


@router.patch('/edges/{edge_id}')
async def update_edge_label(
    edge_id: str,
    body: EdgeLabelUpdate,
    user: CurrentUser = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the label on a knowledge graph edge."""
    result = await db.execute(
        text("""
            UPDATE knowledge_edges
            SET label = CAST(:label AS edge_label_enum)
            WHERE id = :edge_id AND user_id = :user_id
            RETURNING id, source_node_id, target_node_id, similarity, label, created_at
        """),
        {'edge_id': edge_id, 'user_id': user.user_id, 'label': body.label},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail='Edge not found')

    return {
        'id': str(row[0]),
        'source': str(row[1]),
        'target': str(row[2]),
        'similarity': float(row[3]),
        'label': row[4],
        'created_at': row[5].isoformat() if row[5] else None,
    }
```

- [ ] Step 2: Verify router loads:
```bash
cd backend
python -c "from app.api.v1.knowledge import router; print('knowledge router OK, routes:', [r.path for r in router.routes])"
```

- [ ] Step 3: Commit:
```bash
git add backend/app/api/v1/knowledge.py
git commit -m "feat(api): rewrite knowledge.py with pgvector queries and PATCH /edges/{id} endpoint"
```

---

### Task 16: Create session_service.py

**Files:**
- Create: `backend/app/services/session_service.py`

Three async functions: `get_or_create`, `append_messages` (cap 10, atomic fetch-update), `get_history`. Uses `AsyncSessionLocal` directly (not a FastAPI dependency) because it is called as a fire-and-forget task from the analyze pipeline.

- [ ] Step 1: Create `backend/app/services/session_service.py`:
```python
"""
Session Service — server-side conversation session persistence.

Message cap: 10 messages (5 turns). append_messages() truncates
to the last 10 after appending, atomically.

Sessions expire after 7 days (expires_at field).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, UTC
from typing import Optional

import structlog
from sqlalchemy import text

from ..core.database import AsyncSessionLocal

log = structlog.get_logger()

_MESSAGE_CAP = 10
_SESSION_TTL_DAYS = 7


async def get_or_create(
    session_id: Optional[str],
    user_id: Optional[str],
) -> dict:
    """
    Return an existing session or create a new one.

    If session_id is None, a new UUID is generated server-side.
    Returns: {session_id: str, created_at: str, is_new: bool}
    """
    if not session_id:
        session_id = str(uuid.uuid4())

    expires_at = datetime.now(UTC) + timedelta(days=_SESSION_TTL_DAYS)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text('SELECT id, created_at FROM conversation_sessions WHERE id = :id'),
            {'id': session_id},
        )
        row = result.fetchone()

        if row:
            return {
                'session_id': str(row[0]),
                'created_at': row[1].isoformat() if row[1] else None,
                'is_new': False,
            }

        # Create new session
        await db.execute(
            text("""
                INSERT INTO conversation_sessions
                    (id, user_id, messages, scan_ids, created_at, updated_at, expires_at)
                VALUES
                    (:id, :user_id, '[]'::jsonb, ARRAY[]::varchar[], NOW(), NOW(), :expires_at)
                ON CONFLICT (id) DO NOTHING
            """),
            {'id': session_id, 'user_id': user_id, 'expires_at': expires_at},
        )
        await db.commit()

    return {
        'session_id': session_id,
        'created_at': datetime.now(UTC).isoformat(),
        'is_new': True,
    }


async def append_messages(session_id: str, new_messages: list[dict]) -> int:
    """
    Append new_messages to the session's message list.
    Truncates total to last _MESSAGE_CAP (10) messages after appending.

    Returns the new total message count.
    """
    if not new_messages:
        return 0

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text('SELECT messages FROM conversation_sessions WHERE id = :id FOR UPDATE'),
            {'id': session_id},
        )
        row = result.fetchone()
        if not row:
            log.warning('session_service.append.not_found', session_id=session_id)
            return 0

        existing = row[0] if isinstance(row[0], list) else []
        combined = existing + new_messages
        # Keep only the last MESSAGE_CAP messages (truncate oldest)
        capped = combined[-_MESSAGE_CAP:]

        await db.execute(
            text("""
                UPDATE conversation_sessions
                SET messages = :messages::jsonb, updated_at = NOW()
                WHERE id = :id
            """),
            {'messages': json.dumps(capped), 'id': session_id},
        )
        await db.commit()

    return len(capped)


async def get_history(session_id: str) -> list[dict]:
    """
    Return the message history for a session.
    Returns empty list if session not found.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text("""
                SELECT messages, scan_ids
                FROM conversation_sessions
                WHERE id = :id
            """),
            {'id': session_id},
        )
        row = result.fetchone()
        if not row:
            return []
        messages = row[0] if isinstance(row[0], list) else []
        return messages
```

- [ ] Step 2: Verify import:
```bash
cd backend
python -c "from app.services.session_service import get_or_create, append_messages, get_history; print('session_service OK')"
```

- [ ] Step 3: Commit:
```bash
git add backend/app/services/session_service.py
git commit -m "feat(services): create session_service.py with get_or_create, append_messages (cap 10), get_history"
```

---

### Task 17: Create sessions.py API Router

**Files:**
- Create: `backend/app/api/v1/sessions.py`

Four endpoints mirroring the spec: POST (create/get session), GET /{id}, PATCH /{id} (append messages), DELETE /{id}. Auth is optional — anonymous sessions are allowed.

- [ ] Step 1: Create `backend/app/api/v1/sessions.py`:
```python
"""
Sessions API — server-persisted conversation sessions.

POST   /api/v1/sessions              — create or retrieve session
GET    /api/v1/sessions/{session_id} — get session history
PATCH  /api/v1/sessions/{session_id} — append messages (cap: 10)
DELETE /api/v1/sessions/{session_id} — delete session
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ...core.auth import optional_user, CurrentUser
from ...services import session_service

router = APIRouter()


class CreateSessionRequest(BaseModel):
    session_id: Optional[str] = None


class AppendMessagesRequest(BaseModel):
    messages: list[dict]   # list of {role: str, content: str}


@router.post('', status_code=201)
async def create_session(
    body: CreateSessionRequest = CreateSessionRequest(),
    user: Optional[CurrentUser] = Depends(optional_user),
):
    """
    Create a new session or return an existing one.
    Client may suggest its own session_id (UUID string).
    """
    user_id = user.user_id if user else None
    result = await session_service.get_or_create(
        session_id=body.session_id,
        user_id=user_id,
    )
    return {
        'session_id': result['session_id'],
        'created_at': result['created_at'],
    }


@router.get('/{session_id}')
async def get_session(
    session_id: str,
    user: Optional[CurrentUser] = Depends(optional_user),
):
    """
    Return the session's message history and associated scan IDs.
    Anonymous sessions (no user_id) are accessible without auth.
    """
    messages = await session_service.get_history(session_id)
    if messages is None:
        raise HTTPException(status_code=404, detail='Session not found')
    return {
        'session_id': session_id,
        'messages': messages,
    }


@router.patch('/{session_id}')
async def append_messages(
    session_id: str,
    body: AppendMessagesRequest,
    user: Optional[CurrentUser] = Depends(optional_user),
):
    """
    Append messages to a session. Server enforces cap of 10 total.
    Returns the new message count.
    """
    if not body.messages:
        return {'message_count': 0}

    count = await session_service.append_messages(session_id, body.messages)
    if count == 0:
        raise HTTPException(status_code=404, detail='Session not found')
    return {'message_count': count}


@router.delete('/{session_id}', status_code=204)
async def delete_session(
    session_id: str,
    user: Optional[CurrentUser] = Depends(optional_user),
):
    """Delete a session record."""
    from sqlalchemy import text
    from ...core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text('DELETE FROM conversation_sessions WHERE id = :id'),
            {'id': session_id},
        )
        await db.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail='Session not found')
```

- [ ] Step 2: Add `optional_user` to `backend/app/core/auth.py` if it does not already exist. Check:
```bash
cd backend
grep -n "optional_user" app/core/auth.py || echo "NOT FOUND — must add"
```
If not found, add the following to `app/core/auth.py`:
```python
from typing import Optional
from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

_optional_bearer = HTTPBearer(auto_error=False)

async def optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_optional_bearer),
) -> Optional[CurrentUser]:
    """Return CurrentUser if a valid Bearer token is provided; None otherwise."""
    if not credentials:
        return None
    try:
        return await require_user.__wrapped__(credentials)
    except Exception:
        return None
```
(The exact implementation depends on how `require_user` is written in `auth.py`. Adapt as needed to reuse the existing token verification logic but return `None` on failure instead of raising 401.)

- [ ] Step 3: Verify router loads:
```bash
cd backend
python -c "from app.api.v1.sessions import router; print('sessions router OK, routes:', [r.path for r in router.routes])"
```

- [ ] Step 4: Commit:
```bash
git add backend/app/api/v1/sessions.py
git commit -m "feat(api): create sessions.py router with POST/GET/PATCH/DELETE endpoints"
```

---

### Task 18: Create classify.py Router

**Files:**
- Create: `backend/app/api/v1/classify.py`

Lightweight POST endpoint. Calls `ContentClassifier.classify()` directly. No streaming. Rate-limited to 20 req/min for anonymous users (by IP, enforced by existing middleware or Redis sliding window in the rate limiter). Latency target: < 2s (NVIDIA 11B Vision model, Redis-cached).

- [ ] Step 1: Create `backend/app/api/v1/classify.py`:
```python
"""
Classify API — lightweight content classification endpoint.

POST /api/v1/classify
  Body:    {image_data: str (base64), session_id?: str}
  Returns: {content_type: str, confidence: float, detected_language?: str}
  Auth:    optional (anonymous rate-limited to 20 req/min by IP)
  Latency: < 2s (NVIDIA Llama 3.2 11B Vision, Redis LRU cached)

Registered in main.py with prefix="/api/v1" (not "/api/v1/classify")
so the route is POST /api/v1/classify without double-prefix.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ...services.content_classifier import get_classifier

router = APIRouter()


class ClassifyRequest(BaseModel):
    image_data: str = Field(..., description='Base64-encoded image (JPEG or PNG)')
    session_id: Optional[str] = Field(None)


class ClassifyResponse(BaseModel):
    content_type: str
    confidence: float
    detected_language: Optional[str] = None
    signals: list[str] = []
    secondary_type: Optional[str] = None


@router.post('/classify', response_model=ClassifyResponse)
async def classify_image(body: ClassifyRequest, request: Request):
    """
    Classify a screenshot region. Used by the extension's proactive detection
    scroll handler to decide whether to show an analysis hint to the user.

    Returns content_type and confidence. If confidence < 0.8 or type is 'unknown',
    the extension suppresses the hint.
    """
    if not body.image_data:
        raise HTTPException(status_code=422, detail='image_data is required')

    # Basic size guard — base64 of 5MB image is ~6.7M chars
    if len(body.image_data) > 7_000_000:
        raise HTTPException(status_code=413, detail='Image too large (max ~5MB)')

    classifier = get_classifier()
    result = await classifier.classify(body.image_data)

    return ClassifyResponse(
        content_type=result.get('content_type', 'unknown'),
        confidence=float(result.get('confidence', 0.0)),
        detected_language=result.get('detected_language'),
        signals=result.get('signals', []),
        secondary_type=result.get('secondary_type'),
    )
```

- [ ] Step 2: Verify router loads:
```bash
cd backend
python -c "from app.api.v1.classify import router; print('classify router OK, routes:', [r.path for r in router.routes])"
```

- [ ] Step 3: Commit:
```bash
git add backend/app/api/v1/classify.py
git commit -m "feat(api): create classify.py router — lightweight POST /api/v1/classify endpoint"
```

---

### Task 19: Update main.py and auth.py

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/app/api/v1/auth.py`

Register the two new routers. Remove `POST /auth/google` (old `getAuthToken` flow). Add `GET /auth/extension-callback` (authorization-code flow). The classify router uses prefix `/api/v1` (not `/api/v1/classify`) because the route inside `classify.py` is already `/classify` — this avoids a double-prefix.

- [ ] Step 1: Update the import line in `backend/app/main.py`. Change:
```python
from .api.v1 import analyze, auth, history, knowledge, share, export, learning
```
To:
```python
from .api.v1 import analyze, auth, history, knowledge, share, export, learning, sessions, classify
```

- [ ] Step 2: Add the two new router registrations in `backend/app/main.py`, after the existing `app.include_router(tts.router, ...)` line:
```python
app.include_router(sessions.router, prefix='/api/v1/sessions', tags=['Sessions'])
app.include_router(classify.router, prefix='/api/v1',          tags=['Classify'])
```

- [ ] Step 3: In `backend/app/api/v1/auth.py`, remove the `POST /google` endpoint (the entire `@router.post('/google', ...)` function and its `GoogleAuthRequest` model). Then add the new `GET /extension-callback` endpoint. Add these imports at the top if not present:
```python
import httpx
from fastapi import APIRouter, HTTPException, Depends, Query
```
Add the new endpoint after the `AuthResponse` model:
```python
@router.get('/extension-callback', response_model=AuthResponse)
async def extension_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Handle Google OAuth2 authorization-code flow for Chrome extension.

    The extension calls chrome.identity.launchWebAuthFlow() which redirects
    to https://<extension-id>.chromiumapp.org/callback?code=...
    The extension then POSTs that code to this endpoint.

    Flow:
      1. Exchange code for tokens at Google's token endpoint
      2. Fetch user profile from Google userinfo endpoint
      3. Upsert User in database
      4. Issue LensAI JWT access_token (60min) + refresh_token (30 days)
    """
    if state != 'lensai':
        raise HTTPException(status_code=400, detail='Invalid state parameter')

    token_url = 'https://oauth2.googleapis.com/token'
    # The redirect_uri must match what the extension passed in the auth URL.
    # It is the extension's chromiumapp.org callback URL, not this server's URL.
    redirect_uri = f'https://{settings.google_client_id.split("-")[0]}.chromiumapp.org/callback'
    # NOTE: redirect_uri is reconstructed from the client_id prefix for the token exchange.
    # In practice the extension must pass its actual redirect_uri.
    # For robustness, store EXTENSION_REDIRECT_URI in settings.

    async with httpx.AsyncClient(timeout=30) as client:
        # Step 1: Exchange authorization code for tokens
        token_resp = await client.post(token_url, data={
            'code': code,
            'client_id': settings.google_client_id,
            'client_secret': settings.google_client_secret,
            'redirect_uri': redirect_uri,
            'grant_type': 'authorization_code',
        })
        if token_resp.status_code != 200:
            raise HTTPException(status_code=401, detail='Google token exchange failed')

        token_data = token_resp.json()
        google_access_token = token_data.get('access_token')
        if not google_access_token:
            raise HTTPException(status_code=401, detail='No access token from Google')

        # Step 2: Fetch user profile
        profile_resp = await client.get(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            headers={'Authorization': f'Bearer {google_access_token}'},
        )
        if profile_resp.status_code != 200:
            raise HTTPException(status_code=401, detail='Failed to fetch Google profile')

        profile = profile_resp.json()

    google_id = profile.get('id', '')
    email = profile.get('email', '')
    name = profile.get('name', '')
    avatar_url = profile.get('picture')

    if not google_id or not email:
        raise HTTPException(status_code=400, detail='Google profile missing required fields')

    # Step 3: Upsert user
    user = await upsert_user(db, google_id=google_id, email=email, name=name, avatar_url=avatar_url)
    tier = await resolve_tier(db, user.id)

    # Step 4: Issue LensAI tokens
    token_payload = {
        'sub': user.id,
        'email': email,
        'name': name,
        'tier': tier.value,
    }
    access_token = create_access_token(token_payload)
    refresh_token = create_refresh_token(token_payload)

    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user={
            'id': user.id,
            'email': email,
            'name': name,
            'avatar_url': avatar_url,
            'tier': tier.value,
        },
    )
```

- [ ] Step 4: Verify the app starts cleanly and all routers are registered:
```bash
cd backend
python -c "
from app.main import app
routes = [(r.methods, r.path) for r in app.routes if hasattr(r, 'path') and hasattr(r, 'methods')]
for m, p in sorted(routes, key=lambda x: x[1]):
    print(m, p)
"
```
Confirm you see:
- `{'POST'}  /api/v1/sessions`
- `{'GET'}   /api/v1/sessions/{session_id}`
- `{'PATCH'} /api/v1/sessions/{session_id}`
- `{'DELETE'} /api/v1/sessions/{session_id}`
- `{'POST'}  /api/v1/classify`
- `{'GET'}   /api/v1/auth/extension-callback`
- No route for `POST /api/v1/auth/google`

- [ ] Step 5: Run a smoke test against the live API (optional but recommended):
```bash
curl -s http://localhost:8000/health | python -m json.tool
curl -s http://localhost:8000/docs  # verify Swagger UI shows new endpoints
```

- [ ] Step 6: Commit:
```bash
git add backend/app/main.py backend/app/api/v1/auth.py
git commit -m "feat(api): register sessions + classify routers; replace POST /auth/google with GET /auth/extension-callback"
```

---

*End of Phase 1 and Phase 2. Phase 3 (Extension Fixes) and Phase 4 (Landing Page) are covered in the second half of this plan.*
