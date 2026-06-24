"""agente_base_conhecimento (RAG, Fase 3) — chunks com embedding vector(1536)

Revision ID: 088
Revises: 087
Create Date: 2026-06-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "088"
down_revision: Union[str, None] = "087"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS agente_base_conhecimento (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            agente_id  UUID NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
            tipo       VARCHAR(20) NOT NULL DEFAULT 'faq',
            titulo     VARCHAR(255),
            conteudo   TEXT NOT NULL,
            embedding  vector(1536),
            criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT ck_agente_kb_tipo CHECK (tipo IN ('documento','url','faq'))
        )
    """))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_agente_kb_agente ON agente_base_conhecimento (agente_id, criado_em DESC)"))
    # Índice ANN por similaridade cosseno (criável só após CREATE EXTENSION vector).
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_agente_kb_embedding ON agente_base_conhecimento "
        "USING hnsw (embedding vector_cosine_ops)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS agente_base_conhecimento"))
