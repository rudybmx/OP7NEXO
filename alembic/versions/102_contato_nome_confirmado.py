"""Contato: nome_confirmado + nome_origem (nome confirmado, separado do push_name)

Abordagem ADITIVA — NÃO toca nenhum caminho de escrita de inbound (webhooks Evolution/WAHA/Meta,
enriquecimentos). Adiciona `crm_whatsapp_contatos.nome_confirmado` (nome declarado pelo cliente /
editado por humano) e `nome_origem` ('humano'|'ia'|NULL). O display e o agente passam a PREFERIR
`nome_confirmado`; o `push_name` (nome do WhatsApp, não-confiável) nunca é usado como nome pelo agente.

Backfill NÃO-destrutivo: popula `nome_confirmado` a partir do `nome` legado quando este parece um
nome real (≠ push_name, não-telefone/jid/placeholder/numérico) — preserva nomes já editados por
humanos. NÃO altera nem apaga `nome`/`push_name`.

Revision ID: 102
Revises: 101
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa

revision = "102"
down_revision = "101"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "crm_whatsapp_contatos",
        sa.Column("nome_confirmado", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "crm_whatsapp_contatos",
        sa.Column("nome_origem", sa.String(length=20), nullable=True),
    )
    # Backfill NÃO-destrutivo: nomes legados que parecem reais viram confirmados (origem humano).
    # IS DISTINCT FROM trata NULL corretamente (telefone/push_name podem ser NULL).
    op.execute(
        """
        UPDATE public.crm_whatsapp_contatos
        SET nome_confirmado = BTRIM(nome), nome_origem = 'humano'
        WHERE nome IS NOT NULL
          AND NULLIF(BTRIM(nome), '') IS NOT NULL
          AND nome IS DISTINCT FROM push_name
          AND nome IS DISTINCT FROM telefone
          AND nome IS DISTINCT FROM jid
          AND lower(BTRIM(nome)) NOT IN ('contato', 'contato whatsapp')
          AND nome NOT LIKE '%@%'
          AND nome !~ '^[0-9 ()+.-]+$'
        """
    )


def downgrade() -> None:
    op.drop_column("crm_whatsapp_contatos", "nome_origem")
    op.drop_column("crm_whatsapp_contatos", "nome_confirmado")
