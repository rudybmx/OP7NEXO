"""pmp_unidades + ativo em pmp_plans + prioridade em pmp_tasks

Revision ID: 061
Revises: 060
Create Date: 2026-06-08
"""
from alembic import op

revision = "061"
down_revision = "060"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        -- 1. Tabela de unidades do PMP
        CREATE TABLE IF NOT EXISTS public.pmp_unidades (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
            nome         VARCHAR(255) NOT NULL,
            ativo        BOOLEAN NOT NULL DEFAULT true,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX idx_pmp_unidades_workspace ON public.pmp_unidades(workspace_id);

        -- 2. Soft-delete em pmp_plans
        ALTER TABLE public.pmp_plans
            ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
        CREATE INDEX IF NOT EXISTS idx_pmp_plans_ativo ON public.pmp_plans(ativo);

        -- 3. Vínculo plano → unidade (nullable)
        ALTER TABLE public.pmp_plans
            ADD COLUMN IF NOT EXISTS unidade_id UUID NULL
            REFERENCES public.pmp_unidades(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_pmp_plans_unidade ON public.pmp_plans(unidade_id);

        -- 4. Prioridade em pmp_tasks
        ALTER TABLE public.pmp_tasks
            ADD COLUMN IF NOT EXISTS prioridade VARCHAR(20) NOT NULL DEFAULT 'media'
            CHECK (prioridade IN ('baixa','media','alta'));
    """)


def downgrade() -> None:
    op.execute("""
        -- reverter na ordem correta (FK antes de tabela referenciada)
        ALTER TABLE public.pmp_plans DROP COLUMN IF EXISTS unidade_id;
        ALTER TABLE public.pmp_plans DROP COLUMN IF EXISTS ativo;
        ALTER TABLE public.pmp_tasks DROP COLUMN IF EXISTS prioridade;
        DROP TABLE IF EXISTS public.pmp_unidades CASCADE;
    """)
