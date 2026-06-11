"""Idempotência de crédito: referência única por crédito (anti double-credit)

Garante que um mesmo `referencia` (ex.: session_id da Stripe) não gere 2 créditos
— blindagem contra confirm-on-return + webhook creditando a mesma sessão (= dinheiro
grátis). Índice parcial: só créditos com referência não-nula.

Revision ID: 068
Revises: 067
Create Date: 2026-06-11
"""
from alembic import op
import sqlalchemy as sa

revision = "068"
down_revision = "067"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_estudio_tx_referencia_credito "
        "ON estudio_token_transacoes (referencia) "
        "WHERE tipo = 'credito' AND referencia IS NOT NULL"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS uq_estudio_tx_referencia_credito"))
