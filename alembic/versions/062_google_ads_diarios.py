"""Tabelas diárias por entidade do Google Ads (granularidade por data)

Cria google_{grupos,keywords,anuncios,publicos}_diarios e adiciona
valor_conversoes a google_dados_diarios. Permite fatiar métricas por
range de datas (SUM ... WHERE data BETWEEN ... GROUP BY entidade),
replicando o padrão diário do Meta Ads. As tabelas google_*_insights
permanecem como snapshot de janela (metadados + impression_share +
quality_score, que não são somáveis por dia).

Revision ID: 062
Revises: 061
Create Date: 2026-06-09
"""
from alembic import op
import sqlalchemy as sa

revision = "062"
down_revision = "061"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Campanhas: adicionar valor_conversoes ao diário existente ───────────
    op.execute(sa.text(
        "ALTER TABLE google_dados_diarios "
        "ADD COLUMN IF NOT EXISTS valor_conversoes NUMERIC(14,2) DEFAULT 0"
    ))

    # ── Grupos diários (ad_group + asset_group/PMax) ────────────────────────
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS google_grupos_diarios (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            ads_account_id   UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            campaign_id      VARCHAR(30) NOT NULL,
            grupo_id         VARCHAR(30) NOT NULL,
            tipo_grupo       VARCHAR(50) NOT NULL DEFAULT 'AD_GROUP',
            data             DATE NOT NULL,
            investimento     NUMERIC(14,2) DEFAULT 0,
            cliques          BIGINT DEFAULT 0,
            impressoes       BIGINT DEFAULT 0,
            conversoes       NUMERIC(14,4) DEFAULT 0,
            valor_conversoes NUMERIC(14,2) DEFAULT 0,
            sincronizado_em  TIMESTAMPTZ,
            ativo            BOOLEAN NOT NULL DEFAULT true,
            UNIQUE (ads_account_id, grupo_id, tipo_grupo, data)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_google_grupos_diarios_account_data "
        "ON google_grupos_diarios (ads_account_id, data)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_google_grupos_diarios_campaign "
        "ON google_grupos_diarios (ads_account_id, campaign_id)"
    ))

    # ── Keywords diárias ────────────────────────────────────────────────────
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS google_keywords_diarios (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            ads_account_id   UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            campaign_id      VARCHAR(30) NOT NULL,
            ad_group_id      VARCHAR(30) NOT NULL,
            criterion_id     VARCHAR(30) NOT NULL,
            data             DATE NOT NULL,
            investimento     NUMERIC(14,2) DEFAULT 0,
            cliques          BIGINT DEFAULT 0,
            impressoes       BIGINT DEFAULT 0,
            conversoes       NUMERIC(14,4) DEFAULT 0,
            valor_conversoes NUMERIC(14,2) DEFAULT 0,
            sincronizado_em  TIMESTAMPTZ,
            ativo            BOOLEAN NOT NULL DEFAULT true,
            UNIQUE (ads_account_id, criterion_id, data)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_google_keywords_diarios_account_data "
        "ON google_keywords_diarios (ads_account_id, data)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_google_keywords_diarios_grupo "
        "ON google_keywords_diarios (ads_account_id, ad_group_id)"
    ))

    # ── Anúncios diários ────────────────────────────────────────────────────
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS google_anuncios_diarios (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            ads_account_id   UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            campaign_id      VARCHAR(30) NOT NULL,
            ad_group_id      VARCHAR(30) NOT NULL,
            ad_id            VARCHAR(30) NOT NULL,
            data             DATE NOT NULL,
            investimento     NUMERIC(14,2) DEFAULT 0,
            cliques          BIGINT DEFAULT 0,
            impressoes       BIGINT DEFAULT 0,
            conversoes       NUMERIC(14,4) DEFAULT 0,
            valor_conversoes NUMERIC(14,2) DEFAULT 0,
            sincronizado_em  TIMESTAMPTZ,
            ativo            BOOLEAN NOT NULL DEFAULT true,
            UNIQUE (ads_account_id, ad_id, data)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_google_anuncios_diarios_account_data "
        "ON google_anuncios_diarios (ads_account_id, data)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_google_anuncios_diarios_campaign "
        "ON google_anuncios_diarios (ads_account_id, campaign_id)"
    ))

    # ── Públicos diários ────────────────────────────────────────────────────
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS google_publicos_diarios (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            ads_account_id   UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            campaign_id      VARCHAR(30) NOT NULL,
            criterion_id     VARCHAR(30) NOT NULL,
            data             DATE NOT NULL,
            investimento     NUMERIC(14,2) DEFAULT 0,
            cliques          BIGINT DEFAULT 0,
            impressoes       BIGINT DEFAULT 0,
            conversoes       NUMERIC(14,4) DEFAULT 0,
            sincronizado_em  TIMESTAMPTZ,
            ativo            BOOLEAN NOT NULL DEFAULT true,
            UNIQUE (ads_account_id, criterion_id, data)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_google_publicos_diarios_account_data "
        "ON google_publicos_diarios (ads_account_id, data)"
    ))


def downgrade() -> None:
    for tbl in [
        "google_publicos_diarios",
        "google_anuncios_diarios",
        "google_keywords_diarios",
        "google_grupos_diarios",
    ]:
        op.execute(sa.text(f"DROP TABLE IF EXISTS {tbl}"))
    op.execute(sa.text(
        "ALTER TABLE google_dados_diarios DROP COLUMN IF EXISTS valor_conversoes"
    ))
