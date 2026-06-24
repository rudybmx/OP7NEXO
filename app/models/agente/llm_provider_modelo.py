import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class LlmProviderModelo(Base):
    """Modelo disponível em um provider (ex.: gpt-4o, deepseek-chat). Permite
    adicionar/remover modelos pelo admin sem deploy."""

    __tablename__ = "llm_provider_modelos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_providers.id", ondelete="CASCADE"), nullable=False
    )
    nome_modelo: Mapped[str] = mapped_column(String(120), nullable=False)
    label_display: Mapped[str | None] = mapped_column(String(120), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    provider: Mapped["LlmProvider"] = relationship(back_populates="modelos", lazy="select")
