import uuid

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CriativoPaleta(Base, TimestampMixin):
    """Esquema de cores 60/30/10 salvo por workspace (máx. 10, enforce no endpoint)."""

    __tablename__ = "criativo_paletas"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    cor_60: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cor_30: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cor_10: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
