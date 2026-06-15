import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Painel(Base):
    __tablename__ = "crm_paineis"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    # custom | recepcionamento_leads | leads_sem_resposta
    tipo: Mapped[str] = mapped_column(String(40), default="custom", nullable=False)
    sistema: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    automacao_ativa: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    bloqueado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ordem: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    fases: Mapped[list["PainelFase"]] = relationship(
        back_populates="painel", lazy="select", order_by="PainelFase.ordem",
        cascade="all, delete-orphan",
    )
    campos: Mapped[list["PainelCampo"]] = relationship(
        back_populates="painel", lazy="select", order_by="PainelCampo.ordem",
        cascade="all, delete-orphan",
    )
    cards: Mapped[list["PainelCard"]] = relationship(
        back_populates="painel", lazy="select", cascade="all, delete-orphan",
    )


class PainelFase(Base):
    __tablename__ = "crm_painel_fases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    painel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_paineis.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    cor: Mapped[str] = mapped_column(String(7), default="#64748b", nullable=False)
    ordem: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    limite_wip: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fixa: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    painel: Mapped["Painel"] = relationship(back_populates="fases", lazy="select")


class PainelCampo(Base):
    __tablename__ = "crm_painel_campos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    painel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_paineis.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    # texto | numero | data | select | usuario | checkbox | url
    tipo: Mapped[str] = mapped_column(String(20), default="texto", nullable=False)
    opcoes: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    ordem: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    painel: Mapped["Painel"] = relationship(back_populates="campos", lazy="select")


class PainelCard(Base):
    __tablename__ = "crm_painel_cards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    painel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_paineis.id", ondelete="CASCADE"), nullable=False
    )
    fase_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_painel_fases.id", ondelete="CASCADE"), nullable=False
    )
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    prioridade: Mapped[str | None] = mapped_column(String(20), nullable=True)
    responsavel_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    origem_agente: Mapped[str | None] = mapped_column(String(120), nullable=True)
    data_vencimento: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Campos de lead (preenchidos pelas automações de canal).
    nome: Mapped[str | None] = mapped_column(String(255), nullable=True)
    telefone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    canal_entrada_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("canais_entrada.id", ondelete="SET NULL"), nullable=True
    )
    resumo_conversa: Mapped[str | None] = mapped_column(Text, nullable=True)
    conversa_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_whatsapp_conversas.id", ondelete="SET NULL"), nullable=True
    )
    contato_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_whatsapp_contatos.id", ondelete="SET NULL"), nullable=True
    )
    ordem: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    arquivado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    painel: Mapped["Painel"] = relationship(back_populates="cards", lazy="select")
    fase: Mapped["PainelFase"] = relationship(lazy="select")
    responsavel: Mapped["User | None"] = relationship(  # type: ignore[name-defined]
        foreign_keys=[responsavel_user_id], lazy="select"
    )
    valores: Mapped[list["PainelCardValor"]] = relationship(
        back_populates="card", lazy="select", cascade="all, delete-orphan",
    )
    comentarios: Mapped[list["PainelComentario"]] = relationship(
        back_populates="card", lazy="select", order_by="PainelComentario.criado_em",
        cascade="all, delete-orphan",
    )


class PainelCardValor(Base):
    __tablename__ = "crm_painel_card_valores"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    card_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_painel_cards.id", ondelete="CASCADE"), nullable=False
    )
    campo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_painel_campos.id", ondelete="CASCADE"), nullable=False
    )
    valor: Mapped[dict | list | str | int | float | bool | None] = mapped_column(JSONB, nullable=True)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    card: Mapped["PainelCard"] = relationship(back_populates="valores", lazy="select")
    campo: Mapped["PainelCampo"] = relationship(lazy="select")


class PainelComentario(Base):
    __tablename__ = "crm_painel_comentarios"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    card_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_painel_cards.id", ondelete="CASCADE"), nullable=False
    )
    autor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    card: Mapped["PainelCard"] = relationship(back_populates="comentarios", lazy="select")
    autor: Mapped["User | None"] = relationship(  # type: ignore[name-defined]
        foreign_keys=[autor_user_id], lazy="select"
    )
