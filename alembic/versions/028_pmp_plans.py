"""pmp_plans: tabela de planos de marketing personalizado

Revision ID: 028_pmp_plans
Revises: 027_contatos_ws_unique
Create Date: 2026-05-15
"""
from alembic import op

revision = '028_pmp_plans'
down_revision = '027_contatos_ws_unique'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.pmp_plans (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id    UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
            client_name     VARCHAR(255) NOT NULL,
            title           VARCHAR(255) NOT NULL,
            version         VARCHAR(20) NOT NULL DEFAULT '1.0',
            start_date      DATE NOT NULL,
            end_date        DATE NOT NULL,
            status          VARCHAR(20) NOT NULL DEFAULT 'TODO'
                            CHECK (status IN ('TODO','IN_PROGRESS','DONE','BLOCKED')),
            insights_cache      JSONB,
            insights_updated_at TIMESTAMPTZ,
            created_by      UUID REFERENCES public.users(id),
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX idx_pmp_plans_workspace ON public.pmp_plans(workspace_id);
        CREATE INDEX idx_pmp_plans_status ON public.pmp_plans(status);
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE IF EXISTS public.pmp_plans CASCADE;
    """)
