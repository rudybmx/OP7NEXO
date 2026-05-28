import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LeadOriginEvent(Base):
    __tablename__ = "crm_lead_origin_events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    canal_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("canais_entrada.id", ondelete="SET NULL"), nullable=True)
    contato_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("crm_whatsapp_contatos.id", ondelete="CASCADE"), nullable=True)
    conversa_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("crm_whatsapp_conversas.id", ondelete="SET NULL"), nullable=True)
    mensagem_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("crm_whatsapp_mensagens.id", ondelete="SET NULL"), nullable=True)
    raw_event_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("crm_whatsapp_eventos.id", ondelete="SET NULL"), nullable=True)
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    medium: Mapped[str | None] = mapped_column(String(50), nullable=True)
    campaign: Mapped[str | None] = mapped_column(String(150), nullable=True)
    origin_label: Mapped[str | None] = mapped_column(String(150), nullable=True)
    meta_ad_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    meta_ctwa_clid: Mapped[str | None] = mapped_column(String(150), nullable=True)
    meta_headline: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta_source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    referral_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    raw_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
