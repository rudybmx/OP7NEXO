"""Consolida conversas WhatsApp duplicadas pela variante do 9º dígito BR + backfill bare.

PROBLEMA: o mesmo contato gera 2+ conversas no mesmo canal porque o WhatsApp BR representa o
mesmo celular como 12 díg (legado, sem o 9) e 13 díg (atual), e porque o envio manual gravava
o JID *bare* (sem @s.whatsapp.net) enquanto o inbound grava com sufixo.

ESTE SCRIPT (corretivo, complementa a prevenção já no código):
  - Agrupa conversas ATIVAS não-resolvidas por (workspace, canal, _canonical_br_jid),
    excluindo grupo/lid/broadcast/newsletter.
  - Grupos com >1 conversa: escolhe a MAIS RECENTE como canônica (preserva estado vivo:
    status/ai_ativo/id que a UI aponta), move as 9 tabelas-filhas (reusa a MESMA função do
    código live, _move_conversation_children_to_canonical), soma nao_lidas, seta remote_jid
    canônico, soft-delete das demais. Contato canônico = o que já tem o jid canônico (senão o
    da sobrevivente); filhos reapontados ao contato canônico (escopado pela conversa). Contato
    perdedor SEM outra conversa ativa → merge de campos + soft-delete.
  - Singletons com remote_jid != canônico (classe bare): backfill (rename para o canônico).

SEGURANÇA:
  - --dry-run é o DEFAULT: executa tudo numa transação e faz ROLLBACK, imprimindo o plano.
  - O CREATE UNIQUE INDEX ao final é invariante auto-verificável: se sobrar duplicata ativa,
    o índice não recria e a transação aborta (apply falha em vez de deixar inconsistência).
  - --apply commita. Rode em horário de baixo tráfego (a transação dropa o índice único parcial
    durante a execução).

USO:
  python scripts/consolidar_conversas_duplicadas.py                 # dry-run (mostra o plano)
  python scripts/consolidar_conversas_duplicadas.py --apply         # aplica
  # filtros opcionais: --workspace-id <uuid> --canal-id <uuid>
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from collections import defaultdict
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.services.whatsapp_crm_persistence import (
    _canonical_br_jid,
    _move_conversation_children_to_canonical,
)

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("consolidar")

DATABASE_URL = os.getenv("DATABASE_URL")

OPEN_INDEX = "uq_crm_open_conversation_per_channel"


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--apply", action="store_true", help="Aplica (default: dry-run com rollback).")
    p.add_argument("--workspace-id", help="Escopo opcional: só este workspace.")
    p.add_argument("--canal-id", help="Escopo opcional: só este canal.")
    return p.parse_args(argv)


def _recency_key(m: dict) -> tuple:
    """Mais recente primeiro: ultima_msg_at, updated_at, created_at, id (None por último)."""
    from datetime import datetime, timezone

    floor = datetime(1, 1, 1, tzinfo=timezone.utc)

    def norm(dt):
        if dt is None:
            return floor
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

    return (norm(m["ultima_msg_at"]), norm(m["updated_at"]), norm(m["created_at"]), str(m["id"]))


def _tables_with_contato_and_conversa(db: Session) -> list[str]:
    """Tabelas-filhas que têm AMBOS conversa_id e contato_id (p/ reapontar contato escopado)."""
    rows = db.execute(text("""
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = 'public' AND column_name = 'contato_id'
          AND table_name IN (
              SELECT table_name FROM information_schema.columns
              WHERE table_schema = 'public' AND column_name = 'conversa_id'
          )
    """)).fetchall()
    return [r[0] for r in rows]


def fetch_candidates(db: Session, ws: str | None, canal: str | None) -> list[dict]:
    where = [
        "cv.ativo = true",
        "COALESCE(cv.status, '') <> 'resolvido'",
        "cv.remote_jid NOT LIKE '%@g.us'",
        "cv.remote_jid NOT LIKE '%@lid'",
        "cv.remote_jid NOT LIKE '%@broadcast'",
        "cv.remote_jid NOT LIKE '%@newsletter'",
        "COALESCE(cv.remote_jid, '') <> ''",
    ]
    params: dict[str, Any] = {}
    if ws:
        where.append("cv.workspace_id = CAST(:ws AS uuid)")
        params["ws"] = ws
    if canal:
        where.append("cv.canal_id = CAST(:canal AS uuid)")
        params["canal"] = canal
    rows = db.execute(text(f"""
        SELECT cv.id, cv.workspace_id, cv.canal_id, cv.remote_jid, cv.contato_id,
               cv.nao_lidas, cv.ultima_msg_at, cv.updated_at, cv.created_at,
               ct.jid AS contato_jid, ct.nome AS contato_nome,
               (SELECT COUNT(*) FROM public.crm_whatsapp_mensagens m WHERE m.conversa_id = cv.id) AS n_msgs
        FROM public.crm_whatsapp_conversas cv
        LEFT JOIN public.crm_whatsapp_contatos ct ON ct.id = cv.contato_id
        WHERE {" AND ".join(where)}
    """), params).mappings().all()
    return [dict(r) for r in rows]


def build_groups(rows: list[dict]) -> dict[tuple, list[dict]]:
    groups: dict[tuple, list[dict]] = defaultdict(list)
    for r in rows:
        canon = _canonical_br_jid(r["remote_jid"])
        groups[(str(r["workspace_id"]), str(r["canal_id"]), canon)].append(r)
    return groups


def _pick_canonical_contato(members: list[dict], canon_jid: str, survivor: dict) -> Any:
    """Contato canônico: o membro cujo contato já tem o jid canônico; senão o da sobrevivente."""
    for m in members:
        if m.get("contato_jid") == canon_jid and m["contato_id"]:
            return m["contato_id"]
    return survivor["contato_id"]


def _canonicalize_contato_jid(db: Session, *, contato_id: Any, ws: str, canon_jid: str) -> None:
    """Seta jid do contato canônico para o canônico, só se nenhum outro contato (ativo OU
    soft-deletado — a unique (workspace,jid) inclui ambos) já ocupa o slot."""
    db.execute(text("""
        UPDATE public.crm_whatsapp_contatos c
        SET jid = :canon, telefone = COALESCE(NULLIF(c.telefone, ''), split_part(:canon, '@', 1)),
            updated_at = NOW()
        WHERE c.id = :cid AND c.jid <> :canon
          AND NOT EXISTS (
              SELECT 1 FROM public.crm_whatsapp_contatos o
              WHERE o.workspace_id = CAST(:ws AS uuid) AND o.jid = :canon AND o.id <> :cid
          )
    """), {"canon": canon_jid, "cid": contato_id, "ws": ws})


def _retire_orphan_contato(db: Session, *, orphan_id: Any, canon_contato: Any) -> bool:
    """Se o contato perdedor não tem mais nenhuma conversa ativa: merge de campos no canônico
    + soft-delete. Retorna True se aposentou."""
    still_active = db.execute(text("""
        SELECT 1 FROM public.crm_whatsapp_conversas
        WHERE contato_id = :oc AND ativo = true LIMIT 1
    """), {"oc": orphan_id}).fetchone()
    if still_active:
        return False
    # merge de campos (preenche lacunas do canônico com o do órfão)
    db.execute(text("""
        UPDATE public.crm_whatsapp_contatos canon
        SET nome = CASE
                       WHEN NULLIF(BTRIM(canon.nome), '') IS NULL OR canon.nome = canon.jid
                            OR canon.nome LIKE '%@%'
                       THEN COALESCE(NULLIF(BTRIM(orph.nome), ''), canon.nome)
                       ELSE canon.nome END,
            telefone = COALESCE(NULLIF(canon.telefone, ''), orph.telefone),
            push_name = COALESCE(canon.push_name, orph.push_name),
            updated_at = NOW()
        FROM public.crm_whatsapp_contatos orph
        WHERE canon.id = :canon AND orph.id = :oc
    """), {"canon": canon_contato, "oc": orphan_id})
    db.execute(text("""
        UPDATE public.crm_whatsapp_contatos
        SET ativo = false, deleted_at = NOW(), updated_at = NOW()
        WHERE id = :oc
    """), {"oc": orphan_id})
    return True


def process_merge_group(db: Session, members: list[dict], canon_jid: str, contato_tables: list[str],
                        stats: dict, apply: bool) -> None:
    ws = str(members[0]["workspace_id"])
    ordered = sorted(members, key=_recency_key, reverse=True)
    survivor = ordered[0]
    losers = ordered[1:]
    canonical_id = survivor["id"]
    old_ids = [m["id"] for m in losers]
    canon_contato = _pick_canonical_contato(members, canon_jid, survivor)
    group_conv_ids = [m["id"] for m in members]
    old_contatos = list({m["contato_id"] for m in losers if m["contato_id"] and m["contato_id"] != canon_contato})

    logger.info("  GRUPO canal=%s  canônico=%s", str(members[0]["canal_id"])[:8], canon_jid)
    for m in ordered:
        tag = "CANONICA" if m["id"] == canonical_id else "merge-> "
        logger.info("    [%s] %-32s nome=%-22s msgs=%s nao_lidas=%s ult=%s",
                    tag, m["remote_jid"], (m.get("contato_nome") or "")[:22], m["n_msgs"],
                    m["nao_lidas"], m["ultima_msg_at"])

    # Quais contatos perdedores ficariam órfãos (read-only p/ o relatório): sem conversa ativa
    # FORA do grupo. (No apply, _retire_orphan_contato reconfirma após o soft-delete.)
    retire = []
    for oc in old_contatos:
        other = db.execute(text("""
            SELECT COUNT(*) FROM public.crm_whatsapp_conversas
            WHERE contato_id = :oc AND ativo = true AND id <> ALL(:grp)
        """), {"oc": oc, "grp": group_conv_ids}).scalar()
        if other == 0:
            retire.append(oc)
            logger.info("    -> contato órfão %s será mesclado+retirado", str(oc)[:8])
        else:
            logger.info("    -> contato %s mantido (%d conversa(s) ativa(s) fora do grupo)", str(oc)[:8], other)

    stats["grupos"] += 1
    stats["conversas_mescladas"] += len(old_ids)
    stats["contatos_retirados"] += len(retire)
    if not apply:
        return

    # 1. mover as 9 tabelas-filhas para a conversa canônica
    _move_conversation_children_to_canonical(db, canonical_id=canonical_id, old_ids=old_ids)
    # 2. reapontar contato_id dos filhos movidos → contato canônico (ESCOPADO pela conversa canônica)
    if old_contatos:
        for tbl in contato_tables:
            db.execute(text(
                f"UPDATE public.{tbl} SET contato_id = :canon WHERE conversa_id = :conv AND contato_id = ANY(:old)"
            ), {"canon": canon_contato, "conv": canonical_id, "old": old_contatos})
    # 3. somar nao_lidas e soft-delete das perdedoras
    unread = db.execute(text(
        "SELECT COALESCE(SUM(nao_lidas), 0) FROM public.crm_whatsapp_conversas WHERE id = ANY(:o)"
    ), {"o": old_ids}).scalar() or 0
    db.execute(text("""
        UPDATE public.crm_whatsapp_conversas
        SET ativo = false, deleted_at = NOW(), status = 'resolvido',
            closed_at = COALESCE(closed_at, NOW()), nao_lidas = 0, updated_at = NOW()
        WHERE id = ANY(:o)
    """), {"o": old_ids})
    # 4. canônica: contato canônico, remote_jid canônico, nao_lidas somadas
    db.execute(text("""
        UPDATE public.crm_whatsapp_conversas
        SET remote_jid = :canon_jid, contato_id = :canon_contato,
            nao_lidas = nao_lidas + :unread, ativo = true, deleted_at = NULL, updated_at = NOW()
        WHERE id = :cid
    """), {"canon_jid": canon_jid, "canon_contato": canon_contato, "unread": unread, "cid": canonical_id})
    # alinhar remote_jid das mensagens da canônica (cosmético; busca é por conversa_id)
    db.execute(text(
        "UPDATE public.crm_whatsapp_mensagens SET remote_jid = :canon_jid WHERE conversa_id = :cid"
    ), {"canon_jid": canon_jid, "cid": canonical_id})
    # 5. jid canônico no contato canônico (guarda de colisão)
    _canonicalize_contato_jid(db, contato_id=canon_contato, ws=ws, canon_jid=canon_jid)
    # 6. contatos perdedores órfãos → merge + soft-delete
    for oc in old_contatos:
        _retire_orphan_contato(db, orphan_id=oc, canon_contato=canon_contato)


def process_backfill(db: Session, conv: dict, canon_jid: str, stats: dict, apply: bool) -> None:
    ws = str(conv["workspace_id"])
    logger.info("  BACKFILL canal=%s  %s -> %s  (nome=%s)",
                str(conv["canal_id"])[:8], conv["remote_jid"], canon_jid, (conv.get("contato_nome") or "")[:22])
    stats["backfill"] += 1
    if not apply:
        return
    db.execute(text(
        "UPDATE public.crm_whatsapp_conversas SET remote_jid = :canon, updated_at = NOW() WHERE id = :cid"
    ), {"canon": canon_jid, "cid": conv["id"]})
    db.execute(text(
        "UPDATE public.crm_whatsapp_mensagens SET remote_jid = :canon WHERE conversa_id = :cid"
    ), {"canon": canon_jid, "cid": conv["id"]})
    if conv["contato_id"]:
        _canonicalize_contato_jid(db, contato_id=conv["contato_id"], ws=ws, canon_jid=canon_jid)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    if not DATABASE_URL:
        logger.error("DATABASE_URL não configurada")
        return 1

    engine = create_engine(DATABASE_URL)
    stats = {"grupos": 0, "conversas_mescladas": 0, "backfill": 0, "contatos_retirados": 0}

    with Session(engine) as db:
        rows = fetch_candidates(db, args.workspace_id, args.canal_id)
        groups = build_groups(rows)
        contato_tables = _tables_with_contato_and_conversa(db)
        logger.info("Candidatas: %d conversas | tabelas c/ contato_id: %s", len(rows), ", ".join(contato_tables))

        merge_groups = {k: v for k, v in groups.items() if len(v) > 1}
        backfills = [v[0] for k, v in groups.items() if len(v) == 1 and v[0]["remote_jid"] != k[2]]
        logger.info("=== %d grupos a mesclar | %d conversas a backfill (bare->canônico) ===",
                    len(merge_groups), len(backfills))
        logger.info("Modo: %s\n", "APPLY (transação atômica)" if args.apply else "DRY-RUN (read-only)")

        # APPLY: tudo numa transação. DROP do índice → mutações → CREATE UNIQUE INDEX (invariante).
        # DRY-RUN: somente leitura (sem DROP/locks), apenas imprime o plano — seguro p/ prod.
        if args.apply:
            db.execute(text(f"DROP INDEX IF EXISTS public.{OPEN_INDEX}"))

        logger.info("--- MERGES ---")
        for (_ws, _canal, canon_jid), members in merge_groups.items():
            process_merge_group(db, members, canon_jid, contato_tables, stats, args.apply)

        logger.info("--- BACKFILLS (bare->canônico) ---")
        for conv in backfills:
            process_backfill(db, conv, _canonical_br_jid(conv["remote_jid"]), stats, args.apply)

        if args.apply:
            # Invariante: recria o índice único parcial. Falha se sobrou duplicata ativa.
            db.execute(text(f"""
                CREATE UNIQUE INDEX IF NOT EXISTS {OPEN_INDEX}
                ON public.crm_whatsapp_conversas(workspace_id, canal_id, remote_jid)
                WHERE ativo = true AND status <> 'resolvido'
            """))

        logger.info("\n=== RESUMO%s ===", "" if args.apply else " (PREVISTO)")
        logger.info("  Grupos a mesclar        : %d", stats["grupos"])
        logger.info("  Conversas a soft-deletar: %d", stats["conversas_mescladas"])
        logger.info("  Conversas backfill bare : %d", stats["backfill"])
        logger.info("  Contatos órfãos a retirar: %d", stats["contatos_retirados"])

        if args.apply:
            db.commit()
            logger.info("\n>>> APLICADO (commit). Índice único recriado (invariante OK).")
        else:
            db.rollback()
            logger.info("\n>>> DRY-RUN read-only: nada alterado. Rode com --apply para aplicar.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
