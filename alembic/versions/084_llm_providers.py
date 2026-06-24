"""llm_providers + llm_provider_tokens + llm_provider_modelos (Central de Agentes, Fase 1)

Revision ID: 084
Revises: 083
Create Date: 2026-06-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "084"
down_revision: Union[str, None] = "083"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS llm_providers (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            nome          VARCHAR(80) NOT NULL,
            base_url      VARCHAR(255) NOT NULL,
            tipo          VARCHAR(30) NOT NULL DEFAULT 'openai_compatible',
            ativo         BOOLEAN NOT NULL DEFAULT true,
            descricao     TEXT,
            criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_llm_providers_nome UNIQUE (nome),
            CONSTRAINT ck_llm_providers_tipo CHECK (tipo IN ('openai_compatible','anthropic_native'))
        )
    """))

    # Um token global por provider (escopo plataforma). token_encrypted = Fernet;
    # token_mask = 6+4 do token original (a API só devolve a máscara).
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS llm_provider_tokens (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            provider_id     UUID NOT NULL REFERENCES llm_providers(id) ON DELETE CASCADE,
            token_encrypted TEXT NOT NULL,
            token_mask      VARCHAR(40) NOT NULL DEFAULT '',
            ativo           BOOLEAN NOT NULL DEFAULT true,
            criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_llm_provider_tokens_provider UNIQUE (provider_id)
        )
    """))

    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS llm_provider_modelos (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            provider_id   UUID NOT NULL REFERENCES llm_providers(id) ON DELETE CASCADE,
            nome_modelo   VARCHAR(120) NOT NULL,
            label_display VARCHAR(120),
            ativo         BOOLEAN NOT NULL DEFAULT true,
            criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_llm_provider_modelos UNIQUE (provider_id, nome_modelo)
        )
    """))

    # Seed dos providers padrão (todos openai_compatible). Tokens vazios — cadastrar
    # via admin (POST /llm-providers/{id}/token). base_url editável depois.
    op.execute(sa.text("""
        INSERT INTO llm_providers (nome, base_url, tipo, descricao)
        VALUES
            ('OpenAI',     'https://api.openai.com/v1',    'openai_compatible', 'OpenAI (GPT-4o, embeddings)'),
            ('OpenRouter', 'https://openrouter.ai/api/v1', 'openai_compatible', 'Gateway multi-modelo'),
            ('DeepSeek',   'https://api.deepseek.com/v1',  'openai_compatible', 'DeepSeek (chat, R1)')
        ON CONFLICT (nome) DO NOTHING
    """))

    # Seed de modelos por provider (OpenRouter fica sem modelos fixos — campo livre no admin).
    op.execute(sa.text("""
        INSERT INTO llm_provider_modelos (provider_id, nome_modelo, label_display)
        SELECT p.id, m.nome_modelo, m.label_display
        FROM llm_providers p
        JOIN (VALUES
            ('OpenAI',   'gpt-4o',        'GPT-4o'),
            ('OpenAI',   'gpt-4o-mini',   'GPT-4o mini'),
            ('OpenAI',   'gpt-4.1',       'GPT-4.1'),
            ('DeepSeek', 'deepseek-chat', 'DeepSeek Chat'),
            ('DeepSeek', 'deepseek-r1',   'DeepSeek R1')
        ) AS m(provider_nome, nome_modelo, label_display) ON m.provider_nome = p.nome
        ON CONFLICT (provider_id, nome_modelo) DO NOTHING
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS llm_provider_modelos"))
    op.execute(sa.text("DROP TABLE IF EXISTS llm_provider_tokens"))
    op.execute(sa.text("DROP TABLE IF EXISTS llm_providers"))
