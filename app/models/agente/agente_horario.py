import uuid
from datetime import time

from sqlalchemy import Boolean, ForeignKey, Integer, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class AgenteHorario(Base):
    """Janela de funcionamento por dia da semana (0=segunda … 6=domingo).
    Horário é avaliado no timezone do workspace (Fase 2)."""

    __tablename__ = "agente_horarios"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agentes.id", ondelete="CASCADE"), nullable=False
    )
    dia_semana: Mapped[int] = mapped_column(Integer, nullable=False)
    hora_inicio: Mapped[time] = mapped_column(Time, nullable=False)
    hora_fim: Mapped[time] = mapped_column(Time, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    agente: Mapped["Agente"] = relationship(back_populates="horarios", lazy="select")
