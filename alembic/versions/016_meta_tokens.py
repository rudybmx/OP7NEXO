"""meta_tokens table + ads_accounts.ativo column

Revision ID: 016
Revises: 015
Create Date: 2026-05-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "016"
down_revision: Union[str, None] = "015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS meta_tokens (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            nome        VARCHAR(100) NOT NULL,
            token       TEXT NOT NULL,
            valido_ate  DATE,
            ativo       BOOLEAN NOT NULL DEFAULT true,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))

    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_meta_tokens_workspace_id
            ON meta_tokens (workspace_id)
    """))

    op.execute(sa.text("""
        ALTER TABLE ads_accounts
            ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true
    """))

    op.execute(sa.text("""
        INSERT INTO meta_tokens (workspace_id, nome, token, valido_ate)
        SELECT DISTINCT ON (bm_token)
            workspace_id,
            COALESCE(account_name, 'Token Principal') AS nome,
            bm_token AS token,
            token_expira_em::date AS valido_ate
        FROM ads_accounts
        WHERE bm_token IS NOT NULL
        ORDER BY bm_token, criado_em
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS meta_tokens"))
    op.execute(sa.text(
        "ALTER TABLE ads_accounts DROP COLUMN IF EXISTS ativo"
    ))
