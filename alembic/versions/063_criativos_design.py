"""Estúdio de Criativos (Fase 1: imagem) — tabelas base

Cria as 7 tabelas do gerador de criativos:
criativo_logos, criativo_templates, criativo_estilos, criativo_brand_kits,
criativo_geracoes, criativo_projetos, criativo_export_jobs.

Princípio: gpt-image-2 gera só a base visual (criativo_geracoes); o OP7NEXO
monta o criativo final editável (criativo_projetos) com template + logo real +
camadas de texto + Brand Kit, e exporta via job no worker (criativo_export_jobs).
Multi-tenant por workspace_id. Estilos/templates com workspace_id NULL = global.
Ver docs/specs/gerador-criativos/.

Revision ID: 063
Revises: 062
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa

revision = "063"
down_revision = "062"
branch_labels = None
depends_on = None

_TS = (
    "criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(), "
    "atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()"
)


def upgrade() -> None:
    # ── Logos (ativo de marca; aplicada como camada no render) ──────────────
    op.execute(sa.text(f"""
        CREATE TABLE IF NOT EXISTS criativo_logos (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            nome          VARCHAR(120) NOT NULL,
            arquivo_url   TEXT NOT NULL,
            variant       VARCHAR(40),
            width         INTEGER,
            height        INTEGER,
            mime_type     VARCHAR(80),
            ativo         BOOLEAN NOT NULL DEFAULT true,
            {_TS}
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_criativo_logos_ws "
        "ON criativo_logos (workspace_id, ativo)"
    ))

    # ── Templates (layout com áreas seguras; NULL workspace = global) ───────
    op.execute(sa.text(f"""
        CREATE TABLE IF NOT EXISTS criativo_templates (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id    UUID REFERENCES workspaces(id) ON DELETE CASCADE,
            nome            VARCHAR(120) NOT NULL,
            creative_format VARCHAR(40) NOT NULL,
            layout_json     JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            escopo          VARCHAR(20) NOT NULL DEFAULT 'global',
            ativo           BOOLEAN NOT NULL DEFAULT true,
            {_TS}
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_criativo_templates_ws "
        "ON criativo_templates (workspace_id, ativo)"
    ))

    # ── Estilos (prompt-template curado; NULL workspace = global) ───────────
    op.execute(sa.text(f"""
        CREATE TABLE IF NOT EXISTS criativo_estilos (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id     UUID REFERENCES workspaces(id) ON DELETE CASCADE,
            nome             VARCHAR(120) NOT NULL,
            prompt_template  TEXT NOT NULL,
            thumb_url        TEXT,
            tom_default      VARCHAR(60),
            formato_default  VARCHAR(40),
            ativo            BOOLEAN NOT NULL DEFAULT true,
            {_TS}
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_criativo_estilos_ws "
        "ON criativo_estilos (workspace_id, ativo)"
    ))

    # ── Brand Kit (um por workspace) ────────────────────────────────────────
    op.execute(sa.text(f"""
        CREATE TABLE IF NOT EXISTS criativo_brand_kits (
            id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            logo_id          UUID REFERENCES criativo_logos(id) ON DELETE SET NULL,
            logo_variants    JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            primary_color    VARCHAR(20),
            secondary_color  VARCHAR(20),
            font_family      VARCHAR(120),
            tone_of_voice    VARCHAR(120),
            visual_rules     TEXT,
            forbidden_rules  TEXT,
            ativo            BOOLEAN NOT NULL DEFAULT true,
            {_TS}
        )
    """))
    op.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_criativo_brand_kits_ws "
        "ON criativo_brand_kits (workspace_id) WHERE ativo"
    ))

    # ── Gerações (cada chamada à OpenAI; gera só a base visual) ─────────────
    op.execute(sa.text(f"""
        CREATE TABLE IF NOT EXISTS criativo_geracoes (
            id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            user_id               UUID REFERENCES users(id) ON DELETE SET NULL,
            estilo_id             UUID REFERENCES criativo_estilos(id) ON DELETE SET NULL,
            briefing              TEXT,
            creative_format       VARCHAR(40),
            referencias_json      JSONB NOT NULL DEFAULT '[]'::jsonb,
            mask_url              TEXT,
            generation_size       VARCHAR(20),
            imagem_base_url       TEXT,
            model                 VARCHAR(60),
            model_snapshot        VARCHAR(120),
            prompt_final          TEXT,
            params_json           JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            request_id            VARCHAR(120),
            provider_response_id  VARCHAR(120),
            usage                 JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            status                VARCHAR(20) NOT NULL DEFAULT 'pending',
            error_code            VARCHAR(40),
            error_message         TEXT,
            ativo                 BOOLEAN NOT NULL DEFAULT true,
            {_TS}
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_criativo_geracoes_ws_status "
        "ON criativo_geracoes (workspace_id, status)"
    ))

    # ── Projetos (criativo final editável; sem IA na montagem) ──────────────
    op.execute(sa.text(f"""
        CREATE TABLE IF NOT EXISTS criativo_projetos (
            id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id         UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            user_id              UUID REFERENCES users(id) ON DELETE SET NULL,
            geracao_id           UUID REFERENCES criativo_geracoes(id) ON DELETE SET NULL,
            base_image_url       TEXT,
            template_id          UUID REFERENCES criativo_templates(id) ON DELETE SET NULL,
            brand_kit_id         UUID REFERENCES criativo_brand_kits(id) ON DELETE SET NULL,
            logo_id              UUID REFERENCES criativo_logos(id) ON DELETE SET NULL,
            creative_format      VARCHAR(40),
            layout_json          JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            text_layers_json     JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            export_urls_json     JSONB NOT NULL DEFAULT '[]'::jsonb,
            brand_kit_snapshot   JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            logo_snapshot        JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            template_snapshot    JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            status               VARCHAR(20) NOT NULL DEFAULT 'rascunho',
            ativo                BOOLEAN NOT NULL DEFAULT true,
            {_TS}
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_criativo_projetos_ws "
        "ON criativo_projetos (workspace_id, ativo)"
    ))

    # ── Jobs de exportação (render Playwright no worker) ────────────────────
    op.execute(sa.text(f"""
        CREATE TABLE IF NOT EXISTS criativo_export_jobs (
            id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            projeto_id     UUID NOT NULL REFERENCES criativo_projetos(id) ON DELETE CASCADE,
            export_size    VARCHAR(20) NOT NULL,
            output_format  VARCHAR(10) NOT NULL DEFAULT 'png',
            status         VARCHAR(20) NOT NULL DEFAULT 'pending',
            export_url     TEXT,
            error_code     VARCHAR(40),
            error_message  TEXT,
            progresso      INTEGER NOT NULL DEFAULT 0,
            ativo          BOOLEAN NOT NULL DEFAULT true,
            {_TS}
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_criativo_export_jobs_ws_status "
        "ON criativo_export_jobs (workspace_id, status)"
    ))


def downgrade() -> None:
    for tbl in [
        "criativo_export_jobs",
        "criativo_projetos",
        "criativo_geracoes",
        "criativo_brand_kits",
        "criativo_estilos",
        "criativo_templates",
        "criativo_logos",
    ]:
        op.execute(sa.text(f"DROP TABLE IF EXISTS {tbl} CASCADE"))
