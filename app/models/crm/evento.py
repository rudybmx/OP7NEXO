import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from sqlalchemy import func


class Evento(Base):
    __tablename__ = "crm_whatsapp_eventos"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="SET NULL"),
        nullable=True,
    )
    canal_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("canais_entrada.id", ondelete="SET NULL"),
        nullable=True,
    )
    event: Mapped[str] = mapped_column(String(50), nullable=False)
    event_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    event_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    instance: Mapped[str | None] = mapped_column(String(100), nullable=True)
    remote_jid: Mapped[str | None] = mapped_column(String(50), nullable=True)
    evolution_msg_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    payload: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=dict
    )
    recebido_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    processing_status: Mapped[str] = mapped_column(
        String(32), default="pending", nullable=False
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    workspace: Mapped["Workspace"] = relationship(  # type: ignore[name-defined]
        foreign_keys=[workspace_id], lazy="select"
    )
    canal: Mapped["CanalEntrada"] = relationship(  # type: ignore[name-defined]
        foreign_keys=[canal_id], lazy="select"
    )
