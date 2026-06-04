from __future__ import annotations

import argparse
from typing import Any

from sqlalchemy import text

from app.core.database import SessionLocal


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="List duplicated active WhatsApp conversations.")
    parser.add_argument("--workspace-id", help="Optional workspace UUID scope.")
    parser.add_argument("--canal-id", help="Optional canal UUID scope.")
    parser.add_argument("--limit", type=int, default=200, help="Maximum duplicated groups to print.")
    return parser.parse_args(argv)


def _build_query(args: argparse.Namespace) -> tuple[str, dict[str, Any]]:
    where = [
        "ativo = true",
        "COALESCE(status, '') <> 'resolvido'",
    ]
    params: dict[str, Any] = {"limit": args.limit}
    if args.workspace_id:
        where.append("workspace_id = CAST(:workspace_id AS uuid)")
        params["workspace_id"] = args.workspace_id
    if args.canal_id:
        where.append("canal_id = CAST(:canal_id AS uuid)")
        params["canal_id"] = args.canal_id

    query = f"""
        SELECT
            workspace_id::text AS workspace_id,
            canal_id::text AS canal_id,
            COALESCE(instance, '') AS instance,
            COALESCE(remote_jid, '') AS remote_jid,
            COUNT(*) AS total,
            MAX(updated_at) AS last_updated_at,
            ARRAY_AGG(id::text ORDER BY updated_at DESC, created_at DESC) AS conversation_ids,
            ARRAY_AGG(COALESCE(group_name, '') ORDER BY updated_at DESC, created_at DESC) AS group_names,
            ARRAY_AGG(COALESCE(status, '') ORDER BY updated_at DESC, created_at DESC) AS statuses
        FROM public.crm_whatsapp_conversas
        WHERE {" AND ".join(where)}
        GROUP BY workspace_id, canal_id, instance, remote_jid
        HAVING COUNT(*) > 1
        ORDER BY MAX(updated_at) DESC NULLS LAST, MAX(created_at) DESC NULLS LAST
        LIMIT :limit
    """
    return query, params


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    query, params = _build_query(args)

    with SessionLocal() as db:
        rows = db.execute(text(query), params).mappings().all()

    if not rows:
        print("no_duplicates_found=true")
        return 0

    for row in rows:
        conversation_ids = ", ".join(str(item) for item in row.get("conversation_ids") or [])
        group_names = ", ".join(filter(None, (str(item).strip() for item in row.get("group_names") or [])))
        statuses = ", ".join(str(item) for item in row.get("statuses") or [])
        print(
            "workspace_id={workspace_id} canal_id={canal_id} instance={instance} remote_jid={remote_jid} total={total} last_updated_at={last_updated_at} group_names=[{group_names}] statuses=[{statuses}] conversation_ids=[{conversation_ids}]".format(
                workspace_id=row["workspace_id"],
                canal_id=row["canal_id"],
                instance=row["instance"],
                remote_jid=row["remote_jid"],
                total=row["total"],
                last_updated_at=row["last_updated_at"],
                group_names=group_names,
                statuses=statuses,
                conversation_ids=conversation_ids,
            )
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
