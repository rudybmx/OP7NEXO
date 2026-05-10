"""workspaces e contas ads

Revision ID: 002
Revises: 001
Create Date: 2026-05-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE workspaces (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            nome          VARCHAR(255) NOT NULL,
            razao_social  VARCHAR(255),
            cnpj          VARCHAR(18),
            endereco      JSONB NOT NULL DEFAULT '{}',
            ativo         BOOLEAN NOT NULL DEFAULT TRUE,
            criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE ads_accounts (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            plataforma      VARCHAR(20) NOT NULL,
            account_id      VARCHAR(100) NOT NULL,
            account_name    VARCHAR(255),
            token_acesso    TEXT,
            token_expira_em TIMESTAMPTZ,
            bm_id           VARCHAR(100),
            status          VARCHAR(20) NOT NULL DEFAULT 'ativo',
            config          JSONB NOT NULL DEFAULT '{}',
            criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
            atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(plataforma, account_id)
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE whatsapp_numbers (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            numero              VARCHAR(20) NOT NULL,
            nome_exibicao       VARCHAR(100),
            evolution_instance  VARCHAR(100),
            status              VARCHAR(20) NOT NULL DEFAULT 'desconectado',
            criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
            atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE workspace_modules (
            workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            modulo        VARCHAR(50) NOT NULL,
            ativo         BOOLEAN NOT NULL DEFAULT TRUE,
            PRIMARY KEY (workspace_id, modulo)
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE user_resource_access (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            resource_type VARCHAR(30) NOT NULL,
            resource_id   UUID NOT NULL,
            criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(user_id, resource_type, resource_id)
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE meta_campanhas (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ads_account_id  UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            campaign_id     VARCHAR(100) NOT NULL,
            nome            VARCHAR(255),
            status          VARCHAR(30),
            objetivo        VARCHAR(50),
            orcamento_diario NUMERIC(10,2),
            criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
            atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(ads_account_id, campaign_id)
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE meta_insights_diarios (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ads_account_id  UUID NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
            data            DATE NOT NULL,
            spend           NUMERIC(10,2),
            impressions     INTEGER,
            reach           INTEGER,
            clicks          INTEGER,
            leads           INTEGER,
            cpl             NUMERIC(10,2),
            criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(ads_account_id, data)
        )
    """))

    op.execute(sa.text("CREATE INDEX ix_ads_accounts_workspace ON ads_accounts(workspace_id)"))
    op.execute(sa.text("CREATE INDEX ix_whatsapp_workspace ON whatsapp_numbers(workspace_id)"))
    op.execute(sa.text("CREATE INDEX ix_meta_insights_data ON meta_insights_diarios(ads_account_id, data)"))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS meta_insights_diarios CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS meta_campanhas CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS user_resource_access CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS workspace_modules CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS whatsapp_numbers CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS ads_accounts CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS workspaces CASCADE"))
