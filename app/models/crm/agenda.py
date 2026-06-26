"""Models da Agenda nativa (Fase 1).

Espelham op7nexo-front/src/types/agenda.ts + colunas de backend (workspace_id, telefone
normalizado, slot_index). Ver migration 101_agenda_core.py e docs/specs/agenda-core/.
"""
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Agenda(Base):
    """Recurso agendável (profissional/sala/equipamento). Várias por workspace."""

    __tablename__ = "agendas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), default="profissional", nullable=False)
    cor: Mapped[str] = mapped_column(String(20), default="#3E5BFF", nullable=False)
    capacidade_simultanea: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    fuso_horario: Mapped[str] = mapped_column(String(40), default="America/Sao_Paulo", nullable=False)
    webhook_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    agente_agendamento: Mapped[str] = mapped_column(String(12), default="confirmar", nullable=False)
    responsavel_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    horarios: Mapped[list["AgendaHorario"]] = relationship(
        back_populates="agenda", lazy="select"
    )


class AgendaHorario(Base):
    """Horário de funcionamento de uma agenda por dia da semana (várias faixas/dia permitidas)."""

    __tablename__ = "agenda_horarios"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    agenda_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agendas.id", ondelete="CASCADE"), nullable=False
    )
    dia_semana: Mapped[str] = mapped_column(String(3), nullable=False)  # dom..sab
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    hora_inicio: Mapped[str] = mapped_column(String(5), nullable=False)  # HH:mm
    hora_fim: Mapped[str] = mapped_column(String(5), nullable=False)
    duracao_slot_minutos: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    tem_almoco: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    almoco_inicio: Mapped[str | None] = mapped_column(String(5), nullable=True)
    almoco_fim: Mapped[str | None] = mapped_column(String(5), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    agenda: Mapped["Agenda"] = relationship(back_populates="horarios", lazy="select")


class AgendaBloqueio(Base):
    """Bloqueio de horário (global do workspace quando agenda_id é null, ou por agenda)."""

    __tablename__ = "agenda_bloqueios"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    agenda_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agendas.id", ondelete="CASCADE"), nullable=True
    )
    motivo: Mapped[str] = mapped_column(String(200), nullable=False)
    inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fim: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), default="outro", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Agendamento(Base):
    """Agendamento. Vínculo ao contato por telefone normalizado (9º dígito BR);
    contato_id é conveniência. Exceção terceiro usa agendado_por_telefone."""

    __tablename__ = "agendamentos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    agenda_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agendas.id", ondelete="CASCADE"), nullable=False
    )
    contato_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("crm_whatsapp_contatos.id", ondelete="SET NULL"), nullable=True
    )

    # Cliente / paciente
    cliente_nome: Mapped[str] = mapped_column(String(160), nullable=False)
    cliente_telefone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cliente_telefone_normalizado: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cliente_email: Mapped[str | None] = mapped_column(String(160), nullable=True)
    # Exceção terceiro: telefone de quem marcou (dono da conversa)
    agendado_por_telefone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    agendado_por_telefone_normalizado: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Horário
    data_hora_inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    data_hora_fim: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    slot_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Classificação
    servico: Mapped[str | None] = mapped_column(String(160), nullable=True)
    servico_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agenda_servicos.id", ondelete="SET NULL"), nullable=True
    )
    observacoes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Controle
    status: Mapped[str] = mapped_column(String(20), default="agendado", nullable=False)
    origem: Mapped[str] = mapped_column(String(12), default="manual", nullable=False)
    criado_por: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Cancelamento / reagendamento
    cancelamento_motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancelado_por: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cancelado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reagendado_de: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agendamentos.id", ondelete="SET NULL"), nullable=True
    )

    # NPS
    nps_enviado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    nps_enviado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    nps_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    agenda: Mapped["Agenda"] = relationship(foreign_keys=[agenda_id], lazy="select")


class AgendaServico(Base):
    """Serviço/procedimento do catálogo (por agenda; agenda_id NULL = do workspace).
    duracao_minutos guia o slot na disponibilidade."""

    __tablename__ = "agenda_servicos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    agenda_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agendas.id", ondelete="CASCADE"), nullable=True
    )
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    duracao_minutos: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    preco: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    cor: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
