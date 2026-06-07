"""Cria tabelas crm_etiquetas e crm_conversa_etiquetas

Revision ID: 057
Revises: 056
Create Date: 2026-06-07
"""
from alembic import op
import sqlalchemy as sa

revision = "057"
down_revision = "056"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crm_etiquetas",
        sa.Column("id", sa.UUID(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("nome", sa.String(80), nullable=False),
        sa.Column("cor", sa.String(7), nullable=False, server_default="#25D366"),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("workspace_id", "nome", name="uq_etiqueta_workspace_nome"),
    )

    op.create_table(
        "crm_conversa_etiquetas",
        sa.Column("conversa_id", sa.UUID(), nullable=False),
        sa.Column("etiqueta_id", sa.UUID(), nullable=False),
        sa.PrimaryKeyConstraint("conversa_id", "etiqueta_id"),
        sa.ForeignKeyConstraint(
            ["conversa_id"], ["crm_whatsapp_conversas.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["etiqueta_id"], ["crm_etiquetas.id"], ondelete="CASCADE"
        ),
    )


def downgrade() -> None:
    op.drop_table("crm_conversa_etiquetas")
    op.drop_table("crm_etiquetas")
