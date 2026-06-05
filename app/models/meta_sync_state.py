import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class MetaSyncState(Base, TimestampMixin):
    __tablename__ = "meta_sync_states"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ads_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ads_accounts.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_run_mode: Mapped[str | None] = mapped_column(String(30), nullable=True)
    last_run_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_stage: Mapped[str | None] = mapped_column(String(80), nullable=True)
    last_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_error_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_error_http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_rate_limit_usage_percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cooldown_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_totals: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    watermarks: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    last_error_meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    ads_account: Mapped["AdsAccount"] = relationship("AdsAccount")
