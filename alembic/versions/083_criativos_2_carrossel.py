"""Criativos 2.0 — carrossel newsjacking (tabelas)

Cria criativo_carrosseis e criativo_carrossel_slides. O Diretor (LLM) monta o
roteiro (director_json) e o gpt-image-2 gera cada slide com texto/identidade
integrados (queimados pelo modelo). Cada slide referencia uma criativo_geracoes
(auditoria/usage). Multi-tenant por workspace_id. Ver docs/specs/criativos-2/.

Revision ID: 083
Revises: 082
Create Date: 2026-06-23
"""
from alembic import op
import sqlalchemy as sa

# Numeração: 075-081 reservadas pela branch não-mergeada agent/crm-atendimento-port
# e 082 já tomada (crm_mensagem_quoted) — seguimos para 083.
revision = "083"
down_revision = "082"
branch_labels = None
depends_on = None

_TS = (
    "criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(), "
    "atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT now()"
)


def upgrade() -> None:
    # ── Carrossel (1 por geração; o Diretor guarda o roteiro em director_json) ──
    op.execute(sa.text(f"""
        CREATE TABLE IF NOT EXISTS criativo_carrosseis (
            id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
            origem            VARCHAR(20) NOT NULL DEFAULT 'manual',
            tema              TEXT,
            molde             VARCHAR(2),
            composition_mode  VARCHAR(12) NOT NULL DEFAULT 'standard',
            n_slides          INTEGER NOT NULL DEFAULT 5,
            master_format     VARCHAR(20),
            director_json     JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            status            VARCHAR(20) NOT NULL DEFAULT 'pending',
            error_code        VARCHAR(40),
            error_message     TEXT,
            ativo             BOOLEAN NOT NULL DEFAULT true,
            {_TS}
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_criativo_carrosseis_ws "
        "ON criativo_carrosseis (workspace_id, ativo)"
    ))

    # ── Slides (cada um referencia uma criativo_geracoes; url por formato) ──────
    op.execute(sa.text(f"""
        CREATE TABLE IF NOT EXISTS criativo_carrossel_slides (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            carrossel_id    UUID NOT NULL REFERENCES criativo_carrosseis(id) ON DELETE CASCADE,
            slide_index     INTEGER NOT NULL,
            intensidade     VARCHAR(12),
            copy_json       JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            image_prompt    TEXT,
            geracao_id      UUID REFERENCES criativo_geracoes(id) ON DELETE SET NULL,
            base_image_url  TEXT,
            formatos_json   JSONB NOT NULL DEFAULT '{{}}'::jsonb,
            status          VARCHAR(20) NOT NULL DEFAULT 'pending',
            {_TS}
        )
    """))
    op.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_carrossel_slide_index "
        "ON criativo_carrossel_slides (carrossel_id, slide_index)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_carrossel_slides_carrossel "
        "ON criativo_carrossel_slides (carrossel_id)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS criativo_carrossel_slides"))
    op.execute(sa.text("DROP TABLE IF EXISTS criativo_carrosseis"))
