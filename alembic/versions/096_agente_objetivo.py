"""agentes.objetivo — objetivo do agente (guia a análise de interesse do lead)

Campo de texto livre no cadastro do agente (ex.: "agendar consulta"). Usado pela
análise de conversa (agent_service.analisar_conversa) para captar o "interesse" do lead
em relação ao objetivo. Boot-safe (ADD COLUMN IF NOT EXISTS).

Revision ID: 096
Revises: 095
Create Date: 2026-06-25
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "096"
down_revision: Union[str, None] = "095"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TABLE agentes ADD COLUMN IF NOT EXISTS objetivo TEXT"))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE agentes DROP COLUMN IF EXISTS objetivo"))
