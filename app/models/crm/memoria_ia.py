import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from sqlalchemy import func


class MemoriaIA(Base):
    __tablename__ = "crm_whatsapp_memorias_ia"

    criado_em: Mapped[datetime] = mapped_column(
        "created_at", DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        "updated_at", DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conversa_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crm_whatsapp_conversas.id", ondelete="CASCADE"),
        nullable=False,
    )
    contato_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crm_whatsapp_contatos.id", ondelete="SET NULL"),
        nullable=True,
    )
    tipo: Mapped[str] = mapped_column(
        String(50), default="observacao", nullable=False
    )
    titulo: Mapped[str | None] = mapped_column(Text, nullable=True)
    conteudo: Mapped[str] = mapped_column(Text, nullable=False)
    confianca: Mapped[float | None] = mapped_column(
        Numeric(4, 3), nullable=True
    )
    fonte_msg_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crm_whatsapp_mensagens.id", ondelete="SET NULL"),
        nullable=True,
    )
    metadata_json: Mapped[dict | None] = mapped_column(
        "metadata", JSONB, nullable=True, default=dict
    )
    ativa: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    busca: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)

    conversa: Mapped["Conversa"] = relationship(
        back_populates="memorias_ia", lazy="select"
    )
    contato: Mapped["Contato"] = relationship(
        foreign_keys=[contato_id], lazy="select"
    )
    fonte_mensagem: Mapped["Mensagem"] = relationship(
        foreign_keys=[fonte_msg_id], lazy="select"
    )
