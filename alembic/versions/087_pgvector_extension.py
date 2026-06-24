"""CREATE EXTENSION vector (pgvector) — pré-requisito da Fase 3 (RAG)

Revision ID: 087
Revises: 086
Create Date: 2026-06-24

GATE: requer pgvector disponível no servidor. Em produção o container `postgres`
deve usar a imagem `pgvector/pgvector:pg16` (a `postgres:16-alpine` NÃO traz o vector
e não tem apt). Esta migration FALHA de propósito se a extensão não estiver disponível
— é o sinal de que a troca de imagem ainda não foi feita.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "087"
down_revision: Union[str, None] = "086"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS vector"))


def downgrade() -> None:
    # Não dropamos a extensão no downgrade (outras tabelas podem depender dela).
    pass
