import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SyncJob(Base):
    __tablename__ = "sync_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ads_account_id: Mapped[str] = mapped_column(String, nullable=False)
    modo_sync: Mapped[str] = mapped_column(String(30), nullable=False, default="recorrente")
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    etapa_atual: Mapped[str | None] = mapped_column(String, nullable=True)
    progresso: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    totais: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    erro: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
