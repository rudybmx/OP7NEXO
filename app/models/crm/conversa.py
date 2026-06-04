import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from sqlalchemy import func


class Conversa(Base):
    __tablename__ = "crm_whatsapp_conversas"

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
    contato_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crm_whatsapp_contatos.id", ondelete="CASCADE"),
        nullable=False,
    )
    canal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("canais_entrada.id", ondelete="SET NULL"),
        nullable=False,
    )
    instance: Mapped[str | None] = mapped_column(String(100), nullable=True)
    remote_jid: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_group: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    group_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    group_avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), default="nova", nullable=False
    )
    nao_lidas: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    ultima_mensagem: Mapped[str | None] = mapped_column(Text, nullable=True)
    ultima_direcao: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )
    ultima_msg_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    responsavel_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    agente: Mapped[str] = mapped_column(String(100), default="Op7 Nexo", nullable=False)
    campanha: Mapped[str | None] = mapped_column(String(100), nullable=True)
    etapa_funil: Mapped[str | None] = mapped_column(String(50), nullable=True)
    prioridade: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    resumo_ia: Mapped[str | None] = mapped_column(Text, nullable=True)
    proximas_acoes_ia: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=list
    )
    contexto_ia: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=dict
    )
    equipe_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crm_whatsapp_equipes.id", ondelete="SET NULL"),
        nullable=True,
    )
    historico_transferencias: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=list
    )
    first_response_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    assigned_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    closed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    lead_status: Mapped[str] = mapped_column(String(32), default="novo", nullable=False)
    followup_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_inbound_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_outbound_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_time: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # segundos
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    workspace: Mapped["Workspace"] = relationship(  # type: ignore[name-defined]
        foreign_keys=[workspace_id], lazy="select"
    )
    contato: Mapped["Contato"] = relationship(
        back_populates="conversas", lazy="select"
    )
    canal: Mapped["CanalEntrada"] = relationship(  # type: ignore[name-defined]
        foreign_keys=[canal_id], lazy="select"
    )
    responsavel: Mapped["User"] = relationship(  # type: ignore[name-defined]
        foreign_keys=[responsavel_id], lazy="select"
    )
    equipe: Mapped["Equipe"] = relationship(
        back_populates="conversas", lazy="select"
    )
    mensagens: Mapped[list["Mensagem"]] = relationship(
        back_populates="conversa", lazy="select", order_by="Mensagem.criado_em"
    )
    midias: Mapped[list["Midia"]] = relationship(
        back_populates="conversa", lazy="select"
    )
    memorias_ia: Mapped[list["MemoriaIA"]] = relationship(
        back_populates="conversa", lazy="select"
    )

    __table_args__ = (
        Index(
            "uq_crm_open_conversation_per_channel",
            "workspace_id",
            "canal_id",
            "remote_jid",
            unique=True,
            postgresql_where=(ativo.is_(True) & (status != "resolvido")),
        ),
    )
