import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class FollowUp(Base):
    __tablename__ = "crm_followups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    canal_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("canais_entrada.id", ondelete="SET NULL"), nullable=True)
    contato_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("crm_whatsapp_contatos.id", ondelete="CASCADE"), nullable=False)
    conversa_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("crm_whatsapp_conversas.id", ondelete="SET NULL"), nullable=True)
    responsavel_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    tipo: Mapped[str] = mapped_column(String(50), default="retorno", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pendente", nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
