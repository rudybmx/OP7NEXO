"""group_avatar_fetched_at — TTL de re-fetch de avatar de grupo

Revision ID: 089
Revises: 086
Create Date: 2026-06-24

Adiciona controle de TTL para o avatar de grupo, espelhando avatar_fetched_at
de crm_whatsapp_contatos (migration 034). Antes, o enriquecimento de grupo usava
guard por presença (group_name AND group_avatar_url): quando o provider devolvia o
nome mas não a foto, o guard nunca era satisfeito e o job re-processava a cada
mensagem para sempre (busy-loop). Com o fetched_at, re-tenta no máximo a cada 7
dias e permite re-hospedar URLs pps cruas que expiram.

Nota: encadeada em 086 (head de api/production). 087/088 estão reservados para o
pgvector adiado em outra branch — ao mergear, pode haver branching de heads off 086.
"""
from alembic import op

revision = "089"
down_revision = "086"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE public.crm_whatsapp_conversas
            ADD COLUMN IF NOT EXISTS group_avatar_fetched_at TIMESTAMPTZ;
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_conversas_group_avatar_fetched_at
            ON public.crm_whatsapp_conversas(group_avatar_fetched_at)
            WHERE group_avatar_fetched_at IS NOT NULL;
    """)


def downgrade() -> None:
    op.execute("""
        DROP INDEX IF EXISTS idx_conversas_group_avatar_fetched_at;
        ALTER TABLE public.crm_whatsapp_conversas
            DROP COLUMN IF EXISTS group_avatar_fetched_at;
    """)
