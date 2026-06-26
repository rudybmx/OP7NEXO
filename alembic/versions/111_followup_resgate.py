"""followup resgate: agentes.resgate_* + crm_followup_resgates

Config de resgate por agente (resgate_modo desligado|rascunho|automatico + max_tentativas +
intervalo_horas + hora_inicio/fim p/ quiet hours) e tabela crm_followup_resgates (1 linha por
tentativa de resgate; UNIQUE(conversa_id, tentativa) reserva o slot ANTES do envio = anti-
double-send a cliente real). Boot-safe (IF NOT EXISTS).

Revision ID: 111
Revises: 110
Create Date: 2026-06-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "111"
down_revision: Union[str, None] = "110"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("ALTER TABLE agentes ADD COLUMN IF NOT EXISTS resgate_modo VARCHAR(20) NOT NULL DEFAULT 'desligado'"))
    op.execute(sa.text("ALTER TABLE agentes ADD COLUMN IF NOT EXISTS resgate_max_tentativas INTEGER NOT NULL DEFAULT 3"))
    op.execute(sa.text("ALTER TABLE agentes ADD COLUMN IF NOT EXISTS resgate_intervalo_horas INTEGER NOT NULL DEFAULT 24"))
    op.execute(sa.text("ALTER TABLE agentes ADD COLUMN IF NOT EXISTS resgate_hora_inicio SMALLINT NOT NULL DEFAULT 8"))
    op.execute(sa.text("ALTER TABLE agentes ADD COLUMN IF NOT EXISTS resgate_hora_fim SMALLINT NOT NULL DEFAULT 20"))
    op.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS crm_followup_resgates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            conversa_id UUID NOT NULL REFERENCES crm_whatsapp_conversas(id) ON DELETE CASCADE,
            contato_id UUID REFERENCES crm_whatsapp_contatos(id) ON DELETE SET NULL,
            agente_id UUID REFERENCES agentes(id) ON DELETE SET NULL,
            canal_id UUID REFERENCES canais_entrada(id) ON DELETE SET NULL,
            tentativa INTEGER NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'pendente',
            mensagem TEXT,
            score DOUBLE PRECISION,
            agendado_para TIMESTAMPTZ,
            enviado_em TIMESTAMPTZ,
            erro TEXT,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """))
    op.execute(sa.text(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_followup_resgate_conversa_tentativa "
        "ON crm_followup_resgates(conversa_id, tentativa)"
    ))
    op.execute(sa.text(
        "CREATE INDEX IF NOT EXISTS ix_followup_resgate_ws_status "
        "ON crm_followup_resgates(workspace_id, status)"
    ))


def downgrade() -> None:
    op.execute(sa.text("DROP TABLE IF EXISTS crm_followup_resgates"))
    for col in (
        "resgate_hora_fim", "resgate_hora_inicio", "resgate_intervalo_horas",
        "resgate_max_tentativas", "resgate_modo",
    ):
        op.execute(sa.text(f"ALTER TABLE agentes DROP COLUMN IF EXISTS {col}"))
