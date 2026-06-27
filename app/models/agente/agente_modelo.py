import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AgenteModelo(Base):
    """Modelo (template) de agente: a inteligência central reutilizável. `prompt_template` tem
    placeholders `{{chave}}`; `variaveis_schema` descreve cada variável ([{chave,label,obrigatorio,
    exemplo}]). Agentes vinculados (agentes.modelo_id) HERDAM o prompt do modelo com as próprias
    variáveis substituídas — melhorar o modelo propaga a todos. Soft delete via deleted_at."""

    __tablename__ = "agente_modelos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    nicho: Mapped[str | None] = mapped_column(String(80), nullable=True)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_template: Mapped[str] = mapped_column(Text, nullable=False, default="")
    variaveis_schema: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
