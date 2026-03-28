"""Scan record models."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    ARRAY,
    Boolean,
    DateTime,
    Enum,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ContentTypeEnum(str, enum.Enum):
    code = "code"
    architecture_diagram = "architecture-diagram"
    dense_text = "dense-text"
    data_visualization = "data-visualization"
    ui_design = "ui-design"
    mathematical = "mathematical"
    image = "image"
    table = "table"
    unknown = "unknown"


class ModeEnum(str, enum.Enum):
    eli5 = "eli5"
    technical = "technical"
    summary = "summary"
    code_review = "code-review"
    translate = "translate"


class ScanRecord(Base):
    __tablename__ = "scan_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    content_type: Mapped[ContentTypeEnum] = mapped_column(
        Enum(ContentTypeEnum, name="content_type_enum", create_type=False),
        nullable=False,
        default=ContentTypeEnum.unknown,
    )
    mode: Mapped[ModeEnum] = mapped_column(
        Enum(ModeEnum, name="mode_enum", create_type=False),
        nullable=False,
        default=ModeEnum.summary,
    )
    image_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    result_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    key_points: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    specialized_analysis: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    reasoning_trace: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    page_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    page_title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    page_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    starred: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    model_used: Mapped[str | None] = mapped_column(String(128), nullable=True)
    provider_used: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        Index("ix_scan_records_tags", "tags", postgresql_using="gin"),
        Index("ix_scan_records_user_created", "user_id", "created_at"),
    )
