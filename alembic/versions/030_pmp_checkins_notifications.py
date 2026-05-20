"""pmp_task_checkins e pmp_notifications: pulso semanal e notificações

Revision ID: 030_pmp_checkins_notifications
Revises: 029_pmp_tasks
Create Date: 2026-05-15
"""
from alembic import op

revision = '030_pmp_checkins_notifications'
down_revision = '029_pmp_tasks'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS public.pmp_task_checkins (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
            task_id      UUID NOT NULL REFERENCES public.pmp_tasks(id) ON DELETE CASCADE,
            user_id      UUID REFERENCES public.users(id),
            response     VARCHAR(20) NOT NULL
                         CHECK (response IN ('ON_TRACK','NEEDS_ATTENTION','BLOCKED')),
            note         TEXT,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX idx_pmp_checkins_task ON public.pmp_task_checkins(task_id);

        CREATE TABLE IF NOT EXISTS public.pmp_notifications (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
            task_id      UUID NOT NULL REFERENCES public.pmp_tasks(id) ON DELETE CASCADE,
            user_id      UUID NOT NULL REFERENCES public.users(id),
            type         VARCHAR(30) NOT NULL
                         CHECK (type IN ('REMINDER_D3','REMINDER_D1','REMINDER_D0','OVERDUE','WEEKLY_PULSE','PULSE_IGNORED')),
            sent_at      TIMESTAMPTZ,
            read_at      TIMESTAMPTZ,
            channel      VARCHAR(20) NOT NULL DEFAULT 'IN_APP'
                         CHECK (channel IN ('IN_APP','EMAIL','WHATSAPP')),
            payload      JSONB
        );

        CREATE INDEX idx_pmp_notifications_user ON public.pmp_notifications(user_id, read_at);
        CREATE INDEX idx_pmp_notifications_task ON public.pmp_notifications(task_id);
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE IF EXISTS public.pmp_notifications CASCADE;
        DROP TABLE IF EXISTS public.pmp_task_checkins CASCADE;
    """)
