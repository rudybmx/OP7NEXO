import uuid

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class PlanModule(Base, TimestampMixin):
    __tablename__ = "plan_modules"
    __table_args__ = (
        UniqueConstraint("plano_id", "modulo_id", name="uq_plano_modulo"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    plano_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("plans.id", ondelete="CASCADE"), nullable=False
    )
    modulo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("modules.id", ondelete="RESTRICT"), nullable=False
    )

    plano: Mapped["Plan"] = relationship(back_populates="modulos")
    modulo: Mapped["Module"] = relationship(back_populates="planos")
