"""Script para resolver @lid históricos via WAHA API e consolidar conversas duplicadas.

Executa a mesma lógica da migration 052, mas como script standalone para quando
a migration rodou sem WAHA_BASE_URL configurada no ambiente.

Uso:
    docker exec op7nexo-api python scripts/resolver_lids_historicos.py
    # ou com URL explícita:
    WAHA_BASE_URL=https://waha.op7franquia.com.br docker exec op7nexo-api python scripts/resolver_lids_historicos.py
"""
from __future__ import annotations

import logging
import os
import re
import sys
import time

import httpx
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL", "")
WAHA_BASE_URL = os.environ.get("WAHA_BASE_URL", "https://waha.op7franquia.com.br").rstrip("/")
WAHA_API_KEY = os.environ.get("WAHA_API_KEY", "")


def collect_lids(db: Session) -> list[dict]:
    rows = db.execute(text("""
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
    """)).fetchall()
    return [{"lid_number": r[0], "session": r[1]} for r in rows if r[0] and r[1]]


def resolve_lids(lids: list[dict]) -> dict[str, str]:
    if not WAHA_API_KEY:
        logger.warning("WAHA_API_KEY não configurada")
        return {}

    seen: set[tuple] = set()
    unique = [item for item in lids if (k := (item["lid_number"], item["session"])) not in seen and not seen.add(k)]

    resolved: dict[str, str] = {}
    with httpx.Client(timeout=10.0) as client:
        for i, item in enumerate(unique):
            lid = item["lid_number"]
            session = item["session"]
            if lid in resolved:
                continue
            try:
                resp = client.get(
                    f"{WAHA_BASE_URL}/api/{session}/lids/{lid}",
                    headers={"X-Api-Key": WAHA_API_KEY},
                )
                resp.raise_for_status()
                pn_full = resp.json().get("pn", "")
                if pn_full and "@" in pn_full:
                    pn_digits = pn_full.split("@")[0]
                    resolved[lid] = pn_digits
                    logger.info("  %s → %s", lid, pn_digits)
            except Exception as exc:
                logger.warning("  falha LID %s: %s", lid, exc)
            if i % 20 == 19:
                logger.info("  progresso: %d/%d", len(resolved), len(unique))
            time.sleep(0.05)

    logger.info("Resolvidos %d/%d LIDs", len(resolved), len(unique))
    return resolved


def apply_resolved(db: Session, resolved_map: dict[str, str]) -> None:
    for lid_number, pn_digits in resolved_map.items():
        lid_jid = f"{lid_number}@lid"
        resolved_jid = f"{pn_digits}@s.whatsapp.net"

        # Contatos — Caso A: renomear
        db.execute(text("""
            UPDATE crm_whatsapp_contatos
            SET jid = :resolved_jid, numero_evo = :resolved_jid, telefone = :pn, updated_at = NOW()
            WHERE jid = :lid_jid
              AND NOT EXISTS (
                SELECT 1 FROM crm_whatsapp_contatos c2
                WHERE c2.workspace_id = crm_whatsapp_contatos.workspace_id AND c2.jid = :resolved_jid
              )
        """), {"resolved_jid": resolved_jid, "pn": pn_digits, "lid_jid": lid_jid})

        # Contatos — Caso B: enriquecer real + reatribuir + soft-delete @lid
        db.execute(text("""
            UPDATE crm_whatsapp_contatos AS real_ct
            SET
              telefone = COALESCE(NULLIF(real_ct.telefone, ''), lid_ct.telefone),
              nome = CASE
                WHEN real_ct.nome IS NULL OR real_ct.nome = real_ct.jid OR real_ct.nome = real_ct.telefone
                THEN lid_ct.nome ELSE real_ct.nome END,
              push_name = COALESCE(real_ct.push_name, lid_ct.push_name),
              updated_at = NOW()
            FROM crm_whatsapp_contatos lid_ct
            WHERE real_ct.workspace_id = lid_ct.workspace_id
              AND real_ct.jid = :resolved_jid AND lid_ct.jid = :lid_jid
        """), {"resolved_jid": resolved_jid, "lid_jid": lid_jid})

        db.execute(text("""
            UPDATE crm_whatsapp_conversas cv
            SET contato_id = (
              SELECT id FROM crm_whatsapp_contatos
              WHERE workspace_id = cv.workspace_id AND jid = :resolved_jid LIMIT 1
            )
            WHERE contato_id IN (
              SELECT id FROM crm_whatsapp_contatos lid_ct
              WHERE lid_ct.jid = :lid_jid AND lid_ct.workspace_id = cv.workspace_id
            ) AND EXISTS (
              SELECT 1 FROM crm_whatsapp_contatos
              WHERE workspace_id = cv.workspace_id AND jid = :resolved_jid
            )
        """), {"resolved_jid": resolved_jid, "lid_jid": lid_jid})

        db.execute(text("""
            UPDATE crm_whatsapp_contatos
            SET ativo = false, deleted_at = NOW(), updated_at = NOW()
            WHERE jid = :lid_jid
              AND EXISTS (
                SELECT 1 FROM crm_whatsapp_contatos c2
                WHERE c2.workspace_id = crm_whatsapp_contatos.workspace_id AND c2.jid = :resolved_jid
              )
        """), {"resolved_jid": resolved_jid, "lid_jid": lid_jid})

        # Conversas — merge se já existe conversa com o JID resolvido, senão renomeia
        # Buscar conversas @lid ativas não-resolvidas
        lid_convs = db.execute(text("""
            SELECT id, canal_id, workspace_id, nao_lidas
            FROM crm_whatsapp_conversas
            WHERE split_part(remote_jid, '@', 1) = :lid
              AND remote_jid LIKE '%@lid'
              AND ativo = true AND status <> 'resolvido'
        """), {"lid": lid_number}).fetchall()

        for lid_conv in lid_convs:
            # Verifica se já existe conversa com o JID resolvido no mesmo canal/workspace
            existing_conv = db.execute(text("""
                SELECT id FROM crm_whatsapp_conversas
                WHERE workspace_id = :ws AND canal_id = :canal
                  AND remote_jid = :resolved_jid
                  AND ativo = true AND status <> 'resolvido'
                LIMIT 1
            """), {"ws": lid_conv[2], "canal": lid_conv[1], "resolved_jid": resolved_jid}).scalar()

            if existing_conv:
                # Merge: mover tudo para a conversa existente, soft-delete a @lid
                for table, col in [
                    ("crm_whatsapp_mensagens", "conversa_id"),
                    ("crm_whatsapp_midia", "conversa_id"),
                    ("crm_whatsapp_memorias_ia", "conversa_id"),
                    ("crm_conversation_assignments", "conversa_id"),
                    ("crm_followups", "conversa_id"),
                    ("crm_lead_origin_events", "conversa_id"),
                ]:
                    db.execute(text(
                        f"UPDATE public.{table} SET {col} = :canonical WHERE {col} = :old"
                    ), {"canonical": existing_conv, "old": lid_conv[0]})
                # Somar nao_lidas e soft-delete da @lid
                if lid_conv[3]:
                    db.execute(text("""
                        UPDATE crm_whatsapp_conversas
                        SET nao_lidas = nao_lidas + :unread, updated_at = NOW()
                        WHERE id = :canonical
                    """), {"unread": lid_conv[3], "canonical": existing_conv})
                db.execute(text("""
                    UPDATE crm_whatsapp_conversas
                    SET ativo = false, deleted_at = NOW(), status = 'resolvido',
                        nao_lidas = 0, updated_at = NOW()
                    WHERE id = :old
                """), {"old": lid_conv[0]})
            else:
                # Renomear @lid → número real
                db.execute(text("""
                    UPDATE crm_whatsapp_conversas
                    SET remote_jid = :resolved_jid, updated_at = NOW()
                    WHERE id = :conv_id
                """), {"resolved_jid": resolved_jid, "conv_id": lid_conv[0]})

        # Conversas resolvidas/inativas com @lid — apenas renomear (sem constraint ativa)
        db.execute(text("""
            UPDATE crm_whatsapp_conversas
            SET remote_jid = :resolved_jid, updated_at = NOW()
            WHERE split_part(remote_jid, '@', 1) = :lid
              AND remote_jid LIKE '%@lid'
              AND (ativo = false OR status = 'resolvido')
        """), {"resolved_jid": resolved_jid, "lid": lid_number})

        # Mensagens
        db.execute(text("""
            UPDATE crm_whatsapp_mensagens
            SET remote_jid = :resolved_jid, updated_at = NOW()
            WHERE split_part(remote_jid, '@', 1) = :lid AND remote_jid LIKE '%@lid'
        """), {"resolved_jid": resolved_jid, "lid": lid_number})
        db.execute(text("""
            UPDATE crm_whatsapp_mensagens
            SET participant_jid = :resolved_jid, updated_at = NOW()
            WHERE split_part(participant_jid, '@', 1) = :lid AND participant_jid LIKE '%@lid'
        """), {"resolved_jid": resolved_jid, "lid": lid_number})

        # Eventos
        db.execute(text("""
            UPDATE crm_whatsapp_eventos
            SET remote_jid = :resolved_jid
            WHERE split_part(remote_jid, '@', 1) = :lid AND remote_jid LIKE '%@lid'
        """), {"resolved_jid": resolved_jid, "lid": lid_number})

    db.commit()


def consolidate_duplicates(db: Session) -> None:
    """Merge conversas ativas não-resolvidas com mesmo (workspace, canal, remote_jid)."""
    db.execute(text("DROP INDEX IF EXISTS public.uq_crm_open_conversation_per_channel"))
    db.execute(text("""
        DO $$
        DECLARE
            grp record; canonical_id uuid; old_ids uuid[]; unread_total integer;
        BEGIN
            FOR grp IN
                SELECT workspace_id, canal_id, remote_jid
                FROM public.crm_whatsapp_conversas
                WHERE ativo = true AND status <> 'resolvido'
                GROUP BY workspace_id, canal_id, remote_jid
                HAVING COUNT(*) > 1
            LOOP
                SELECT c.id INTO canonical_id
                FROM public.crm_whatsapp_conversas c
                WHERE c.workspace_id = grp.workspace_id AND c.canal_id = grp.canal_id
                  AND c.remote_jid = grp.remote_jid AND c.ativo = true AND c.status <> 'resolvido'
                ORDER BY c.ultima_msg_at DESC NULLS LAST, c.updated_at DESC NULLS LAST, c.id DESC
                LIMIT 1;

                SELECT ARRAY_AGG(id), COALESCE(SUM(nao_lidas), 0)
                INTO old_ids, unread_total
                FROM public.crm_whatsapp_conversas
                WHERE workspace_id = grp.workspace_id AND canal_id = grp.canal_id
                  AND remote_jid = grp.remote_jid AND ativo = true
                  AND status <> 'resolvido' AND id <> canonical_id;

                IF old_ids IS NULL OR array_length(old_ids, 1) IS NULL THEN CONTINUE; END IF;

                UPDATE public.crm_whatsapp_mensagens SET conversa_id = canonical_id WHERE conversa_id = ANY(old_ids);
                UPDATE public.crm_whatsapp_midia SET conversa_id = canonical_id WHERE conversa_id = ANY(old_ids);
                UPDATE public.crm_whatsapp_memorias_ia SET conversa_id = canonical_id WHERE conversa_id = ANY(old_ids);
                UPDATE public.crm_conversation_assignments SET conversa_id = canonical_id WHERE conversa_id = ANY(old_ids);
                UPDATE public.crm_followups SET conversa_id = canonical_id WHERE conversa_id = ANY(old_ids);
                UPDATE public.crm_lead_origin_events SET conversa_id = canonical_id WHERE conversa_id = ANY(old_ids);

                UPDATE public.crm_whatsapp_conversas
                SET ativo = false, deleted_at = NOW(), status = 'resolvido',
                    closed_at = COALESCE(closed_at, NOW()), nao_lidas = 0, updated_at = NOW()
                WHERE id = ANY(old_ids);

                UPDATE public.crm_whatsapp_conversas
                SET nao_lidas = nao_lidas + COALESCE(unread_total, 0), ativo = true,
                    deleted_at = NULL, updated_at = NOW()
                WHERE id = canonical_id;
            END LOOP;
        END $$;
    """))
    db.execute(text("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_open_conversation_per_channel
        ON public.crm_whatsapp_conversas(workspace_id, canal_id, remote_jid)
        WHERE ativo = true AND status <> 'resolvido'
    """))
    db.commit()
    logger.info("Consolidação de duplicatas concluída")


def main() -> None:
    if not DATABASE_URL:
        logger.error("DATABASE_URL não configurada")
        sys.exit(1)

    engine = create_engine(DATABASE_URL)
    with Session(engine) as db:
        logger.info("=== Coletando LIDs ===")
        lids = collect_lids(db)
        logger.info("%d LIDs encontrados no banco", len(lids))

        logger.info("=== Resolvendo via WAHA API ===")
        resolved_map = resolve_lids(lids)

        if resolved_map:
            logger.info("=== Aplicando resolução no banco ===")
            apply_resolved(db, resolved_map)
        else:
            logger.warning("Nenhum LID resolvido — apenas consolidação")

        logger.info("=== Consolidando conversas duplicadas ===")
        consolidate_duplicates(db)

        # Resumo final
        rows = db.execute(text("""
            SELECT
              (SELECT COUNT(*) FROM crm_whatsapp_conversas WHERE remote_jid LIKE '%@lid' AND ativo=true) AS conv_lid,
              (SELECT COUNT(*) FROM crm_whatsapp_contatos WHERE jid LIKE '%@lid' AND ativo=true) AS ct_lid,
              (SELECT COUNT(*) FROM crm_whatsapp_mensagens WHERE remote_jid LIKE '%@lid') AS msg_lid
        """)).fetchone()
        logger.info("=== Resultado final ===")
        logger.info("  Conversas ativas com @lid : %d", rows[0])
        logger.info("  Contatos ativos com @lid  : %d", rows[1])
        logger.info("  Mensagens com @lid        : %d", rows[2])


if __name__ == "__main__":
    main()
