"""modelos de agente (templates com herança): agente_modelos + agentes.modelo_id/variaveis

Um MODELO é a "inteligência central" reutilizável: um prompt_template com placeholders
{{chave}} + um schema de variáveis. Um agente vinculado a um modelo HERDA o prompt do modelo
(com as variáveis dele substituídas) — melhorar o modelo propaga a todos os agentes vinculados.
Agente sem modelo_id segue usando agente_prompts (zero regressão). Boot-safe; aditivo.

Revision ID: 114
Revises: 113
Create Date: 2026-06-27
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "114"
down_revision: Union[str, None] = "113"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS agente_modelos (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            nome varchar(120) NOT NULL,
            nicho varchar(80),
            descricao text,
            prompt_template text NOT NULL DEFAULT '',
            variaveis_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
            ativo boolean NOT NULL DEFAULT true,
            deleted_at timestamptz,
            criado_em timestamptz NOT NULL DEFAULT now(),
            atualizado_em timestamptz NOT NULL DEFAULT now()
        )
    """))
    op.execute(sa.text(
        "ALTER TABLE agentes ADD COLUMN IF NOT EXISTS modelo_id uuid "
        "REFERENCES agente_modelos(id) ON DELETE SET NULL"
    ))
    op.execute(sa.text(
        "ALTER TABLE agentes ADD COLUMN IF NOT EXISTS variaveis jsonb NOT NULL DEFAULT '{}'::jsonb"
    ))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE agentes DROP COLUMN IF EXISTS variaveis"))
    op.execute(sa.text("ALTER TABLE agentes DROP COLUMN IF EXISTS modelo_id"))
    op.execute(sa.text("DROP TABLE IF EXISTS agente_modelos"))
