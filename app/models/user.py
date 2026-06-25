import uuid
import enum

from sqlalchemy import Boolean, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class RoleUsuario(str, enum.Enum):
    platform_admin = "platform_admin"
    network_admin = "network_admin"
    network_viewer = "network_viewer"
    company_admin = "company_admin"
    company_agent = "company_agent"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    network_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("networks.id", ondelete="RESTRICT"),
        nullable=True,
    )
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="SET NULL"),
        nullable=True,
    )
    nome: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    senha_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[RoleUsuario] = mapped_column(
        Enum(RoleUsuario, name="role_usuario"), nullable=False
    )
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Colunas já existentes no banco (NOT NULL default false) — mapeadas p/ o CRUD gerir via UI.
    pode_atender_canais: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pode_acessar_crm: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    network: Mapped["Network | None"] = relationship(back_populates="usuarios")
    acessos_companies: Mapped[list["UserCompanyAccess"]] = relationship(back_populates="usuario")
    permissoes: Mapped[list["UserPermission"]] = relationship(back_populates="usuario")
