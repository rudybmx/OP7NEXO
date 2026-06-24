"""agentes + agente_canais + agente_prompts + agente_horarios + agente_habilidades (Central de Agentes, Fase 1)

Revision ID: 085
Revises: 084
Create Date: 2026-06-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "085"
down_revision: Union[str, None] = "084"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS agentes (
            id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id             UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            nome                     VARCHAR(120) NOT NULL,
            descricao                TEXT,
            provider_id              UUID REFERENCES llm_providers(id) ON DELETE SET NULL,
            modelo                   VARCHAR(120),
            status                   VARCHAR(20) NOT NULL DEFAULT 'inativo',
            tom                      VARCHAR(40),
            idiomas                  TEXT[] NOT NULL DEFAULT '{}',
            blacklist_topicos        TEXT[] NOT NULL DEFAULT '{}',
            threshold_confianca      DOUBLE PRECISION NOT NULL DEFAULT 0.7,
            tempo_resposta_target_ms INTEGER,
            debounce_segundos        INTEGER NOT NULL DEFAULT 40,
            limite_tokens_dia        INTEGER,
            alerta_threshold_pct     INTEGER NOT NULL DEFAULT 80,
            mensagem_abertura        TEXT,
            criado_em                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            atualizado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            deleted_at               TIMESTAMPTZ,
            CONSTRAINT ck_agentes_status CHECK (status IN ('ativo','inativo'))
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_agentes_workspace ON agentes (workspace_id) WHERE deleted_at IS NULL"
    ))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS agente_canais (
            id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            agente_id UUID NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
            canal_id  UUID NOT NULL REFERENCES canais_entrada(id) ON DELETE CASCADE,
            ativo     BOOLEAN NOT NULL DEFAULT true,
            criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_agente_canal UNIQUE (agente_id, canal_id)
        )
    """))
    # Máximo 1 agente ATIVO por canal — partial unique na linha de junção.
    # Espelha uq_crm_open_conversation_per_channel (conversa.py).
    op.execute(sa.text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_agente_canal_ativo
        ON agente_canais (canal_id) WHERE ativo = true
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS agente_prompts (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            agente_id     UUID NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
            prompt_texto  TEXT NOT NULL DEFAULT '',
            status        VARCHAR(20) NOT NULL DEFAULT 'draft',
            criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            publicado_em  TIMESTAMPTZ,
            publicado_por UUID REFERENCES users(id) ON DELETE SET NULL,
            CONSTRAINT ck_agente_prompts_status CHECK (status IN ('draft','publicado'))
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_agente_prompts_agente ON agente_prompts (agente_id, criado_em DESC)"
    ))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS agente_horarios (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            agente_id   UUID NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
            dia_semana  INTEGER NOT NULL,
            hora_inicio TIME NOT NULL,
            hora_fim    TIME NOT NULL,
            ativo       BOOLEAN NOT NULL DEFAULT true,
            CONSTRAINT ck_agente_horarios_dia CHECK (dia_semana BETWEEN 0 AND 6)
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_agente_horarios_agente ON agente_horarios (agente_id)"
    ))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS agente_habilidades (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            agente_id   UUID NOT NULL REFERENCES agentes(id) ON DELETE CASCADE,
            tipo        VARCHAR(40) NOT NULL,
            nome        VARCHAR(120) NOT NULL,
            config_json JSONB NOT NULL DEFAULT '{}',
            ativo       BOOLEAN NOT NULL DEFAULT true,
            criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_agente_habilidades_agente ON agente_habilidades (agente_id)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS agente_habilidades"))
    op.execute(sa.text("DROP TABLE IF EXISTS agente_horarios"))
    op.execute(sa.text("DROP TABLE IF EXISTS agente_prompts"))
    op.execute(sa.text("DROP TABLE IF EXISTS agente_canais"))
    op.execute(sa.text("DROP TABLE IF EXISTS agentes"))
