"""Lógica do agente no funil: paineis.agente_funil + comentarios.origem/autor_label

- crm_paineis.agente_funil: liga/desliga "a IA move o card no funil" por painel.
- crm_painel_comentarios.origem (usuario|ia|sistema) + autor_label: eventos de
  sistema/IA na linha do tempo (ex.: "Ana (IA) moveu para Negociação").

Revision ID: 111
Revises: 110
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa

revision = "111"
down_revision = "110"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "crm_paineis",
        sa.Column("agente_funil", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "crm_painel_comentarios",
        sa.Column("origem", sa.String(length=12), server_default="usuario", nullable=False),
    )
    op.add_column(
        "crm_painel_comentarios",
        sa.Column("autor_label", sa.String(length=120), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("crm_painel_comentarios", "autor_label")
    op.drop_column("crm_painel_comentarios", "origem")
    op.drop_column("crm_paineis", "agente_funil")
