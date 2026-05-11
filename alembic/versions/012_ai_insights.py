"""ai_insights table with cache and history support

Revision ID: 012
Revises: 011
Create Date: 2026-05-11
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS ai_insights (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            ads_account_id UUID REFERENCES ads_accounts(id) ON DELETE CASCADE,
            campaign_id   VARCHAR(50),
            modulo        VARCHAR(30) NOT NULL DEFAULT 'meta_ads',
            tipo          VARCHAR(20) NOT NULL,
            titulo        VARCHAR(150) NOT NULL,
            mensagem      TEXT NOT NULL,
            acao          TEXT,
            dados_contexto JSONB,
            dados_hash    VARCHAR(64),
            resolvido     BOOLEAN NOT NULL DEFAULT false,
            gerado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
            expira_em     TIMESTAMPTZ NOT NULL
        );
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_ai_insights_workspace
            ON ai_insights(workspace_id, modulo, gerado_em DESC);
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_ai_insights_account
            ON ai_insights(ads_account_id, gerado_em DESC);
    """))
    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_ai_insights_expira
            ON ai_insights(expira_em) WHERE NOT resolvido;
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS ai_insights;"))
