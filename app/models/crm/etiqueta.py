import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Table, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import func

from app.models.base import Base


crm_conversa_etiquetas = Table(
    "crm_conversa_etiquetas",
    Base.metadata,
    Column("conversa_id", UUID(as_uuid=True), ForeignKey("crm_whatsapp_conversas.id", ondelete="CASCADE"), primary_key=True),
    Column("etiqueta_id", UUID(as_uuid=True), ForeignKey("crm_etiquetas.id", ondelete="CASCADE"), primary_key=True),
)


class CrmEtiqueta(Base):
    __tablename__ = "crm_etiquetas"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    nome: Mapped[str] = mapped_column(String(80), nullable=False)
    cor: Mapped[str] = mapped_column(String(7), nullable=False, default="#25D366")
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    conversas: Mapped[list] = relationship(
        "Conversa",
        secondary="crm_conversa_etiquetas",
        back_populates="etiquetas",
        lazy="select",
    )

    __table_args__ = (
        UniqueConstraint("workspace_id", "nome", name="uq_etiqueta_workspace_nome"),
    )
