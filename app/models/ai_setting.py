import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AiSetting(Base):
    """Override de configuração de IA por feature (insights|image|vision|copy|agent).

    Campos nulos caem para o `.env` via o resolver `app.core.ai_config`. Config é
    global (platform_admin) — não há filtro por workspace.
    """

    __tablename__ = "ai_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    feature: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    provider: Mapped[str | None] = mapped_column(String(40), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    base_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
