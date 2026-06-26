"""plantão: agentes.horario_modo (responder dentro/fora das janelas de horário)

`horario_modo` controla como as janelas de `agente_horarios` são interpretadas:
- 'dentro' (padrão): o agente responde DENTRO das janelas (comportamento atual).
- 'fora' (plantão): o agente responde FORA das janelas — cobre noites + fins de semana
  automaticamente (o usuário cadastra só o horário comercial e marca "responder fora").
Sem janelas configuradas = 24/7 em ambos os modos. Boot-safe (ADD COLUMN IF NOT EXISTS).

Revision ID: 104
Revises: 103
Create Date: 2026-06-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "104"
down_revision: Union[str, None] = "103"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE agentes ADD COLUMN IF NOT EXISTS horario_modo VARCHAR(10) "
        "NOT NULL DEFAULT 'dentro'"
    ))
    op.execute(sa.text("ALTER TABLE agentes DROP CONSTRAINT IF EXISTS ck_agente_horario_modo"))
    op.execute(sa.text(
        "ALTER TABLE agentes ADD CONSTRAINT ck_agente_horario_modo "
        "CHECK (horario_modo IN ('dentro','fora'))"
    ))


def downgrade() -> None:
    op.execute(sa.text("ALTER TABLE agentes DROP CONSTRAINT IF EXISTS ck_agente_horario_modo"))
    op.execute(sa.text("ALTER TABLE agentes DROP COLUMN IF EXISTS horario_modo"))
