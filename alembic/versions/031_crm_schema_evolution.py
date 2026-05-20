"""crm_whatsapp schema evolution — soft delete, SLA, delivery status, workspace_id propagation

Revision ID: 031_crm_schema_evolution
Revises: 030_pmp_checkins_notifications
Create Date: 2026-05-15
"""
from alembic import op

revision = '031_crm_schema_evolution'
down_revision = '030_pmp_checkins_notifications'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Soft delete + deleted_at ──
    op.execute("""
        ALTER TABLE public.crm_whatsapp_contatos
            ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true,
            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

        ALTER TABLE public.crm_whatsapp_conversas
            ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true,
            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

        ALTER TABLE public.crm_whatsapp_mensagens
            ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true,
            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

        ALTER TABLE public.crm_whatsapp_equipes
            ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true,
            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

        ALTER TABLE public.crm_whatsapp_midia
            ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true,
            ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

        ALTER TABLE public.crm_whatsapp_eventos
            ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
    """)

    # ── 2. Campos de status de entrega na mensagem ──
    op.execute("""
        ALTER TABLE public.crm_whatsapp_mensagens
            ADD COLUMN IF NOT EXISTS wa_status VARCHAR(20) DEFAULT 'pending',
            ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS failed_reason TEXT;
    """)

    # ── 3. Campos de SLA na conversa ──
    op.execute("""
        ALTER TABLE public.crm_whatsapp_conversas
            ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS resolution_time INTEGER;  -- segundos
    """)

    # ── 4. workspace_id em mensagens e eventos (propagação a partir da conversa) ──
    op.execute("""
        ALTER TABLE public.crm_whatsapp_mensagens
            ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;

        UPDATE public.crm_whatsapp_mensagens m
        SET workspace_id = c.workspace_id
        FROM public.crm_whatsapp_conversas c
        WHERE m.conversa_id = c.id
          AND m.workspace_id IS NULL;
    """)

    op.execute("""
        ALTER TABLE public.crm_whatsapp_eventos
            ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;

        -- Eventos não têm FK para conversa, então workspace_id permanece NULL para registros antigos.
        -- Novos registros devem ser populados pela aplicação.
    """)

    # ── 5. mensagem_id em midia ──
    op.execute("""
        ALTER TABLE public.crm_whatsapp_midia
            ADD COLUMN IF NOT EXISTS mensagem_id UUID REFERENCES public.crm_whatsapp_mensagens(id) ON DELETE SET NULL;
    """)

    # ── 6. FKs faltantes na v2 de RBAC ──
    op.execute("""
        ALTER TABLE public.crm_whatsapp_equipe_membros
            ADD CONSTRAINT fk_equipe_membros_user
            FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
            NOT VALID;  -- NOT VALID para não travar em dados existentes; depois VALIDATE
    """)

    op.execute("""
        ALTER TABLE public.crm_whatsapp_permissoes
            ADD CONSTRAINT fk_permissoes_user
            FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
            NOT VALID;
    """)

    # ── 7. Índices de performance ──
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_mensagens_workspace ON public.crm_whatsapp_mensagens(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_eventos_workspace ON public.crm_whatsapp_eventos(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_mensagens_wa_status ON public.crm_whatsapp_mensagens(wa_status);
        CREATE INDEX IF NOT EXISTS idx_conversas_closed_at ON public.crm_whatsapp_conversas(closed_at);
    """)


def downgrade() -> None:
    op.execute("""
        DROP INDEX IF EXISTS idx_conversas_closed_at;
        DROP INDEX IF EXISTS idx_mensagens_wa_status;
        DROP INDEX IF EXISTS idx_eventos_workspace;
        DROP INDEX IF EXISTS idx_mensagens_workspace;

        ALTER TABLE public.crm_whatsapp_permissoes
            DROP CONSTRAINT IF EXISTS fk_permissoes_user;

        ALTER TABLE public.crm_whatsapp_equipe_membros
            DROP CONSTRAINT IF EXISTS fk_equipe_membros_user;

        ALTER TABLE public.crm_whatsapp_midia
            DROP COLUMN IF EXISTS mensagem_id;

        ALTER TABLE public.crm_whatsapp_eventos
            DROP COLUMN IF EXISTS workspace_id,
            DROP COLUMN IF EXISTS ativo;

        ALTER TABLE public.crm_whatsapp_mensagens
            DROP COLUMN IF EXISTS workspace_id,
            DROP COLUMN IF EXISTS failed_reason,
            DROP COLUMN IF EXISTS read_at,
            DROP COLUMN IF EXISTS delivered_at,
            DROP COLUMN IF EXISTS wa_status,
            DROP COLUMN IF EXISTS deleted_at,
            DROP COLUMN IF EXISTS ativo;

        ALTER TABLE public.crm_whatsapp_conversas
            DROP COLUMN IF EXISTS resolution_time,
            DROP COLUMN IF EXISTS closed_at,
            DROP COLUMN IF EXISTS assigned_at,
            DROP COLUMN IF EXISTS first_response_at,
            DROP COLUMN IF EXISTS deleted_at,
            DROP COLUMN IF EXISTS ativo;

        ALTER TABLE public.crm_whatsapp_equipes
            DROP COLUMN IF EXISTS deleted_at,
            DROP COLUMN IF EXISTS ativo;

        ALTER TABLE public.crm_whatsapp_contatos
            DROP COLUMN IF EXISTS deleted_at,
            DROP COLUMN IF EXISTS ativo;
    """)
