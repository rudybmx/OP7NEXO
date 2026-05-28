"""fix whatsapp vector documents view filters

Revision ID: 046_vector_view_fix
Revises: 045_whatsapp_vector_documents
Create Date: 2026-05-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "046_vector_view_fix"
down_revision: Union[str, None] = "045_whatsapp_vector_documents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text("""
        CREATE OR REPLACE VIEW public.vw_crm_whatsapp_vector_documents AS
        WITH raw_message_documents AS (
            SELECT
                COALESCE(m.workspace_id, c.workspace_id, ct.workspace_id) AS workspace_id,
                COALESCE(m.canal_id, c.canal_id) AS canal_id,
                m.conversa_id,
                COALESCE(m.contato_id, c.contato_id) AS contato_id,
                m.id AS mensagem_id,
                'message'::text AS document_type,
                COALESCE(m.recebida_em, m.enviada_em, m.created_at) AS occurred_at,
                CASE
                    WHEN lower(btrim(COALESCE(m.conteudo, ''))) IN ('[mídia]', '[midia]', '[media]')
                        THEN media.caption
                    ELSE COALESCE(NULLIF(m.conteudo, ''), media.caption)
                END AS raw_text,
                jsonb_build_object(
                    'direcao', m.direcao,
                    'from_me', m.from_me,
                    'message_type', m.message_type,
                    'wa_status', m.wa_status,
                    'provider_status', m.wa_status,
                    'remetente_tipo', m.remetente_tipo,
                    'remetente_nome', m.remetente_nome,
                    'is_group', c.is_group,
                    'group_name', c.group_name,
                    'participant_jid', m.participant_jid,
                    'participant_name', m.participant_name,
                    'is_mentioned', m.is_mentioned,
                    'lead_status', COALESCE(c.lead_status, ct.lead_status),
                    'origem', ct.origem,
                    'campanha', COALESCE(c.campanha, ct.campanha_origem, ct.utm_campaign),
                    'utm_source', ct.utm_source,
                    'utm_medium', ct.utm_medium,
                    'utm_campaign', ct.utm_campaign,
                    'meta_ad_id', ct.meta_ad_id,
                    'media', media.metadata
                ) AS metadata_json,
                COALESCE(m.embedding_status, 'pendente') AS embedding_status,
                m.id AS source_id,
                COALESCE(m.updated_at, m.created_at) AS source_updated_at,
                media.caption AS media_caption
            FROM public.crm_whatsapp_mensagens m
            JOIN public.crm_whatsapp_conversas c ON c.id = m.conversa_id
            LEFT JOIN public.crm_whatsapp_contatos ct ON ct.id = COALESCE(m.contato_id, c.contato_id)
            LEFT JOIN LATERAL (
                SELECT
                    max(NULLIF(md.caption, '')) AS caption,
                    jsonb_agg(jsonb_build_object(
                        'id', md.id,
                        'tipo', md.tipo,
                        'mimetype', md.mimetype,
                        'filename', md.filename,
                        'storage_status', md.storage_status,
                        'duration_seconds', md.duration_seconds,
                        'width', md.width,
                        'height', md.height
                    ) ORDER BY md.created_at) AS metadata
                FROM public.crm_whatsapp_midia md
                WHERE md.mensagem_id = m.id
                  AND md.ativo = true
                  AND md.deleted_at IS NULL
            ) media ON true
            WHERE m.ativo = true
              AND m.deleted_at IS NULL
              AND c.ativo = true
              AND c.deleted_at IS NULL
        ),
        message_documents AS (
            SELECT
                workspace_id,
                canal_id,
                conversa_id,
                contato_id,
                mensagem_id,
                document_type,
                occurred_at,
                btrim(regexp_replace(raw_text, '\\s+', ' ', 'g')) AS content_text,
                metadata_json,
                embedding_status,
                md5(concat_ws('|',
                    'message',
                    source_id::text,
                    source_updated_at::text,
                    COALESCE(raw_text, ''),
                    COALESCE(media_caption, '')
                )) AS source_hash
            FROM raw_message_documents
            WHERE workspace_id IS NOT NULL
              AND btrim(regexp_replace(COALESCE(raw_text, ''), '\\s+', ' ', 'g')) <> ''
        ),
        raw_summary_documents AS (
            SELECT
                COALESCE(c.workspace_id, ct.workspace_id) AS workspace_id,
                c.canal_id,
                c.id AS conversa_id,
                c.contato_id,
                NULL::uuid AS mensagem_id,
                'conversation_summary'::text AS document_type,
                COALESCE(c.closed_at, c.updated_at, c.created_at) AS occurred_at,
                c.resumo_ia AS raw_text,
                jsonb_build_object(
                    'status', c.status,
                    'lead_status', c.lead_status,
                    'etapa_funil', c.etapa_funil,
                    'prioridade', c.prioridade,
                    'is_group', c.is_group,
                    'group_name', c.group_name,
                    'remote_jid', c.remote_jid,
                    'campanha', COALESCE(c.campanha, ct.campanha_origem, ct.utm_campaign),
                    'origem', ct.origem,
                    'utm_source', ct.utm_source,
                    'utm_medium', ct.utm_medium,
                    'utm_campaign', ct.utm_campaign,
                    'meta_ad_id', ct.meta_ad_id
                ) AS metadata_json,
                COALESCE(c.contexto_ia->>'embedding_status', 'pendente') AS embedding_status,
                c.id AS source_id,
                COALESCE(c.updated_at, c.created_at) AS source_updated_at
            FROM public.crm_whatsapp_conversas c
            LEFT JOIN public.crm_whatsapp_contatos ct ON ct.id = c.contato_id
            WHERE c.ativo = true
              AND c.deleted_at IS NULL
        ),
        summary_documents AS (
            SELECT
                workspace_id,
                canal_id,
                conversa_id,
                contato_id,
                mensagem_id,
                document_type,
                occurred_at,
                btrim(regexp_replace(raw_text, '\\s+', ' ', 'g')) AS content_text,
                metadata_json,
                embedding_status,
                md5(concat_ws('|',
                    'conversation_summary',
                    source_id::text,
                    source_updated_at::text,
                    COALESCE(raw_text, '')
                )) AS source_hash
            FROM raw_summary_documents
            WHERE workspace_id IS NOT NULL
              AND btrim(regexp_replace(COALESCE(raw_text, ''), '\\s+', ' ', 'g')) <> ''
        )
        SELECT
            workspace_id,
            canal_id,
            conversa_id,
            contato_id,
            mensagem_id,
            document_type,
            occurred_at,
            content_text,
            metadata_json,
            embedding_status,
            source_hash
        FROM message_documents
        UNION ALL
        SELECT
            workspace_id,
            canal_id,
            conversa_id,
            contato_id,
            mensagem_id,
            document_type,
            occurred_at,
            content_text,
            metadata_json,
            embedding_status,
            source_hash
        FROM summary_documents
    """))


def downgrade() -> None:
    op.execute(sa.text("DROP VIEW IF EXISTS public.vw_crm_whatsapp_vector_documents"))
