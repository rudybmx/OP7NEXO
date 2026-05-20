import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from sqlalchemy import func


class Midia(Base):
    __tablename__ = "crm_whatsapp_midia"

    criado_em: Mapped[datetime] = mapped_column(
        "created_at", DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conversa_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crm_whatsapp_conversas.id", ondelete="CASCADE"),
        nullable=False,
    )
    mensagem_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crm_whatsapp_mensagens.id", ondelete="SET NULL"),
        nullable=True,
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    minio_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    url_publica: Mapped[str | None] = mapped_column(Text, nullable=True)
    mimetype: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tamanho: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # segundos
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    conversa: Mapped["Conversa"] = relationship(
        back_populates="midias", lazy="select"
    )
    mensagem: Mapped["Mensagem"] = relationship(
        back_populates="midias", lazy="select"
    )
