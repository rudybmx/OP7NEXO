"""meta_tokens: remove workspace FK (tokens are admin-global)

Revision ID: 017
Revises: 016
Create Date: 2026-05-12
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "017"
down_revision: Union[str, None] = "016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE meta_tokens DROP CONSTRAINT IF EXISTS meta_tokens_workspace_id_fkey"
    ))
    op.execute(sa.text(
        "DROP INDEX IF EXISTS ix_meta_tokens_workspace_id"
    ))
    op.execute(sa.text(
        "ALTER TABLE meta_tokens ALTER COLUMN workspace_id DROP NOT NULL"
    ))


def downgrade() -> None:
    op.execute(sa.text(
        "DELETE FROM meta_tokens WHERE workspace_id IS NULL"
    ))
    op.execute(sa.text(
        "ALTER TABLE meta_tokens ALTER COLUMN workspace_id SET NOT NULL"
    ))
    op.execute(sa.text("""
        ALTER TABLE meta_tokens
            ADD CONSTRAINT meta_tokens_workspace_id_fkey
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    """))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_meta_tokens_workspace_id ON meta_tokens (workspace_id)"
    ))
