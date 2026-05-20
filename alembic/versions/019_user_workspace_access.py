"""user_workspace_access N:N

Revision ID: 019
Revises: 018
Create Date: 2026-05-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "019"
down_revision: Union[str, None] = "018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS user_workspace_access (
            user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            role         VARCHAR(20) NOT NULL DEFAULT 'viewer',
            ativo        BOOLEAN NOT NULL DEFAULT true,
            criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, workspace_id)
        )
    """))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_uwa_user ON user_workspace_access(user_id)"))
    op.execute(sa.text("CREATE INDEX IF NOT EXISTS idx_uwa_workspace ON user_workspace_access(workspace_id)"))

    op.execute(sa.text("""
        INSERT INTO user_workspace_access (user_id, workspace_id, role)
        SELECT id, workspace_id, 'admin'
        FROM users
        WHERE workspace_id IS NOT NULL
        ON CONFLICT DO NOTHING
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS idx_uwa_workspace"))
    op.execute(sa.text("DROP INDEX IF EXISTS idx_uwa_user"))
    op.execute(sa.text("DROP TABLE IF EXISTS user_workspace_access"))
