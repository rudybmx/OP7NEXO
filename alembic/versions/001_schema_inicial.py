"""schema inicial

Revision ID: 001
Revises:
Create Date: 2026-05-09

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TYPE role_usuario AS ENUM (
            'platform_admin','network_admin','network_viewer','company_admin','company_agent'
        )
    """))
    op.execute(sa.text("""
        CREATE TYPE slug_modulo AS ENUM ('marketing','crm','management','performance')
    """))
    op.execute(sa.text("""
        CREATE TYPE tipo_recurso AS ENUM ('conta_ads','numero_whatsapp')
    """))
    op.execute(sa.text("""
        CREATE TYPE nivel_permissao AS ENUM ('view','edit','admin')
    """))

    op.execute(sa.text("""
        CREATE TABLE networks (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            nome        VARCHAR(255) NOT NULL,
            slug        VARCHAR(100) NOT NULL UNIQUE,
            descricao   VARCHAR(500),
            ativo       BOOLEAN NOT NULL DEFAULT TRUE,
            criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE companies (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            network_id  UUID NOT NULL REFERENCES networks(id) ON DELETE RESTRICT,
            nome        VARCHAR(255) NOT NULL,
            slug        VARCHAR(100) NOT NULL UNIQUE,
            cidade      VARCHAR(100),
            estado      VARCHAR(2),
            telefone    VARCHAR(20),
            ativo       BOOLEAN NOT NULL DEFAULT TRUE,
            criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE users (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            network_id  UUID REFERENCES networks(id) ON DELETE RESTRICT,
            nome        VARCHAR(255) NOT NULL,
            email       VARCHAR(255) NOT NULL UNIQUE,
            senha_hash  VARCHAR(255) NOT NULL,
            role        role_usuario NOT NULL,
            ativo       BOOLEAN NOT NULL DEFAULT TRUE,
            criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE user_company_access (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            usuario_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_usuario_company UNIQUE (usuario_id, company_id)
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE modules (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            nome        VARCHAR(100) NOT NULL,
            slug        slug_modulo NOT NULL UNIQUE,
            descricao   VARCHAR(500),
            ativo       BOOLEAN NOT NULL DEFAULT TRUE,
            criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE plans (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            nome          VARCHAR(100) NOT NULL,
            descricao     VARCHAR(500),
            preco_mensal  NUMERIC(10,2),
            ativo         BOOLEAN NOT NULL DEFAULT TRUE,
            criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE plan_modules (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            plano_id    UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
            modulo_id   UUID NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
            criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_plano_modulo UNIQUE (plano_id, modulo_id)
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE account_resources (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            tipo          tipo_recurso NOT NULL,
            identificador VARCHAR(255) NOT NULL,
            nome          VARCHAR(255),
            ativo         BOOLEAN NOT NULL DEFAULT TRUE,
            criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE user_permissions (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            usuario_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            modulo_id   UUID NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
            nivel       nivel_permissao NOT NULL,
            criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_usuario_company_modulo UNIQUE (usuario_id, company_id, modulo_id)
        )
    """))

    # --- índices ---
    op.execute(sa.text("CREATE INDEX ix_companies_network_id ON companies(network_id)"))
    op.execute(sa.text("CREATE INDEX ix_users_network_id ON users(network_id)"))
    op.execute(sa.text("CREATE INDEX ix_users_email ON users(email)"))
    op.execute(sa.text("CREATE INDEX ix_user_company_access_usuario_id ON user_company_access(usuario_id)"))
    op.execute(sa.text("CREATE INDEX ix_user_company_access_company_id ON user_company_access(company_id)"))
    op.execute(sa.text("CREATE INDEX ix_account_resources_company_id ON account_resources(company_id)"))
    op.execute(sa.text("CREATE INDEX ix_user_permissions_usuario_id ON user_permissions(usuario_id)"))
    op.execute(sa.text("CREATE INDEX ix_user_permissions_company_id ON user_permissions(company_id)"))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS user_permissions CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS account_resources CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS plan_modules CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS plans CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS modules CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS user_company_access CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS users CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS companies CASCADE"))
    op.execute(sa.text("DROP TABLE IF EXISTS networks CASCADE"))
    op.execute(sa.text("DROP TYPE IF EXISTS nivel_permissao"))
    op.execute(sa.text("DROP TYPE IF EXISTS tipo_recurso"))
    op.execute(sa.text("DROP TYPE IF EXISTS slug_modulo"))
    op.execute(sa.text("DROP TYPE IF EXISTS role_usuario"))
