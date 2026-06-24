import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CanalConnectToken(Base):
    """Token público de conexão de canal (link enviado ao cliente final).

    Separado do `webhook_token` do canal — este NUNCA é exposto ao cliente.
    Um único token `active` por canal (índice parcial); ao conectar, o token é
    marcado `consumed` com validade curta (anti-hijack via link antigo).
    """

    __tablename__ = "canal_connect_tokens"

    token: Mapped[str] = mapped_column(Text, primary_key=True)
    canal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("canais_entrada.id", ondelete="CASCADE"),
        nullable=False,
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # 'active' | 'consumed'
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    consumed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
