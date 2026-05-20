import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from sqlalchemy import func


class Evento(Base):
    __tablename__ = "crm_whatsapp_eventos"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event: Mapped[str] = mapped_column(String(50), nullable=False)
    instance: Mapped[str | None] = mapped_column(String(100), nullable=True)
    remote_jid: Mapped[str | None] = mapped_column(String(50), nullable=True)
    evolution_msg_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    payload: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=dict
    )
    recebido_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
