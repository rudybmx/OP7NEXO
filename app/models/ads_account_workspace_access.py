import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class AdsAccountWorkspaceAccess(Base):
    __tablename__ = "ads_account_workspace_access"

    ads_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ads_accounts.id", ondelete="CASCADE"), primary_key=True
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True
    )
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    ads_account: Mapped["AdsAccount"] = relationship(back_populates="workspace_accesses")
    workspace: Mapped["Workspace"] = relationship(back_populates="ads_account_accesses")
