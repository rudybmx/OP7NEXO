"""agente_ajustes_resposta — sugestões de resposta melhor (feedback de qualidade, Fase 2)

Admin sugere, na tela de conversas, uma resposta melhor para uma mensagem do agente.
Fica salva na Central do agente para curadoria (remover) e treino futuro (few-shot).
Boot-safe (CREATE TABLE IF NOT EXISTS).

Revision ID: 097
Revises: 096
Create Date: 2026-06-25
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "097"
down_revision: Union[str, None] = "096"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS agente_ajustes_resposta (
            id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id      UUID NOT NULL,
            agente_id         UUID NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
            conversa_id       UUID,
            mensagem_id       UUID,
            resposta_original TEXT NOT NULL DEFAULT '',
            resposta_sugerida TEXT NOT NULL,
            categoria         VARCHAR(60),
            autor_id          UUID,
            ativo             BOOLEAN NOT NULL DEFAULT true,
            criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_ajustes_agente ON agente_ajustes_resposta(agente_id) WHERE ativo"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS agente_ajustes_resposta"))
