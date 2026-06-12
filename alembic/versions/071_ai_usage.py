"""ai_usage_log + ai_model_pricing + fx_rates (Consumo & Custo de IA - Fase 2)

Revision ID: 071
Revises: 070
Create Date: 2026-06-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "071"
down_revision: Union[str, None] = "070"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS ai_usage_log (
            id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            feature           VARCHAR(20) NOT NULL,
            workspace_id      UUID REFERENCES workspaces(id) ON DELETE SET NULL,
            model             VARCHAR(120) NOT NULL,
            provider          VARCHAR(40),
            kind              VARCHAR(10) NOT NULL DEFAULT 'text',
            tokens_prompt     INTEGER NOT NULL DEFAULT 0,
            tokens_completion INTEGER NOT NULL DEFAULT 0,
            tokens_total      INTEGER NOT NULL DEFAULT 0,
            image_count       INTEGER NOT NULL DEFAULT 0,
            image_quality     VARCHAR(10),
            image_size        VARCHAR(20),
            cost_usd          NUMERIC(12,6),
            pricing_source    VARCHAR(20) NOT NULL DEFAULT 'sem_preco',
            request_id        TEXT,
            status            VARCHAR(20) NOT NULL DEFAULT 'ok'
        )
    """))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_ai_usage_created ON ai_usage_log (created_at DESC)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_ai_usage_feature ON ai_usage_log (feature, created_at DESC)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_ai_usage_workspace ON ai_usage_log (workspace_id, created_at DESC)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_ai_usage_model ON ai_usage_log (model)"))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS ai_model_pricing (
            id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            model             VARCHAR(120) NOT NULL UNIQUE,
            kind              VARCHAR(10) NOT NULL DEFAULT 'text',
            input_usd_1m      NUMERIC(12,4),
            output_usd_1m     NUMERIC(12,4),
            image_prices_json JSONB,
            ativo             BOOLEAN NOT NULL DEFAULT true,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))
    # Seeds aproximados (USD); editáveis no painel. Imagem por qualidade (1024 quadrado).
    op.execute(sa.text("""
        INSERT INTO ai_model_pricing (model, kind, input_usd_1m, output_usd_1m, image_prices_json)
        VALUES
            ('gpt-4o-mini',  'text', 0.15, 0.60, NULL),
            ('gpt-4.1-mini', 'text', 0.40, 1.60, NULL),
            ('gpt-4.1',      'text', 2.00, 8.00, NULL),
            ('gpt-image-2',  'image', NULL, NULL,
             jsonb_build_object('low', 0.011, 'medium', 0.042, 'high', 0.167, 'auto', 0.042))
        ON CONFLICT (model) DO NOTHING
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS fx_rates (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            dia         DATE NOT NULL UNIQUE,
            usd_brl     NUMERIC(10,4) NOT NULL,
            fonte       VARCHAR(40),
            fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS fx_rates"))
    op.execute(sa.text("DROP TABLE IF EXISTS ai_model_pricing"))
    op.execute(sa.text("DROP TABLE IF EXISTS ai_usage_log"))
