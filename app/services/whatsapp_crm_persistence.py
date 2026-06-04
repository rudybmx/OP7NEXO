from __future__ import annotations

import hashlib
import json
import logging
import re
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.canal_entrada import CanalEntrada
from app.services.lead_origin import extract_lead_origin, has_lead_origin
from app.services.redis_pub import publish_whatsapp_event
from app.services.whatsapp_media import enqueue_inbound_media_download
from app.services.whatsapp_normalizer import (
    CONNECTION_EVENT_TYPES,
    MESSAGE_EVENT_TYPES,
    RECEIPT_EVENT_TYPES,
    build_evolution_message_signature,
    normalize_connection_event,
    normalize_event_type,
    normalize_message_event,
    normalize_receipt_event,
    payload_message,
)

logger = logging.getLogger(__name__)


_INVALID_DISPLAY_NAMES = {"contato", "contato whatsapp"}


def _digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def _is_jid_like(value: str) -> bool:
    text = str(value or "").strip().lower()
    return "@" in text and (
        text.endswith("@s.whatsapp.net")
        or text.endswith("@c.us")
        or text.endswith("@g.us")
        or text.endswith("@lid")
    )


def _format_phone_display(value: str) -> str | None:
    digits = _digits(value)
    if not digits.startswith("55"):
        return None
    if len(digits) == 13:
        return f"+55 {digits[2:4]} {digits[4:9]}-{digits[9:]}"
    if len(digits) == 12:
        return f"+55 {digits[2:4]} {digits[4:8]}-{digits[8:]}"
    return None


def _channel_own_identity(canal: CanalEntrada) -> dict[str, set[str] | str]:
    cfg = getattr(canal, "config", None) or {}
    waha = cfg.get("waha") if isinstance(cfg, dict) else {}
    if not isinstance(waha, dict):
        waha = {}
    own_names = {
        str(value).strip().casefold()
        for value in (
            waha.get("push_name"),
            waha.get("pushName"),
            waha.get("name"),
            waha.get("session_name"),
            waha.get("sessionName"),
            waha.get("session"),
        )
        if str(value or "").strip()
    }
    return {
        "phone": str(getattr(canal, "numero_telefone", "") or ""),
        "names": own_names,
    }


def _valid_display_name(
    value: str | None,
    *,
    jid: str = "",
    own_identity: dict[str, set[str] | str] | None = None,
) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if text.casefold() in _INVALID_DISPLAY_NAMES:
        return ""
    if _is_jid_like(text) or "@lid" in text.lower():
        return ""

    own_names = set()
    own_phone = ""
    if own_identity:
        names = own_identity.get("names")
        if isinstance(names, set):
            own_names = names
        phone = own_identity.get("phone")
        if isinstance(phone, str):
            own_phone = phone
    if text.casefold() in own_names:
        return ""

    text_digits = _digits(text)
    jid_digits = _digits(jid.split("@", 1)[0] if jid else "")
    own_phone_digits = _digits(own_phone)
    compact = re.sub(r"[\s()+.-]", "", text)
    if text_digits and compact == text_digits:
        return ""
    if jid_digits and text_digits and text_digits == jid_digits:
        return ""
    if own_phone_digits and text_digits and text_digits == own_phone_digits:
        return ""
    return text


def _message_sender_display_name(*, push_name: str, participant_jid: str, remote_jid: str) -> str:
    clean_name = _valid_display_name(push_name, jid=participant_jid or remote_jid)
    if clean_name:
        return clean_name
    formatted = _format_phone_display((participant_jid or remote_jid).split("@", 1)[0])
    return formatted or "Contato"


def process_evolution_message(
    db: Session,
    canal: CanalEntrada,
    data: dict[str, Any],
    *,
    raw_event_id: str | uuid.UUID | None = None,
) -> dict[str, Any] | None:
    normalized = normalize_message_event(data, instance=canal.evolution_instance_id)
    message = payload_message(data) or data.get("message", {})
    remote_jid = normalized.remote_jid
    participant_jid = normalized.participant_jid
    from_me = normalized.from_me
    evolution_msg_id = normalized.evolution_msg_id
    own_identity = _channel_own_identity(canal)
    push_name = _valid_display_name(
        normalized.push_name,
        jid=normalized.participant_jid if normalized.is_group else normalized.remote_jid,
        own_identity=own_identity,
    )
    message_type = normalized.message_type
    recebida_em = normalized.received_at
    instance = canal.evolution_instance_id or normalized.instance or "opcl"
    payload_root = normalized.raw if isinstance(normalized.raw, dict) else {}
    waha_payload = payload_root.get("waha") if isinstance(payload_root.get("waha"), dict) else {}
    provider = str(
        payload_root.get("provider")
        or ("whatsapp_waha" if getattr(canal, "tipo", "") == "whatsapp_waha" else "whatsapp_evolution")
    )
    waha_full_message_id = str(waha_payload.get("fullMessageId") or "") if isinstance(waha_payload, dict) else ""
    waha_chat_id = str(waha_payload.get("chatId") or remote_jid) if isinstance(waha_payload, dict) else remote_jid
    media_payload = normalized.media.model_dump()
    should_enqueue_media = bool(normalized.media.is_media)
    media_status = None
    media_error = None
    if normalized.media.is_media:
        if should_enqueue_media:
            media_status = "pending"
        else:
            media_status = "error"
            media_error = normalized.media.error or "Mídia sem URL/base64 no payload do provedor"
    is_group = normalized.is_group
    sender_name = push_name
    msg_text = normalized.text
    is_mentioned = normalized.is_channel_mentioned(canal.numero_telefone)
    direcao = "saida" if from_me else "entrada"
    workspace_id = str(canal.workspace_id)
    canal_id = str(canal.id)
    raw_event_id_str = str(raw_event_id) if raw_event_id else None
    message_signature = build_evolution_message_signature(normalized)
    message_hash = _build_message_hash(
        workspace_id=workspace_id,
        canal_id=canal_id,
        instance=instance,
        evolution_msg_id=evolution_msg_id,
        direction=direcao,
        remote_jid=remote_jid,
        message_signature=message_signature,
    )

    logger.info(
        "[webhook-process] remote_jid=%s is_group=%s participant=%s from_me=%s msg_id=%s msg_type=%s",
        remote_jid,
        is_group,
        participant_jid,
        from_me,
        evolution_msg_id,
        message_type,
    )

    lead_origem = extract_lead_origin(data, message, msg_text)
    logger.info("[webhook-process] texto_extraido=%s remote_jid=%s is_mentioned=%s", repr(msg_text), remote_jid, is_mentioned)

    if not remote_jid or not msg_text:
        logger.info("[webhook-process] ABORTANDO: remote_jid ou msg_text vazio")
        return None

    duplicate = _find_existing_message(
        db,
        workspace_id=workspace_id,
        canal_id=canal_id,
        instance=instance,
        evolution_msg_id=evolution_msg_id,
        remote_jid=remote_jid,
        message_hash=message_hash,
    )
    if duplicate and not from_me:
        if normalized.media.is_media:
            _merge_message_media_fields(
                db,
                mensagem_id=str(duplicate["id"]),
                raw_event_id=raw_event_id_str,
                message_type=message_type,
                text_value=msg_text,
                payload=data,
                media_status=media_status,
                media_error=media_error,
            )
            db.commit()
        logger.info("[webhook-process] Mensagem duplicada ignorada antes de atualizar conversa: %s", evolution_msg_id or message_hash)
        return _result(
            is_media=should_enqueue_media,
            mensagem_id=str(duplicate["id"]),
            conversa_id=str(duplicate["conversa_id"]),
            evolution_msg_id=evolution_msg_id,
            message_type=message_type,
            from_me=from_me,
            is_group=is_group,
            remote_jid=remote_jid,
            participant_jid=participant_jid,
            instance=instance,
            workspace_id=workspace_id,
            media_payload=media_payload,
            provider=provider,
            full_message_id=waha_full_message_id,
            chat_id=waha_chat_id,
            participant_name=sender_name if is_group else "",
        )

    sender_pn = normalized.sender_pn
    numero_evo = sender_pn if sender_pn else (remote_jid if "@s.whatsapp.net" in remote_jid else "")
    resolved_remote_jid, contato_id_existente = _resolve_lid_contact(
        db,
        instance=instance,
        remote_jid=remote_jid,
        sender_pn=sender_pn,
        is_lid=normalized.is_lid,
    )

    if is_group and participant_jid:
        _upsert_participant_contact(
            db,
            workspace_id=workspace_id,
            participant_jid=participant_jid,
            sender_name=sender_name,
        )

    contato_id = _upsert_contact(
        db,
        workspace_id=workspace_id,
        upsert_jid=resolved_remote_jid,
        remote_jid=remote_jid,
        sender_pn=sender_pn,
        numero_evo=numero_evo,
        # Para fromMe=True, push_name é o nome da nossa conta — não sobrescrever o contato
        push_name=None if from_me else push_name,
        lead_origin=lead_origem,
        existing_contact_id=contato_id_existente,
    )

    # Enfileirar busca de avatar e telefone @lid (best-effort, fora do fluxo crítico)
    try:
        from app.services.contact_avatar_enrichment import (
            enqueue_contact_avatar_enrichment,
            enqueue_lid_phone_enrichment,
        )
        enqueue_contact_avatar_enrichment(
            db,
            workspace_id=workspace_id,
            canal_id=canal_id,
            contact_id=str(contato_id),
            jid=resolved_remote_jid,
            instance=instance,
        )
        if "@lid" in resolved_remote_jid:
            enqueue_lid_phone_enrichment(
                db,
                workspace_id=workspace_id,
                canal_id=canal_id,
                contact_id=str(contato_id),
                jid=resolved_remote_jid,
                instance=instance,
            )
    except Exception:
        logger.warning("[avatar-enqueue] falha ao enfileirar workspace=%s", str(workspace_id)[:8])

    conversa_id = _upsert_conversation(
        db,
        workspace_id=workspace_id,
        canal_id=canal_id,
        contato_id=str(contato_id),
        instance=instance,
        remote_jid=resolved_remote_jid,
        is_group=is_group,
        message_text=msg_text,
        direction=direcao,
        received_at=recebida_em,
    )

    # Enfileirar enriquecimento de grupo (best-effort)
    if is_group:
        try:
            from app.services.contact_avatar_enrichment import enqueue_group_enrichment
            enqueue_group_enrichment(
                db,
                workspace_id=workspace_id,
                canal_id=canal_id,
                conversa_id=str(conversa_id),
                group_jid=resolved_remote_jid,
                instance=instance,
            )
        except Exception:
            logger.warning("[group-enqueue] falha ao enfileirar workspace=%s", str(workspace_id)[:8])

    mensagem_id = _upsert_message(
        db,
        workspace_id=workspace_id,
        canal_id=canal_id,
        raw_event_id=raw_event_id_str,
        conversa_id=str(conversa_id),
        contato_id=str(contato_id),
        evolution_msg_id=evolution_msg_id,
        message_hash=message_hash,
        instance=instance,
        remote_jid=remote_jid,
        direction=direcao,
        from_me=from_me,
        push_name=push_name,
        participant_jid=participant_jid,
        sender_name=sender_name,
        is_group=is_group,
        is_mentioned=is_mentioned,
        text_value=msg_text,
        message_type=message_type,
        payload=data,
        received_at=recebida_em,
        media_status=media_status,
        media_error=media_error,
        message_signature=message_signature,
    )

    if has_lead_origin(lead_origem):
        _record_lead_origin_event(
            db,
            workspace_id=workspace_id,
            canal_id=canal_id,
            contato_id=str(contato_id),
            conversa_id=str(conversa_id),
            mensagem_id=str(mensagem_id) if mensagem_id else None,
            raw_event_id=raw_event_id_str,
            lead_origin=lead_origem,
            raw_payload=data,
        )

    db.commit()
    logger.info("[webhook-process] COMMIT OK conversa_id=%s", conversa_id)

    try:
        publish_whatsapp_event(
            {
                "type": "message.upsert",
                "workspaceId": workspace_id,
                "conversaId": str(conversa_id),
                "remoteJid": remote_jid,
                "direction": direcao,
                "text": msg_text,
                "instance": instance,
                "messageType": message_type,
                "timestamp": recebida_em.isoformat(),
            }
        )
        logger.info("[webhook-process] REDIS PUBLICADO")
    except Exception as exc:
        logger.info("[webhook-process] REDIS FALHOU: %s", exc)

    return _result(
        is_media=should_enqueue_media,
        mensagem_id=str(mensagem_id) if mensagem_id else None,
        conversa_id=str(conversa_id),
        evolution_msg_id=evolution_msg_id,
        message_type=message_type,
        from_me=from_me,
        is_group=is_group,
        remote_jid=remote_jid,
        participant_jid=participant_jid,
        instance=instance,
        workspace_id=workspace_id,
        media_payload=media_payload,
        provider=provider,
        full_message_id=waha_full_message_id,
        chat_id=waha_chat_id,
        participant_name=sender_name if is_group else "",
    )


def record_assignment_event(
    db: Session,
    *,
    workspace_id: str | uuid.UUID,
    canal_id: str | uuid.UUID | None,
    conversa_id: str | uuid.UUID,
    contato_id: str | uuid.UUID | None,
    action: str,
    from_responsavel_id: str | uuid.UUID | None = None,
    to_responsavel_id: str | uuid.UUID | None = None,
    from_equipe_id: str | uuid.UUID | None = None,
    to_equipe_id: str | uuid.UUID | None = None,
    actor_user_id: str | uuid.UUID | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    db.execute(
        text("""
            INSERT INTO public.crm_conversation_assignments (
                workspace_id, canal_id, conversa_id, contato_id, action,
                from_responsavel_id, to_responsavel_id, from_equipe_id, to_equipe_id,
                actor_user_id, payload, created_at
            )
            VALUES (
                :workspace_id, :canal_id, :conversa_id, :contato_id, :action,
                :from_responsavel_id, :to_responsavel_id, :from_equipe_id, :to_equipe_id,
                :actor_user_id, CAST(:payload AS jsonb), NOW()
            )
        """),
        {
            "workspace_id": str(workspace_id),
            "canal_id": str(canal_id) if canal_id else None,
            "conversa_id": str(conversa_id),
            "contato_id": str(contato_id) if contato_id else None,
            "action": action,
            "from_responsavel_id": str(from_responsavel_id) if from_responsavel_id else None,
            "to_responsavel_id": str(to_responsavel_id) if to_responsavel_id else None,
            "from_equipe_id": str(from_equipe_id) if from_equipe_id else None,
            "to_equipe_id": str(to_equipe_id) if to_equipe_id else None,
            "actor_user_id": str(actor_user_id) if actor_user_id else None,
            "payload": json.dumps(payload or {}),
        },
    )


def _find_existing_message(
    db: Session,
    *,
    workspace_id: str,
    canal_id: str,
    instance: str,
    evolution_msg_id: str,
    remote_jid: str,
    message_hash: str,
) -> dict[str, Any] | None:
    row = None
    if evolution_msg_id:
        row = db.execute(
            text("""
                SELECT id, conversa_id, remote_jid
                FROM public.crm_whatsapp_mensagens
                WHERE workspace_id = CAST(:workspace_id AS uuid)
                  AND canal_id = CAST(:canal_id AS uuid)
                  AND instance = :instance
                  AND evolution_msg_id = :evolution_msg_id
                LIMIT 1
            """),
            {
                "workspace_id": workspace_id,
                "canal_id": canal_id,
                "instance": instance,
                "evolution_msg_id": evolution_msg_id,
            },
        ).mappings().first()
        if row:
            existing_remote_jid = str(row.get("remote_jid") or "")
            if existing_remote_jid and remote_jid and existing_remote_jid != remote_jid:
                logger.warning(
                    "[webhook-process] evolution_msg_id collision ignored evid=%s existing_remote_jid=%s incoming_remote_jid=%s",
                    evolution_msg_id,
                    existing_remote_jid,
                    remote_jid,
                )
            else:
                return dict(row)
    row = db.execute(
        text("""
            SELECT id, conversa_id
            FROM public.crm_whatsapp_mensagens
            WHERE workspace_id = CAST(:workspace_id AS uuid)
              AND canal_id = CAST(:canal_id AS uuid)
              AND message_hash = :message_hash
            LIMIT 1
        """),
        {"workspace_id": workspace_id, "canal_id": canal_id, "message_hash": message_hash},
    ).mappings().first()
    return dict(row) if row else None


def _merge_message_media_fields(
    db: Session,
    *,
    mensagem_id: str,
    raw_event_id: str | None,
    message_type: str,
    text_value: str,
    payload: dict[str, Any],
    media_status: str | None,
    media_error: str | None,
) -> None:
    if media_status is None and media_error is None:
        return
    db.execute(
        text("""
            UPDATE public.crm_whatsapp_mensagens
            SET raw_event_id = COALESCE(CAST(:raw_event_id AS uuid), raw_event_id),
                message_type = COALESCE(NULLIF(:message_type, ''), message_type),
                conteudo = CASE
                    WHEN COALESCE(conteudo, '') IN ('', '[mídia]') THEN COALESCE(NULLIF(:text_value, ''), conteudo)
                    ELSE conteudo
                END,
                payload = CAST(:payload AS jsonb),
                media_status = CASE
                    WHEN media_status = 'ready' THEN media_status
                    WHEN :media_status IS NOT NULL THEN :media_status
                    ELSE media_status
                END,
                media_error = CASE
                    WHEN media_status = 'ready' THEN media_error
                    ELSE :media_error
                END,
                updated_at = NOW()
            WHERE id = CAST(:mensagem_id AS uuid)
        """),
        {
            "mensagem_id": mensagem_id,
            "raw_event_id": raw_event_id,
            "message_type": message_type,
            "text_value": text_value,
            "payload": json.dumps(payload),
            "media_status": media_status,
            "media_error": media_error,
        },
    )


def _record_lead_origin_event(
    db: Session,
    *,
    workspace_id: str,
    canal_id: str,
    contato_id: str,
    conversa_id: str,
    mensagem_id: str | None,
    raw_event_id: str | None,
    lead_origin: dict[str, Any],
    raw_payload: dict[str, Any],
) -> None:
    row = db.execute(
        text("""
            INSERT INTO public.crm_lead_origin_events (
                workspace_id, canal_id, contato_id, conversa_id, mensagem_id, raw_event_id,
                source, medium, campaign, origin_label, meta_ad_id, meta_ctwa_clid,
                meta_headline, meta_source_url, referral_json, raw_payload, created_at
            )
            VALUES (
                CAST(:workspace_id AS uuid), CAST(:canal_id AS uuid), CAST(:contato_id AS uuid), CAST(:conversa_id AS uuid),
                CAST(:mensagem_id AS uuid), CAST(:raw_event_id AS uuid),
                :source, :medium, :campaign, :origin_label, :meta_ad_id, :meta_ctwa_clid,
                :meta_headline, :meta_source_url, CAST(:referral_json AS jsonb), CAST(:raw_payload AS jsonb), NOW()
            )
            RETURNING id
        """),
        {
            "workspace_id": workspace_id,
            "canal_id": canal_id,
            "contato_id": contato_id,
            "conversa_id": conversa_id,
            "mensagem_id": mensagem_id,
            "raw_event_id": raw_event_id,
            "source": lead_origin.get("source") or lead_origin.get("utm_source"),
            "medium": lead_origin.get("utm_medium"),
            "campaign": lead_origin.get("utm_campaign"),
            "origin_label": lead_origin.get("campanha_origem"),
            "meta_ad_id": lead_origin.get("meta_ad_id"),
            "meta_ctwa_clid": lead_origin.get("meta_ctwa_clid"),
            "meta_headline": lead_origin.get("meta_headline"),
            "meta_source_url": lead_origin.get("meta_source_url"),
            "referral_json": lead_origin.get("meta_referral_json"),
            "raw_payload": json.dumps(raw_payload, default=str),
        },
    ).fetchone()
    if row:
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_contatos
                SET last_origin_event_id = :event_id,
                    updated_at = NOW()
                WHERE id = CAST(:contato_id AS uuid)
            """),
            {"event_id": str(row[0]), "contato_id": contato_id},
        )


def _resolve_lid_contact(
    db: Session,
    *,
    instance: str,
    remote_jid: str,
    sender_pn: str,
    is_lid: bool,
) -> tuple[str, Any | None]:
    resolved_remote_jid = remote_jid
    contato_id_existente = None
    if not (is_lid and sender_pn):
        return resolved_remote_jid, contato_id_existente

    phone_digits = re.sub(r"\D", "", sender_pn.split("@")[0])
    phone_candidates = [sender_pn]
    if len(phone_digits) == 12 and phone_digits.startswith("55"):
        phone_candidates.append(f"{phone_digits}@s.whatsapp.net")
        phone_candidates.append(f"{phone_digits[:4]}9{phone_digits[4:]}@s.whatsapp.net")
    elif len(phone_digits) == 13 and phone_digits.startswith("55"):
        phone_candidates.append(f"{phone_digits}@s.whatsapp.net")
        if phone_digits[4] == "9":
            phone_candidates.append(f"{phone_digits[:4]}{phone_digits[5:]}@s.whatsapp.net")

    for candidate_jid in dict.fromkeys(phone_candidates):
        phone_conv = db.execute(
            text("""
                SELECT cv.id, cv.status, ct.id AS contato_id
                FROM public.crm_whatsapp_conversas cv
                JOIN public.crm_whatsapp_contatos ct ON ct.id = cv.contato_id
                WHERE cv.instance = :inst AND cv.remote_jid = :jid
                ORDER BY cv.updated_at DESC LIMIT 1
            """),
            {"inst": instance, "jid": candidate_jid},
        ).fetchone()
        if phone_conv:
            logger.info("[webhook-process] LID %s resolvido para JID %s via senderPn", remote_jid, candidate_jid)
            return candidate_jid, phone_conv[2]
    return resolved_remote_jid, contato_id_existente


def _upsert_participant_contact(db: Session, *, workspace_id: str, participant_jid: str, sender_name: str) -> Any:
    display_name = _valid_display_name(sender_name, jid=participant_jid)
    result = db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_contatos (workspace_id, jid, telefone, numero_evo, nome, push_name, origem, created_at, updated_at)
            VALUES (CAST(:ws AS uuid), :jid, :tel, :evo, :nome, :push, 'evolution', NOW(), NOW())
            ON CONFLICT (workspace_id, jid) DO UPDATE SET
                nome = CASE
                    WHEN EXCLUDED.push_name IS NOT NULL
                         AND (
                            NULLIF(BTRIM(public.crm_whatsapp_contatos.nome), '') IS NULL
                            OR public.crm_whatsapp_contatos.nome = public.crm_whatsapp_contatos.telefone
                            OR public.crm_whatsapp_contatos.nome = public.crm_whatsapp_contatos.jid
                            OR lower(BTRIM(public.crm_whatsapp_contatos.nome)) IN ('contato', 'contato whatsapp')
                            OR public.crm_whatsapp_contatos.nome LIKE '%@%'
                         )
                    THEN EXCLUDED.push_name
                    ELSE public.crm_whatsapp_contatos.nome
                END,
                push_name = COALESCE(EXCLUDED.push_name, public.crm_whatsapp_contatos.push_name),
                updated_at = NOW()
            RETURNING id
        """),
        {
            "ws": workspace_id,
            "jid": participant_jid,
            "tel": participant_jid.split("@")[0] if "@" in participant_jid else participant_jid,
            "evo": participant_jid,
            "nome": display_name,
            "push": display_name,
        },
    )
    return result.scalar()


def _upsert_contact(
    db: Session,
    *,
    workspace_id: str,
    upsert_jid: str,
    remote_jid: str,
    sender_pn: str,
    numero_evo: str,
    push_name: str,
    lead_origin: dict[str, Any],
    existing_contact_id: Any | None,
) -> Any:
    upsert_tel = upsert_jid.split("@")[0] if "@s.whatsapp.net" in upsert_jid else (
        re.sub(r"\D", "", sender_pn.split("@")[0]) if sender_pn else remote_jid.split("@")[0]
    )
    clean_push_name = _valid_display_name(push_name, jid=upsert_jid)
    fallback_name = _format_phone_display(upsert_tel)
    if existing_contact_id:
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_contatos
                SET push_name = COALESCE(:push, push_name),
                    nome = CASE
                        WHEN :push IS NOT NULL
                             AND (
                                NULLIF(BTRIM(nome), '') IS NULL
                                OR nome = telefone
                                OR nome = jid
                                OR lower(BTRIM(nome)) IN ('contato', 'contato whatsapp')
                                OR nome LIKE '%@%'
                             )
                        THEN :push
                        WHEN :fallback_name IS NOT NULL
                             AND (
                                NULLIF(BTRIM(nome), '') IS NULL
                                OR nome = telefone
                                OR nome = jid
                                OR lower(BTRIM(nome)) IN ('contato', 'contato whatsapp')
                                OR nome LIKE '%@%'
                             )
                        THEN :fallback_name
                        ELSE nome
                    END,
                    updated_at = NOW()
                WHERE id = :cid
            """),
            {"push": clean_push_name or None, "fallback_name": fallback_name, "cid": str(existing_contact_id)},
        )
        return existing_contact_id

    result = db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_contatos (
                workspace_id, jid, telefone, numero_evo, nome, push_name, origem,
                primeira_conversa_at,
                campanha_origem, utm_source, utm_medium, utm_campaign,
                meta_ad_id, meta_ctwa_clid, meta_headline, meta_body,
                meta_source_url, meta_media_type, meta_image_url, meta_referral_json,
                created_at, updated_at
            )
            VALUES (
                CAST(:ws AS uuid), :jid, :tel, :evo, :nome, :push, 'evolution', NOW(),
                :campanha, :utm_source, :utm_medium, :utm_campaign,
                :meta_ad_id, :meta_ctwa_clid, :meta_headline, :meta_body,
                :meta_source_url, :meta_media_type, :meta_image_url, CAST(:meta_referral_json AS jsonb),
                NOW(), NOW()
            )
            ON CONFLICT (workspace_id, jid) DO UPDATE SET
                push_name = COALESCE(EXCLUDED.push_name, public.crm_whatsapp_contatos.push_name),
                nome = CASE
                    WHEN EXCLUDED.push_name IS NOT NULL
                         AND (NULLIF(BTRIM(public.crm_whatsapp_contatos.nome), '') IS NULL
                              OR public.crm_whatsapp_contatos.nome = public.crm_whatsapp_contatos.telefone
                              OR public.crm_whatsapp_contatos.nome = public.crm_whatsapp_contatos.jid
                              OR lower(BTRIM(public.crm_whatsapp_contatos.nome)) IN ('contato', 'contato whatsapp')
                              OR public.crm_whatsapp_contatos.nome LIKE '%@%')
                    THEN EXCLUDED.push_name
                    WHEN EXCLUDED.nome IS NOT NULL
                         AND (
                            NULLIF(BTRIM(public.crm_whatsapp_contatos.nome), '') IS NULL
                            OR public.crm_whatsapp_contatos.nome = public.crm_whatsapp_contatos.telefone
                            OR public.crm_whatsapp_contatos.nome = public.crm_whatsapp_contatos.jid
                            OR lower(BTRIM(public.crm_whatsapp_contatos.nome)) IN ('contato', 'contato whatsapp')
                            OR public.crm_whatsapp_contatos.nome LIKE '%@%'
                         )
                    THEN EXCLUDED.nome
                    ELSE COALESCE(public.crm_whatsapp_contatos.nome, EXCLUDED.nome)
                END,
                numero_evo = COALESCE(NULLIF(EXCLUDED.numero_evo, ''), public.crm_whatsapp_contatos.numero_evo),
                campanha_origem = COALESCE(public.crm_whatsapp_contatos.campanha_origem, EXCLUDED.campanha_origem),
                utm_source = COALESCE(public.crm_whatsapp_contatos.utm_source, EXCLUDED.utm_source),
                utm_medium = COALESCE(public.crm_whatsapp_contatos.utm_medium, EXCLUDED.utm_medium),
                utm_campaign = COALESCE(public.crm_whatsapp_contatos.utm_campaign, EXCLUDED.utm_campaign),
                meta_ad_id = COALESCE(public.crm_whatsapp_contatos.meta_ad_id, EXCLUDED.meta_ad_id),
                meta_ctwa_clid = COALESCE(public.crm_whatsapp_contatos.meta_ctwa_clid, EXCLUDED.meta_ctwa_clid),
                meta_headline = COALESCE(public.crm_whatsapp_contatos.meta_headline, EXCLUDED.meta_headline),
                meta_body = COALESCE(public.crm_whatsapp_contatos.meta_body, EXCLUDED.meta_body),
                meta_source_url = COALESCE(public.crm_whatsapp_contatos.meta_source_url, EXCLUDED.meta_source_url),
                meta_media_type = COALESCE(public.crm_whatsapp_contatos.meta_media_type, EXCLUDED.meta_media_type),
                meta_image_url = COALESCE(public.crm_whatsapp_contatos.meta_image_url, EXCLUDED.meta_image_url),
                meta_referral_json = COALESCE(public.crm_whatsapp_contatos.meta_referral_json, EXCLUDED.meta_referral_json),
                updated_at = NOW()
            RETURNING id
        """),
        {
            "ws": workspace_id,
            "jid": upsert_jid,
            "tel": upsert_tel,
            "evo": numero_evo,
            "nome": clean_push_name or fallback_name,
            "push": clean_push_name,
            "campanha": lead_origin.get("campanha_origem"),
            "utm_source": lead_origin.get("utm_source"),
            "utm_medium": lead_origin.get("utm_medium"),
            "utm_campaign": lead_origin.get("utm_campaign"),
            "meta_ad_id": lead_origin.get("meta_ad_id"),
            "meta_ctwa_clid": lead_origin.get("meta_ctwa_clid"),
            "meta_headline": lead_origin.get("meta_headline"),
            "meta_body": lead_origin.get("meta_body"),
            "meta_source_url": lead_origin.get("meta_source_url"),
            "meta_media_type": lead_origin.get("meta_media_type"),
            "meta_image_url": lead_origin.get("meta_image_url"),
            "meta_referral_json": lead_origin.get("meta_referral_json"),
        },
    )
    return result.scalar()


def _upsert_conversation(
    db: Session,
    *,
    workspace_id: str,
    canal_id: str,
    contato_id: str,
    instance: str,
    remote_jid: str,
    is_group: bool,
    message_text: str,
    direction: str,
    received_at: Any,
) -> Any:
    conv_row = db.execute(
        text("""
            SELECT id, status
            FROM public.crm_whatsapp_conversas
            WHERE workspace_id = CAST(:ws AS uuid)
              AND canal_id = CAST(:canal AS uuid)
              AND instance = :inst
              AND remote_jid = :jid
              AND ativo = true
            ORDER BY updated_at DESC
            LIMIT 1
        """),
        {"ws": workspace_id, "canal": canal_id, "inst": instance, "jid": remote_jid},
    ).fetchone()

    if conv_row and not (conv_row[1] == "resolvido" and direction == "entrada"):
        conversa_id = conv_row[0]
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_conversas
                SET ultima_mensagem = :msg,
                    ultima_direcao = :dir,
                    ultima_msg_at = :ts,
                    last_inbound_at = CASE WHEN :dir = 'entrada' THEN :ts ELSE last_inbound_at END,
                    last_outbound_at = CASE WHEN :dir = 'saida' THEN :ts ELSE last_outbound_at END,
                    is_group = COALESCE(:is_group, is_group),
                    nao_lidas = nao_lidas + CASE WHEN :dir = 'entrada' THEN 1 ELSE 0 END,
                    updated_at = NOW()
                WHERE id = :cid
            """),
            {"msg": message_text[:500], "dir": direction, "ts": received_at, "is_group": is_group, "cid": str(conversa_id)},
        )
        return conversa_id

    result = db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_conversas
                (workspace_id, canal_id, contato_id, instance, remote_jid, is_group, group_name, status,
                 nao_lidas, ultima_mensagem, ultima_direcao, ultima_msg_at, last_inbound_at, last_outbound_at, created_at, updated_at)
            VALUES
                (CAST(:ws AS uuid), CAST(:canal AS uuid), CAST(:ct AS uuid), :inst, :jid, :is_group, :group_name, 'nova',
                 CASE WHEN :dir = 'entrada' THEN 1 ELSE 0 END, :msg, :dir, :ts,
                 CASE WHEN :dir = 'entrada' THEN :ts ELSE NULL END,
                 CASE WHEN :dir = 'saida' THEN :ts ELSE NULL END,
                 NOW(), NOW())
            RETURNING id
        """),
        {
            "ws": workspace_id,
            "canal": canal_id,
            "ct": contato_id,
            "inst": instance,
            "jid": remote_jid,
            "is_group": is_group,
            "group_name": None,
            "dir": direction,
            "msg": message_text[:500],
            "ts": received_at,
        },
    )
    return result.scalar()


def _upsert_message(
    db: Session,
    *,
    workspace_id: str,
    canal_id: str,
    raw_event_id: str | None,
    conversa_id: str,
    contato_id: str,
    evolution_msg_id: str,
    message_hash: str,
    instance: str,
    remote_jid: str,
    direction: str,
    from_me: bool,
    push_name: str,
    participant_jid: str,
    sender_name: str,
    is_group: bool,
    is_mentioned: bool,
    text_value: str,
    message_type: str,
    payload: dict[str, Any],
    received_at: Any,
    media_status: str | None,
    media_error: str | None,
    message_signature: dict[str, Any],
) -> Any | None:
    stored_evolution_msg_id = evolution_msg_id
    stored_message_hash = message_hash
    if evolution_msg_id:
        collision = db.execute(
            text("""
                SELECT id, remote_jid
                FROM public.crm_whatsapp_mensagens
                WHERE workspace_id = CAST(:ws AS uuid)
                  AND canal_id = CAST(:canal AS uuid)
                  AND instance = :inst
                  AND evolution_msg_id = :evid
                LIMIT 1
            """),
            {"ws": workspace_id, "canal": canal_id, "inst": instance, "evid": evolution_msg_id},
        ).mappings().first()
        if collision and str(collision.get("remote_jid") or "") and str(collision.get("remote_jid") or "") != remote_jid:
            logger.warning(
                "[webhook-process] evolution_msg_id collision fallback evid=%s existing_remote_jid=%s incoming_remote_jid=%s",
                evolution_msg_id,
                collision.get("remote_jid"),
                remote_jid,
            )
            stored_evolution_msg_id = ""
            stored_message_hash = _build_message_hash(
                workspace_id=workspace_id,
                canal_id=canal_id,
                instance=instance,
                evolution_msg_id="",
                direction=direction,
                remote_jid=remote_jid,
                message_signature=message_signature,
            )

    if from_me:
        if stored_evolution_msg_id:
            msg_existente = db.execute(
                text("""
                    SELECT id FROM public.crm_whatsapp_mensagens
                    WHERE workspace_id = CAST(:ws AS uuid)
                      AND canal_id = CAST(:canal AS uuid)
                      AND instance = :inst
                      AND evolution_msg_id = :evid
                      AND direcao = 'saida'
                      AND status = 'enviada'
                    ORDER BY created_at DESC LIMIT 1
                """),
                {"ws": workspace_id, "canal": canal_id, "inst": instance, "evid": stored_evolution_msg_id},
            ).fetchone()
        else:
            msg_existente = db.execute(
                text("""
                    SELECT id FROM public.crm_whatsapp_mensagens
                    WHERE workspace_id = CAST(:ws AS uuid)
                      AND canal_id = CAST(:canal AS uuid)
                      AND message_hash = :message_hash
                      AND direcao = 'saida'
                      AND status = 'enviada'
                    LIMIT 1
                """),
                {"ws": workspace_id, "canal": canal_id, "message_hash": stored_message_hash},
            ).fetchone()

        if msg_existente:
            db.execute(
                text("""
                    UPDATE public.crm_whatsapp_mensagens
                    SET evolution_msg_id = :evid,
                        raw_event_id = CAST(:raw_event_id AS uuid),
                        message_hash = :message_hash,
                        status = 'entregue',
                        payload = CAST(:payload AS jsonb),
                        message_type = COALESCE(NULLIF(:mt, ''), message_type),
                        conteudo = CASE
                            WHEN COALESCE(conteudo, '') IN ('', '[mídia]') THEN COALESCE(NULLIF(:msg, ''), conteudo)
                            ELSE conteudo
                        END,
                        media_status = CASE
                            WHEN media_status = 'ready' THEN media_status
                            WHEN :media_status IS NOT NULL THEN :media_status
                            ELSE media_status
                        END,
                        media_error = CASE
                            WHEN media_status = 'ready' THEN media_error
                            ELSE :media_error
                        END,
                        enviada_em = :ts,
                        updated_at = NOW()
                    WHERE id = :mid
                """),
                {
                    "evid": stored_evolution_msg_id or None,
                    "raw_event_id": raw_event_id,
                    "message_hash": stored_message_hash,
                    "payload": json.dumps(payload),
                    "mt": message_type,
                    "msg": text_value,
                    "media_status": media_status,
                    "media_error": media_error,
                    "ts": received_at,
                    "mid": str(msg_existente[0]),
                },
            )
            logger.info("[webhook-process] mensagem de saída atualizada para 'entregue': %s", evolution_msg_id)
            return msg_existente[0]

    remetente_tipo = "agente" if from_me else "contato"
    status_value = "entregue" if from_me else None
    result = db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_mensagens (
                workspace_id, canal_id, raw_event_id, conversa_id, contato_id,
                evolution_msg_id, message_hash, instance, remote_jid, direcao,
                from_me, remetente_tipo, remetente_nome, conteudo, message_type,
                status, payload, recebida_em, media_status, media_error, participant_jid, participant_name,
                is_mentioned, enviada_em, created_at, updated_at
            )
            VALUES (
                CAST(:ws AS uuid), CAST(:canal AS uuid), CAST(:raw_event_id AS uuid), CAST(:cid AS uuid), CAST(:ct AS uuid),
                :evid, :message_hash, :inst, :jid, :direction,
                :from_me, :remetente_tipo, :rn, :msg, :mt,
                :status, CAST(:payload AS jsonb), :ts, :media_status, :media_error, :part_jid, :part_name,
                :is_mentioned, :sent_ts, NOW(), NOW()
            )
            ON CONFLICT DO NOTHING
            RETURNING id
        """),
        {
            "ws": workspace_id,
            "canal": canal_id,
            "raw_event_id": raw_event_id,
            "cid": conversa_id,
            "ct": contato_id,
            "evid": stored_evolution_msg_id or None,
            "message_hash": stored_message_hash,
            "inst": instance,
            "jid": remote_jid,
            "direction": direction,
            "from_me": from_me,
            "remetente_tipo": remetente_tipo,
            "rn": "Agente" if from_me else _message_sender_display_name(
                push_name=push_name,
                participant_jid=participant_jid,
                remote_jid=remote_jid,
            ),
            "msg": text_value,
            "mt": message_type,
            "status": status_value,
            "payload": json.dumps(payload),
            "ts": None if from_me else received_at,
            "sent_ts": received_at if from_me else None,
            "media_status": media_status,
            "media_error": media_error,
            "part_jid": participant_jid if is_group else None,
            "part_name": sender_name if is_group else None,
            "is_mentioned": is_mentioned,
        },
    )
    mensagem_id = result.scalar()
    if not mensagem_id:
        existing = _find_existing_message(
            db,
            workspace_id=workspace_id,
            canal_id=canal_id,
            instance=instance,
            evolution_msg_id=stored_evolution_msg_id,
            remote_jid=remote_jid,
            message_hash=stored_message_hash,
        )
        if existing:
            _merge_message_media_fields(
                db,
                mensagem_id=str(existing["id"]),
                raw_event_id=raw_event_id,
                message_type=message_type,
                text_value=text_value,
                payload=payload,
                media_status=media_status,
                media_error=media_error,
            )
        return existing["id"] if existing else None
    return mensagem_id


def _build_message_hash(
    *,
    workspace_id: str,
    canal_id: str,
    instance: str,
    remote_jid: str,
    evolution_msg_id: str,
    direction: str,
    message_signature: dict[str, Any],
) -> str:
    if evolution_msg_id:
        canonical = {
            "workspace_id": workspace_id,
            "canal_id": canal_id,
            "instance": instance,
            "remote_jid": remote_jid,
            "evolution_msg_id": evolution_msg_id,
            "direction": direction,
        }
    else:
        canonical = {
            "workspace_id": workspace_id,
            "canal_id": canal_id,
            "instance": instance,
            "remote_jid": remote_jid,
            "direction": direction,
            "signature": message_signature,
        }
    base = json.dumps(canonical, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def _result(
    *,
    is_media: bool,
    mensagem_id: str | None,
    conversa_id: str,
    evolution_msg_id: str,
    message_type: str,
    from_me: bool,
    is_group: bool,
    remote_jid: str,
    participant_jid: str,
    instance: str,
    workspace_id: str,
    media_payload: dict[str, Any],
    provider: str | None = None,
    full_message_id: str | None = None,
    chat_id: str | None = None,
    participant_name: str | None = None,
) -> dict[str, Any]:
    return {
        "is_media": is_media,
        "mensagem_id": mensagem_id,
        "conversa_id": conversa_id,
        "evolution_msg_id": evolution_msg_id,
        "message_type": message_type,
        "from_me": from_me,
        "is_group": is_group,
        "remote_jid": remote_jid,
        "participant_jid": participant_jid,
        "instance": instance,
        "workspace_id": workspace_id,
        "provider": provider,
        "full_message_id": full_message_id,
        "chat_id": chat_id,
        "participant_name": participant_name,
        "media_base64": media_payload.get("base64"),
        "media_url": media_payload.get("url"),
        "media_mime_type": media_payload.get("mimetype"),
        "media_filename": media_payload.get("filename"),
        "media_caption": media_payload.get("caption"),
        "media_error": media_payload.get("error"),
    }


def process_evolution_receipt_event(
    db: Session,
    canal: CanalEntrada,
    data: dict[str, Any],
    *,
    event: str = "",
) -> dict[str, Any] | None:
    from datetime import datetime, timezone

    event_norm = normalize_event_type(event)
    # Para canais WAHA, evolution_instance_id é NULL — a sessão vem no payload adaptado.
    instance = data.get("instance") or canal.evolution_instance_id or "opcl"
    receipt = normalize_receipt_event(data, event_norm, instance=instance)

    if not receipt.message_ids or not receipt.status:
        logger.info("[webhook-status] ABORTANDO: evolution_msg_id ou status vazio")
        return None

    message_ids = list(dict.fromkeys(sorted(receipt.message_ids)))
    wa_status = receipt.status
    remote_jid = receipt.remote_jid
    timestamp = datetime.now(timezone.utc)

    updated_count = 0
    for evolution_msg_id in message_ids:
        result = db.execute(
            text("""
                UPDATE public.crm_whatsapp_mensagens
                SET wa_status = :status,
                    delivered_at = CASE WHEN :status = 'delivered' AND delivered_at IS NULL THEN NOW() ELSE delivered_at END,
                    read_at = CASE WHEN :status = 'read' AND read_at IS NULL THEN NOW() ELSE read_at END,
                    updated_at = NOW()
                WHERE evolution_msg_id = :evid
                  AND instance = :inst
                  AND workspace_id = :ws_id
            """),
            {"status": wa_status, "evid": evolution_msg_id, "inst": instance, "ws_id": str(canal.workspace_id)},
        )
        if result.rowcount == 0:
            logger.warning(
                "[webhook-status] 0 rows updated evid=%.12s inst=%s ws=%s status=%s",
                evolution_msg_id, instance, str(canal.workspace_id)[:8], wa_status,
            )
        else:
            updated_count += result.rowcount

    db.commit()

    logger.info("[webhook-status] msg_ids=%s status=%s updated=%d", message_ids, wa_status, updated_count)

    try:
        for evolution_msg_id in message_ids:
            publish_whatsapp_event(
                {
                    "type": "message.status",
                    "workspaceId": str(canal.workspace_id),
                    "evolutionMsgId": evolution_msg_id,
                    "remoteJid": remote_jid,
                    "status": wa_status,
                    "instance": instance,
                    "timestamp": timestamp.isoformat(),
                }
            )
        logger.info("[webhook-status] REDIS PUBLICADO")
    except Exception as e:
        logger.info("[webhook-status] REDIS FALHOU: %s", e)

    return {
        "message_ids": message_ids,
        "status": wa_status,
        "remote_jid": remote_jid,
        "instance": instance,
    }


def process_evolution_connection_event(
    db: Session,
    canal: CanalEntrada,
    data: dict[str, Any],
    *,
    event: str = "",
) -> dict[str, Any] | None:
    from datetime import datetime, timezone

    event_norm = normalize_event_type(event)
    connection = normalize_connection_event(data, event_norm, instance=canal.evolution_instance_id or "opcl")

    if connection.state == "unknown":
        return None

    updates: dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
    if connection.state == "connected":
        updates.update(
            {
                "status": "ativo",
                "connection_status": "connected",
                "conectado_em": datetime.now(timezone.utc),
            }
        )
        if connection.number:
            updates["numero_telefone"] = connection.number
    elif connection.state == "connecting":
        updates["connection_status"] = "connecting"
    elif connection.state == "disconnected":
        updates.update({"status": "inativo", "connection_status": "disconnected"})

    set_clause = ", ".join(f"{column} = :{column}" for column in updates)
    db.execute(
        text(f"""
            UPDATE public.canais_entrada
            SET {set_clause}
            WHERE id = :canal_id
        """),
        {**updates, "canal_id": str(canal.id)},
    )
    db.commit()

    logger.info("[webhook-connection] canal=%s state=%s", canal.id, connection.state)
    return {
        "state": connection.state,
        "number": connection.number,
        "qr_code": connection.qr_code,
    }


def process_evolution_webhook_event(
    db: Session,
    canal: CanalEntrada,
    event: str,
    data: dict[str, Any],
    *,
    raw_event_id: str | uuid.UUID | None = None,
) -> dict[str, Any]:
    event_norm = normalize_event_type(event)
    if event_norm in MESSAGE_EVENT_TYPES:
        result = process_evolution_message(db, canal, data, raw_event_id=raw_event_id)
        if result and result.get("is_media"):
            mensagem_id = str(result.get("mensagem_id") or "")
            conversa_id = str(result.get("conversa_id") or "")
            evolution_msg_id = str(result.get("evolution_msg_id") or "")
            if mensagem_id and conversa_id and evolution_msg_id:
                _waha_cfg = (canal.config or {}).get("waha", {}) if getattr(canal, "tipo", "") == "whatsapp_waha" else {}
                enqueue_inbound_media_download(
                    db,
                    workspace_id=str(result.get("workspace_id") or canal.workspace_id),
                    canal_id=str(canal.id),
                    raw_event_id=raw_event_id,
                    mensagem_id=mensagem_id,
                    conversa_id=conversa_id,
                    instance_name=result.get("instance") or canal.evolution_instance_id or "opcl",
                    evolution_msg_id=evolution_msg_id,
                    message_type_raw=str(result.get("message_type") or ""),
                    provider=str(result.get("provider") or ("whatsapp_waha" if getattr(canal, "tipo", "") == "whatsapp_waha" else "whatsapp_evolution")),
                    provider_full_message_id=str(result.get("full_message_id") or ""),
                    provider_chat_id=str(result.get("chat_id") or result.get("remote_jid") or ""),
                    provider_participant_jid=str(result.get("participant_jid") or ""),
                    provider_participant_name=str(result.get("participant_name") or ""),
                    media_base64=result.get("media_base64"),
                    media_url=result.get("media_url"),
                    media_mime_type=result.get("media_mime_type"),
                    media_filename=result.get("media_filename"),
                    media_caption=result.get("media_caption"),
                    media_error=result.get("media_error"),
                    waha_session=_waha_cfg.get("session"),
                    waha_chat_id=result.get("remote_jid"),
                    waha_api_base_url=_waha_cfg.get("api_base_url"),
                    waha_api_key_ref=_waha_cfg.get("api_key_ref"),
                )
                db.commit()
            else:
                logger.info(
                    "[webhook-process] mídia ignorada por identificadores incompletos mensagem=%s conversa=%s evid=%s",
                    mensagem_id,
                    conversa_id,
                    evolution_msg_id,
                )
        return {
            "status": "done" if result else "ignored",
            "event_type": event_norm,
            "result": result,
        }
    if event_norm in RECEIPT_EVENT_TYPES:
        result = process_evolution_receipt_event(db, canal, data, event=event_norm)
        return {
            "status": "done" if result else "ignored",
            "event_type": event_norm,
            "result": result,
        }
    if event_norm in CONNECTION_EVENT_TYPES:
        result = process_evolution_connection_event(db, canal, data, event=event_norm)
        return {
            "status": "done" if result else "ignored",
            "event_type": event_norm,
            "result": result,
        }
    return {"status": "ignored", "event_type": event_norm, "result": None}
