import uuid
import enum

from sqlalchemy import Enum, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class NivelPermissao(str, enum.Enum):
    view = "view"
    edit = "edit"
    admin = "admin"


class UserPermission(Base, TimestampMixin):
    __tablename__ = "user_permissions"
    __table_args__ = (
        UniqueConstraint(
            "usuario_id", "company_id", "modulo_id", name="uq_usuario_company_modulo"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    usuario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    modulo_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("modules.id", ondelete="RESTRICT"), nullable=False
    )
    nivel: Mapped[NivelPermissao] = mapped_column(
        Enum(NivelPermissao, name="nivel_permissao"), nullable=False
    )

    usuario: Mapped["User"] = relationship(back_populates="permissoes")
    company: Mapped["Company"] = relationship(back_populates="permissoes_usuarios")
    modulo: Mapped["Module"] = relationship(back_populates="permissoes_usuarios")
