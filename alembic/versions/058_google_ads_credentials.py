"""Cria tabela google_ads_credentials

Revision ID: 058
Revises: 057
Create Date: 2026-06-07
"""
from alembic import op
import sqlalchemy as sa

revision = "058"
down_revision = "057"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS google_ads_credentials (
            id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            nome                    VARCHAR(100) NOT NULL,
            developer_token         TEXT NOT NULL,
            client_id               TEXT NOT NULL,
            client_secret           TEXT NOT NULL,
            refresh_token           TEXT NOT NULL,
            manager_customer_id     VARCHAR(20),
            access_token            TEXT,
            access_token_expires_at TIMESTAMPTZ,
            ativo                   BOOLEAN NOT NULL DEFAULT true,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS google_ads_credentials"))
