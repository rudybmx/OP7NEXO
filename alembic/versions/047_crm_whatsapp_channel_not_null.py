"""crm whatsapp channel workspace not null

Revision ID: 047_crm_wa_not_null
Revises: 046_vector_view_fix
Create Date: 2026-05-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "047_crm_wa_not_null"
down_revision: Union[str, None] = "046_vector_view_fix"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_WORKSPACE_ID = "9647ad83-20c6-416a-a5f1-527aee1e48ce"
DEFAULT_CANAL_ID = "7c6a0ae5-ff34-4b1e-98f0-3f2caf5bf753"


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE public.crm_whatsapp_conversas
            SET workspace_id = :workspace_id,
                canal_id = :canal_id
            WHERE workspace_id IS NULL OR canal_id IS NULL
            """
        ).bindparams(workspace_id=DEFAULT_WORKSPACE_ID, canal_id=DEFAULT_CANAL_ID)
    )
    op.execute(
        sa.text(
            """
            UPDATE public.crm_whatsapp_mensagens
            SET workspace_id = :workspace_id,
                canal_id = :canal_id
            WHERE workspace_id IS NULL OR canal_id IS NULL
            """
        ).bindparams(workspace_id=DEFAULT_WORKSPACE_ID, canal_id=DEFAULT_CANAL_ID)
    )
    op.execute(
        sa.text(
            """
            UPDATE public.crm_whatsapp_eventos
            SET workspace_id = :workspace_id,
                canal_id = :canal_id
            WHERE workspace_id IS NULL OR canal_id IS NULL
            """
        ).bindparams(workspace_id=DEFAULT_WORKSPACE_ID, canal_id=DEFAULT_CANAL_ID)
    )

    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_conversas
            ALTER COLUMN workspace_id SET NOT NULL,
            ALTER COLUMN canal_id SET NOT NULL
    """))
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_mensagens
            ALTER COLUMN workspace_id SET NOT NULL,
            ALTER COLUMN canal_id SET NOT NULL
    """))
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_eventos
            ALTER COLUMN workspace_id SET NOT NULL,
            ALTER COLUMN canal_id SET NOT NULL
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_eventos
            ALTER COLUMN canal_id DROP NOT NULL,
            ALTER COLUMN workspace_id DROP NOT NULL
    """))
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_mensagens
            ALTER COLUMN canal_id DROP NOT NULL,
            ALTER COLUMN workspace_id DROP NOT NULL
    """))
    op.execute(sa.text("""
        ALTER TABLE public.crm_whatsapp_conversas
            ALTER COLUMN canal_id DROP NOT NULL,
            ALTER COLUMN workspace_id DROP NOT NULL
    """))
