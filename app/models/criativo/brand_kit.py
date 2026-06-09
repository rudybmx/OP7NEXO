import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CriativoBrandKit(Base, TimestampMixin):
    """Identidade de marca do workspace (um por workspace ativo).

    Usado tanto na montagem do criativo (logo/cores/fonte) quanto para
    enriquecer o prompt enviado ao modelo (cores/tom/regras visuais).
    """

    __tablename__ = "criativo_brand_kits"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    logo_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("criativo_logos.id", ondelete="SET NULL"),
        nullable=True,
    )
    logo_variants: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    primary_color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    secondary_color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    font_family: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tone_of_voice: Mapped[str | None] = mapped_column(String(120), nullable=True)
    visual_rules: Mapped[str | None] = mapped_column(Text, nullable=True)
    forbidden_rules: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
