from __future__ import annotations

import argparse
import copy
import json
import mimetypes
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import text

from app.core.database import SessionLocal
from app.services.object_storage import get_object, public_url, put_bytes
from app.services.whatsapp_crm_persistence import _build_message_hash
from app.services.waha_normalizer import _waha_short_msg_id

MEDIA_BUCKET = "whatsapp-media"


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Repair WAHA inbound message misroutes and media merges.")
    parser.add_argument("--message-id", help="Target crm_whatsapp_mensagens.id to inspect/repair.")
    parser.add_argument("--dry-run", action="store_true", help="Only print the repair plan without applying changes.")
    parser.add_argument("--apply", action="store_true", help="Apply the repair after the dry-run validation.")
    parser.add_argument("--backup-file", help="Logical backup path to write before applying.")
    parser.add_argument("--limit", type=int, default=100, help="Maximum candidates to scan when --message-id is omitted.")
    return parser.parse_args(argv)


def _json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


def _load_message(db, message_id: str) -> dict[str, Any] | None:
    row = db.execute(
        text("""
            SELECT *
            FROM public.crm_whatsapp_mensagens
            WHERE id = CAST(:message_id AS uuid)
        """),
        {"message_id": message_id},
    ).mappings().first()
    return dict(row) if row else None


def _load_event(db, event_id: str) -> dict[str, Any] | None:
    row = db.execute(
        text("""
            SELECT *
            FROM public.crm_whatsapp_eventos
            WHERE id = CAST(:event_id AS uuid)
        """),
        {"event_id": event_id},
    ).mappings().first()
    return dict(row) if row else None


def _load_conversation(db, *, workspace_id: str, canal_id: str, instance: str, remote_jid: str) -> dict[str, Any] | None:
    row = db.execute(
        text("""
            SELECT id, workspace_id, contato_id, canal_id, instance, remote_jid, group_name,
                   status, nao_lidas, ultima_mensagem, ultima_direcao, ultima_msg_at, updated_at
            FROM public.crm_whatsapp_conversas
            WHERE workspace_id = CAST(:workspace_id AS uuid)
              AND canal_id = CAST(:canal_id AS uuid)
              AND instance = :instance
              AND remote_jid = :remote_jid
              AND ativo = true
            ORDER BY updated_at DESC
            LIMIT 1
        """),
        {
            "workspace_id": workspace_id,
            "canal_id": canal_id,
            "instance": instance,
            "remote_jid": remote_jid,
        },
    ).mappings().first()
    return dict(row) if row else None


def _load_media(db, message_id: str) -> dict[str, Any] | None:
    row = db.execute(
        text("""
            SELECT *
            FROM public.crm_whatsapp_midia
            WHERE mensagem_id = CAST(:message_id AS uuid)
              AND ativo = true
            ORDER BY updated_at DESC, created_at DESC
            LIMIT 1
        """),
        {"message_id": message_id},
    ).mappings().first()
    return dict(row) if row else None


def _extract_media_caption(payload: dict[str, Any]) -> str:
    data = payload.get("data") if isinstance(payload, dict) else {}
    message = data.get("message") if isinstance(data, dict) else {}
    if not isinstance(message, dict):
        return ""
    for value in message.values():
        if not isinstance(value, dict):
            continue
        caption = value.get("caption") or value.get("text")
        if caption:
            return str(caption).strip()
    return ""


def _find_text_sibling_event(
    db,
    *,
    workspace_id: str,
    canal_id: str,
    instance: str,
    remote_jid: str,
    evolution_msg_id: str,
    exclude_event_id: str,
) -> dict[str, Any] | None:
    row = db.execute(
        text("""
            SELECT id, recebido_em, remote_jid, evolution_msg_id, payload
            FROM public.crm_whatsapp_eventos
            WHERE workspace_id = CAST(:workspace_id AS uuid)
              AND canal_id = CAST(:canal_id AS uuid)
              AND instance = :instance
              AND remote_jid = :remote_jid
              AND evolution_msg_id = :evolution_msg_id
              AND id <> CAST(:exclude_event_id AS uuid)
            ORDER BY recebido_em ASC
            LIMIT 1
        """),
        {
            "workspace_id": workspace_id,
            "canal_id": canal_id,
            "instance": instance,
            "remote_jid": remote_jid,
            "evolution_msg_id": evolution_msg_id,
            "exclude_event_id": exclude_event_id,
        },
    ).mappings().first()
    return dict(row) if row else None


def _scan_candidates(db, *, limit: int) -> list[dict[str, Any]]:
    rows = db.execute(
        text("""
            SELECT
                m.id::text AS message_id,
                m.workspace_id::text AS workspace_id,
                m.canal_id::text AS canal_id,
                m.instance,
                m.remote_jid AS message_remote_jid,
                m.conversa_id::text AS source_conversation_id,
                c.group_name AS source_group_name,
                m.evolution_msg_id AS stored_evolution_msg_id,
                m.message_type,
                m.conteudo,
                m.raw_event_id::text AS current_raw_event_id,
                m.media_status,
                m.media_error,
                m.payload AS message_payload,
                e.id::text AS event_id,
                e.remote_jid AS event_remote_jid,
                e.evolution_msg_id AS event_evolution_msg_id,
                e.payload AS event_payload,
                e.recebido_em AS event_received_em
            FROM public.crm_whatsapp_mensagens m
            JOIN public.crm_whatsapp_eventos e ON e.id = m.raw_event_id
            LEFT JOIN public.crm_whatsapp_conversas c ON c.id = m.conversa_id
            WHERE COALESCE(m.payload->>'provider', '') = 'whatsapp_waha'
              AND COALESCE(m.remote_jid, '') <> COALESCE(e.remote_jid, '')
            ORDER BY e.recebido_em DESC, m.updated_at DESC
            LIMIT :limit
        """),
        {"limit": limit},
    ).mappings().all()
    return [dict(row) for row in rows]


def _backup_rows(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(_json_dump(row))
            handle.write("\n")


def _ensure_copy_media(db, *, media_row: dict[str, Any], clone_message_id: str, destination_conversation_id: str) -> dict[str, Any]:
    source_object = str(media_row.get("minio_path") or "")
    if not source_object:
        raise RuntimeError("Midia sem minio_path")

    extension = Path(source_object).suffix
    if not extension:
        extension = mimetypes.guess_extension(str(media_row.get("mimetype") or "")) or ".bin"
    new_object = f"whatsapp/{media_row['workspace_id']}/{destination_conversation_id}/{clone_message_id}{extension}"
    if str(media_row.get("mensagem_id") or "") == clone_message_id and str(media_row.get("conversa_id") or "") == destination_conversation_id:
        return {**media_row, "minio_path": new_object, "url_publica": public_url(MEDIA_BUCKET, new_object)}

    content_stream = get_object(MEDIA_BUCKET, source_object)
    try:
        content = content_stream.read()
    finally:
        try:
            content_stream.close()
        finally:
            release = getattr(content_stream, "release_conn", None)
            if callable(release):
                release()

    put_bytes(
        MEDIA_BUCKET,
        new_object,
        content,
        str(media_row.get("mimetype") or "application/octet-stream"),
    )
    return {
        **media_row,
        "conversa_id": destination_conversation_id,
        "mensagem_id": clone_message_id,
        "minio_path": new_object,
        "url_publica": public_url(MEDIA_BUCKET, new_object),
        "filename": f"{clone_message_id}{extension}",
    }


def _insert_clone_message(
    db,
    *,
    source_message: dict[str, Any],
    source_event: dict[str, Any],
    destination_conversation: dict[str, Any],
    correct_message_id: str,
) -> str:
    payload = copy.deepcopy(source_event["payload"])
    data = payload.setdefault("data", {})
    key = data.setdefault("key", {})
    waha = data.setdefault("waha", {})
    key["id"] = correct_message_id
    key["remoteJid"] = destination_conversation["remote_jid"]
    waha["messageId"] = correct_message_id
    waha["chatId"] = destination_conversation["remote_jid"]
    clone_conteudo = _extract_media_caption(source_event["payload"]) or str(source_message.get("conteudo") or "").strip()
    if clone_conteudo in {"", ".", "[mídia]", "(mídia)", "mídia"}:
        clone_conteudo = "[mídia]"

    message_hash = _build_message_hash(
        workspace_id=str(source_message["workspace_id"]),
        canal_id=str(source_message["canal_id"]),
        instance=str(source_message["instance"] or ""),
        remote_jid=str(destination_conversation["remote_jid"]),
        evolution_msg_id=correct_message_id,
        direction=str(source_message["direcao"] or "entrada"),
        message_signature={},
    )

    existing = db.execute(
        text("""
            SELECT id::text
            FROM public.crm_whatsapp_mensagens
            WHERE workspace_id = CAST(:workspace_id AS uuid)
              AND canal_id = CAST(:canal_id AS uuid)
              AND instance = :instance
              AND remote_jid = :remote_jid
              AND evolution_msg_id = :evolution_msg_id
            LIMIT 1
        """),
        {
            "workspace_id": str(source_message["workspace_id"]),
            "canal_id": str(source_message["canal_id"]),
            "instance": str(source_message["instance"] or ""),
            "remote_jid": str(destination_conversation["remote_jid"]),
            "evolution_msg_id": correct_message_id,
        },
    ).mappings().first()
    if existing:
        return str(existing["id"])

    row = db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_mensagens (
                id, workspace_id, conversa_id, canal_id, raw_event_id, contato_id,
                evolution_msg_id, message_hash, instance, remote_jid, direcao,
                from_me, remetente_tipo, remetente_nome, conteudo, message_type,
                status, payload, tokens_estimados, embedding_status, enviada_em,
                recebida_em, created_at, ativo, deleted_at, wa_status, delivered_at,
                read_at, failed_reason, participant_jid, participant_name,
                is_mentioned, updated_at, media_status, media_error
            )
            VALUES (
                CAST(:id AS uuid), CAST(:workspace_id AS uuid), CAST(:conversa_id AS uuid), CAST(:canal_id AS uuid), CAST(:raw_event_id AS uuid), CAST(:contato_id AS uuid),
                :evolution_msg_id, :message_hash, :instance, :remote_jid, :direcao,
                :from_me, :remetente_tipo, :remetente_nome, :conteudo, :message_type,
                :status, CAST(:payload AS jsonb), :tokens_estimados, :embedding_status, :enviada_em,
                :recebida_em, :created_at, :ativo, :deleted_at, :wa_status, :delivered_at,
                :read_at, :failed_reason, :participant_jid, :participant_name,
                :is_mentioned, :updated_at, :media_status, :media_error
            )
            RETURNING id
        """),
        {
            "id": str(uuid.uuid4()),
            "workspace_id": str(source_message["workspace_id"]),
            "conversa_id": str(destination_conversation["id"]),
            "canal_id": str(source_message["canal_id"]),
            "raw_event_id": str(source_event["id"]),
            "contato_id": str(destination_conversation["contato_id"]),
            "evolution_msg_id": correct_message_id,
            "message_hash": message_hash,
            "instance": str(source_message["instance"] or ""),
            "remote_jid": str(destination_conversation["remote_jid"]),
            "direcao": str(source_message["direcao"] or "entrada"),
            "from_me": bool(source_message["from_me"]),
            "remetente_tipo": str(source_message["remetente_tipo"] or "contato"),
            "remetente_nome": source_message.get("remetente_nome"),
            "conteudo": clone_conteudo,
            "message_type": "imageMessage",
            "status": source_message.get("status"),
            "payload": _json_dump(payload),
            "tokens_estimados": source_message.get("tokens_estimados"),
            "embedding_status": source_message.get("embedding_status"),
            "enviada_em": source_message.get("enviada_em"),
            "recebida_em": source_event.get("recebido_em") or source_message.get("recebida_em"),
            "created_at": source_event.get("recebido_em") or source_message.get("created_at") or datetime.now(timezone.utc),
            "ativo": True,
            "deleted_at": None,
            "wa_status": source_message.get("wa_status"),
            "delivered_at": source_message.get("delivered_at"),
            "read_at": source_message.get("read_at"),
            "failed_reason": source_message.get("failed_reason"),
            "participant_jid": source_message.get("participant_jid"),
            "participant_name": source_message.get("participant_name"),
            "is_mentioned": bool(source_message.get("is_mentioned")),
            "updated_at": source_event.get("recebido_em") or source_message.get("updated_at") or datetime.now(timezone.utc),
            "media_status": "ready",
            "media_error": None,
        },
    ).fetchone()
    return str(row[0])


def _restore_source_message(
    db,
    *,
    source_message: dict[str, Any],
    source_event: dict[str, Any],
    source_text_event: dict[str, Any],
) -> None:
    payload = copy.deepcopy(source_text_event["payload"])
    data = payload.setdefault("data", {})
    key = data.setdefault("key", {})
    key["remoteJid"] = str(source_message["remote_jid"])
    key["id"] = str(source_message["evolution_msg_id"])
    data["waha"] = data.get("waha") or {}

    db.execute(
        text("""
            UPDATE public.crm_whatsapp_mensagens
            SET raw_event_id = CAST(:raw_event_id AS uuid),
                payload = CAST(:payload AS jsonb),
                message_type = :message_type,
                conteudo = :conteudo,
                media_status = NULL,
                media_error = NULL,
                updated_at = NOW()
            WHERE id = CAST(:message_id AS uuid)
        """),
        {
            "raw_event_id": str(source_text_event["id"]),
            "payload": _json_dump(payload),
            "message_type": "conversation",
            "conteudo": source_text_event["payload"].get("data", {}).get("message", {}).get("conversation", source_message.get("conteudo")),
            "message_id": str(source_message["id"]),
        },
    )


def _update_destination_conversation(db, *, destination_conversation: dict[str, Any], source_event: dict[str, Any], preview_text: str) -> None:
    current_last = destination_conversation.get("ultima_msg_at")
    received_at = source_event.get("recebido_em")
    if current_last and received_at and received_at <= current_last:
        return
    db.execute(
        text("""
            UPDATE public.crm_whatsapp_conversas
            SET ultima_mensagem = :ultima_mensagem,
                ultima_direcao = 'entrada',
                ultima_msg_at = :ultima_msg_at,
                last_inbound_at = :last_inbound_at,
                nao_lidas = COALESCE(nao_lidas, 0) + 1,
                updated_at = NOW()
            WHERE id = CAST(:conversation_id AS uuid)
        """),
        {
            "ultima_mensagem": preview_text[:500],
            "ultima_msg_at": received_at or datetime.now(timezone.utc),
            "last_inbound_at": received_at or datetime.now(timezone.utc),
            "conversation_id": str(destination_conversation["id"]),
        },
    )


def _move_media(
    db,
    *,
    source_message: dict[str, Any],
    clone_message_id: str,
    destination_conversation: dict[str, Any],
) -> dict[str, Any] | None:
    media_row = _load_media(db, str(source_message["id"]))
    if not media_row:
        return None
    updated_media = _ensure_copy_media(
        db,
        media_row=media_row,
        clone_message_id=clone_message_id,
        destination_conversation_id=str(destination_conversation["id"]),
    )
    db.execute(
        text("""
            UPDATE public.crm_whatsapp_midia
            SET conversa_id = CAST(:conversa_id AS uuid),
                workspace_id = CAST(:workspace_id AS uuid),
                canal_id = CAST(:canal_id AS uuid),
                mensagem_id = CAST(:mensagem_id AS uuid),
                minio_path = :minio_path,
                url_publica = :url_publica,
                filename = :filename,
                updated_at = NOW()
            WHERE id = CAST(:media_id AS uuid)
        """),
        {
            "conversa_id": str(destination_conversation["id"]),
            "workspace_id": str(source_message["workspace_id"]),
            "canal_id": str(source_message["canal_id"]),
            "mensagem_id": clone_message_id,
            "minio_path": updated_media["minio_path"],
            "url_publica": updated_media["url_publica"],
            "filename": updated_media.get("filename") or media_row.get("filename"),
            "media_id": str(media_row["id"]),
        },
    )
    return updated_media


def _render_candidate(candidate: dict[str, Any]) -> str:
    return (
        "message_id={message_id} source_remote_jid={message_remote_jid} event_remote_jid={event_remote_jid} "
        "source_conversation_id={source_conversation_id} source_group_name={source_group_name!r} "
        "event_id={event_id} raw_event_id={current_raw_event_id} "
        "stored_evolution_msg_id={stored_evolution_msg_id} event_evolution_msg_id={event_evolution_msg_id} "
        "message_type={message_type} conteudo={conteudo!r} media_status={media_status!r}"
    ).format(**candidate)


def repair_candidate(db, candidate: dict[str, Any]) -> dict[str, Any]:
    source_message = _load_message(db, candidate["message_id"])
    if not source_message:
        raise RuntimeError(f"Mensagem não encontrada: {candidate['message_id']}")

    source_event = _load_event(db, candidate["event_id"])
    if not source_event:
        raise RuntimeError(f"Evento não encontrado: {candidate['event_id']}")

    source_text_event = _find_text_sibling_event(
        db,
        workspace_id=candidate["workspace_id"],
        canal_id=candidate["canal_id"],
        instance=str(source_message["instance"] or ""),
        remote_jid=str(source_message["remote_jid"] or ""),
        evolution_msg_id=str(source_message["evolution_msg_id"] or ""),
        exclude_event_id=candidate["event_id"],
    )
    if not source_text_event:
        raise RuntimeError("Evento texto de origem não encontrado para restaurar a mensagem original")

    destination_remote_jid = str(source_event.get("remote_jid") or "")
    destination_conversation = _load_conversation(
        db,
        workspace_id=candidate["workspace_id"],
        canal_id=candidate["canal_id"],
        instance=str(source_message["instance"] or ""),
        remote_jid=destination_remote_jid,
    )
    if not destination_conversation:
        raise RuntimeError(f"Conversa destino não encontrada para remote_jid={destination_remote_jid}")

    correct_message_id = _waha_short_msg_id(
        str((source_event.get("payload") or {}).get("data", {}).get("waha", {}).get("fullMessageId") or "")
    )
    if not correct_message_id:
        raise RuntimeError("Não foi possível derivar o messageId correto da WAHA")

    destination_preview = _extract_media_caption(source_event["payload"]) or str(source_message.get("conteudo") or "").strip()
    if destination_preview in {"", ".", "[mídia]", "(mídia)", "mídia"}:
        destination_preview = "[mídia]"

    existing_clone = db.execute(
        text("""
            SELECT id::text AS id
            FROM public.crm_whatsapp_mensagens
            WHERE workspace_id = CAST(:workspace_id AS uuid)
              AND canal_id = CAST(:canal_id AS uuid)
              AND instance = :instance
              AND remote_jid = :remote_jid
              AND evolution_msg_id = :evolution_msg_id
            LIMIT 1
        """),
        {
            "workspace_id": candidate["workspace_id"],
            "canal_id": candidate["canal_id"],
            "instance": str(source_message["instance"] or ""),
            "remote_jid": destination_remote_jid,
            "evolution_msg_id": correct_message_id,
        },
    ).mappings().first()

    if existing_clone:
        clone_message_id = str(existing_clone["id"])
    else:
        clone_message_id = _insert_clone_message(
            db,
            source_message=source_message,
            source_event=source_event,
            destination_conversation=destination_conversation,
            correct_message_id=correct_message_id,
        )

    _restore_source_message(
        db,
        source_message=source_message,
        source_event=source_event,
        source_text_event=source_text_event,
    )
    moved_media = _move_media(
        db,
        source_message=source_message,
        clone_message_id=clone_message_id,
        destination_conversation=destination_conversation,
    )
    _update_destination_conversation(
        db,
        destination_conversation=destination_conversation,
        source_event=source_event,
        preview_text=destination_preview,
    )

    db.commit()

    return {
        "source_message_id": source_message["id"],
        "source_event_id": source_event["id"],
        "source_text_event_id": source_text_event["id"],
        "destination_conversation_id": destination_conversation["id"],
        "source_conversation_id": source_message["conversa_id"],
        "source_group_name": candidate.get("source_group_name"),
        "destination_group_name": destination_conversation.get("group_name"),
        "destination_remote_jid": destination_remote_jid,
        "clone_message_id": clone_message_id,
        "correct_message_id": correct_message_id,
        "source_media_id": moved_media["id"] if moved_media else None,
        "source_media_path": moved_media.get("minio_path") if moved_media else None,
        "source_media_url": moved_media.get("url_publica") if moved_media else None,
    }


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    if args.apply and args.dry_run:
        raise SystemExit("--apply and --dry-run are mutually exclusive")
    with SessionLocal() as db:
        if args.message_id:
            candidate_rows = []
            row = db.execute(
                text("""
                    SELECT
                        m.id::text AS message_id,
                        m.workspace_id::text AS workspace_id,
                        m.canal_id::text AS canal_id,
                        m.instance,
                        m.remote_jid AS message_remote_jid,
                        m.conversa_id::text AS source_conversation_id,
                        c.group_name AS source_group_name,
                        m.evolution_msg_id AS stored_evolution_msg_id,
                        m.message_type,
                        m.conteudo,
                        m.raw_event_id::text AS current_raw_event_id,
                        m.media_status,
                        m.media_error,
                        e.id::text AS event_id,
                        e.remote_jid AS event_remote_jid,
                        e.evolution_msg_id AS event_evolution_msg_id,
                        e.payload AS event_payload,
                        e.recebido_em AS event_received_em
                    FROM public.crm_whatsapp_mensagens m
                    JOIN public.crm_whatsapp_eventos e ON e.id = m.raw_event_id
                    LEFT JOIN public.crm_whatsapp_conversas c ON c.id = m.conversa_id
                    WHERE m.id = CAST(:message_id AS uuid)
                """),
                {"message_id": args.message_id},
            ).mappings().first()
            if row:
                candidate = dict(row)
                if candidate.get("message_remote_jid") != candidate.get("event_remote_jid"):
                    candidate_rows = [candidate]
                else:
                    print("no_remote_jid_mismatch=true")
        else:
            candidate_rows = _scan_candidates(db, limit=args.limit)

        print(f"candidate_count={len(candidate_rows)}")
        for candidate in candidate_rows:
            print(_render_candidate(candidate))

        if not args.apply or args.dry_run:
            return 0

        if not args.message_id:
            raise SystemExit("--apply requires --message-id to keep the repair scoped")

        if not candidate_rows:
            raise SystemExit("Nenhum candidato encontrado para aplicar")

        candidate = candidate_rows[0]
        backup_path = Path(
            args.backup_file or f"repair_waha_inbound_misroute_{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.jsonl"
        )
        _backup_rows(backup_path, candidate_rows)
        print(f"backup={backup_path}")

        result = repair_candidate(db, candidate)
        print(_json_dump(result))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
