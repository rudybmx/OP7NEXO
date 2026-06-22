"""Limpeza de contatos/conversas legados de @newsletter / @broadcast.

Contexto: a ingestão já ignora `@newsletter`/`@broadcast` via `is_ignored_whatsapp_jid`,
mas existem registros legados criados ANTES desse filtro (não recebem mais mensagens).
Este script faz soft-delete (ativo=false, deleted_at=NOW()) desses contatos e conversas.
Idempotente; só toca em quem ainda está ativo.

Uso:
    python -m scripts.limpar_newsletters_legado --dry-run     # só conta
    python -m scripts.limpar_newsletters_legado --apply
"""

from __future__ import annotations

import argparse

from sqlalchemy import text

from app.core.database import SessionLocal

# Mesmos sufixos de app.services.whatsapp_jid_filters (fonte única do conceito)
_LIKE = ("%@newsletter", "%@broadcast")


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Soft-delete de newsletters/broadcast legados.")
    p.add_argument("--dry-run", action="store_true", help="Só relata (default).")
    p.add_argument("--apply", action="store_true", help="Aplica o soft-delete.")
    return p.parse_args(argv)


def _count(db, table: str, col: str) -> int:
    return db.execute(
        text(f"""
            SELECT count(*) FROM public.{table}
            WHERE ativo = true AND ({col} LIKE :n OR {col} LIKE :b OR lower({col}) = 'status@broadcast')
        """),
        {"n": _LIKE[0], "b": _LIKE[1]},
    ).scalar() or 0


def _soft_delete(db, table: str, col: str) -> int:
    res = db.execute(
        text(f"""
            UPDATE public.{table}
            SET ativo = false, deleted_at = NOW(), updated_at = NOW()
            WHERE ativo = true AND ({col} LIKE :n OR {col} LIKE :b OR lower({col}) = 'status@broadcast')
        """),
        {"n": _LIKE[0], "b": _LIKE[1]},
    )
    return res.rowcount or 0


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    apply = bool(args.apply)
    if apply and args.dry_run:
        print("Use --apply OU --dry-run.")
        return 2

    db = SessionLocal()
    try:
        alvos = [
            ("crm_whatsapp_contatos", "jid"),
            ("crm_whatsapp_conversas", "remote_jid"),
        ]
        print(f"[limpar-newsletters] modo={'APPLY' if apply else 'DRY-RUN'}")
        for table, col in alvos:
            if apply:
                n = _soft_delete(db, table, col)
                db.commit()
                print(f"  {table}: soft-deleted={n}")
            else:
                print(f"  {table}: alvos={_count(db, table, col)}")
        if not apply:
            print("  (dry-run: nada alterado — rode com --apply)")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
