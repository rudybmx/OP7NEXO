import uuid

from sqlalchemy import ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class EstudioTokenSaldo(Base, TimestampMixin):
    """Saldo de tokens do Estúdio AI por workspace (1 token = R$1)."""

    __tablename__ = "estudio_token_saldo"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    saldo_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
