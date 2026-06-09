import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CriativoEstilo(Base, TimestampMixin):
    """Estilo pré-pronto (prompt-template). workspace_id NULL = global curado."""

    __tablename__ = "criativo_estilos"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=True,
    )
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    prompt_template: Mapped[str] = mapped_column(Text, nullable=False)
    thumb_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    tom_default: Mapped[str | None] = mapped_column(String(60), nullable=True)
    formato_default: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
