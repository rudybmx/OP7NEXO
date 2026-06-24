import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class AgenteCanal(Base):
    """Vínculo M:N agente↔canal. `ativo` mora na junção: índice parcial único
    uq_agente_canal_ativo garante no máximo 1 agente ATIVO por canal."""

    __tablename__ = "agente_canais"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agentes.id", ondelete="CASCADE"), nullable=False
    )
    canal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("canais_entrada.id", ondelete="CASCADE"), nullable=False
    )
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    agente: Mapped["Agente"] = relationship(back_populates="canais", lazy="select")
    canal: Mapped["CanalEntrada"] = relationship(foreign_keys=[canal_id], lazy="select")  # type: ignore[name-defined]
