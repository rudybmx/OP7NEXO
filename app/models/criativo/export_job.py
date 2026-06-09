import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CriativoExportJob(Base, TimestampMixin):
    """Job de exportação — render Playwright roda no worker, não na API síncrona."""

    __tablename__ = "criativo_export_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    projeto_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("criativo_projetos.id", ondelete="CASCADE"),
        nullable=False,
    )
    export_size: Mapped[str] = mapped_column(String(20), nullable=False)
    output_format: Mapped[str] = mapped_column(String(10), nullable=False, default="png")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    export_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    progresso: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
