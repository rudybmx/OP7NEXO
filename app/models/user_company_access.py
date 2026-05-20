import uuid

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class UserCompanyAccess(Base, TimestampMixin):
    __tablename__ = "user_company_access"
    __table_args__ = (
        UniqueConstraint("usuario_id", "company_id", name="uq_usuario_company"),
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

    usuario: Mapped["User"] = relationship(back_populates="acessos_companies")
    company: Mapped["Company"] = relationship(back_populates="acessos_usuarios")
