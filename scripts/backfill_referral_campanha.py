"""Backfill de origem de campanha (Click-to-WhatsApp Ads) em contatos.

Contexto: leads que chegaram clicando num anúncio do Instagram/Facebook trazem um
objeto `referral` no webhook. O canal **Meta Oficial** (Cloud API) só passou a
extrair esse referral recentemente — antes, o webhook bruto era salvo em
`crm_whatsapp_eventos.payload` mas os campos `meta_*`/`campanha_origem` do contato
ficavam vazios, então a tag de campanha não aparecia no topo da conversa.

Este script re-processa o payload bruto guardado, extrai o referral com o MESMO
parser do ingest (`extract_lead_origin`) e preenche os contatos que ainda estão
SEM origem. É idempotente: só toca contato sem origem e usa COALESCE — rodar de
novo não muda nada.

Uso:
    python -m scripts.backfill_referral_campanha --dry-run
    python -m scripts.backfill_referral_campanha --apply
    python -m scripts.backfill_referral_campanha --apply --workspace <uuid>
    python -m scripts.backfill_referral_campanha --apply --limit 500
"""

from __future__ import annotations

import argparse
from typing import Any, Iterator

from sqlalchemy import text

from app.core.database import SessionLocal
from app.services.lead_origin import extract_lead_origin, has_lead_origin


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill de origem de campanha (CTWA) em contatos.")
    parser.add_argument("--dry-run", action="store_true", help="Só relata o que faria (default).")
    parser.add_argument("--apply", action="store_true", help="Aplica os UPDATEs nos contatos sem origem.")
    parser.add_argument("--workspace", help="Filtra por workspace_id (UUID).")
    parser.add_argument("--limit", type=int, default=0, help="Máximo de eventos a varrer (0 = sem limite).")
    return parser.parse_args(argv)


def _extrair_pares(payload: dict[str, Any]) -> Iterator[tuple[str, dict[str, Any]]]:
    """Gera pares (jid_do_contato, origem) a partir do payload bruto de um evento.

    Cobre o formato do webhook Meta Cloud API (referral em
    entry[].changes[].value.messages[].referral) e um fallback genérico
    (Evolution/WAHA) reusando o mesmo parser do ingest.
    """
    if not isinstance(payload, dict):
        return

    # --- Formato Meta Cloud API ---
    for entry in payload.get("entry", []) or []:
        for change in (entry.get("changes", []) if isinstance(entry, dict) else []) or []:
            value = change.get("value", {}) if isinstance(change, dict) else {}
            for msg in (value.get("messages", []) if isinstance(value, dict) else []) or []:
                if not isinstance(msg, dict):
                    continue
                referral = msg.get("referral")
                jid = msg.get("from")
                if referral and jid:
                    texto = msg.get("text", {}).get("body", "") if isinstance(msg.get("text"), dict) else ""
                    origem = extract_lead_origin({}, {"referral": referral}, texto or "")
                    if has_lead_origin(origem):
                        yield str(jid), origem

    # --- Fallback genérico (Evolution/WAHA e outros) ---
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    jid = None
    if isinstance(data, dict):
        key = data.get("key") if isinstance(data.get("key"), dict) else {}
        jid = key.get("remoteJid") or data.get("remoteJid") or payload.get("remote_jid")
    if jid:
        message = data.get("message") if isinstance(data, dict) else None
        origem = extract_lead_origin(data if isinstance(data, dict) else {}, message, "")
        # só o ramo de referral interessa no backfill (não inventar campanha de texto orgânico aqui)
        if origem.get("meta_referral_json"):
            yield str(jid), origem


def _atualizar_contato(db, *, workspace_id: str, jid: str, origem: dict[str, Any]) -> int:
    """UPDATE idempotente: só toca contato SEM origem; COALESCE não sobrescreve.

    O `jid` do payload pode vir cru (Meta: telefone) ou com sufixo (@s.whatsapp.net);
    casa por jid exato, prefixo de jid ou telefone.
    """
    jid_bare = jid.split("@")[0]
    res = db.execute(
        text("""
            UPDATE public.crm_whatsapp_contatos AS c SET
                campanha_origem = COALESCE(c.campanha_origem, :campanha),
                utm_source = COALESCE(c.utm_source, :utm_source),
                utm_medium = COALESCE(c.utm_medium, :utm_medium),
                utm_campaign = COALESCE(c.utm_campaign, :utm_campaign),
                meta_ad_id = COALESCE(c.meta_ad_id, :meta_ad_id),
                meta_ctwa_clid = COALESCE(c.meta_ctwa_clid, :meta_ctwa_clid),
                meta_headline = COALESCE(c.meta_headline, :meta_headline),
                meta_body = COALESCE(c.meta_body, :meta_body),
                meta_source_url = COALESCE(c.meta_source_url, :meta_source_url),
                meta_media_type = COALESCE(c.meta_media_type, :meta_media_type),
                meta_image_url = COALESCE(c.meta_image_url, :meta_image_url),
                meta_referral_json = COALESCE(c.meta_referral_json, :meta_referral_json),
                updated_at = NOW()
            WHERE c.workspace_id = CAST(:ws AS uuid)
              AND c.meta_referral_json IS NULL
              AND c.campanha_origem IS NULL
              AND (c.jid = :jid OR c.jid LIKE :jidprefix OR c.telefone = :jid_bare OR c.jid = :jid_bare)
        """),
        {
            "ws": workspace_id,
            "jid": jid,
            "jid_bare": jid_bare,
            "jidprefix": jid_bare + "@%",
            "campanha": origem.get("campanha_origem"),
            "utm_source": origem.get("utm_source"),
            "utm_medium": origem.get("utm_medium"),
            "utm_campaign": origem.get("utm_campaign"),
            "meta_ad_id": origem.get("meta_ad_id"),
            "meta_ctwa_clid": origem.get("meta_ctwa_clid"),
            "meta_headline": origem.get("meta_headline"),
            "meta_body": origem.get("meta_body"),
            "meta_source_url": origem.get("meta_source_url"),
            "meta_media_type": origem.get("meta_media_type"),
            "meta_image_url": origem.get("meta_image_url"),
            "meta_referral_json": origem.get("meta_referral_json"),
        },
    )
    return res.rowcount or 0


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    apply = bool(args.apply)
    if apply and args.dry_run:
        print("Use --apply OU --dry-run, não os dois.")
        return 2
    mode = "APPLY" if apply else "DRY-RUN"

    limite = f" LIMIT {int(args.limit)}" if args.limit and args.limit > 0 else ""

    db = SessionLocal()
    try:
        print(f"[backfill-campanha] modo={mode} workspace={args.workspace or 'TODOS'}")

        eventos = db.execute(
            text(f"""
                SELECT id::text AS id, workspace_id::text AS workspace_id, payload
                FROM public.crm_whatsapp_eventos
                WHERE payload IS NOT NULL
                  AND payload::text ILIKE '%referral%'
                  AND (:ws IS NULL OR workspace_id = CAST(:ws AS uuid))
                ORDER BY recebido_em ASC NULLS LAST
                {limite}
            """),
            {"ws": args.workspace},
        ).mappings().all()

        eventos_com_referral = 0
        contatos_restaurados = 0
        amostras: list[str] = []

        for ev in eventos:
            payload = ev["payload"] or {}
            ws = ev["workspace_id"]
            pares = list(_extrair_pares(payload))
            if pares:
                eventos_com_referral += 1
            for jid, origem in pares:
                tocados = _atualizar_contato(db, workspace_id=ws, jid=jid, origem=origem)
                contatos_restaurados += tocados
                if tocados and len(amostras) < 10:
                    amostras.append(
                        f"    jid={jid} campanha={origem.get('campanha_origem')!r} "
                        f"headline={origem.get('meta_headline')!r} url={origem.get('meta_source_url')!r}"
                    )

        if apply:
            db.commit()
        else:
            db.rollback()

        print(f"  eventos varridos:        {len(eventos)}")
        print(f"  eventos com referral:    {eventos_com_referral}")
        print(f"  contatos restaurados:    {contatos_restaurados}")
        if amostras:
            print("  amostra (até 10):")
            for a in amostras:
                print(a)
        if not apply:
            print("  (dry-run: rollback — nada foi alterado. Rode com --apply para aplicar)")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
