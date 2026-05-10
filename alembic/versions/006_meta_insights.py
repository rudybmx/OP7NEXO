"""meta insights — campanhas, anuncios, publicos e colunas extras em diarios

Revision ID: 006
Revises: 005
Create Date: 2026-05-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Adiciona colunas em meta_insights_diarios
    op.execute(sa.text("""
        ALTER TABLE meta_insights_diarios
            ADD COLUMN IF NOT EXISTS cpc         NUMERIC(10,4),
            ADD COLUMN IF NOT EXISTS cpm         NUMERIC(10,4),
            ADD COLUMN IF NOT EXISTS ctr         NUMERIC(10,4),
            ADD COLUMN IF NOT EXISTS frequencia  NUMERIC(10,4),
            ADD COLUMN IF NOT EXISTS leads_mensagem  INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS leads_cadastro  INTEGER DEFAULT 0
    """))

    # 2. Insights por campanha
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS meta_campanhas_insights (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ads_account_id  UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            campaign_id     VARCHAR(50) NOT NULL,
            nome            VARCHAR(255),
            status          VARCHAR(30),
            objetivo        VARCHAR(50),
            data            DATE NOT NULL,
            spend           NUMERIC(10,2) DEFAULT 0,
            leads           INTEGER DEFAULT 0,
            impressions     INTEGER DEFAULT 0,
            reach           INTEGER DEFAULT 0,
            clicks          INTEGER DEFAULT 0,
            ctr             NUMERIC(10,4) DEFAULT 0,
            cpc             NUMERIC(10,4) DEFAULT 0,
            cpm             NUMERIC(10,4) DEFAULT 0,
            frequencia      NUMERIC(10,4) DEFAULT 0,
            criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(ads_account_id, campaign_id, data)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_meta_camp_insights_account "
        "ON meta_campanhas_insights(ads_account_id)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_meta_camp_insights_data "
        "ON meta_campanhas_insights(ads_account_id, data)"
    ))

    # 3. Insights por anúncio
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS meta_anuncios_insights (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ads_account_id  UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            ad_id           VARCHAR(50) NOT NULL,
            adset_id        VARCHAR(50),
            campaign_id     VARCHAR(50),
            nome            VARCHAR(255),
            status          VARCHAR(30),
            creative_id     VARCHAR(50),
            thumbnail_url   TEXT,
            tipo            VARCHAR(20) DEFAULT 'IMAGE',
            data            DATE NOT NULL,
            spend           NUMERIC(10,2) DEFAULT 0,
            leads           INTEGER DEFAULT 0,
            impressions     INTEGER DEFAULT 0,
            reach           INTEGER DEFAULT 0,
            clicks          INTEGER DEFAULT 0,
            ctr             NUMERIC(10,4) DEFAULT 0,
            cpc             NUMERIC(10,4) DEFAULT 0,
            cpm             NUMERIC(10,4) DEFAULT 0,
            frequencia      NUMERIC(10,4) DEFAULT 0,
            criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(ads_account_id, ad_id, data)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_meta_ad_insights_account "
        "ON meta_anuncios_insights(ads_account_id)"
    ))

    # 4. Insights de públicos (breakdowns demográficos e de placement)
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS meta_publicos_insights (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ads_account_id  UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            data            DATE NOT NULL,
            breakdown_type  VARCHAR(20) NOT NULL,
            breakdown_value VARCHAR(50) NOT NULL,
            leads           INTEGER DEFAULT 0,
            spend           NUMERIC(10,2) DEFAULT 0,
            impressions     INTEGER DEFAULT 0,
            clicks          INTEGER DEFAULT 0,
            ctr             NUMERIC(10,4) DEFAULT 0,
            cpl             NUMERIC(10,4) DEFAULT 0,
            criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(ads_account_id, data, breakdown_type, breakdown_value)
        )
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS meta_publicos_insights CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS meta_anuncios_insights CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS meta_campanhas_insights CASCADE"))
    op.execute(sa.text("""
        ALTER TABLE meta_insights_diarios
            DROP COLUMN IF EXISTS cpc,
            DROP COLUMN IF EXISTS cpm,
            DROP COLUMN IF EXISTS ctr,
            DROP COLUMN IF EXISTS frequencia,
            DROP COLUMN IF EXISTS leads_mensagem,
            DROP COLUMN IF EXISTS leads_cadastro
    """))
