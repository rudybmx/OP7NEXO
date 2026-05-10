import uuid

from sqlalchemy import Boolean, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Workspace(Base, TimestampMixin):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    razao_social: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cnpj: Mapped[str | None] = mapped_column(String(18), nullable=True)
    endereco: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    ads_accounts: Mapped[list["AdsAccount"]] = relationship(back_populates="workspace")
