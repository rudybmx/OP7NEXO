import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Reacao(Base):
    """Reação com emoji a uma mensagem de WhatsApp (espelha o WhatsApp real).

    Uma reação é um evento mutável: a mesma pessoa pode trocar o emoji (REPLACE)
    ou removê-lo (emoji vazio → a linha é apagada). Por isso a unicidade é por
    (workspace, canal, instance, mensagem-alvo, quem-reagiu) — o emoji fica FORA
    da chave. Casa com a mensagem-alvo pelo id externo do provider
    (`target_evolution_msg_id` = evolution_msg_id/wamid da mensagem reagida),
    tolerando reação que chega antes da própria mensagem-alvo (mensagem_id nullable).
    """

    __tablename__ = "crm_whatsapp_reacoes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    canal_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("canais_entrada.id", ondelete="SET NULL"),
        nullable=True,
    )
    conversa_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crm_whatsapp_conversas.id", ondelete="CASCADE"),
        nullable=True,
    )
    mensagem_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crm_whatsapp_mensagens.id", ondelete="CASCADE"),
        nullable=True,
    )
    instance: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # id externo (provider) da mensagem reagida — evolution_msg_id / wamid / id WAHA
    target_evolution_msg_id: Mapped[str] = mapped_column(String(255), nullable=False)
    # quem reagiu: participant (grupo) ou remote_jid (1:1); "me" quando from_me
    reactor_jid: Mapped[str] = mapped_column(String(64), nullable=False)
    reactor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    from_me: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # emoji da reação; NULL/'' = reação removida (a linha costuma ser apagada)
    emoji: Mapped[str | None] = mapped_column(String(16), nullable=True)
    reacted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=dict)
    criado_em: Mapped[datetime] = mapped_column(
        "created_at", DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        "updated_at",
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    mensagem: Mapped["Mensagem"] = relationship(  # type: ignore[name-defined]
        back_populates="reacoes", lazy="select"
    )

    __table_args__ = (
        Index(
            "uq_crm_reacao_target_reactor",
            "workspace_id",
            "canal_id",
            "instance",
            "target_evolution_msg_id",
            "reactor_jid",
            unique=True,
            postgresql_nulls_not_distinct=True,
        ),
        Index("ix_crm_reacao_mensagem", "mensagem_id"),
        Index(
            "ix_crm_reacao_target",
            "workspace_id",
            "canal_id",
            "instance",
            "target_evolution_msg_id",
        ),
    )
