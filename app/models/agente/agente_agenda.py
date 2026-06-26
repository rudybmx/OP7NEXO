import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class AgenteAgenda(Base):
    """Vínculo M:N agente↔agenda (Fase 6 — seleção de agenda pelo agente, multi-clínica).

    Restringe QUAIS agendas o agente pode consultar/marcar. SEM vínculo = atende TODAS as
    agendáveis do workspace (fallback: clínica única segue sem config). Vincular = restringir.
    """

    __tablename__ = "agente_agendas"
    __table_args__ = (UniqueConstraint("agente_id", "agenda_id", name="uq_agente_agenda"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agentes.id", ondelete="CASCADE"), nullable=False
    )
    agenda_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agendas.id", ondelete="CASCADE"), nullable=False
    )
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    agente: Mapped["Agente"] = relationship(back_populates="agendas", lazy="select")  # type: ignore[name-defined]
    agenda: Mapped["Agenda"] = relationship(foreign_keys=[agenda_id], lazy="select")  # type: ignore[name-defined]
