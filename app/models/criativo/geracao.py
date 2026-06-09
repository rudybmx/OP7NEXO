import uuid

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CriativoGeracao(Base, TimestampMixin):
    """Uma chamada ao gpt-image-2 — gera/edita apenas a BASE visual.

    Texto, logo e marca NÃO entram aqui (entram na montagem do projeto).
    Guarda auditoria completa da chamada (model_snapshot, prompt_final,
    params, request_id, usage) e estado/erro.
    """

    __tablename__ = "criativo_geracoes"

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
    estilo_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("criativo_estilos.id", ondelete="SET NULL"),
        nullable=True,
    )
    briefing: Mapped[str | None] = mapped_column(Text, nullable=True)
    creative_format: Mapped[str | None] = mapped_column(String(40), nullable=True)
    referencias_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    mask_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    generation_size: Mapped[str | None] = mapped_column(String(20), nullable=True)
    imagem_base_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    model: Mapped[str | None] = mapped_column(String(60), nullable=True)
    model_snapshot: Mapped[str | None] = mapped_column(String(120), nullable=True)
    prompt_final: Mapped[str | None] = mapped_column(Text, nullable=True)
    params_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    request_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    provider_response_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    usage: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    error_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
