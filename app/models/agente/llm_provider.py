import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class LlmProvider(Base):
    """Provider de LLM configurável via admin (OpenAI/OpenRouter/DeepSeek/…).

    `tipo=openai_compatible` → atendido pelo client `openai` mudando base_url + modelo.
    """

    __tablename__ = "llm_providers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    base_url: Mapped[str] = mapped_column(String(255), nullable=False)
    tipo: Mapped[str] = mapped_column(String(30), nullable=False, default="openai_compatible")
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    modelos: Mapped[list["LlmProviderModelo"]] = relationship(
        back_populates="provider", lazy="select", cascade="all, delete-orphan"
    )
    token: Mapped["LlmProviderToken | None"] = relationship(
        back_populates="provider", lazy="select", uselist=False, cascade="all, delete-orphan"
    )
