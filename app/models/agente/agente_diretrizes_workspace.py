import uuid
from datetime import datetime

from sqlalchemy import DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AgenteDiretrizesWorkspace(Base):
    """Diretrizes de IA por workspace — texto injetado no system prompt de TODOS os
    agentes daquele workspace (regras de marca/atendimento, padrões de resposta).
    1 linha por workspace (upsert). Editável por platform_admin na Central de Agentes."""

    __tablename__ = "agente_diretrizes_workspace"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, unique=True, index=True
    )
    diretrizes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
