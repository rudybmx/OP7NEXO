import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class AdsAccount(Base, TimestampMixin):
    __tablename__ = "ads_accounts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False
    )
    plataforma: Mapped[str] = mapped_column(String(20), nullable=False)
    account_id: Mapped[str] = mapped_column(String(100), nullable=False)
    account_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    token_acesso: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expira_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    bm_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ativo", nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    workspace: Mapped["Workspace"] = relationship(back_populates="ads_accounts")
