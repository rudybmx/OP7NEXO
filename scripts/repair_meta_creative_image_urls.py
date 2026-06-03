from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from sqlalchemy import text

from app.core.config import settings
from app.core.database import SessionLocal
from app.services.object_storage import creative_object_name, public_url, stat_object


def _resolve_scope_account_uuid(db, account_id: str) -> str | None:
    row = db.execute(
        text(
            """
            SELECT id::text
            FROM ads_accounts
            WHERE account_id = :account_id
              AND plataforma = 'meta'
            LIMIT 1
            """
        ),
        {"account_id": account_id},
    ).mappings().first()
    return row["id"] if row else None


def _load_legacy_creatives(db, ads_account_uuid: str | None = None) -> list[dict]:
    params: dict[str, str] = {}
    where = ["image_url_hq LIKE '%/meta/storage-assinado%'"]
    if ads_account_uuid:
        where.append("ads_account_id = CAST(:ads_account_id AS uuid)")
        params["ads_account_id"] = ads_account_uuid
    rows = db.execute(
        text(
            """
            SELECT
                creative_id,
                ads_account_id::text AS ads_account_id,
                image_url_hq,
                hq_source,
                last_seen_at AS updated_at
            FROM meta_creatives_catalog
            WHERE {where}
            ORDER BY last_seen_at DESC, creative_id
            """.format(where=" AND ".join(where))
        ),
        params,
    ).mappings().all()
    return [dict(row) for row in rows]


def _build_candidates(rows: Iterable[dict], bucket: str) -> tuple[list[dict], list[dict]]:
    candidates: list[dict] = []
    missing: list[dict] = []
    for row in rows:
        ads_account_uuid = str(row.get("ads_account_id") or "").strip()
        creative_id = str(row.get("creative_id") or "").strip()
        if not ads_account_uuid or not creative_id:
            missing.append({**row, "reason": "missing identifiers"})
            continue

        object_path = creative_object_name(ads_account_uuid, creative_id)
        try:
            stat = stat_object(bucket, object_path)
        except Exception:
            missing.append({**row, "object_path": object_path, "reason": "object_missing"})
            continue

        candidates.append(
            {
                "creative_id": creative_id,
                "ads_account_id": ads_account_uuid,
                "old_image_url_hq": row.get("image_url_hq"),
                "hq_source": row.get("hq_source"),
                "updated_at": row.get("updated_at"),
                "new_image_url_hq": public_url(bucket, object_path),
                "object_path": object_path,
                "content_length": getattr(stat, "size", None),
                "content_type": getattr(stat, "content_type", None),
            }
        )
    return candidates, missing


def _write_backup(path: Path, rows: Iterable[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True, default=str))
            handle.write("\n")


def _apply_candidates(db, candidates: Iterable[dict]) -> int:
    updated = 0
    for row in candidates:
        result = db.execute(
            text(
                """
                UPDATE meta_creatives_catalog
                SET image_url_hq = :new_image_url_hq,
                    hq_last_resolved_at = NOW()
                WHERE ads_account_id = CAST(:ads_account_id AS uuid)
                  AND creative_id = :creative_id
                  AND image_url_hq = :old_image_url_hq
                """
            ),
            {
                "ads_account_id": row["ads_account_id"],
                "creative_id": row["creative_id"],
                "old_image_url_hq": row["old_image_url_hq"],
                "new_image_url_hq": row["new_image_url_hq"],
            },
        )
        updated += int(getattr(result, "rowcount", 0) or 0)
    db.commit()
    return updated


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Repair legacy Meta Ads creative image URLs.")
    parser.add_argument("--account-id", help="Meta account_id (act_...) to scope the repair.")
    parser.add_argument("--apply", action="store_true", help="Apply the repair to the selected scope.")
    parser.add_argument("--apply-global", action="store_true", help="Apply the repair to all reparable creatives.")
    parser.add_argument("--confirm-global", action="store_true", help="Required together with --apply-global.")
    parser.add_argument("--backup-file", help="Logical backup path to write before applying.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    if args.apply_global and not args.confirm_global:
        raise SystemExit("--apply-global requires --confirm-global")
    if args.account_id and args.apply_global:
        raise SystemExit("--account-id cannot be combined with --apply-global")

    scope = "global" if args.apply_global else "account"
    if not args.account_id and not args.apply_global:
        scope = "dry-run"

    with SessionLocal() as db:
        ads_account_uuid = None
        if args.account_id:
            ads_account_uuid = _resolve_scope_account_uuid(db, args.account_id)
            if not ads_account_uuid:
                raise SystemExit(f"Meta account not found: {args.account_id}")

        raw_rows = _load_legacy_creatives(db, ads_account_uuid if args.account_id else None)
        candidates, missing = _build_candidates(raw_rows, settings.MINIO_BUCKET_CRIATIVOS)

        print(f"scope={scope}")
        print(f"legacy_rows={len(raw_rows)} reparable={len(candidates)} missing_object={len(missing)}")

        if missing:
            for row in missing:
                print(
                    "skip creative_id={creative_id} ads_account_id={ads_account_id} reason={reason}".format(
                        creative_id=row.get("creative_id"),
                        ads_account_id=row.get("ads_account_id"),
                        reason=row.get("reason"),
                    )
                )

        if not args.apply and not args.apply_global:
            return 0

        backup_path = Path(
            args.backup_file
            or f"repair_meta_creative_image_urls_{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.jsonl"
        )
        _write_backup(backup_path, candidates)
        print(f"backup={backup_path}")

        updated = _apply_candidates(db, candidates)
        print(f"updated={updated}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
