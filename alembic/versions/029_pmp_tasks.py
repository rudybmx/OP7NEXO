"""pmp_tasks: tarefas do plano de marketing personalizado

Revision ID: 029_pmp_tasks
Revises: 028_pmp_plans
Create Date: 2026-05-15
"""
from alembic import op

revision = '029_pmp_tasks'
down_revision = '028_pmp_plans'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.pmp_tasks (
            id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id      UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
            plan_id           UUID NOT NULL REFERENCES public.pmp_plans(id) ON DELETE CASCADE,
            phase             VARCHAR(50) NOT NULL
                              CHECK (phase IN ('diagnostico','identidade','conteudo','midia-paga','analise')),
            title             VARCHAR(255) NOT NULL,
            description       TEXT,
            responsible_id    UUID REFERENCES public.users(id),
            responsible_email VARCHAR(255),
            category          VARCHAR(50) NOT NULL
                              CHECK (category IN ('MIDIA_PAGA','CONTEUDO','SEO','EVENTO','REUNIAO','EMAIL_MARKETING','SOCIAL','OUTRO')),
            status            VARCHAR(20) NOT NULL DEFAULT 'TODO'
                              CHECK (status IN ('TODO','IN_PROGRESS','DONE','BLOCKED')),
            start_date        DATE NOT NULL,
            end_date          DATE NOT NULL,
            completed_at      TIMESTAMPTZ,
            blocked_reason    TEXT,
            display_order     INT NOT NULL DEFAULT 0,
            ativo             BOOLEAN NOT NULL DEFAULT true,
            created_by        UUID REFERENCES public.users(id),
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT chk_pmp_tasks_dates CHECK (start_date <= end_date),
            CONSTRAINT chk_pmp_tasks_done CHECK (
                status != 'DONE' OR completed_at IS NOT NULL
            ),
            CONSTRAINT chk_pmp_tasks_blocked CHECK (
                status != 'BLOCKED' OR (blocked_reason IS NOT NULL AND blocked_reason != '')
            )
        );

        CREATE INDEX idx_pmp_tasks_plan ON public.pmp_tasks(plan_id);
        CREATE INDEX idx_pmp_tasks_workspace ON public.pmp_tasks(workspace_id);
        CREATE INDEX idx_pmp_tasks_status ON public.pmp_tasks(status);
        CREATE INDEX idx_pmp_tasks_end_date ON public.pmp_tasks(end_date);
        CREATE INDEX idx_pmp_tasks_responsible ON public.pmp_tasks(responsible_id);
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE IF EXISTS public.pmp_tasks CASCADE;
    """)
