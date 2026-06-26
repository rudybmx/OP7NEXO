import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AgendaPublicToken(Base):
    """Token público de agendamento POR AGENDA (link de auto-agendamento do paciente).

    Diferente do CanalConnectToken: LONGEVO e reusável — muitos pacientes marcam pelo mesmo
    link, então NÃO é consumido por reserva nem tem validade curta. Revogável (status='revoked'),
    e um único token 'active' por agenda (índice parcial único) permite get-or-create atômico.
    """

    __tablename__ = "agenda_public_tokens"

    token: Mapped[str] = mapped_column(Text, primary_key=True)
    agenda_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agendas.id", ondelete="CASCADE"),
        nullable=False,
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    # 'active' | 'revoked'
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
