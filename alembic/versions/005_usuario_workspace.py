"""workspace_id em users + network_id em workspaces

Revision ID: 005
Revises: 004
Create Date: 2026-05-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS workspace_id UUID
          REFERENCES workspaces(id) ON DELETE SET NULL
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_users_workspace_id ON users(workspace_id)"
    ))
    op.execute(sa.text("""
        ALTER TABLE workspaces
          ADD COLUMN IF NOT EXISTS network_id UUID
          REFERENCES networks(id) ON DELETE SET NULL
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_workspaces_network_id ON workspaces(network_id)"
    ))
    op.execute(sa.text("""
        UPDATE users u
        SET workspace_id = ura.resource_id
        FROM user_resource_access ura
        WHERE ura.user_id = u.id
          AND ura.resource_type = 'workspace'
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_workspaces_network_id"))
    op.execute(sa.text("ALTER TABLE workspaces DROP COLUMN IF EXISTS network_id"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_users_workspace_id"))
    op.execute(sa.text("ALTER TABLE users DROP COLUMN IF EXISTS workspace_id"))
