"""agente_uso_tokens + colunas ai_* em crm_whatsapp_conversas (Central de Agentes, Fase 2)

Revision ID: 086
Revises: 085
Create Date: 2026-06-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "086"
down_revision: Union[str, None] = "085"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS agente_uso_tokens (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            agente_id       UUID NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
            workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            canal_id        UUID REFERENCES canais_entrada(id) ON DELETE SET NULL,
            conversa_id     UUID REFERENCES crm_whatsapp_conversas(id) ON DELETE SET NULL,
            modelo          VARCHAR(120),
            tokens_input    INTEGER NOT NULL DEFAULT 0,
            tokens_output   INTEGER NOT NULL DEFAULT 0,
            escalado        BOOLEAN NOT NULL DEFAULT false,
            score_confianca DOUBLE PRECISION,
            criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_agente_uso_workspace ON agente_uso_tokens (workspace_id, criado_em DESC)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_agente_uso_agente ON agente_uso_tokens (agente_id, criado_em DESC)"
    ))

    # GATE: crm_whatsapp_conversas já tem coluna `agente VARCHAR` (display name) — NÃO confundir
    # com ai_agente_id. Tudo ADD COLUMN IF NOT EXISTS (idempotente).
    op.execute(sa.text("ALTER TABLE crm_whatsapp_conversas ADD COLUMN IF NOT EXISTS ai_respondido BOOLEAN NOT NULL DEFAULT false"))
    op.execute(sa.text("ALTER TABLE crm_whatsapp_conversas ADD COLUMN IF NOT EXISTS ai_escalado BOOLEAN NOT NULL DEFAULT false"))
    op.execute(sa.text("ALTER TABLE crm_whatsapp_conversas ADD COLUMN IF NOT EXISTS ai_agente_id UUID REFERENCES agentes(id) ON DELETE SET NULL"))
    op.execute(sa.text("ALTER TABLE crm_whatsapp_conversas ADD COLUMN IF NOT EXISTS ai_score_confianca DOUBLE PRECISION"))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE crm_whatsapp_conversas DROP COLUMN IF EXISTS ai_score_confianca"))
    op.execute(sa.text("ALTER TABLE crm_whatsapp_conversas DROP COLUMN IF EXISTS ai_agente_id"))
    op.execute(sa.text("ALTER TABLE crm_whatsapp_conversas DROP COLUMN IF EXISTS ai_escalado"))
    op.execute(sa.text("ALTER TABLE crm_whatsapp_conversas DROP COLUMN IF EXISTS ai_respondido"))
    op.execute(sa.text("DROP TABLE IF EXISTS agente_uso_tokens"))
