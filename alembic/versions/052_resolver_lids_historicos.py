"""resolver @lid históricos no banco — mapear via WAHA API e consolidar

Revision ID: 052_resolver_lids_historicos
Revises: 051_meta_sync_state_incremental
Create Date: 2026-06-05
"""
import logging
import os
import time
from typing import Sequence, Union

import httpx
import sqlalchemy as sa
from alembic import op

revision: str = "052_resolver_lids_historicos"
down_revision: Union[str, None] = "051_meta_sync_state_incremental"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger(__name__)


def _collect_lids(conn) -> list[dict]:
    """Coleta LIDs distintos com sua sessão WAHA a partir de conversas e contatos."""
    result = conn.execute(sa.text("""
        SELECT DISTINCT
          split_part(cv.remote_jid, '@', 1) AS lid_number,
          ce.config->'waha'->>'session' AS session
        FROM crm_whatsapp_conversas cv
        JOIN canais_entrada ce ON ce.id = cv.canal_id
        WHERE cv.remote_jid LIKE '%@lid'
          AND ce.config->'waha'->>'session' IS NOT NULL
        UNION
        SELECT DISTINCT
          split_part(ct.jid, '@', 1) AS lid_number,
          ce.config->'waha'->>'session' AS session
        FROM crm_whatsapp_contatos ct
        JOIN canais_entrada ce
          ON ce.workspace_id = ct.workspace_id
         AND ce.tipo = 'whatsapp_waha'
        WHERE ct.jid LIKE '%@lid'
          AND ce.config->'waha'->>'session' IS NOT NULL
    """))
    rows = result.fetchall()
    return [{"lid_number": r[0], "session": r[1]} for r in rows if r[0] and r[1]]


def _resolve_lids(lids: list[dict]) -> dict[str, str]:
    """
    Resolve cada LID via WAHA API.
    Retorna dict: lid_number -> pn_digits (sem @c.us)
    """
    waha_base = os.environ.get("WAHA_BASE_URL", "").rstrip("/")
    waha_key = os.environ.get("WAHA_API_KEY", "")

    if not waha_base or not waha_key:
        logger.warning("[052] WAHA_BASE_URL ou WAHA_API_KEY não configurados — pulando resolução")
        return {}

    # Deduplica por (lid_number, session)
    seen: set[tuple] = set()
    unique: list[dict] = []
    for item in lids:
        key = (item["lid_number"], item["session"])
        if key not in seen:
            seen.add(key)
            unique.append(item)

    resolved: dict[str, str] = {}
    n_total = len(unique)

    with httpx.Client(timeout=10.0) as client:
        for i, item in enumerate(unique):
            lid_number = item["lid_number"]
            session = item["session"]

            if lid_number in resolved:
                continue

            url = f"{waha_base}/api/{session}/lids/{lid_number}"
            try:
                resp = client.get(url, headers={"X-Api-Key": waha_key})
                resp.raise_for_status()
                data = resp.json()
                pn_full = data.get("pn", "")  # ex: "554391996849@c.us"
                if pn_full and "@" in pn_full:
                    pn_digits = pn_full.split("@")[0]
                    resolved[lid_number] = pn_digits
                    logger.info("[052] %s -> %s", lid_number, pn_digits)
                else:
                    logger.warning("[052] Resposta sem pn para LID %s: %s", lid_number, data)
            except Exception as exc:
                logger.warning("[052] Falha ao resolver LID %s (sessão %s): %s", lid_number, session, exc)

            if i % 10 == 9:
                logger.info("[052] resolvidos %d/%d LIDs", len(resolved), n_total)

            time.sleep(0.05)  # 50ms entre chamadas

    logger.info("[052] resolvidos %d/%d LIDs no total", len(resolved), n_total)
    return resolved


def upgrade() -> None:
    conn = op.get_bind()

    # ── Step 1: Coletar LIDs ──────────────────────────────────────────────────
    lids = _collect_lids(conn)
    logger.info("[052] %d LIDs encontrados no banco", len(lids))

    # ── Step 2: Resolver via WAHA API ─────────────────────────────────────────
    resolved_map: dict[str, str] = _resolve_lids(lids)  # lid_number -> pn_digits

    if not resolved_map:
        logger.warning("[052] Nenhum LID resolvido — prosseguindo com consolidação apenas")
    else:
        # ── Step 3: Tabela temporária ─────────────────────────────────────────
        conn.execute(sa.text(
            "CREATE TEMP TABLE IF NOT EXISTS _lid_pn_map "
            "(lid_number TEXT PRIMARY KEY, pn TEXT NOT NULL)"
        ))
        for lid_number, pn_digits in resolved_map.items():
            conn.execute(
                sa.text("INSERT INTO _lid_pn_map (lid_number, pn) VALUES (:lid, :pn) ON CONFLICT DO NOTHING"),
                {"lid": lid_number, "pn": pn_digits},
            )

        # ── Step 4: Atualizar contatos ────────────────────────────────────────
        for lid_number, pn_digits in resolved_map.items():
            lid_jid = f"{lid_number}@lid"
            resolved_jid = f"{pn_digits}@s.whatsapp.net"

            # Caso A: não existe contato com JID resolvido → renomear
            conn.execute(sa.text("""
                UPDATE crm_whatsapp_contatos
                SET jid = :resolved_jid,
                    numero_evo = :resolved_jid,
                    telefone = :pn_digits,
                    updated_at = NOW()
                WHERE jid = :lid_jid
                  AND NOT EXISTS (
                    SELECT 1 FROM crm_whatsapp_contatos c2
                    WHERE c2.workspace_id = crm_whatsapp_contatos.workspace_id
                      AND c2.jid = :resolved_jid
                  )
            """), {"resolved_jid": resolved_jid, "pn_digits": pn_digits, "lid_jid": lid_jid})

            # Caso B: já existe → enriquecer real, reatribuir conversas, soft-delete @lid
            # Enriquecer contato real com dados do @lid se melhores
            conn.execute(sa.text("""
                UPDATE crm_whatsapp_contatos AS real_ct
                SET
                  telefone = COALESCE(NULLIF(real_ct.telefone, ''), lid_ct.telefone),
                  nome = CASE
                    WHEN real_ct.nome IS NULL
                      OR real_ct.nome = real_ct.jid
                      OR real_ct.nome = real_ct.telefone
                    THEN lid_ct.nome
                    ELSE real_ct.nome
                  END,
                  push_name = COALESCE(real_ct.push_name, lid_ct.push_name),
                  updated_at = NOW()
                FROM crm_whatsapp_contatos lid_ct
                WHERE real_ct.workspace_id = lid_ct.workspace_id
                  AND real_ct.jid = :resolved_jid
                  AND lid_ct.jid = :lid_jid
            """), {"resolved_jid": resolved_jid, "lid_jid": lid_jid})

            # Reatribuir conversas do contato @lid para o contato real
            conn.execute(sa.text("""
                UPDATE crm_whatsapp_conversas cv
                SET contato_id = (
                  SELECT id FROM crm_whatsapp_contatos
                  WHERE workspace_id = cv.workspace_id
                    AND jid = :resolved_jid
                  LIMIT 1
                )
                WHERE contato_id IN (
                  SELECT id FROM crm_whatsapp_contatos lid_ct
                  WHERE lid_ct.jid = :lid_jid
                    AND lid_ct.workspace_id = cv.workspace_id
                )
                  AND EXISTS (
                    SELECT 1 FROM crm_whatsapp_contatos
                    WHERE workspace_id = cv.workspace_id
                      AND jid = :resolved_jid
                  )
            """), {"resolved_jid": resolved_jid, "lid_jid": lid_jid})

            # Soft-delete do contato @lid (quando já existe o real)
            conn.execute(sa.text("""
                UPDATE crm_whatsapp_contatos
                SET ativo = false,
                    deleted_at = NOW(),
                    updated_at = NOW()
                WHERE jid = :lid_jid
                  AND EXISTS (
                    SELECT 1 FROM crm_whatsapp_contatos c2
                    WHERE c2.workspace_id = crm_whatsapp_contatos.workspace_id
                      AND c2.jid = :resolved_jid
                  )
            """), {"resolved_jid": resolved_jid, "lid_jid": lid_jid})

        # ── Step 5: Atualizar conversas ───────────────────────────────────────
        for lid_number, pn_digits in resolved_map.items():
            resolved_jid = f"{pn_digits}@s.whatsapp.net"
            conn.execute(sa.text("""
                UPDATE crm_whatsapp_conversas
                SET remote_jid = :resolved_jid, updated_at = NOW()
                WHERE split_part(remote_jid, '@', 1) = :lid_number
                  AND remote_jid LIKE '%@lid'
            """), {"resolved_jid": resolved_jid, "lid_number": lid_number})

        # ── Step 6: Atualizar mensagens ───────────────────────────────────────
        for lid_number, pn_digits in resolved_map.items():
            resolved_jid = f"{pn_digits}@s.whatsapp.net"
            conn.execute(sa.text("""
                UPDATE crm_whatsapp_mensagens
                SET remote_jid = :resolved_jid, updated_at = NOW()
                WHERE split_part(remote_jid, '@', 1) = :lid_number
                  AND remote_jid LIKE '%@lid'
            """), {"resolved_jid": resolved_jid, "lid_number": lid_number})

            conn.execute(sa.text("""
                UPDATE crm_whatsapp_mensagens
                SET participant_jid = :resolved_jid, updated_at = NOW()
                WHERE split_part(participant_jid, '@', 1) = :lid_number
                  AND participant_jid LIKE '%@lid'
            """), {"resolved_jid": resolved_jid, "lid_number": lid_number})

    # ── Step 7: Consolidar conversas duplicadas (padrão migration 050) ────────
    op.execute(sa.text("DROP INDEX IF EXISTS public.uq_crm_open_conversation_per_channel"))
    op.execute(sa.text("""
        DO $$
        DECLARE
            grp record;
            canonical_id uuid;
            old_ids uuid[];
            unread_total integer;
        BEGIN
            FOR grp IN
                SELECT workspace_id, canal_id, remote_jid
                FROM public.crm_whatsapp_conversas
                WHERE ativo = true
                  AND status <> 'resolvido'
                GROUP BY workspace_id, canal_id, remote_jid
                HAVING COUNT(*) > 1
            LOOP
                SELECT c.id
                INTO canonical_id
                FROM public.crm_whatsapp_conversas c
                WHERE c.workspace_id = grp.workspace_id
                  AND c.canal_id = grp.canal_id
                  AND c.remote_jid = grp.remote_jid
                  AND c.ativo = true
                  AND c.status <> 'resolvido'
                ORDER BY c.ultima_msg_at DESC NULLS LAST,
                         c.updated_at DESC NULLS LAST,
                         c.created_at DESC NULLS LAST,
                         c.id DESC
                LIMIT 1;

                SELECT ARRAY_AGG(id), COALESCE(SUM(nao_lidas), 0)
                INTO old_ids, unread_total
                FROM public.crm_whatsapp_conversas
                WHERE workspace_id = grp.workspace_id
                  AND canal_id = grp.canal_id
                  AND remote_jid = grp.remote_jid
                  AND ativo = true
                  AND status <> 'resolvido'
                  AND id <> canonical_id;

                IF old_ids IS NULL OR array_length(old_ids, 1) IS NULL THEN
                    CONTINUE;
                END IF;

                UPDATE public.crm_whatsapp_mensagens
                SET conversa_id = canonical_id
                WHERE conversa_id = ANY(old_ids);

                UPDATE public.crm_whatsapp_midia
                SET conversa_id = canonical_id
                WHERE conversa_id = ANY(old_ids);

                UPDATE public.crm_whatsapp_memorias_ia
                SET conversa_id = canonical_id
                WHERE conversa_id = ANY(old_ids);

                UPDATE public.crm_conversation_assignments
                SET conversa_id = canonical_id
                WHERE conversa_id = ANY(old_ids);

                UPDATE public.crm_followups
                SET conversa_id = canonical_id
                WHERE conversa_id = ANY(old_ids);

                UPDATE public.crm_lead_origin_events
                SET conversa_id = canonical_id
                WHERE conversa_id = ANY(old_ids);

                UPDATE public.crm_whatsapp_conversas
                SET nao_lidas = 0,
                    status = 'resolvido',
                    closed_at = COALESCE(closed_at, NOW()),
                    ativo = false,
                    deleted_at = NOW(),
                    updated_at = NOW()
                WHERE id = ANY(old_ids);

                UPDATE public.crm_whatsapp_conversas
                SET nao_lidas = nao_lidas + COALESCE(unread_total, 0),
                    ativo = true,
                    deleted_at = NULL,
                    updated_at = NOW()
                WHERE id = canonical_id;
            END LOOP;
        END $$;
    """))
    op.execute(sa.text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_open_conversation_per_channel
        ON public.crm_whatsapp_conversas(workspace_id, canal_id, remote_jid)
        WHERE ativo = true AND status <> 'resolvido'
    """))

    # ── Step 8: Atualizar eventos ─────────────────────────────────────────────
    if resolved_map:
        for lid_number, pn_digits in resolved_map.items():
            resolved_jid = f"{pn_digits}@s.whatsapp.net"
            conn.execute(sa.text("""
                UPDATE crm_whatsapp_eventos
                SET remote_jid = :resolved_jid
                WHERE split_part(remote_jid, '@', 1) = :lid_number
                  AND remote_jid LIKE '%@lid'
            """), {"resolved_jid": resolved_jid, "lid_number": lid_number})


def downgrade() -> None:
    pass  # não reversível — dados transformados
