import uuid
import enum

from sqlalchemy import Boolean, Enum, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class SlugModulo(str, enum.Enum):
    marketing = "marketing"
    crm = "crm"
    management = "management"
    performance = "performance"


class Module(Base, TimestampMixin):
    __tablename__ = "modules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[SlugModulo] = mapped_column(
        Enum(SlugModulo, name="slug_modulo"), unique=True, nullable=False
    )
    descricao: Mapped[str | None] = mapped_column(String(500), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    planos: Mapped[list["PlanModule"]] = relationship(back_populates="modulo")
    permissoes_usuarios: Mapped[list["UserPermission"]] = relationship(back_populates="modulo")
