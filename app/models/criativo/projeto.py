import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CriativoProjeto(Base, TimestampMixin):
    """Criativo final EDITÁVEL — montado pelo OP7NEXO, sem IA.

    Base (da geração) + template + logo + camadas de texto + cores.
    Guarda snapshots de brand kit/logo/template para reabrir criativos
    antigos sem alterar o layout. Permite editar texto/logo/formato e
    re-exportar sem chamar a OpenAI de novo.
    """

    __tablename__ = "criativo_projetos"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    geracao_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("criativo_geracoes.id", ondelete="SET NULL"),
        nullable=True,
    )
    base_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("criativo_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    brand_kit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("criativo_brand_kits.id", ondelete="SET NULL"),
        nullable=True,
    )
    logo_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("criativo_logos.id", ondelete="SET NULL"),
        nullable=True,
    )
    creative_format: Mapped[str | None] = mapped_column(String(40), nullable=True)
    layout_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    text_layers_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    export_urls_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    brand_kit_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    logo_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    template_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="rascunho")
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
