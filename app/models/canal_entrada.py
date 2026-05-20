import uuid

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CanalEntrada(Base, TimestampMixin):
    __tablename__ = "canais_entrada"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    mensagem_boas_vindas: Mapped[str | None] = mapped_column(Text, nullable=True)
    webhook_token: Mapped[str | None] = mapped_column(
        String(64), unique=True, nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), default="inativo", nullable=False)
    numero_telefone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    conectado_em: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    evolution_instance_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    connection_status: Mapped[str | None] = mapped_column(
        String(20), nullable=True, default="disconnected"
    )
