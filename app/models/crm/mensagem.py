import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from sqlalchemy import func


class Mensagem(Base):
    __tablename__ = "crm_whatsapp_mensagens"

    criado_em: Mapped[datetime] = mapped_column(
        "created_at", DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="SET NULL"),
        nullable=False,
    )
    conversa_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crm_whatsapp_conversas.id", ondelete="CASCADE"),
        nullable=False,
    )
    contato_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crm_whatsapp_contatos.id", ondelete="SET NULL"),
        nullable=True,
    )
    evolution_msg_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    instance: Mapped[str | None] = mapped_column(String(100), nullable=True)
    remote_jid: Mapped[str | None] = mapped_column(String(50), nullable=True)
    direcao: Mapped[str] = mapped_column(
        String(20), default="entrada", nullable=False
    )
    from_me: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    remetente_tipo: Mapped[str] = mapped_column(
        String(20), default="contato", nullable=False
    )
    remetente_nome: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    conteudo: Mapped[str | None] = mapped_column(Text, nullable=True)
    message_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    participant_jid: Mapped[str | None] = mapped_column(String(50), nullable=True)
    participant_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_mentioned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    wa_status: Mapped[str | None] = mapped_column(
        String(20), default="pending", nullable=True
    )
    payload: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=dict
    )
    tokens_estimados: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    embedding_status: Mapped[str | None] = mapped_column(
        String(20), default="pendente", nullable=True
    )
    enviada_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    recebida_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    delivered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    failed_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    workspace: Mapped["Workspace"] = relationship(  # type: ignore[name-defined]
        foreign_keys=[workspace_id], lazy="select"
    )
    conversa: Mapped["Conversa"] = relationship(
        back_populates="mensagens", lazy="select"
    )
    contato: Mapped["Contato"] = relationship(
        back_populates="mensagens", lazy="select"
    )
    midias: Mapped[list["Midia"]] = relationship(
        back_populates="mensagem", lazy="select"
    )

    __table_args__ = (
        UniqueConstraint(
            "instance",
            "evolution_msg_id",
            name="uq_mensagens_instance_evolution_msg_id",
        ),
    )
