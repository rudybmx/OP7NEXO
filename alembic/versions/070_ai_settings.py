"""ai_settings table (config de IA por feature) + ai_insights.model_usado

Revision ID: 070
Revises: 069
Create Date: 2026-06-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "070"
down_revision: Union[str, None] = "069"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS ai_settings (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            feature     VARCHAR(20) NOT NULL UNIQUE,
            provider    VARCHAR(40),
            model       VARCHAR(120),
            base_url    TEXT,
            api_key     TEXT,
            ativo       BOOLEAN NOT NULL DEFAULT true,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))

    # Seed das features conhecidas com overrides NULL (resolver cai no .env).
    # `agent` é slot reservado (futuro), inativo.
    op.execute(sa.text("""
        INSERT INTO ai_settings (feature, provider, ativo)
        VALUES
            ('insights', 'openai', true),
            ('image',    'openai', true),
            ('vision',   'openai', true),
            ('copy',     'openai', true),
            ('agent',    'openai', false)
        ON CONFLICT (feature) DO NOTHING
    """))

    op.execute(sa.text("""
        ALTER TABLE ai_insights
            ADD COLUMN IF NOT EXISTS model_usado VARCHAR(120)
    """))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE ai_insights DROP COLUMN IF EXISTS model_usado"))
    op.execute(sa.text("DROP TABLE IF EXISTS ai_settings"))
