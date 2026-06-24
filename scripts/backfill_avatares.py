"""Backfill de avatares de contatos/grupos do WhatsApp.

Contexto: avatares foram gravados como URL crua do CDN do WhatsApp
(`pps.whatsapp.net`), que **expira** (HTTP 403) — a imagem some no front. O fix no
job de enriquecimento passou a re-hospedar os bytes no MinIO; este script limpa os
registros quebrados e re-enfileira o enriquecimento para que o (novo) worker
re-baixe e re-hospede de forma persistente.

⚠️ Rode SOMENTE depois que o worker já estiver com o código novo (re-host), senão
o worker antigo grava `pps.whatsapp.net` de novo.

Uso:
    python -m scripts.backfill_avatares --dry-run            # só relatório
    python -m scripts.backfill_avatares --apply              # aplica (contatos+grupos pps)
    python -m scripts.backfill_avatares --apply --workspace <uuid>
    python -m scripts.backfill_avatares --apply --include-null-tried  # +contatos que ficaram NULL
"""

from __future__ import annotations

import argparse
from typing import Any

from sqlalchemy import text

from app.core.database import SessionLocal
from app.services.contact_avatar_enrichment import (
    enqueue_contact_avatar_enrichment,
    enqueue_group_enrichment,
)

PPS_LIKE = "%pps.whatsapp.net%"


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill de avatares (re-host) do WhatsApp.")
    parser.add_argument("--dry-run", action="store_true", help="Só relata o que faria (default).")
    parser.add_argument("--apply", action="store_true", help="Aplica: limpa URLs quebradas e re-enfileira.")
    parser.add_argument("--workspace", help="Filtra por workspace_id (UUID).")
    parser.add_argument("--limit", type=int, default=0, help="Máximo de registros por categoria (0 = sem limite).")
    parser.add_argument(
        "--include-null-tried",
        action="store_true",
        help="Também re-tenta contatos que ficaram avatar_url NULL após tentativa (envenenados pelo TTL antigo).",
    )
    return parser.parse_args(argv)


def _resolve_instance(row: dict[str, Any]) -> str:
    """Instância para o payload do job (o job re-resolve via config do canal;
    isto é só o fallback). Evolution → evolution_instance_id; WAHA → session."""
    inst = str(row.get("evolution_instance_id") or "").strip()
    if inst:
        return inst
    cfg = row.get("config") or {}
    if isinstance(cfg, dict):
        sess = str((cfg.get("waha") or {}).get("session") or "").strip()
        if sess:
            return sess
    return str(row.get("canal_id") or "")  # fallback truthy p/ passar a checagem do enqueue


def _limit_sql(limit: int) -> str:
    return f" LIMIT {int(limit)}" if limit and limit > 0 else ""


def backfill_contatos(db, *, workspace: str | None, limit: int, where_extra: str, apply: bool) -> dict[str, int]:
    rows = db.execute(
        text(f"""
            SELECT DISTINCT ON (c.id)
                c.id::text AS contact_id, c.jid, c.workspace_id::text AS workspace_id,
                conv.canal_id::text AS canal_id, ce.evolution_instance_id, ce.config
            FROM public.crm_whatsapp_contatos c
            JOIN public.crm_whatsapp_conversas conv
              ON conv.contato_id = c.id AND conv.workspace_id = c.workspace_id
            JOIN public.canais_entrada ce ON ce.id = conv.canal_id
            WHERE {where_extra}
              AND (:ws IS NULL OR c.workspace_id = CAST(:ws AS uuid))
            ORDER BY c.id, conv.id
            {_limit_sql(limit)}
        """),
        {"ws": workspace, "pps": PPS_LIKE},
    ).mappings().all()

    enqueued = 0
    for row in rows:
        if not apply:
            continue
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_contatos
                SET avatar_url = NULL, avatar_fetched_at = NULL, updated_at = NOW()
                WHERE id = CAST(:cid AS uuid)
            """),
            {"cid": row["contact_id"]},
        )
        db.commit()
        if enqueue_contact_avatar_enrichment(
            db,
            workspace_id=row["workspace_id"],
            canal_id=row["canal_id"],
            contact_id=row["contact_id"],
            jid=row["jid"],
            instance=_resolve_instance(dict(row)),
        ):
            enqueued += 1
        db.commit()

    return {"candidatos": len(rows), "enfileirados": enqueued}


def backfill_grupos(db, *, workspace: str | None, limit: int, apply: bool, where_extra: str = "conv.group_avatar_url LIKE :pps") -> dict[str, int]:
    rows = db.execute(
        text(f"""
            SELECT conv.id::text AS conversa_id, conv.remote_jid AS group_jid,
                   conv.workspace_id::text AS workspace_id, conv.canal_id::text AS canal_id,
                   ce.evolution_instance_id, ce.config
            FROM public.crm_whatsapp_conversas conv
            JOIN public.canais_entrada ce ON ce.id = conv.canal_id
            WHERE conv.is_group = true AND conv.ativo = true
              AND {where_extra}
              AND (:ws IS NULL OR conv.workspace_id = CAST(:ws AS uuid))
            {_limit_sql(limit)}
        """),
        {"ws": workspace, "pps": PPS_LIKE},
    ).mappings().all()

    enqueued = 0
    for row in rows:
        if not apply:
            continue
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_conversas
                SET group_avatar_url = NULL, group_avatar_fetched_at = NULL, updated_at = NOW()
                WHERE id = CAST(:id AS uuid)
            """),
            {"id": row["conversa_id"]},
        )
        db.commit()
        if enqueue_group_enrichment(
            db,
            workspace_id=row["workspace_id"],
            canal_id=row["canal_id"],
            conversa_id=row["conversa_id"],
            group_jid=row["group_jid"],
            instance=_resolve_instance(dict(row)),
        ):
            enqueued += 1
        db.commit()

    return {"candidatos": len(rows), "enfileirados": enqueued}


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    apply = bool(args.apply)
    if apply and args.dry_run:
        print("Use --apply OU --dry-run, não os dois.")
        return 2
    mode = "APPLY" if apply else "DRY-RUN"

    db = SessionLocal()
    try:
        print(f"[backfill-avatares] modo={mode} workspace={args.workspace or 'TODOS'}")

        # 1) Contatos com avatar pps (expirado)
        pps_contatos = backfill_contatos(
            db, workspace=args.workspace, limit=args.limit,
            where_extra="c.avatar_url LIKE :pps",
            apply=apply,
        )
        print(f"  contatos pps:   candidatos={pps_contatos['candidatos']} enfileirados={pps_contatos['enfileirados']}")

        # 2) Grupos com avatar pps (expirado)
        grupos = backfill_grupos(db, workspace=args.workspace, limit=args.limit, apply=apply)
        print(f"  grupos pps:     candidatos={grupos['candidatos']} enfileirados={grupos['enfileirados']}")

        # 3) Opcional: contatos que ficaram NULL após tentativa (envenenados pelo TTL antigo)
        if args.include_null_tried:
            null_tried = backfill_contatos(
                db, workspace=args.workspace, limit=args.limit,
                where_extra="c.avatar_url IS NULL AND c.avatar_fetched_at IS NOT NULL",
                apply=apply,
            )
            print(f"  null-tried:     candidatos={null_tried['candidatos']} enfileirados={null_tried['enfileirados']}")

            # 4) Grupos sem foto que já foram marcados (fetched_at setado) — re-tentar com
            #    o novo fallback /user/avatar (a foto do grupo passa a ser recuperável).
            grupos_null = backfill_grupos(
                db, workspace=args.workspace, limit=args.limit, apply=apply,
                where_extra="conv.group_avatar_url IS NULL AND conv.group_avatar_fetched_at IS NOT NULL",
            )
            print(f"  grupos null:    candidatos={grupos_null['candidatos']} enfileirados={grupos_null['enfileirados']}")

        if not apply:
            print("  (dry-run: nada foi alterado — rode com --apply para aplicar)")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
