import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from sqlalchemy import func


class Equipe(Base):
    __tablename__ = "crm_whatsapp_equipes"

    criado_em: Mapped[datetime] = mapped_column(
        "created_at", DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="SET NULL"),
        nullable=False,
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    workspace: Mapped["Workspace"] = relationship(  # type: ignore[name-defined]
        foreign_keys=[workspace_id], lazy="select"
    )
    conversas: Mapped[list["Conversa"]] = relationship(
        back_populates="equipe", lazy="select"
    )
    membros: Mapped[list["EquipeMembro"]] = relationship(
        back_populates="equipe", lazy="select"
    )


class EquipeMembro(Base):
    __tablename__ = "crm_whatsapp_equipe_membros"

    equipe_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("crm_whatsapp_equipes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    perfil: Mapped[str] = mapped_column(
        String(20), default="agente", nullable=False
    )

    equipe: Mapped["Equipe"] = relationship(
        back_populates="membros", lazy="select"
    )
    usuario: Mapped["User"] = relationship(  # type: ignore[name-defined]
        foreign_keys=[user_id], lazy="select"
    )


class Permissao(Base):
    __tablename__ = "crm_whatsapp_permissoes"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    pode_ver_outras_equipes: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    equipes_visiveis: Mapped[list[uuid.UUID] | None] = mapped_column(
        JSONB, nullable=True, default=list
    )

    usuario: Mapped["User"] = relationship(  # type: ignore[name-defined]
        foreign_keys=[user_id], lazy="select"
    )
