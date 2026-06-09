import uuid

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CriativoTemplate(Base, TimestampMixin):
    """Layout com áreas seguras (logo/headline/CTA/imagem). workspace_id NULL = global."""

    __tablename__ = "criativo_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=True,
    )
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    creative_format: Mapped[str] = mapped_column(String(40), nullable=False)
    layout_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    escopo: Mapped[str] = mapped_column(String(20), nullable=False, default="global")
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
