"""canonize whatsapp waha conversations by remote_jid

Revision ID: 050_canonizar_conversas_waha
Revises: 049_fix_contato_nome_fmt
Create Date: 2026-06-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "050_canonizar_conversas_waha"
down_revision: Union[str, None] = "049_fix_contato_nome_fmt"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS public.uq_crm_open_conversation_per_channel"))
    op.execute(sa.text("""
        DO $$
        DECLARE
            grp record;
            canonical_id uuid;
            old_ids uuid[];
            unread_total integer;
        BEGIN
            FOR grp IN
                SELECT workspace_id, canal_id, remote_jid
                FROM public.crm_whatsapp_conversas
                WHERE ativo = true
                  AND status <> 'resolvido'
                GROUP BY workspace_id, canal_id, remote_jid
                HAVING COUNT(*) > 1
            LOOP
                SELECT c.id
                INTO canonical_id
                FROM public.crm_whatsapp_conversas c
                WHERE c.workspace_id = grp.workspace_id
                  AND c.canal_id = grp.canal_id
                  AND c.remote_jid = grp.remote_jid
                  AND c.ativo = true
                  AND c.status <> 'resolvido'
                ORDER BY c.ultima_msg_at DESC NULLS LAST,
                         c.updated_at DESC NULLS LAST,
                         c.created_at DESC NULLS LAST,
                         c.id DESC
                LIMIT 1;

                SELECT ARRAY_AGG(id), COALESCE(SUM(nao_lidas), 0)
                INTO old_ids, unread_total
                FROM public.crm_whatsapp_conversas
                WHERE workspace_id = grp.workspace_id
                  AND canal_id = grp.canal_id
                  AND remote_jid = grp.remote_jid
                  AND ativo = true
                  AND status <> 'resolvido'
                  AND id <> canonical_id;

                IF old_ids IS NULL OR array_length(old_ids, 1) IS NULL THEN
                    CONTINUE;
                END IF;

                UPDATE public.crm_whatsapp_mensagens
                SET conversa_id = canonical_id
                WHERE conversa_id = ANY(old_ids);

                UPDATE public.crm_whatsapp_midia
                SET conversa_id = canonical_id
                WHERE conversa_id = ANY(old_ids);

                UPDATE public.crm_whatsapp_memorias_ia
                SET conversa_id = canonical_id
                WHERE conversa_id = ANY(old_ids);

                UPDATE public.crm_conversation_assignments
                SET conversa_id = canonical_id
                WHERE conversa_id = ANY(old_ids);

                UPDATE public.crm_followups
                SET conversa_id = canonical_id
                WHERE conversa_id = ANY(old_ids);

                UPDATE public.crm_lead_origin_events
                SET conversa_id = canonical_id
                WHERE conversa_id = ANY(old_ids);

                UPDATE public.crm_whatsapp_conversas
                SET nao_lidas = 0,
                    status = 'resolvido',
                    closed_at = COALESCE(closed_at, NOW()),
                    ativo = false,
                    deleted_at = NOW(),
                    updated_at = NOW()
                WHERE id = ANY(old_ids);

                UPDATE public.crm_whatsapp_conversas
                SET nao_lidas = nao_lidas + COALESCE(unread_total, 0),
                    ativo = true,
                    deleted_at = NULL,
                    updated_at = NOW()
                WHERE id = canonical_id;
            END LOOP;
        END $$;
    """))
    op.execute(sa.text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_open_conversation_per_channel
        ON public.crm_whatsapp_conversas(workspace_id, canal_id, remote_jid)
        WHERE ativo = true AND status <> 'resolvido'
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS public.uq_crm_open_conversation_per_channel"))
    op.execute(sa.text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_open_conversation_per_channel
        ON public.crm_whatsapp_conversas(workspace_id, canal_id, instance, remote_jid)
        WHERE ativo = true AND status <> 'resolvido'
    """))
