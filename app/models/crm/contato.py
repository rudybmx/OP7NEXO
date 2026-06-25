import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from sqlalchemy import func


class Contato(Base):
    __tablename__ = "crm_whatsapp_contatos"

    criado_em: Mapped[datetime] = mapped_column(
        "created_at", DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        "updated_at", DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="SET NULL"),
        nullable=False,
    )
    jid: Mapped[str] = mapped_column(String(50), nullable=False)
    telefone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    nome: Mapped[str | None] = mapped_column(String(255), nullable=True)
    push_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # nome CONFIRMADO (declarado pelo cliente / editado por humano), separado do push_name
    # (nome do WhatsApp, não-confiável). Display e agente preferem este quando presente.
    # nome_origem: 'humano' (atendente) | 'ia' (declarado pelo cliente, capturado pela IA) | None.
    nome_confirmado: Mapped[str | None] = mapped_column(String(255), nullable=True)
    nome_origem: Mapped[str | None] = mapped_column(String(20), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_fetched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    numero_evo: Mapped[str | None] = mapped_column(String(50), nullable=True)
    origem: Mapped[str | None] = mapped_column(String(50), nullable=True)
    tags: Mapped[list[str] | None] = mapped_column(
        ARRAY(String), nullable=True, default=list
    )
    perfil_json: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=dict
    )
    resumo_ia: Mapped[str | None] = mapped_column(Text, nullable=True)
    sentimento_ia: Mapped[str | None] = mapped_column(String(50), nullable=True)
    score_lead_ia: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_message_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # CRM / funil
    etapa_funil: Mapped[str | None] = mapped_column(String(50), default="novo", nullable=True)
    responsavel_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    equipe_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crm_whatsapp_equipes.id", ondelete="SET NULL"),
        nullable=True,
    )
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)
    instagram: Mapped[str | None] = mapped_column(String(100), nullable=True)
    facebook: Mapped[str | None] = mapped_column(String(100), nullable=True)
    primeira_conversa_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    lead_status: Mapped[str] = mapped_column(String(32), default="novo", nullable=False)
    lead_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    followup_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_origin_event_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # UTM / tracking
    campanha_origem: Mapped[str | None] = mapped_column(String(100), nullable=True)
    utm_source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    utm_medium: Mapped[str | None] = mapped_column(String(50), nullable=True)
    utm_campaign: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Meta Ads Click-to-WhatsApp referral
    meta_ad_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    meta_ctwa_clid: Mapped[str | None] = mapped_column(String(100), nullable=True)
    meta_headline: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta_source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta_media_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    meta_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta_referral_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=dict)

    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    workspace: Mapped["Workspace"] = relationship(  # type: ignore[name-defined]
        foreign_keys=[workspace_id], lazy="select"
    )
    responsavel: Mapped["User"] = relationship(  # type: ignore[name-defined]
        foreign_keys=[responsavel_id], lazy="select"
    )
    equipe: Mapped["Equipe"] = relationship(
        foreign_keys=[equipe_id], lazy="select"
    )
    conversas: Mapped[list["Conversa"]] = relationship(
        back_populates="contato", lazy="select"
    )
    mensagens: Mapped[list["Mensagem"]] = relationship(
        back_populates="contato", lazy="select"
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "jid", name="uq_contatos_workspace_jid"),
    )
