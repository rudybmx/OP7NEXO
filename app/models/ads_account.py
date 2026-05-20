import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
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
    balance: Mapped[float | None] = mapped_column(Numeric(14, 2), default=0, nullable=True)
    amount_spent: Mapped[float | None] = mapped_column(Numeric(14, 2), default=0, nullable=True)
    spend_cap: Mapped[float | None] = mapped_column(Numeric(14, 2), default=0, nullable=True)
    token_acesso: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expira_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    bm_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    bm_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ativo", nullable=False)
    account_status: Mapped[int | None] = mapped_column(Integer, default=1, nullable=True)
    sincronizado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    periodo_sync_inicio: Mapped[date | None] = mapped_column(Date, nullable=True)
    agrupamento: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    workspace: Mapped["Workspace"] = relationship(back_populates="ads_accounts")
