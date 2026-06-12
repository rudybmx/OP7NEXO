import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AiModelPricing(Base):
    """Preço por modelo (editável no painel). Texto: input/output por 1M tokens.
    Imagem: `image_prices_json` mapeia qualidade → USD por imagem."""

    __tablename__ = "ai_model_pricing"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    kind: Mapped[str] = mapped_column(String(10), nullable=False, default="text")
    input_usd_1m: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    output_usd_1m: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    image_prices_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
