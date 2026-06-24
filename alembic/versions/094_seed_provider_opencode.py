"""seed provider opencode (openai-compatible — plano Go)

opencode (opencode.ai Zen) é um gateway de modelos OpenAI-compatible. Adiciona como
provider para a Central de Agentes. base_url do plano Go = https://opencode.ai/zen/go/v1
(ajustável via PUT /llm-providers/{id} se necessário). Sem modelos fixos — usar o botão
"Carregar modelos" (GET {base_url}/models com o token salvo). Idempotente.

Revision ID: 094
Revises: 093
Create Date: 2026-06-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision = "094"
down_revision = "093"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        INSERT INTO llm_providers (nome, base_url, tipo, descricao)
        VALUES ('opencode', 'https://opencode.ai/zen/go/v1', 'openai_compatible',
                'opencode Zen — plano Go (openai-compatible)')
        ON CONFLICT (nome) DO NOTHING
    """))


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM llm_providers WHERE nome = 'opencode'"))
