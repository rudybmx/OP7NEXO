import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Agente(Base):
    """Agente de IA de atendimento (escopo workspace). Soft delete via deleted_at."""

    __tablename__ = "agentes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    provider_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_providers.id", ondelete="SET NULL"), nullable=True
    )
    modelo: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="inativo")
    tom: Mapped[str | None] = mapped_column(String(40), nullable=True)
    idiomas: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    blacklist_topicos: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    threshold_confianca: Mapped[float] = mapped_column(Float, nullable=False, default=0.7)
    tempo_resposta_target_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    debounce_segundos: Mapped[int] = mapped_column(Integer, nullable=False, default=40)
    limite_tokens_dia: Mapped[int | None] = mapped_column(Integer, nullable=True)
    alerta_threshold_pct: Mapped[int] = mapped_column(Integer, nullable=False, default=80)
    mensagem_abertura: Mapped[str | None] = mapped_column(Text, nullable=True)
    objetivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    tempo_followup_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    codigo_responsavel: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # 'dentro' = responde nas janelas de agente_horarios; 'fora' (plantão) = responde FORA delas.
    horario_modo: Mapped[str] = mapped_column(String(10), nullable=False, default="dentro")
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    provider: Mapped["LlmProvider | None"] = relationship(foreign_keys=[provider_id], lazy="select")
    canais: Mapped[list["AgenteCanal"]] = relationship(
        back_populates="agente", lazy="select", cascade="all, delete-orphan"
    )
    agendas: Mapped[list["AgenteAgenda"]] = relationship(
        back_populates="agente", lazy="select", cascade="all, delete-orphan"
    )
    prompts: Mapped[list["AgentePrompt"]] = relationship(
        back_populates="agente", lazy="select", cascade="all, delete-orphan"
    )
    horarios: Mapped[list["AgenteHorario"]] = relationship(
        back_populates="agente", lazy="select", cascade="all, delete-orphan"
    )
    habilidades: Mapped[list["AgenteHabilidade"]] = relationship(
        back_populates="agente", lazy="select", cascade="all, delete-orphan"
    )
