"""workspaces: telefone_principal + telefone_responsavel (contato WhatsApp)

Revision ID: 072
Revises: 071
Create Date: 2026-06-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "072"
down_revision: Union[str, None] = "071"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS telefone_principal   VARCHAR(20);
        ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS telefone_responsavel VARCHAR(20);
    """))


def downgrade() -> None:
    op.execute(sa.text("""
        ALTER TABLE workspaces DROP COLUMN IF EXISTS telefone_responsavel;
        ALTER TABLE workspaces DROP COLUMN IF EXISTS telefone_principal;
    """))
