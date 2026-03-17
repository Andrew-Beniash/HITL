from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db import Base


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    return [member.value for member in enum_cls]


class SourceFormat(str, enum.Enum):
    DOCX = "docx"
    PDF = "pdf"
    XLSX = "xlsx"
    MD = "md"
    EPUB = "epub"


class ReviewState(str, enum.Enum):
    OPEN = "open"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"


class ConversionStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETE = "complete"
    FAILED = "failed"


source_format_enum = ENUM(
    SourceFormat,
    name="source_format",
    values_callable=_enum_values,
    create_type=False,
)
review_state_enum = ENUM(
    ReviewState,
    name="review_state",
    values_callable=_enum_values,
    create_type=False,
)
conversion_status_enum = ENUM(
    ConversionStatus,
    name="conversion_status",
    values_callable=_enum_values,
    create_type=False,
)


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (Index("idx_documents_tenant_id", "tenant_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    source_format: Mapped[SourceFormat] = mapped_column(source_format_enum, nullable=False)
    current_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("document_versions.id", ondelete="SET NULL", onupdate="CASCADE"),
        nullable=True,
    )
    review_state: Mapped[ReviewState] = mapped_column(
        review_state_enum,
        nullable=False,
        server_default=text("'open'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    versions: Mapped[list["DocumentVersion"]] = relationship(
        "DocumentVersion",
        foreign_keys="DocumentVersion.document_id",
        back_populates="document",
    )
    current_version: Mapped["DocumentVersion | None"] = relationship(
        "DocumentVersion",
        foreign_keys=[current_version_id],
        back_populates="current_for_documents",
    )
    sessions: Mapped[list["Session"]] = relationship("Session", back_populates="document")


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    __table_args__ = (Index("idx_document_versions_document_id", "document_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE", onupdate="CASCADE"),
        nullable=False,
    )
    version_number: Mapped[int] = mapped_column(nullable=False)
    source_s3_key: Mapped[str] = mapped_column(Text, nullable=False)
    epub_s3_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    conversion_status: Mapped[ConversionStatus] = mapped_column(
        conversion_status_enum,
        nullable=False,
        server_default=text("'pending'"),
    )
    conversion_manifest: Mapped[dict | list | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    created_by: Mapped[str] = mapped_column(Text, nullable=False)

    document: Mapped[Document] = relationship(
        "Document",
        foreign_keys=[document_id],
        back_populates="versions",
    )
    current_for_documents: Mapped[list[Document]] = relationship(
        "Document",
        foreign_keys="Document.current_version_id",
        back_populates="current_version",
    )


class Session(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        Index("idx_sessions_tenant_id", "tenant_id"),
        Index("idx_sessions_document_id", "document_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.id", ondelete="CASCADE", onupdate="CASCADE"),
        nullable=False,
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    kb_connection_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    last_active_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    review_state: Mapped[ReviewState] = mapped_column(
        review_state_enum,
        nullable=False,
        server_default=text("'open'"),
    )

    document: Mapped[Document] = relationship("Document", back_populates="sessions")
