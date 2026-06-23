import uuid

from sqlalchemy import (
    Boolean,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CriativoCarrossel(Base, TimestampMixin):
    """Um carrossel newsjacking — N slides coerentes a partir de um assunto.

    O Diretor (LLM) monta o roteiro (`director_json`) e o gpt-image-2 gera cada
    slide com texto/identidade integrados (queimados pelo modelo). Multi-tenant
    por `workspace_id`. Ver docs/specs/criativos-2/.
    """

    __tablename__ = "criativo_carrosseis"

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
    # manual | noticia | referencia
    origem: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    tema: Mapped[str | None] = mapped_column(Text, nullable=True)
    molde: Mapped[str | None] = mapped_column(String(2), nullable=True)  # A | B | C
    # standard | panoramic (panoramic = Fase 2)
    composition_mode: Mapped[str] = mapped_column(
        String(12), nullable=False, default="standard"
    )
    n_slides: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    master_format: Mapped[str | None] = mapped_column(String(20), nullable=True)
    director_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # pending | running | done | error
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    error_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class CriativoCarrosselSlide(Base, TimestampMixin):
    """Um slide do carrossel — copy + direção de imagem + base gerada.

    Cada slide referencia uma `criativo_geracoes` (auditoria/usage da chamada ao
    gpt-image-2). `formatos_json` guarda a URL por formato derivado.
    """

    __tablename__ = "criativo_carrossel_slides"
    __table_args__ = (
        UniqueConstraint("carrossel_id", "slide_index", name="uq_carrossel_slide_index"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    carrossel_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("criativo_carrosseis.id", ondelete="CASCADE"),
        nullable=False,
    )
    slide_index: Mapped[int] = mapped_column(Integer, nullable=False)
    intensidade: Mapped[str | None] = mapped_column(String(12), nullable=True)  # alto|medio|baixo
    copy_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    image_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    geracao_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("criativo_geracoes.id", ondelete="SET NULL"),
        nullable=True,
    )
    base_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    formatos_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # pending | running | done | error
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
