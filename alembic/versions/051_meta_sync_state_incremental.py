"""meta sync state incremental and catalog updated_time columns

Revision ID: 051_meta_sync_state_incremental
Revises: 050_canonizar_conversas_waha
Create Date: 2026-06-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "051_meta_sync_state_incremental"
down_revision: Union[str, None] = "050_canonizar_conversas_waha"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS meta_sync_states (
            id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ads_account_id                UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            last_run_at                   TIMESTAMPTZ,
            last_run_mode                 VARCHAR(30),
            last_run_status               VARCHAR(30),
            last_success_at               TIMESTAMPTZ,
            last_error_at                 TIMESTAMPTZ,
            last_error_stage              VARCHAR(80),
            last_error_message            TEXT,
            last_error_code               INTEGER,
            last_error_http_status        INTEGER,
            last_rate_limit_usage_percent INTEGER,
            cooldown_until                TIMESTAMPTZ,
            last_totals                   JSONB NOT NULL DEFAULT '{}'::jsonb,
            watermarks                    JSONB NOT NULL DEFAULT '{}'::jsonb,
            last_error_meta               JSONB NOT NULL DEFAULT '{}'::jsonb,
            criado_em                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            atualizado_em                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (ads_account_id)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_meta_sync_states_cooldown "
        "ON meta_sync_states(cooldown_until)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_meta_sync_states_last_success "
        "ON meta_sync_states(last_success_at)"
    ))

    op.execute(sa.text("""
        INSERT INTO meta_sync_states (
            ads_account_id,
            last_run_at,
            last_run_mode,
            last_run_status,
            last_success_at,
            cooldown_until,
            last_totals,
            watermarks
        )
        SELECT
            aa.id,
            aa.sincronizado_em,
            CASE WHEN aa.sincronizado_em IS NOT NULL THEN 'recorrente' ELSE NULL END,
            CASE WHEN aa.sincronizado_em IS NOT NULL THEN 'success' ELSE NULL END,
            aa.sincronizado_em,
            NULLIF(aa.config->'meta_sync'->>'cooldown_until', '')::timestamptz,
            COALESCE(aa.config->'meta_sync'->'last_totals', '{}'::jsonb),
            COALESCE(aa.config->'meta_sync'->'watermarks', '{}'::jsonb)
        FROM ads_accounts aa
        WHERE aa.plataforma = 'meta'
        ON CONFLICT (ads_account_id) DO NOTHING
    """))

    for table in ("meta_campaigns_catalog", "meta_adsets_catalog", "meta_ads_catalog"):
        op.execute(sa.text(f"""
            ALTER TABLE {table}
                ADD COLUMN IF NOT EXISTS updated_time TIMESTAMPTZ
        """))


def downgrade() -> None:
    for table in ("meta_ads_catalog", "meta_adsets_catalog", "meta_campaigns_catalog"):
        op.execute(sa.text(f"ALTER TABLE {table} DROP COLUMN IF EXISTS updated_time"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_meta_sync_states_last_success"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_meta_sync_states_cooldown"))
    op.execute(sa.text("DROP TABLE IF EXISTS meta_sync_states"))
