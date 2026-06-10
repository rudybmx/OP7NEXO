"""Corrige overflow de ctr/taxa_conversao/percentual no Google Ads

As colunas eram NUMERIC(8,6) (máx 99.999999), mas o sync grava percentuais:
ctr = cliques/impressões*100 (até 100), taxa_conversao = conversões/cliques*100
(pode passar de 100). Uma keyword com 1 clique / 1 impressão = CTR 100,0%
estourava o campo (numeric field overflow) e abortava todo o sync da conta.
Amplia para NUMERIC(12,6).

Revision ID: 064
Revises: 063
Create Date: 2026-06-10
"""
from alembic import op
import sqlalchemy as sa

revision = "064"
down_revision = "063"
branch_labels = None
depends_on = None

# (tabela, coluna) com percentuais que podem ser >= 100
_COLS = [
    ("google_campanhas_insights", "ctr"),
    ("google_campanhas_insights", "taxa_conversao"),
    ("google_grupos_insights", "ctr"),
    ("google_grupos_insights", "taxa_conversao"),
    ("google_keywords_insights", "ctr"),
    ("google_anuncios_insights", "ctr"),
    ("google_publicos_insights", "ctr"),
    ("google_publicos_insights", "percentual"),
]


def upgrade() -> None:
    for tabela, coluna in _COLS:
        op.execute(sa.text(
            f"ALTER TABLE {tabela} ALTER COLUMN {coluna} TYPE NUMERIC(12,6)"
        ))


def downgrade() -> None:
    for tabela, coluna in _COLS:
        op.execute(sa.text(
            f"ALTER TABLE {tabela} ALTER COLUMN {coluna} TYPE NUMERIC(8,6)"
        ))
