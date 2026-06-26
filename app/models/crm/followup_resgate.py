import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class FollowupResgate(Base):
    """Uma tentativa de resgate (Fase 2): o agente gera/envia 1 mensagem de reengajamento
    para um lead em followup. status: pendente|processando|aprovado|enviado|cancelado|falhou.
    UNIQUE(conversa_id, tentativa) reserva o slot antes do envio (anti-double-send)."""

    __tablename__ = "crm_followup_resgates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    conversa_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("crm_whatsapp_conversas.id", ondelete="CASCADE"), nullable=False)
    contato_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("crm_whatsapp_contatos.id", ondelete="SET NULL"), nullable=True)
    agente_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("agentes.id", ondelete="SET NULL"), nullable=True)
    canal_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("canais_entrada.id", ondelete="SET NULL"), nullable=True)
    tentativa: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pendente")
    mensagem: Mapped[str | None] = mapped_column(Text, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    agendado_para: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    enviado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    erro: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
