import uuid
from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class EstudioTokenTransacao(Base, TimestampMixin):
    """Lançamento da carteira do Estúdio AI (crédito de recarga / débito de uso)."""

    __tablename__ = "estudio_token_transacoes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    tipo: Mapped[str] = mapped_column(String(10), nullable=False)  # credito | debito
    tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    valor_reais: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(12), nullable=False, default="confirmado"
    )  # confirmado | pendente | cancelado
    referencia: Mapped[str | None] = mapped_column(Text, nullable=True)
    # origem do lançamento: concedido | comprado | consumo | remocao | transferencia
    origem: Mapped[str | None] = mapped_column(String(16), nullable=True)
    criado_por: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
