"""ads_accounts — colunas para importação Meta

Revision ID: 004
Revises: 003
Create Date: 2026-05-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE ads_accounts
            ADD COLUMN IF NOT EXISTS bm_token          TEXT,
            ADD COLUMN IF NOT EXISTS token_expira_em   TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS sincronizado_em   TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS periodo_sync_inicio DATE,
            ADD COLUMN IF NOT EXISTS account_status    INTEGER DEFAULT 1
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE ads_accounts
            DROP COLUMN IF EXISTS bm_token,
            DROP COLUMN IF EXISTS sincronizado_em,
            DROP COLUMN IF EXISTS periodo_sync_inicio,
            DROP COLUMN IF EXISTS account_status
    """))
