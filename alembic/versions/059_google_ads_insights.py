"""Cria tabelas google_*_insights para dados do Google Ads

Revision ID: 059
Revises: 058
Create Date: 2026-06-07
"""
from alembic import op
import sqlalchemy as sa

revision = "059"
down_revision = "058"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS google_campanhas_insights (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            ads_account_id      UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            customer_id         VARCHAR(20) NOT NULL,
            campaign_id         VARCHAR(30) NOT NULL,
            campaign_name       TEXT,
            tipo_campanha       VARCHAR(30),
            status              VARCHAR(20),
            orcamento_diario    NUMERIC(14,2),
            investimento        NUMERIC(14,2) DEFAULT 0,
            cliques             BIGINT DEFAULT 0,
            impressoes          BIGINT DEFAULT 0,
            conversoes          NUMERIC(14,4) DEFAULT 0,
            valor_conversoes    NUMERIC(14,2) DEFAULT 0,
            ctr                 NUMERIC(8,6) DEFAULT 0,
            cpc_medio           NUMERIC(14,2) DEFAULT 0,
            cpm                 NUMERIC(14,2) DEFAULT 0,
            roas                NUMERIC(12,4) DEFAULT 0,
            taxa_conversao      NUMERIC(8,6) DEFAULT 0,
            custo_conversao     NUMERIC(14,2) DEFAULT 0,
            impression_share    NUMERIC(8,6) DEFAULT 0,
            is_perdido_budget   NUMERIC(8,6) DEFAULT 0,
            is_perdido_rank     NUMERIC(8,6) DEFAULT 0,
            absolute_top_is     NUMERIC(8,6) DEFAULT 0,
            quality_score_medio NUMERIC(5,2) DEFAULT 0,
            periodo_inicio      DATE NOT NULL,
            periodo_fim         DATE NOT NULL,
            sincronizado_em     TIMESTAMPTZ,
            ativo               BOOLEAN NOT NULL DEFAULT true,
            UNIQUE (ads_account_id, campaign_id, periodo_inicio, periodo_fim)
        )
    """))

    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_google_campanhas_workspace
            ON google_campanhas_insights (workspace_id, periodo_inicio, periodo_fim)
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS google_grupos_insights (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            ads_account_id      UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            campaign_id         VARCHAR(30) NOT NULL,
            grupo_id            VARCHAR(30) NOT NULL,
            grupo_nome          TEXT,
            status              VARCHAR(20),
            is_pmax             BOOLEAN NOT NULL DEFAULT false,
            tipo_grupo          VARCHAR(50),
            estrategia_lance    VARCHAR(50),
            target_cpa          NUMERIC(14,2),
            target_roas         NUMERIC(12,4),
            cpc_maximo          NUMERIC(14,2),
            em_aprendizado      BOOLEAN DEFAULT false,
            investimento        NUMERIC(14,2) DEFAULT 0,
            cliques             BIGINT DEFAULT 0,
            impressoes          BIGINT DEFAULT 0,
            conversoes          NUMERIC(14,4) DEFAULT 0,
            valor_conversoes    NUMERIC(14,2) DEFAULT 0,
            ctr                 NUMERIC(8,6) DEFAULT 0,
            cpc_medio           NUMERIC(14,2) DEFAULT 0,
            cpm                 NUMERIC(14,2) DEFAULT 0,
            roas                NUMERIC(12,4) DEFAULT 0,
            taxa_conversao      NUMERIC(8,6) DEFAULT 0,
            custo_conversao     NUMERIC(14,2) DEFAULT 0,
            quality_score_medio NUMERIC(5,2) DEFAULT 0,
            keywords_ativas     INTEGER DEFAULT 0,
            keywords_total      INTEGER DEFAULT 0,
            ad_strength         VARCHAR(20),
            anuncios_ativos     INTEGER DEFAULT 0,
            impression_share    NUMERIC(8,6) DEFAULT 0,
            is_perdido_budget   NUMERIC(8,6) DEFAULT 0,
            is_perdido_rank     NUMERIC(8,6) DEFAULT 0,
            periodo_inicio      DATE NOT NULL,
            periodo_fim         DATE NOT NULL,
            sincronizado_em     TIMESTAMPTZ,
            ativo               BOOLEAN NOT NULL DEFAULT true,
            UNIQUE (ads_account_id, grupo_id, tipo_grupo, periodo_inicio, periodo_fim)
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS google_keywords_insights (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            ads_account_id  UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            campaign_id     VARCHAR(30) NOT NULL,
            ad_group_id     VARCHAR(30) NOT NULL,
            criterion_id    VARCHAR(30) NOT NULL,
            keyword_text    TEXT,
            match_type      VARCHAR(20),
            status          VARCHAR(20),
            quality_score   INTEGER DEFAULT 0,
            investimento    NUMERIC(14,2) DEFAULT 0,
            cliques         BIGINT DEFAULT 0,
            impressoes      BIGINT DEFAULT 0,
            conversoes      NUMERIC(14,4) DEFAULT 0,
            ctr             NUMERIC(8,6) DEFAULT 0,
            cpc_medio       NUMERIC(14,2) DEFAULT 0,
            custo_conversao NUMERIC(14,2) DEFAULT 0,
            periodo_inicio  DATE NOT NULL,
            periodo_fim     DATE NOT NULL,
            sincronizado_em TIMESTAMPTZ,
            ativo           BOOLEAN NOT NULL DEFAULT true,
            UNIQUE (ads_account_id, criterion_id, periodo_inicio, periodo_fim)
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS google_anuncios_insights (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            ads_account_id  UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            campaign_id     VARCHAR(30) NOT NULL,
            ad_group_id     VARCHAR(30) NOT NULL,
            ad_id           VARCHAR(30) NOT NULL,
            titulo          TEXT,
            descricao       TEXT,
            tipo_anuncio    VARCHAR(50),
            status          VARCHAR(20),
            ad_strength     VARCHAR(20),
            investimento    NUMERIC(14,2) DEFAULT 0,
            cliques         BIGINT DEFAULT 0,
            impressoes      BIGINT DEFAULT 0,
            conversoes      NUMERIC(14,4) DEFAULT 0,
            ctr             NUMERIC(8,6) DEFAULT 0,
            cpc_medio       NUMERIC(14,2) DEFAULT 0,
            custo_conversao NUMERIC(14,2) DEFAULT 0,
            periodo_inicio  DATE NOT NULL,
            periodo_fim     DATE NOT NULL,
            sincronizado_em TIMESTAMPTZ,
            ativo           BOOLEAN NOT NULL DEFAULT true,
            UNIQUE (ads_account_id, ad_id, periodo_inicio, periodo_fim)
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS google_publicos_insights (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            ads_account_id  UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            campaign_id     VARCHAR(30) NOT NULL,
            criterion_id    VARCHAR(30) NOT NULL,
            audience_name   TEXT,
            leads           BIGINT DEFAULT 0,
            investimento    NUMERIC(14,2) DEFAULT 0,
            cpl             NUMERIC(14,2) DEFAULT 0,
            ctr             NUMERIC(8,6) DEFAULT 0,
            percentual      NUMERIC(8,6) DEFAULT 0,
            periodo_inicio  DATE NOT NULL,
            periodo_fim     DATE NOT NULL,
            sincronizado_em TIMESTAMPTZ,
            ativo           BOOLEAN NOT NULL DEFAULT true,
            UNIQUE (ads_account_id, criterion_id, periodo_inicio, periodo_fim)
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS google_dados_diarios (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            ads_account_id  UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            campaign_id     VARCHAR(30) NOT NULL,
            data            DATE NOT NULL,
            cliques         BIGINT DEFAULT 0,
            impressoes      BIGINT DEFAULT 0,
            conversoes      NUMERIC(14,4) DEFAULT 0,
            custo           NUMERIC(14,2) DEFAULT 0,
            ctr             NUMERIC(8,6) DEFAULT 0,
            sincronizado_em TIMESTAMPTZ,
            ativo           BOOLEAN NOT NULL DEFAULT true,
            UNIQUE (ads_account_id, campaign_id, data)
        )
    """))

    op.execute(sa.text("""
        CREATE INDEX IF NOT EXISTS ix_google_dados_diarios_account_data
            ON google_dados_diarios (ads_account_id, data)
    """))


def downgrade() -> None:
    for tbl in [
        "google_dados_diarios",
        "google_publicos_insights",
        "google_anuncios_insights",
        "google_keywords_insights",
        "google_grupos_insights",
        "google_campanhas_insights",
    ]:
        op.execute(sa.text(f"DROP TABLE IF EXISTS {tbl}"))
