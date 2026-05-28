import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from sqlalchemy import func


class ConversationAssignment(Base):
    __tablename__ = "crm_conversation_assignments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    canal_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("canais_entrada.id", ondelete="SET NULL"), nullable=True
    )
    conversa_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_whatsapp_conversas.id", ondelete="CASCADE"), nullable=False
    )
    contato_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_whatsapp_contatos.id", ondelete="SET NULL"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    from_responsavel_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    to_responsavel_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    from_equipe_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_whatsapp_equipes.id", ondelete="SET NULL"), nullable=True
    )
    to_equipe_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_whatsapp_equipes.id", ondelete="SET NULL"), nullable=True
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
