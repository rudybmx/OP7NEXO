"""Limpa as mensagens-lixo de reação (message_type='reactionMessage') do histórico.

CONTEXTO: antes do suporte a reações, uma reação recebida era persistida como se
fosse uma MENSAGEM normal (conteudo '[mídia]'/vazio), poluindo a conversa. O código
novo intercepta reactionMessage e grava em crm_whatsapp_reacoes; este script corrige
o passado.

ESTE SCRIPT (corretivo):
  - Acha as mensagens ATIVAS com message_type='reactionMessage'.
  - Para cada uma: extrai do payload o alvo (reactionMessage.key.id), o emoji
    (reactionMessage.text) e quem reagiu (outer key participant/remoteJid/fromMe).
  - Se houver emoji, faz UPSERT em crm_whatsapp_reacoes (ON CONFLICT DO NOTHING)
    quando o alvo existir; depois SOFT-DELETE (ativo=false) da linha-lixo.

SEGURANÇA:
  - --dry-run é o DEFAULT: roda tudo numa transação e faz ROLLBACK, imprimindo o plano.
  - --apply commita.

USO:
  python scripts/limpar_reactionmessage_lixo.py            # dry-run
  python scripts/limpar_reactionmessage_lixo.py --apply    # aplica
  # filtro opcional: --workspace-id <uuid>
"""
from __future__ import annotations

import argparse
import os
import sys

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session


def _extrair(payload: dict) -> tuple[str, str, str, bool] | None:
    """Retorna (target_id, emoji, reactor_jid, from_me) ou None."""
    if not isinstance(payload, dict):
        return None
    root = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    message = root.get("message") or root.get("Message") or {}
    reaction = message.get("reactionMessage") if isinstance(message, dict) else None
    if not isinstance(reaction, dict):
        return None
    tkey = reaction.get("key") if isinstance(reaction.get("key"), dict) else {}
    target_id = str(tkey.get("id") or "").strip()
    if not target_id:
        return None
    emoji = str(reaction.get("text") or "")
    okey = root.get("key") if isinstance(root.get("key"), dict) else {}
    from_me = bool(okey.get("fromMe"))
    reactor = "me" if from_me else str(okey.get("participant") or okey.get("remoteJid") or "")
    return target_id, emoji, reactor, from_me


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="commita (default: dry-run)")
    ap.add_argument("--workspace-id", default=None)
    args = ap.parse_args()

    engine = create_engine(os.environ["DATABASE_URL"])
    filtro_ws = ""
    params: dict = {}
    if args.workspace_id:
        filtro_ws = "AND workspace_id = CAST(:ws AS uuid)"
        params["ws"] = args.workspace_id

    migradas = lixo = sem_alvo = 0
    with Session(engine) as db:
        rows = db.execute(
            text(f"""
                SELECT id, workspace_id, canal_id, instance, conversa_id, payload
                FROM public.crm_whatsapp_mensagens
                WHERE message_type = 'reactionMessage' AND ativo = true {filtro_ws}
            """),
            params,
        ).mappings().all()

        print(f"reactionMessage-lixo encontradas: {len(rows)}")
        for r in rows:
            extr = _extrair(r["payload"] or {})
            if not extr:
                print(f"  [skip] {r['id']} payload sem reactionMessage")
                continue
            target_id, emoji, reactor, from_me = extr

            alvo = db.execute(
                text("""
                    SELECT id, conversa_id FROM public.crm_whatsapp_mensagens
                    WHERE workspace_id = :ws AND instance = :inst AND evolution_msg_id = :tid
                    LIMIT 1
                """),
                {"ws": str(r["workspace_id"]), "inst": r["instance"], "tid": target_id},
            ).mappings().first()
            if not alvo:
                sem_alvo += 1

            if emoji.strip() and reactor:
                db.execute(
                    text("""
                        INSERT INTO public.crm_whatsapp_reacoes
                          (workspace_id, canal_id, conversa_id, mensagem_id, instance,
                           target_evolution_msg_id, reactor_jid, from_me, emoji, reacted_at, created_at, updated_at)
                        VALUES (CAST(:ws AS uuid), CAST(:canal AS uuid), CAST(:conv AS uuid),
                                CAST(:msg AS uuid), :inst, :tid, :rj, :fromme, :emoji, now(), now(), now())
                        ON CONFLICT (workspace_id, canal_id, instance, target_evolution_msg_id, reactor_jid)
                        DO NOTHING
                    """),
                    {
                        "ws": str(r["workspace_id"]),
                        "canal": str(r["canal_id"]) if r["canal_id"] else None,
                        "conv": str(alvo["conversa_id"]) if alvo and alvo["conversa_id"] else None,
                        "msg": str(alvo["id"]) if alvo and alvo["id"] else None,
                        "inst": r["instance"],
                        "tid": target_id,
                        "rj": reactor,
                        "fromme": from_me,
                        "emoji": emoji.strip(),
                    },
                )
                migradas += 1

            db.execute(
                text("UPDATE public.crm_whatsapp_mensagens SET ativo = false, deleted_at = now() WHERE id = :id"),
                {"id": str(r["id"])},
            )
            lixo += 1

        print(f"\nplano: soft-delete {lixo} linhas-lixo | reações migradas {migradas} | alvo ausente {sem_alvo}")
        if args.apply:
            db.commit()
            print("APPLY: commitado.")
        else:
            db.rollback()
            print("DRY-RUN: rollback (use --apply para aplicar).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
