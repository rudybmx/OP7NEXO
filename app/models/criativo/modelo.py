import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CriativoModelo(Base, TimestampMixin):
    """Modelo da galeria do Estúdio.

    workspace_id NULL → modelo CURADO global (fonte='curado'), com `estrutura_json`
    (lógica vencedora) + `ai_porque`. workspace_id preenchido → "Meus modelos"
    (fonte='manual'): referência que o usuário salva pra reusar (só imagem).
    """

    __tablename__ = "criativo_modelos"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=True,
    )
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    nicho: Mapped[str | None] = mapped_column(String(80), nullable=True)
    objetivo: Mapped[str | None] = mapped_column(String(60), nullable=True)
    nivel_consciencia: Mapped[str | None] = mapped_column(String(20), nullable=True)
    gancho: Mapped[str | None] = mapped_column(String(120), nullable=True)
    creative_format: Mapped[str | None] = mapped_column(String(40), nullable=True)
    thumb_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    fonte: Mapped[str] = mapped_column(String(20), nullable=False, default="curado")
    ad_snapshot_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    longevidade_dias: Mapped[int | None] = mapped_column(Integer, nullable=True)
    badge: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ai_porque: Mapped[str | None] = mapped_column(Text, nullable=True)
    estrutura_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
