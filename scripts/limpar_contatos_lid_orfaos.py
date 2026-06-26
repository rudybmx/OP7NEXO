"""Soft-delete de contatos @lid órfãos (sem número e sem conversa) de um workspace.

Contexto: contatos `<LID>@lid` criados por MENÇÕES em grupos (o nome vem da menção),
mas que NUNCA tiveram número de telefone nem conversa/atendimento — "contatos-fantasma",
sujeira antiga da lista de contatos. Este script faz soft-delete (ativo=false,
deleted_at=NOW()) desses contatos, POR workspace. Idempotente; só toca em quem ainda
está ativo. NÃO toca: grupos (@g.us), @lid COM conversa, nem contatos com número
(@s.whatsapp.net ou telefone preenchido).

Reversível: para desfazer, reativar pelos `deleted_at` do momento do apply.

Uso:
    python -m scripts.limpar_contatos_lid_orfaos --workspace <uuid> --dry-run   # lista, não altera
    python -m scripts.limpar_contatos_lid_orfaos --workspace <uuid> --apply
"""

from __future__ import annotations

import argparse

from sqlalchemy import text

from app.core.database import SessionLocal

# Filtro dos alvos (ponto único de verdade): @lid, sem número, sem conversa.
_WHERE = """
    ativo = true
    AND workspace_id = CAST(:ws AS uuid)
    AND jid LIKE '%@lid'
    AND COALESCE(BTRIM(telefone), '') = ''
    AND NOT EXISTS (
        SELECT 1 FROM public.crm_whatsapp_conversas cv
        WHERE cv.contato_id = public.crm_whatsapp_contatos.id
    )
"""


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Soft-delete de contatos @lid órfãos (sem número e sem conversa) por workspace."
    )
    p.add_argument("--workspace", required=True, help="UUID do workspace.")
    p.add_argument("--dry-run", action="store_true", help="Só relata (default).")
    p.add_argument("--apply", action="store_true", help="Aplica o soft-delete.")
    return p.parse_args(argv)


def _listar(db, ws: str) -> list:
    return db.execute(
        text(
            f"SELECT jid, nome, push_name FROM public.crm_whatsapp_contatos "
            f"WHERE {_WHERE} ORDER BY nome NULLS LAST"
        ),
        {"ws": ws},
    ).fetchall()


def _soft_delete(db, ws: str) -> int:
    res = db.execute(
        text(
            f"UPDATE public.crm_whatsapp_contatos "
            f"SET ativo = false, deleted_at = NOW(), updated_at = NOW() WHERE {_WHERE}"
        ),
        {"ws": ws},
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
        alvos = _listar(db, args.workspace)
        print(
            f"[limpar-lid-orfaos] workspace={args.workspace} "
            f"modo={'APPLY' if apply else 'DRY-RUN'} alvos={len(alvos)}"
        )
        for jid, nome, push in alvos:
            print(f"  {jid:<40} nome={nome!r} push={push!r}")
        if apply:
            n = _soft_delete(db, args.workspace)
            db.commit()
            print(f"  ✅ soft-deleted={n}")
        else:
            print("  (dry-run: nada alterado — rode com --apply)")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
