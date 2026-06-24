import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AgenteBaseConhecimento(Base):
    """Chunk de base de conhecimento do agente (RAG). Cada linha = um trecho indexado.

    A coluna `embedding vector(1536)` existe no banco mas NÃO é mapeada aqui (evita
    dependência pgvector-python); inserção e retrieval por similaridade usam SQL cru
    (`embedding <=> CAST(:q AS vector)`)."""

    __tablename__ = "agente_base_conhecimento"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agente_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agentes.id", ondelete="CASCADE"), nullable=False
    )
    tipo: Mapped[str] = mapped_column(String(20), nullable=False, default="faq")
    titulo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    conteudo: Mapped[str] = mapped_column(Text, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
