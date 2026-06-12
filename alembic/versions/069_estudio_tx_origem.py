"""Origem do lançamento na carteira (concedido vs comprado) — base p/ remover/transferir

Adiciona `origem` em estudio_token_transacoes e backfilla os lançamentos
existentes por motivo/tipo, para o admin distinguir tokens CONCEDIDOS (grátis,
removíveis) de COMPRADOS (Stripe/recarga paga, só transferíveis). Aditivo e
nullable — não altera saldos.

Revision ID: 069
Revises: 068
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa

revision = "069"
down_revision = "068"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "estudio_token_transacoes",
        sa.Column("origem", sa.String(length=16), nullable=True),
    )
    # Backfill por motivo/tipo (consumo grátis-primeiro fica implícito no cálculo).
    op.execute(sa.text(
        "UPDATE estudio_token_transacoes SET origem = 'comprado' "
        "WHERE tipo = 'credito' AND ("
        "  motivo = 'Recarga via Stripe' "
        "  OR (motivo = 'Recarga de saldo' AND status = 'confirmado'))"
    ))
    op.execute(sa.text(
        "UPDATE estudio_token_transacoes SET origem = 'consumo' "
        "WHERE tipo = 'debito' AND motivo = 'Geração de criativo'"
    ))
    op.execute(sa.text(
        "UPDATE estudio_token_transacoes SET origem = 'concedido' "
        "WHERE tipo = 'credito' AND origem IS NULL"
    ))


def downgrade() -> None:
    op.drop_column("estudio_token_transacoes", "origem")
