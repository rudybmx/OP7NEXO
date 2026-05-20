import uuid
import enum

from sqlalchemy import Boolean, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class TipoRecurso(str, enum.Enum):
    conta_ads = "conta_ads"
    numero_whatsapp = "numero_whatsapp"


class AccountResource(Base, TimestampMixin):
    __tablename__ = "account_resources"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    tipo: Mapped[TipoRecurso] = mapped_column(
        Enum(TipoRecurso, name="tipo_recurso"), nullable=False
    )
    identificador: Mapped[str] = mapped_column(String(255), nullable=False)
    nome: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    company: Mapped["Company"] = relationship(back_populates="recursos")
