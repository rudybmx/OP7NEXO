import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class LlmProviderToken(Base):
    """Token global (escopo plataforma) de um provider. `token_encrypted` é Fernet;
    `token_mask` é 6+4 do token original. A API nunca devolve o token decifrado."""

    __tablename__ = "llm_provider_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_providers.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    token_mask: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    provider: Mapped["LlmProvider"] = relationship(back_populates="token", lazy="select")
