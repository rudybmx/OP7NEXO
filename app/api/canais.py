"""Rotas de canais de entrada (omnichannel)."""

from __future__ import annotations

import copy
import base64
import hashlib
import json
import logging
import mimetypes
import os
import re
import secrets
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import create_engine, text
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import (
    exigir_platform_admin,
    get_usuario_atual,
    get_workspace_atual,
    verificar_acesso_workspace,
)
from app.models.canal_entrada import CanalEntrada
from app.models.user import RoleUsuario, User
from app.models.user_workspace_access import UserWorkspaceAccess
from app.models.workspace import Workspace
from app.services import evolution as evo_service
from app.services import waha_service
from app.services.object_storage import download_and_put, put_bytes, public_url
from app.services.webhook_api_ingestion import (
    CRM_EXTERNO_ZAPI_PROVIDER,
    WebhookAPIError,
    prepare_webhook_config,
    process_webhook_api_ingestion,
    sanitize_webhook_config,
    webhook_provider_from_config,
)
from app.services import helena_chat as helena_service
from app.services.canal_labels import canal_provider, canal_provider_label
from app.services.waha_normalizer import adapt_waha_to_evolution
from app.services.redis_pub import publish_whatsapp_event
from app.services.whatsapp_crm_persistence import process_evolution_message
from app.services.whatsapp_event_queue import enqueue_evolution_event
from app.services.whatsapp_media import StoredMedia, enqueue_inbound_media_download, register_media_record, store_media_bytes
from app.services.whatsapp_normalizer import (
    normalize_connection_event,
    normalize_event_type as normalize_whatsapp_event_type,
    normalize_media_payload,
    normalize_message_event,
    normalize_message_type,
    normalize_receipt_event,
    payload_info,
    payload_message,
    payload_root,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["canais"])

TIPOS_VALIDOS = Literal[
    "whatsapp_evolution", "whatsapp_waha", "whatsapp_oficial", "instagram", "facebook", "webhook"
]


# ── Schemas ──────────────────────────────────────────────────────────

class CanalIn(BaseModel):
    tipo: TIPOS_VALIDOS
    nome: str
    config: dict = {}
    mensagem_boas_vindas: str | None = None
    status: str = "inativo"


class CanalUpdate(BaseModel):
    nome: str
    config: dict = {}
    mensagem_boas_vindas: str | None = None
    status: str


class CanalOut(BaseModel):
    id: str
    workspace_id: str
    tipo: str
    nome: str
    provider: str
    provider_label: str
    config: dict
    mensagem_boas_vindas: str | None
    webhook_token: str | None
    webhook_secret: str | None = None
    status: str
    numero_telefone: str | None
    conectado_em: str | None
    evolution_instance_id: str | None
    connection_status: str | None

    model_config = {"from_attributes": True}


class ConectarOut(BaseModel):
    qr_code: str | None
    pairing_code: str | None
    connection_status: str
    instance_id: str | None
    message: str


# ── Helpers ──────────────────────────────────────────────────────────

def _canal_out(c: CanalEntrada, *, webhook_secret: str | None = None) -> CanalOut:
    return CanalOut(
        id=str(c.id),
        workspace_id=str(c.workspace_id),
        tipo=c.tipo,
        nome=c.nome,
        provider=canal_provider(c.tipo, c.config or {}),
        provider_label=canal_provider_label(c.tipo, c.config or {}),
        config=_sanitize_canal_config(c.config or {}),
        mensagem_boas_vindas=c.mensagem_boas_vindas,
        webhook_token=c.webhook_token,
        webhook_secret=webhook_secret,
        status=c.status,
        numero_telefone=c.numero_telefone,
        conectado_em=c.conectado_em.isoformat() if c.conectado_em else None,
        evolution_instance_id=c.evolution_instance_id,
        connection_status=c.connection_status,
    )


def _sanitize_canal_config(config: dict | None) -> dict:
    sanitized = sanitize_webhook_config(config)
    evolution = sanitized.get("evolution")
    if isinstance(evolution, dict):
        evolution.pop("instance_token", None)
        sanitized["evolution"] = evolution
    return sanitized


def _merge_config(existing_config: dict | None, incoming_config: dict | None) -> dict:
    existing = existing_config if isinstance(existing_config, dict) else {}
    incoming = incoming_config if isinstance(incoming_config, dict) else {}

    merged = copy.deepcopy(existing)
    for key, value in incoming.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _merge_config(merged.get(key), value)  # type: ignore[arg-type]
        else:
            merged[key] = copy.deepcopy(value)
    return merged


def _get_canal_or_404(canal_id: uuid.UUID, db: Session) -> CanalEntrada:
    c = db.query(CanalEntrada).filter(CanalEntrada.id == canal_id).first()
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Canal não encontrado")
    return c


def _get_workspace_or_404(workspace_id: uuid.UUID, db: Session) -> Workspace:
    w = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not w:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace não encontrado")
    return w


def _exigir_admin_canal(usuario: User, canal: CanalEntrada, db: Session) -> None:
    """platform_admin OU company_admin do workspace do canal."""
    if usuario.role == RoleUsuario.platform_admin:
        return
    if usuario.role == RoleUsuario.company_admin:
        # company_admin pode editar se o canal pertence ao workspace dele
        uwa = db.query(UserWorkspaceAccess).filter(
            UserWorkspaceAccess.user_id == usuario.id,
            UserWorkspaceAccess.workspace_id == canal.workspace_id,
            UserWorkspaceAccess.ativo.is_(True),
        ).first()
        if uwa:
            return
        if usuario.workspace_id == canal.workspace_id:
            return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para editar este canal")


def _role_value(role: RoleUsuario | str) -> str:
    return role.value if isinstance(role, RoleUsuario) else str(role)


def _workspace_access_role_for_usuario(role: RoleUsuario | str) -> str:
    role_value = _role_value(role)
    if role_value in {"platform_admin", "network_admin", "company_admin"}:
        return "admin"
    if role_value == "network_viewer":
        return "viewer"
    return "editor"


def _workspace_access_role_para_atendimento(usuario: User, workspace_id: uuid.UUID, db: Session) -> str | None:
    if _role_value(usuario.role) == RoleUsuario.platform_admin.value:
        return "admin"

    acesso = db.query(UserWorkspaceAccess).filter(
        UserWorkspaceAccess.user_id == usuario.id,
        UserWorkspaceAccess.workspace_id == workspace_id,
        UserWorkspaceAccess.ativo.is_(True),
    ).first()
    if acesso:
        role = str(acesso.role).strip().lower()
        if role in {"viewer", "editor", "admin"}:
            return role

    if usuario.workspace_id is not None and str(usuario.workspace_id) == str(workspace_id):
        return _workspace_access_role_for_usuario(usuario.role)

    return None


def _exigir_permissao_atendimento(usuario: User, canal: CanalEntrada, db: Session) -> None:
    """Permissão operacional para responder atendimento."""
    if _role_value(usuario.role) == RoleUsuario.platform_admin.value:
        return

    role_acesso = _workspace_access_role_para_atendimento(usuario, canal.workspace_id, db)
    if role_acesso in {"editor", "admin"}:
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Sem permissão para enviar mensagens neste atendimento",
    )


def _uuid_curto(valor: uuid.UUID | str) -> str:
    return uuid.UUID(str(valor)).hex[:8]


def _nome_instancia_evo(canal: CanalEntrada) -> str:
    return f"op7-{_uuid_curto(canal.workspace_id)}-{_uuid_curto(canal.id)}"


def _webhook_base_url() -> str:
    return (settings.SERVER_URL or "https://api.op7franquia.com.br").rstrip("/")


def _evolution_protected_name(canal: CanalEntrada) -> bool:
    evolution = _evolution_config(canal)
    candidates = {
        str(canal.nome or "").strip().lower(),
        str(canal.evolution_instance_id or "").strip().lower(),
        str(evolution.get("instance_name") or "").strip().lower(),
    }
    return "rudy_zap" in candidates


def _configurar_webhook_evolution(canal: CanalEntrada, db: Session, *, forcar: bool = False) -> dict | None:
    if canal.tipo != "whatsapp_evolution":
        return None

    if not canal.webhook_token:
        canal.webhook_token = secrets.token_hex(32)
        db.commit()
        db.refresh(canal)

    instance_name, instance_id, instance_token = _evolution_meta(canal)
    if not instance_id and not instance_token:
        return None

    if not forcar and canal.connection_status not in {"connecting", "connected"} and canal.status != "ativo":
        return None

    webhook_base = _webhook_base_url()
    webhook_url = f"{webhook_base}/webhook/evolution/{canal.webhook_token}"
    try:
        return evo_service.configurar_webhook(
            instance_name,
            webhook_url,
            instance_id=instance_id,
            instance_token=instance_token,
            subscribe=["ALL"],
            immediate=True,
        )
    except evo_service.EvolutionError as exc:
        logger.error("[canais] falha ao configurar webhook Evolution: %s", exc)
        return None


def _instancia_evolution_exata(
    canal: CanalEntrada,
    db: Session,
    instance_name: str,
    instance_id: str | None,
    instance_token: str | None,
) -> dict | None:
    if not instance_name:
        return None

    try:
        instancia = evo_service.obter_instancia(instance_name, instance_id=instance_id)
    except evo_service.EvolutionError:
        return None

    if not instancia:
        return None

    resolved_instance_id = instancia.get("instance_id") or instancia.get("id") or instance_id
    resolved_instance_token = instancia.get("instance_token") or instancia.get("token") or instance_token

    updates: dict[str, str] = {"instance_name": instance_name}
    if resolved_instance_id:
        updates["instance_id"] = str(resolved_instance_id)
    if resolved_instance_token:
        updates["instance_token"] = str(resolved_instance_token)

    _persistir_evolution_meta(canal, db, **updates)
    return {
        "instance_name": instance_name,
        "instance_id": resolved_instance_id,
        "instance_token": resolved_instance_token,
        "raw": instancia,
    }


def _extrair_qr_e_pairing_evolution(payload: object) -> tuple[str | None, str | None]:
    if not isinstance(payload, dict):
        return None, None

    qr_code = payload.get("qr_code") or payload.get("base64")
    if not qr_code:
        qrcode = payload.get("qrcode")
        if isinstance(qrcode, dict):
            qr_code = qrcode.get("base64") or qrcode.get("qr_code") or qrcode.get("qrcode")
        elif isinstance(qrcode, str) and qrcode.strip():
            qr_code = qrcode.strip()

    pairing_code = payload.get("pairing_code") or payload.get("code")
    if not pairing_code:
        pairing_nested = payload.get("qrcode")
        if isinstance(pairing_nested, dict):
            pairing_code = pairing_nested.get("pairing_code") or pairing_nested.get("code")

    if isinstance(qr_code, str):
        qr_code = qr_code.strip() or None
    if isinstance(pairing_code, str):
        pairing_code = pairing_code.strip() or None

    return qr_code, pairing_code


def reaplicar_webhooks_evolution_ativos(db: Session) -> int:
    canais = (
        db.query(CanalEntrada)
        .filter(CanalEntrada.tipo == "whatsapp_evolution")
        .all()
    )
    reaplicados = 0

    for canal in canais:
        if canal.status != "ativo":
            continue
        try:
            _configurar_webhook_evolution(canal, db)
            reaplicados += 1
        except Exception:
            logger.exception("[canais] falha inesperada ao reaplicar webhook Evolution canal=%s", canal.nome)

    return reaplicados


def _normalizar_numero_whatsapp(valor: str | None) -> str | None:
    if not isinstance(valor, str):
        return None

    bruto = valor.strip()
    if not bruto:
        return None

    for sufixo in ("@s.whatsapp.net", "@c.us"):
        bruto = bruto.replace(sufixo, "")

    bruto = bruto.replace("whatsapp:", "").strip()
    digitos = re.sub(r"\D", "", bruto)
    if 10 <= len(digitos) <= 15:
        return digitos
    return None


def _extrair_numero_evolution(payload: object) -> str | None:
    if isinstance(payload, dict):
        for chave in (
            "phone",
            "user",
            "wid",
            "number",
            "ownerJid",
            "me",
            "jid",
            "remoteJid",
            "chat",
            "Chat",
            "senderPn",
            "sender",
        ):
            numero = _normalizar_numero_whatsapp(payload.get(chave))
            if numero:
                return numero

        for valor in payload.values():
            numero = _extrair_numero_evolution(valor)
            if numero:
                return numero
    elif isinstance(payload, list):
        for item in payload:
            numero = _extrair_numero_evolution(item)
            if numero:
                return numero
    elif isinstance(payload, str):
        return _normalizar_numero_whatsapp(payload)
    return None


def _evolution_config(canal: CanalEntrada) -> dict:
    config = canal.config or {}
    evolution = config.get("evolution")
    return evolution if isinstance(evolution, dict) else {}


def _evolution_meta(canal: CanalEntrada) -> tuple[str, str | None, str | None]:
    evolution = _evolution_config(canal)
    instance_name = evolution.get("instance_name") or canal.evolution_instance_id or _nome_instancia_evo(canal)
    instance_id = evolution.get("instance_id")
    instance_token = evolution.get("instance_token")
    return instance_name, instance_id, instance_token


def _helena_instance(canal: CanalEntrada) -> str:
    return f"webhook:{_uuid_curto(canal.id)}"


def _helena_destino_conversa(
    db: Session,
    conversa_id: uuid.UUID,
) -> tuple[str, str, str]:
    result = db.execute(
        text("""
            SELECT c.id, c.contato_id, c.remote_jid, ct.numero_evo, ct.telefone, ct.jid
            FROM public.crm_whatsapp_conversas c
            JOIN public.crm_whatsapp_contatos ct ON ct.id = c.contato_id
            WHERE c.id = :cid
        """),
        {"cid": str(conversa_id)},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    contato_id = str(row[1])
    remote_jid = str(row[2]) if row[2] else ""
    telefone_contato = row[4] or row[3]
    to_phone = helena_service._normalize_phone(telefone_contato)
    if not to_phone:
        raise HTTPException(
            status_code=400,
            detail="Conversa sem telefone do contato configurado para envio via Helena",
        )

    return contato_id, remote_jid or to_phone, to_phone


def _persistir_envio_helena(
    db: Session,
    *,
    canal: CanalEntrada,
    conversa_id: str,
    contato_id: str,
    remote_jid: str,
    texto: str,
    usuario: User,
    provider_response: dict[str, object],
) -> str:
    wa_status = provider_response.get("provider_status_normalized")
    status_label = provider_response.get("provider_status_label")
    provider_message_id = str(provider_response.get("provider_message_id") or "").strip()
    provider_session_id = provider_response.get("provider_session_id")
    provider_status_url = provider_response.get("provider_status_url")
    provider_failure_reason = provider_response.get("provider_failure_reason")
    payload = {
        "provider": "crm_externo_zapi",
        "provider_name": "helena_chat",
        "provider_message_id": provider_message_id,
        "provider_session_id": provider_session_id,
        "provider_status": provider_response.get("provider_status"),
        "provider_status_normalized": wa_status,
        "provider_status_label": status_label,
        "provider_status_url": provider_status_url,
        "provider_failure_reason": provider_failure_reason,
        "provider_raw_response": provider_response.get("raw"),
    }
    message_hash = hashlib.sha256(
        json.dumps(
            {
                "workspace_id": str(canal.workspace_id),
                "canal_id": str(canal.id),
                "instance": _helena_instance(canal),
                "remote_jid": remote_jid,
                "provider_message_id": provider_message_id,
                "direction": "saida",
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()

    row = db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_mensagens (
                workspace_id, canal_id, conversa_id, contato_id, evolution_msg_id,
                message_hash, instance, remote_jid, direcao, from_me, remetente_tipo,
                remetente_nome, conteudo, message_type, status, wa_status, failed_reason,
                payload, enviada_em, recebida_em, created_at, updated_at, ativo
            )
            VALUES (
                CAST(:workspace_id AS uuid), CAST(:canal_id AS uuid), CAST(:conversa_id AS uuid), CAST(:contato_id AS uuid), :evolution_msg_id,
                :message_hash, :instance, :remote_jid, 'saida', true, 'agente',
                :remetente_nome, :conteudo, 'conversation', :status, :wa_status, :failed_reason,
                CAST(:payload AS jsonb), NOW(), NOW(), NOW(), NOW(), true
            )
            RETURNING id
        """),
        {
            "workspace_id": str(canal.workspace_id),
            "canal_id": str(canal.id),
            "conversa_id": conversa_id,
            "contato_id": contato_id,
            "evolution_msg_id": provider_message_id,
            "message_hash": message_hash,
            "instance": _helena_instance(canal),
            "remote_jid": remote_jid,
            "remetente_nome": usuario.nome or usuario.email or "agente",
            "conteudo": texto,
            "status": status_label or wa_status or "enviada",
            "wa_status": wa_status,
            "failed_reason": provider_failure_reason if wa_status == "failed" else None,
            "payload": json.dumps(payload, ensure_ascii=False),
        },
    ).fetchone()

    if not row:
        raise RuntimeError("Falha ao persistir mensagem outbound Helena")
    return str(row[0])


def _atualizar_conversa_saida_helena(
    db: Session,
    *,
    conversa_id: str,
    texto: str,
) -> None:
    db.execute(
        text("""
            UPDATE public.crm_whatsapp_conversas
            SET ultima_mensagem = :ultima_mensagem,
                ultima_direcao = 'saida',
                ultima_msg_at = NOW(),
                last_outbound_at = NOW(),
                updated_at = NOW()
            WHERE id = CAST(:conversa_id AS uuid)
        """),
        {
            "conversa_id": conversa_id,
            "ultima_mensagem": texto[:500],
        },
    )


def _enviar_mensagem_helena_chat(
    canal: CanalEntrada,
    payload: EnviarMensagemIn,
    db: Session,
    usuario: User,
) -> EnviarMensagemOut:
    """Envia mensagem via Helena Chat para canais crm_externo_zapi."""
    texto = (payload.texto or "").strip()
    if payload.tipo != "texto" or payload.media_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Helena Chat no momento aceita apenas mensagens de texto.",
        )
    if not texto:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Texto obrigatório para envio via Helena Chat.",
        )
    if not payload.conversa_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe conversa_id para enviar mensagem via Helena Chat.",
        )

    try:
        conversa_uuid = uuid.UUID(payload.conversa_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="conversa_id inválido.",
        ) from exc

    try:
        contato_id, remote_jid, to_phone = _helena_destino_conversa(db, conversa_uuid)
        provider_response = helena_service.send_text_message(
            canal,
            to_phone=to_phone,
            text=texto,
        )
    except helena_service.HelenaChatError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    mensagem_id = _persistir_envio_helena(
        db,
        canal=canal,
        conversa_id=payload.conversa_id,
        contato_id=contato_id,
        remote_jid=remote_jid,
        texto=texto,
        usuario=usuario,
        provider_response=provider_response,
    )
    _atualizar_conversa_saida_helena(
        db,
        conversa_id=payload.conversa_id,
        texto=texto,
    )
    db.commit()

    try:
        publish_whatsapp_event(
            {
                "type": "message.upsert",
                "workspaceId": str(canal.workspace_id),
                "conversaId": str(payload.conversa_id),
                "remoteJid": remote_jid,
                "direction": "saida",
                "text": texto,
                "instance": _helena_instance(canal),
                "messageType": "conversation",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception as exc:
        logger.info("[enviar-helena] REDIS FALHOU: %s", exc)

    return EnviarMensagemOut(ok=True, mensagem_id=str(mensagem_id), evolution_response=provider_response)


def _extrair_qr_code_evolution(payload: object) -> str | None:
    qr_code, _ = _extrair_qr_e_pairing_evolution(payload)
    return qr_code


def _extrair_pairing_code_evolution(payload: object) -> str | None:
    _, pairing_code = _extrair_qr_e_pairing_evolution(payload)
    return pairing_code


def _persistir_evolution_meta(
    canal: CanalEntrada,
    db: Session,
    **updates,
) -> dict:
    config = dict(canal.config or {})
    evolution = dict(config.get("evolution") or {})
    for chave, valor in updates.items():
        if valor is not None:
            evolution[chave] = valor
    config["evolution"] = evolution
    canal.config = config
    if updates.get("instance_name") is not None:
        canal.evolution_instance_id = str(updates["instance_name"])
    db.commit()
    db.refresh(canal)
    return evolution


def _normalizar_evento_evolution(event: str) -> str:
    return normalize_whatsapp_event_type(event)


def _evolution_payload_raiz(payload: dict | None) -> dict:
    return payload_root(payload)


def _evolution_info(payload: dict | None) -> dict:
    return payload_info(payload)


def _evolution_message(payload: dict | None) -> dict:
    return payload_message(payload)


def _evolution_message_type(payload: dict | None, fallback: str = "conversation") -> str:
    return normalize_message_type(payload, fallback=fallback)


def _evolution_media_payload(payload: dict | None) -> dict:
    media = normalize_media_payload(payload)
    return {
        "base64": media.base64,
        "url": media.url,
        "mimetype": media.mimetype,
        "filename": media.filename,
        "caption": media.caption,
    }


def _evolution_text_and_mentions(payload: dict | None, canal: CanalEntrada) -> tuple[str, bool]:
    normalized = normalize_message_event(payload, instance=getattr(canal, "evolution_instance_id", None))
    is_mentioned = normalized.is_channel_mentioned(getattr(canal, "numero_telefone", None))
    if is_mentioned:
        logger.info("[webhook-process] MENTION detected: %s", normalized.mentioned_jids)
    return normalized.text, is_mentioned


# ── CRUD ─────────────────────────────────────────────────────────────

@router.get("/canais", response_model=list[CanalOut], response_model_exclude_none=True)
def listar_todos_canais(
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
    workspace_acesso=Depends(get_workspace_atual),
):
    q = db.query(CanalEntrada)
    if workspace_acesso is None:
        pass
    elif isinstance(workspace_acesso, list):
        q = q.filter(CanalEntrada.workspace_id.in_(workspace_acesso))
    else:
        q = q.filter(CanalEntrada.workspace_id == workspace_acesso)
    return [_canal_out(c) for c in q.all()]


@router.get("/workspaces/{workspace_id}/canais", response_model=list[CanalOut], response_model_exclude_none=True)
def listar_canais(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    _get_workspace_or_404(workspace_id, db)
    verificar_acesso_workspace(usuario, workspace_id, db)
    canais = db.query(CanalEntrada).filter(CanalEntrada.workspace_id == workspace_id).all()
    return [_canal_out(c) for c in canais]


@router.post(
    "/workspaces/{workspace_id}/canais",
    response_model=CanalOut,
    status_code=status.HTTP_201_CREATED,
    response_model_exclude_none=True,
)
def criar_canal(
    workspace_id: uuid.UUID,
    payload: CanalIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    _get_workspace_or_404(workspace_id, db)
    verificar_acesso_workspace(usuario, workspace_id, db)

    webhook_token = secrets.token_hex(32) if payload.tipo in ("webhook", "whatsapp_waha") else None
    stored_config = payload.config or {}
    webhook_secret: str | None = None
    if payload.tipo == "webhook":
        stored_config, webhook_secret, _ = prepare_webhook_config(
            stored_config,
            generate_secret=True,
        )

    c = CanalEntrada(
        workspace_id=workspace_id,
        tipo=payload.tipo,
        nome=payload.nome,
        config=stored_config,
        mensagem_boas_vindas=payload.mensagem_boas_vindas,
        webhook_token=webhook_token,
        status=payload.status,
    )
    db.add(c)
    db.commit()
    db.refresh(c)

    if c.tipo == "whatsapp_waha":
        waha = (c.config or {}).get("waha", {})
        if not waha.get("api_base_url"):
            waha["api_base_url"] = os.getenv("WAHA_API_BASE_URL", "http://waha:3000")
        if not waha.get("api_key_ref"):
            waha["api_key_ref"] = os.getenv("WAHA_API_KEY_REF", "WAHA_API_KEY")
        if not waha.get("session"):
            waha["session"] = f"op7-{str(c.id).replace('-', '')[:12]}"
        c.config = {**(c.config or {}), "waha": waha}
        db.commit()
        db.refresh(c)

    return _canal_out(c, webhook_secret=webhook_secret)


@router.get("/canais/{canal_id}", response_model=CanalOut, response_model_exclude_none=True)
def detalhar_canal(
    canal_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    c = _get_canal_or_404(canal_id, db)
    verificar_acesso_workspace(usuario, c.workspace_id, db)
    return _canal_out(c)


@router.put("/canais/{canal_id}", response_model=CanalOut, response_model_exclude_none=True)
def atualizar_canal(
    canal_id: uuid.UUID,
    payload: CanalUpdate,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    c = _get_canal_or_404(canal_id, db)
    _exigir_admin_canal(usuario, c, db)
    stored_config = _merge_config(c.config or {}, payload.config or {})
    if c.tipo == "webhook":
        stored_config, _, _ = prepare_webhook_config(
            stored_config,
            existing_config=c.config,
            generate_secret=True,
        )
    c.nome = payload.nome
    c.config = stored_config
    c.mensagem_boas_vindas = payload.mensagem_boas_vindas
    c.status = payload.status
    db.commit()
    db.refresh(c)
    return _canal_out(c)


@router.post(
    "/canais/{canal_id}/webhook-secret/rotacionar",
    response_model=CanalOut,
    response_model_exclude_none=True,
)
def rotacionar_webhook_secret(
    canal_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    c = _get_canal_or_404(canal_id, db)
    _exigir_admin_canal(usuario, c, db)
    if c.tipo != "webhook":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Canal não é webhook")

    stored_config, webhook_secret, _ = prepare_webhook_config(
        c.config,
        existing_config=c.config,
        generate_secret=False,
        force_new_secret=True,
    )
    c.config = stored_config
    db.commit()
    db.refresh(c)

    return _canal_out(c, webhook_secret=webhook_secret)


@router.delete("/canais/{canal_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_canal(
    canal_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    c = _get_canal_or_404(canal_id, db)
    _exigir_admin_canal(usuario, c, db)

    # Se for Evolution, deletar instância na Evolution API
    if c.tipo == "whatsapp_evolution":
        evolution = _evolution_config(c)
        pode_deletar = evolution.get("managed_by") == "op7nexo" or evolution.get("created_by_connect_flow") is True
        if pode_deletar and not _evolution_protected_name(c):
            instance_name, instance_id, instance_token = _evolution_meta(c)
            try:
                evo_service.deletar_instancia(c.evolution_instance_id or instance_name, instance_id=instance_id, instance_token=instance_token)
            except evo_service.EvolutionError as exc:
                logger.error("[canais] falha ao deletar instância Evolution: %s", exc)
        else:
            logger.info("[canais] preservando instância Evolution legada/protegida canal=%s", c.nome)

    db.delete(c)
    db.commit()


# ── Helpers WAHA ─────────────────────────────────────────────────────

def _waha_cfg(canal: CanalEntrada) -> tuple[str, dict]:
    """Retorna (session_name, waha_config) para canal whatsapp_waha."""
    cfg = (canal.config or {}).get("waha", {})
    session = cfg.get("session") or canal.nome or "default"
    return session, cfg


def _waha_chat_id(remote_jid: str) -> str:
    """Deriva chatId para WAHA a partir do remote_jid armazenado.

    Se já contém @ (qualquer sufixo: @c.us, @g.us, @lid, @s.whatsapp.net…):
    usa como está — não converte sufixo.
    Se é número/dígitos puros: acrescenta @c.us.
    """
    jid = (remote_jid or "").strip()
    if "@" in jid:
        return jid
    digits = re.sub(r"\D", "", jid)
    if digits:
        return f"{digits}@c.us"
    return jid


def _waha_webhook_base_url() -> str:
    """URL interna acessível pelo container WAHA (Docker bridge) para entrega de webhooks."""
    return os.getenv("WAHA_INTERNAL_WEBHOOK_BASE_URL", "http://op7nexo-api:8000")


def _extract_waha_message_id(resp: dict) -> str:
    """Extrai o ID da mensagem da resposta WAHA, tentando múltiplos caminhos."""
    if not isinstance(resp, dict):
        return ""
    candidates = [
        resp.get("id"),
        (resp.get("key") or {}).get("id") if isinstance(resp.get("key"), dict) else None,
        (resp.get("_data") or {}).get("id") if isinstance(resp.get("_data"), dict) else None,
        (resp.get("message") or {}).get("id") if isinstance(resp.get("message"), dict) else None,
    ]
    data = resp.get("data")
    if isinstance(data, dict):
        key = data.get("key")
        if isinstance(key, dict):
            candidates.append(key.get("id"))
    # WAHA NOWEB sendImage/sendFile pode retornar resp["id"] como dict {"id": "3EB0..."}
    raw_id = resp.get("id")
    if isinstance(raw_id, dict):
        candidates.append(raw_id.get("id"))
    for value in candidates:
        if isinstance(value, str):
            text = value.strip()
            if text:
                return text
    return ""


def _conectar_waha(canal: CanalEntrada, db: Session) -> ConectarOut:
    import time as _time

    session, cfg = _waha_cfg(canal)

    if not canal.webhook_token:
        canal.webhook_token = secrets.token_hex(32)
        db.commit()
        db.refresh(canal)

    # Estado atual
    try:
        state = waha_service.estado_sessao(session, cfg)
        waha_status = state.get("status", "STOPPED")
    except waha_service.WahaError:
        state = None
        waha_status = "STOPPED"

    # Criar/iniciar se parada
    if waha_status in ("STOPPED", "FAILED") or state is None:
        try:
            waha_service.criar_sessao(session, cfg)
        except waha_service.WahaError as exc:
            logger.warning("[canais] WAHA criar_sessao: %s", exc)
        try:
            waha_service.iniciar_sessao(session, cfg)
        except waha_service.WahaError as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    # Configurar webhook
    webhook_url = f"{_waha_webhook_base_url()}/webhook/waha/{canal.webhook_token}"
    try:
        waha_service.configurar_webhook(session, webhook_url, cfg)
    except waha_service.WahaError as exc:
        logger.warning("[canais] WAHA configurar_webhook: %s", exc)

    # Aguardar init e reler estado
    _time.sleep(1)
    try:
        state = waha_service.estado_sessao(session, cfg)
        waha_status = state.get("status", "STARTING")
    except waha_service.WahaError:
        waha_status = "STARTING"

    conn_status = waha_service.STATUS_MAP.get(waha_status, "connecting")

    if conn_status == "connected":
        canal.connection_status = "connected"
        canal.status = "ativo"
        canal.conectado_em = datetime.now(timezone.utc)
        me = (state or {}).get("me") or {}
        jid = me.get("id") or ""
        if jid:
            canal.numero_telefone = jid.split("@")[0]
        db.commit()
        return ConectarOut(
            qr_code=None,
            pairing_code=None,
            connection_status="connected",
            instance_id=None,
            message="Sessão WAHA já está conectada",
        )

    canal.connection_status = "connecting"
    db.commit()

    try:
        qr_data = waha_service.obter_qr(session, cfg)
    except waha_service.WahaError as exc:
        logger.warning("[canais] WAHA obter_qr: %s", exc)
        qr_data = None

    if qr_data is None:
        return ConectarOut(
            qr_code=None,
            pairing_code=None,
            connection_status="connecting",
            instance_id=None,
            message=f"Aguardando WAHA gerar QR — estado: {waha_status}",
        )

    qr_b64 = qr_data.get("data") or qr_data.get("base64")
    return ConectarOut(
        qr_code=qr_b64,
        pairing_code=None,
        connection_status="connecting",
        instance_id=None,
        message="Escaneie o QR code com seu WhatsApp",
    )


def _status_waha(canal: CanalEntrada, db: Session) -> dict:
    session, cfg = _waha_cfg(canal)
    try:
        state = waha_service.estado_sessao(session, cfg)
        waha_status = state.get("status", "STOPPED")
        conn_status = waha_service.STATUS_MAP.get(waha_status, "disconnected")

        qr_b64 = None
        if conn_status == "connecting":
            try:
                qr_data = waha_service.obter_qr(session, cfg)
                if qr_data:
                    qr_b64 = qr_data.get("data") or qr_data.get("base64")
            except waha_service.WahaError:
                pass

        if conn_status == "connected":
            canal.connection_status = "connected"
            canal.status = "ativo"
            if not canal.conectado_em:
                canal.conectado_em = datetime.now(timezone.utc)
            me = state.get("me") or {}
            jid = me.get("id") or ""
            if jid:
                canal.numero_telefone = jid.split("@")[0]
            db.commit()
        elif conn_status == "connecting":
            if canal.connection_status != "connecting":
                canal.connection_status = "connecting"
                db.commit()
        else:
            if canal.connection_status != "disconnected":
                canal.connection_status = "disconnected"
                db.commit()

        db.refresh(canal)
        return {
            "connection_status": canal.connection_status,
            "evolution_state": waha_status,
            "instance_id": None,
            "numero_telefone": canal.numero_telefone,
            "conectado_em": canal.conectado_em.isoformat() if canal.conectado_em else None,
            "qr_code": qr_b64,
            "pairing_code": None,
        }
    except waha_service.WahaError as exc:
        return {
            "connection_status": canal.connection_status,
            "evolution_state": "unknown",
            "instance_id": None,
            "error": str(exc),
        }


def _desconectar_waha(canal: CanalEntrada, db: Session) -> dict:
    session, cfg = _waha_cfg(canal)
    try:
        waha_service.parar_sessao(session, cfg)
    except waha_service.WahaError as exc:
        logger.warning("[canais] WAHA parar_sessao: %s", exc)
    canal.connection_status = "disconnected"
    canal.numero_telefone = None
    canal.conectado_em = None
    db.commit()
    return {"status": "disconnected", "message": "Sessão WAHA parada."}


def _enviar_mensagem_waha(
    canal: CanalEntrada,
    payload: "EnviarMensagemIn",
    db: Session,
    usuario: "User",
) -> "EnviarMensagemOut":
    """Envia mensagem de texto, imagem ou documento via WAHA Plus."""
    from urllib.parse import urlparse, unquote
    from datetime import timedelta
    from app.services.object_storage import get_minio_client

    texto = (payload.texto or "").strip()

    # Validações de entrada
    if not payload.conversa_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="conversa_id obrigatório para envio WAHA.",
        )
    if payload.tipo == "texto" and not texto:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Texto obrigatório.")
    if payload.tipo in ("image", "document", "video", "audio") and not payload.media_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="media_url obrigatório para envio de mídia.")
    if payload.tipo not in ("texto", "image", "document", "video", "audio"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"WAHA: tipo '{payload.tipo}' não suportado nesta fase.",
        )

    # Resolve conversa + contato com verificação de multi-tenancy em ambas as tabelas
    conv_result = db.execute(
        text("""
            SELECT c.id, c.contato_id, c.remote_jid, ct.telefone
            FROM public.crm_whatsapp_conversas c
            JOIN public.crm_whatsapp_contatos ct
              ON ct.id = c.contato_id
             AND ct.workspace_id = CAST(:workspace_id AS uuid)
            WHERE c.id           = CAST(:cid AS uuid)
              AND c.workspace_id = CAST(:workspace_id AS uuid)
              AND c.canal_id     = CAST(:canal_id AS uuid)
        """),
        {
            "cid":          payload.conversa_id,
            "workspace_id": str(canal.workspace_id),
            "canal_id":     str(canal.id),
        },
    )
    conv_row = conv_result.fetchone()
    if not conv_row:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    conversa_id = conv_row[0]
    contato_id  = conv_row[1]
    remote_jid  = str(conv_row[2] or conv_row[3] or "").strip()

    if not remote_jid:
        raise HTTPException(status_code=400, detail="Conversa sem destinatário configurado.")

    chat_id      = _waha_chat_id(remote_jid)
    session, cfg = _waha_cfg(canal)
    instance     = session  # config.waha.session — espelha o inbound

    # ── Branch mídia (image / document / video / audio) ─────────────────
    if payload.media_url and payload.tipo in ("image", "document", "video", "audio"):
        BUCKET = "whatsapp-media"
        URL_PREFIX = f"/meta/storage/{BUCKET}/"

        parsed    = urlparse(payload.media_url)
        raw_path  = unquote(parsed.path)
        if not raw_path.startswith(URL_PREFIX):
            raise HTTPException(400, f"media_url deve ter path iniciando em {URL_PREFIX}")
        object_key = raw_path[len(URL_PREFIX):]
        if not object_key:
            raise HTTPException(400, "object_key vazio extraído de media_url.")

        minio_client = get_minio_client()

        # Metadados reais via stat_object
        try:
            stat      = minio_client.stat_object(BUCKET, object_key)
            real_size = stat.size or 0
            stat_ct   = (stat.content_type or "").split(";")[0].strip()
        except Exception:
            real_size = 0
            stat_ct   = ""

        # Prioridade de mimetype
        if stat_ct and stat_ct not in ("application/octet-stream", "binary/octet-stream", ""):
            mimetype = stat_ct
        else:
            guessed, _ = mimetypes.guess_type(object_key)
            if guessed:
                mimetype = guessed
            elif payload.tipo == "image":
                mimetype = "image/jpeg"
            elif payload.tipo == "video":
                mimetype = "video/mp4"
            else:
                mimetype = "application/pdf" if object_key.lower().endswith(".pdf") else "application/octet-stream"

        filename = os.path.basename(object_key)

        # Presigned URL interna acessível pelo container WAHA (http://minio:9000)
        presigned = minio_client.presigned_get_object(
            BUCKET, object_key, expires=timedelta(minutes=10)
        )

        caption_to_send = None if payload.tipo == "audio" else (payload.caption or None)
        try:
            waha_resp = waha_service.enviar_mensagem_midia(
                session, cfg, chat_id, payload.tipo,
                media_url=presigned,
                mimetype=mimetype,
                filename=filename,
                caption=caption_to_send,
            )
        except waha_service.WahaError as exc:
            logger.error("[canais] falha ao enviar mídia WAHA canal=%s tipo=%s", canal.id, payload.tipo)
            raise HTTPException(status_code=502, detail=str(exc))

        logger.debug(
            "[canais] waha-media-resp tipo=%s keys=%s id_type=%s",
            payload.tipo,
            list(waha_resp.keys()) if waha_resp else [],
            type(waha_resp.get("id")).__name__,
        )
        provider_msg_id = _extract_waha_message_id(waha_resp)
        if payload.tipo == "image":
            message_type = "imageMessage"
        elif payload.tipo == "video":
            message_type = "videoMessage"
        elif payload.tipo == "audio":
            message_type = "audioMessage"
        else:
            message_type = "documentMessage"
        msg_conteudo    = payload.caption or "[mídia]"
        media_status_val = "ready"

    # ── Branch texto ──────────────────────────────────────────────────────
    else:
        try:
            waha_resp = waha_service.enviar_mensagem_texto(session, cfg, chat_id, texto)
        except waha_service.WahaError as exc:
            logger.error("[canais] falha ao enviar mensagem WAHA canal=%s", canal.id)
            raise HTTPException(status_code=502, detail=str(exc))

        provider_msg_id  = _extract_waha_message_id(waha_resp)
        message_type     = "conversation"
        msg_conteudo     = texto
        media_status_val = None
        object_key       = None
        mimetype         = None
        filename         = None
        real_size        = 0

    # Atualiza conversa com multi-tenancy no WHERE
    db.execute(
        text("""
            UPDATE public.crm_whatsapp_conversas
            SET ultima_mensagem  = :msg,
                ultima_direcao   = 'saida',
                ultima_msg_at    = NOW(),
                last_outbound_at = NOW(),
                updated_at       = NOW()
            WHERE id           = CAST(:cid AS uuid)
              AND workspace_id = CAST(:workspace_id AS uuid)
              AND canal_id     = CAST(:canal_id AS uuid)
        """),
        {
            "msg":          msg_conteudo[:500],
            "cid":          str(conversa_id),
            "workspace_id": str(canal.workspace_id),
            "canal_id":     str(canal.id),
        },
    )

    # Persiste mensagem
    msg_result = db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_mensagens (
                workspace_id, canal_id, conversa_id, contato_id,
                evolution_msg_id, instance, remote_jid,
                direcao, from_me, remetente_tipo, remetente_nome,
                conteudo, message_type, status, media_status,
                recebida_em, created_at, updated_at
            ) VALUES (
                CAST(:ws   AS uuid), CAST(:canal AS uuid),
                CAST(:cid  AS uuid), CAST(:ct   AS uuid),
                :evid, :inst, :jid,
                'saida', true, 'agente', :rn,
                :msg, :mt, 'enviada', :ms,
                NOW(), NOW(), NOW()
            ) RETURNING id
        """),
        {
            "ws":    str(canal.workspace_id),
            "canal": str(canal.id),
            "cid":   str(conversa_id),
            "ct":    str(contato_id),
            "evid":  provider_msg_id,
            "inst":  instance,
            "jid":   remote_jid,
            "rn":    usuario.nome or usuario.email or "agente",
            "msg":   msg_conteudo,
            "mt":    message_type,
            "ms":    media_status_val,
        },
    )
    mensagem_id = msg_result.scalar()

    # Persiste mídia (image / document / video / audio)
    if payload.media_url and payload.tipo in ("image", "document", "video", "audio") and object_key:
        stored_like = StoredMedia(
            bucket="whatsapp-media",
            object_key=object_key,
            url=payload.media_url,
            mimetype=mimetype or "application/octet-stream",
            size=real_size,
            sha256="",
            filename=filename or object_key,
            media_type=payload.tipo,
        )
        register_media_record(
            db,
            workspace_id=str(canal.workspace_id),
            canal_id=str(canal.id),
            conversa_id=str(conversa_id),
            mensagem_id=str(mensagem_id),
            stored=stored_like,
            caption=None if payload.tipo == "audio" else payload.caption,
            storage_status="ready",
        )

    db.commit()

    try:
        publish_whatsapp_event({
            "type":        "message.upsert",
            "workspaceId": str(canal.workspace_id),
            "conversaId":  str(conversa_id),
            "remoteJid":   remote_jid,
            "direction":   "saida",
            "text":        msg_conteudo,
            "instance":    instance,
            "messageType": message_type,
            "timestamp":   datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:
        logger.info("[enviar-waha] REDIS FALHOU: %s", exc)

    return EnviarMensagemOut(
        ok=True,
        mensagem_id=str(mensagem_id),
        evolution_response={"id": provider_msg_id},
    )


# ── Conectar / Desconectar (Evolution) ───────────────────────────────

@router.post("/canais/{canal_id}/conectar", response_model=ConectarOut)
def conectar_canal(
    canal_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    c = _get_canal_or_404(canal_id, db)
    _exigir_admin_canal(usuario, c, db)

    if c.tipo == "whatsapp_waha":
        return _conectar_waha(c, db)
    if c.tipo != "whatsapp_evolution":
        raise HTTPException(status_code=400, detail="Operação disponível apenas para WhatsApp Evolution")
    if _evolution_protected_name(c):
        raise HTTPException(
            status_code=409,
            detail="Canal legado protegido não participa do fluxo automático de desconexão",
        )

    instance_name, instance_id, instance_token = _evolution_meta(c)
    connect_data: dict | None = None

    if _evolution_protected_name(c):
        raise HTTPException(
            status_code=409,
            detail="Canal legado protegido não participa do fluxo automático de conexão",
        )

    existe_exato = False
    if instance_name:
        exacta = _instancia_evolution_exata(c, db, instance_name, instance_id, instance_token)
        if exacta:
            existe_exato = True
            instance_name = exacta["instance_name"]
            instance_id = exacta["instance_id"] or instance_id
            instance_token = exacta["instance_token"] or instance_token

    if not existe_exato:
        instance_name = _nome_instancia_evo(c)
        instance_token = instance_token or str(uuid.uuid4())
        try:
            instancia = evo_service.criar_instancia(instance_name, token=instance_token)
            instance_id = instancia.get("instance_id") or instancia.get("id") or instance_id
            instance_token = instancia.get("instance_token") or instancia.get("token") or instance_token
            _persistir_evolution_meta(
                c,
                db,
                managed_by="op7nexo",
                created_by_connect_flow=True,
                instance_name=instance_name,
                instance_id=instance_id,
                instance_token=instance_token,
            )
        except evo_service.EvolutionError as exc:
            logger.warning("[canais] instância Evolution não pôde ser criada: %s", exc)
            raise HTTPException(status_code=502, detail=str(exc))

    _configurar_webhook_evolution(c, db, forcar=True)

    try:
        state = evo_service.estado_conexao(instance_name, instance_id=instance_id, instance_token=instance_token)
        conn_state = state.get("state") or state.get("instance", {}).get("state", "close")
        if conn_state == "open":
            c.status = "ativo"
            c.connection_status = "connected"
            c.conectado_em = datetime.now(timezone.utc)
            numero = _extrair_numero_evolution(state)
            if numero:
                c.numero_telefone = numero
            db.commit()
            _configurar_webhook_evolution(c, db, forcar=True)
            return ConectarOut(
                qr_code=None,
                pairing_code=None,
                connection_status="connected",
                instance_id=instance_id,
                message="Instância já está conectada",
            )

        qr_data = evo_service.obter_qr_code(
            instance_name,
            instance_id=instance_id,
            instance_token=instance_token,
            retries=4,
        )
        qr_code, pairing_code = _extrair_qr_e_pairing_evolution(qr_data)
        c.connection_status = "connecting"
        db.commit()
        return ConectarOut(
            qr_code=qr_code,
            pairing_code=pairing_code,
            connection_status="connecting",
            instance_id=instance_id,
            message=(
                "Escaneie o QR code com seu WhatsApp"
                if qr_code
                else "Digite o código de pareamento no WhatsApp"
                if pairing_code
                else "Aguardando geração do QR code pela Evolution"
            ),
        )
    except evo_service.EvolutionError as exc:
        # Verificar se já está conectado
        try:
            state = evo_service.estado_conexao(instance_name, instance_id=instance_id, instance_token=instance_token)
            conn_state = state.get("state") or state.get("instance", {}).get("state", "close")
            if conn_state == "open":
                c.status = "ativo"
                c.connection_status = "connected"
                numero = _extrair_numero_evolution(state)
                if numero:
                    c.numero_telefone = numero
                db.commit()
                try:
                    _configurar_webhook_evolution(c, db, forcar=True)
                except evo_service.EvolutionError as exc:
                    logger.error("[canais] falha ao reconfigurar webhook Evolution: %s", exc)
                return ConectarOut(
                    qr_code=None,
                    pairing_code=None,
                    connection_status="connected",
                    instance_id=instance_id,
                    message="Instância já está conectada",
                )
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/canais/{canal_id}/status-evolution")
def status_evolution(
    canal_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    """Consulta o status real da instância na Evolution/WAHA e atualiza o banco."""
    c = _get_canal_or_404(canal_id, db)
    _exigir_admin_canal(usuario, c, db)

    if c.tipo == "whatsapp_waha":
        return _status_waha(c, db)
    if c.tipo != "whatsapp_evolution":
        raise HTTPException(status_code=400, detail="Operação disponível apenas para WhatsApp Evolution")

    instance_name, instance_id, instance_token = _evolution_meta(c)

    try:
        state_data = evo_service.estado_conexao(instance_name, instance_id=instance_id, instance_token=instance_token)
        conn_state = str(state_data.get("state") or state_data.get("instance", {}).get("state", "close")).lower()
        qr_code = None
        pairing_code = None

        if conn_state == "open":
            c.status = "ativo"
            c.connection_status = "connected"
            from datetime import datetime, timezone
            c.conectado_em = datetime.now(timezone.utc)
            numero = _extrair_numero_evolution(state_data)
            if numero:
                c.numero_telefone = numero
            db.commit()
            try:
                _configurar_webhook_evolution(c, db, forcar=True)
            except evo_service.EvolutionError as exc:
                logger.error("[canais] falha ao reconfigurar webhook Evolution: %s", exc)
        elif conn_state == "connecting":
            c.connection_status = "connecting"
            db.commit()
        elif conn_state == "close":
            c.status = "inativo"
            c.connection_status = "disconnected"
            db.commit()

        if conn_state != "open":
            try:
                qr_data = evo_service.obter_qr_code(instance_name, instance_id=instance_id, instance_token=instance_token, retries=1)
                qr_code = _extrair_qr_code_evolution(qr_data)
                pairing_code = _extrair_pairing_code_evolution(qr_data)
            except evo_service.EvolutionError:
                qr_code = None
                pairing_code = None

        db.refresh(c)
        return {
            "connection_status": c.connection_status,
            "evolution_state": conn_state,
            "instance_id": instance_id,
            "numero_telefone": c.numero_telefone,
            "conectado_em": c.conectado_em.isoformat() if c.conectado_em else None,
            "qr_code": qr_code,
            "pairing_code": pairing_code,
        }
    except evo_service.EvolutionError as exc:
        return {
            "connection_status": c.connection_status,
            "evolution_state": "unknown",
            "instance_id": instance_id,
            "error": str(exc),
        }


@router.post("/canais/{canal_id}/desconectar")
def desconectar_canal(
    canal_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    c = _get_canal_or_404(canal_id, db)
    _exigir_admin_canal(usuario, c, db)

    if c.tipo == "whatsapp_waha":
        return _desconectar_waha(c, db)
    if c.tipo != "whatsapp_evolution":
        raise HTTPException(status_code=400, detail="Operação disponível apenas para WhatsApp Evolution")

    instance_name, instance_id, instance_token = _evolution_meta(c)

    try:
        evo_service.desconectar_instancia(instance_name, instance_id=instance_id, instance_token=instance_token)
    except evo_service.EvolutionError:
        pass

    c.status = "inativo"
    c.connection_status = "disconnected"
    c.numero_telefone = None
    c.conectado_em = None
    db.commit()
    return {"status": "disconnected", "message": "WhatsApp desconectado. A instância foi preservada na Evolution."}


# ── Enviar mensagem ──────────────────────────────────────────────────

class EnviarMensagemIn(BaseModel):
    numero: str | None = None  # fallback se nao tiver conversa_id
    texto: str | None = None
    conversa_id: str | None = None
    tipo: str = "texto"  # texto, image, audio, video, document
    media_url: str | None = None
    caption: str | None = None


class EnviarMensagemOut(BaseModel):
    ok: bool
    mensagem_id: str
    evolution_response: dict | None


class UploadMidiaOut(BaseModel):
    ok: bool
    media_url: str
    minio_path: str
    mimetype: str
    filename: str
    tamanho: int
    sha256: str
    tipo: str


@router.post("/canais/{canal_id}/upload-midia", response_model=UploadMidiaOut)
async def upload_midia_canal(
    canal_id: uuid.UUID,
    arquivo: UploadFile = File(...),
    conversa_id: str | None = Form(None),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    c = _get_canal_or_404(canal_id, db)
    _exigir_permissao_atendimento(usuario, c, db)
    content = await arquivo.read()
    mimetype = arquivo.content_type or mimetypes.guess_type(arquivo.filename or "")[0] or "application/octet-stream"
    mensagem_id = str(uuid.uuid4())
    stored = store_media_bytes(
        workspace_id=str(c.workspace_id),
        conversa_id=conversa_id or "outbound",
        mensagem_id=mensagem_id,
        content=content,
        mimetype=mimetype,
        filename=arquivo.filename,
    )
    return UploadMidiaOut(
        ok=True,
        media_url=stored.url,
        minio_path=stored.object_key,
        mimetype=stored.mimetype,
        filename=stored.filename,
        tamanho=stored.size,
        sha256=stored.sha256,
        tipo=stored.media_type,
    )


def _enviar_mensagem_meta_cloud(
    canal: CanalEntrada,
    payload: EnviarMensagemIn,
    db: Session,
    usuario: User,
) -> EnviarMensagemOut:
    """Envia mensagem via Meta Cloud API."""
    from app.services import meta_cloud as meta_service
    from sqlalchemy import text

    config = canal.config or {}
    phone_number_id = config.get("phone_number_id", "")
    access_token = config.get("access_token", "")

    if not phone_number_id or not access_token:
        raise HTTPException(status_code=400, detail="Canal Meta Cloud não configurado. Verifique phone_number_id e access_token.")

    # Resolve número destinatário
    to = None
    conversa_id = None
    contato_id = None

    if payload.conversa_id:
        conv_result = db.execute(
            text("""
                SELECT c.id, c.contato_id, ct.jid, ct.telefone
                FROM public.crm_whatsapp_conversas c
                JOIN public.crm_whatsapp_contatos ct ON ct.id = c.contato_id
                WHERE c.id = :cid
            """),
            {"cid": payload.conversa_id},
        )
        conv_row = conv_result.fetchone()
        if not conv_row:
            raise HTTPException(status_code=404, detail="Conversa não encontrada")
        conversa_id = conv_row[0]
        contato_id = conv_row[1]
        to = conv_row[2] or conv_row[3] or ""
    elif payload.numero:
        to = payload.numero.replace("@s.whatsapp.net", "").replace("@c.us", "")
    else:
        raise HTTPException(status_code=400, detail="Informe numero ou conversa_id")

    # Envia para Meta Cloud API
    try:
        meta_resp = meta_service.enviar_mensagem_texto(
            phone_number_id=phone_number_id,
            access_token=access_token,
            to=to,
            text=payload.texto or "",
        )
    except meta_service.MetaCloudError as exc:
        logger.error("[canais] falha ao enviar mensagem Meta Cloud: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))

    wamid = meta_resp.get("messages", [{}])[0].get("id", "") if isinstance(meta_resp, dict) else ""

    # Cria/atualiza conversa se necessário
    if not conversa_id:
        # Upsert contato
        contato_result = db.execute(
            text("""
                INSERT INTO public.crm_whatsapp_contatos (workspace_id, jid, telefone, nome, origem, created_at, updated_at)
                VALUES (:ws, :jid, :tel, :nome, 'meta', NOW(), NOW())
                ON CONFLICT (workspace_id, jid) DO UPDATE SET updated_at = NOW()
                RETURNING id
            """),
            {
                "ws": str(canal.workspace_id),
                "jid": to,
                "tel": to,
                "nome": to,
            },
        )
        contato_id = contato_result.scalar()

        new_conv = db.execute(
            text("""
                INSERT INTO public.crm_whatsapp_conversas
                (workspace_id, contato_id, instance, remote_jid, status, nao_lidas, ultima_mensagem, ultima_direcao, ultima_msg_at, created_at, updated_at)
                VALUES (:ws, :ct, 'meta', :jid, 'em_atendimento', 0, :msg, 'saida', NOW(), NOW(), NOW())
                RETURNING id
            """),
            {
                "ws": str(canal.workspace_id),
                "ct": str(contato_id),
                "jid": to,
                "msg": (payload.texto or "")[:500],
            },
        )
        conversa_id = new_conv.scalar()
    else:
        # Atualiza conversa existente
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_conversas
                SET ultima_mensagem = :msg,
                    ultima_direcao = 'saida',
                    ultima_msg_at = NOW(),
                    updated_at = NOW()
                WHERE id = :cid
            """),
            {"msg": (payload.texto or "")[:500], "cid": str(conversa_id)},
        )

    # Salva mensagem
    msg_result = db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_mensagens
            (conversa_id, contato_id, evolution_msg_id, instance, remote_jid, direcao, from_me, remetente_tipo, remetente_nome, conteudo, message_type, status, recebida_em, created_at)
            VALUES (:cid, :ct, :wamid, 'meta', :jid, 'saida', true, 'agente', :rn, :msg, 'conversation', 'enviada', NOW(), NOW())
            RETURNING id
        """),
        {
            "cid": str(conversa_id),
            "ct": str(contato_id),
            "wamid": wamid,
            "jid": to,
            "rn": usuario.nome or usuario.email or "agente",
            "msg": payload.texto or "",
        },
    )
    mensagem_id = msg_result.scalar()
    db.commit()

    # Notifica Redis
    try:
        publish_whatsapp_event({
            "type": "message.upsert",
            "workspaceId": str(canal.workspace_id),
            "conversaId": str(conversa_id),
            "remoteJid": to,
            "direction": "saida",
            "text": payload.texto or "",
            "instance": "meta",
            "messageType": "conversation",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.info("[enviar-meta] REDIS FALHOU: %s", e)

    return EnviarMensagemOut(ok=True, mensagem_id=str(mensagem_id), evolution_response=meta_resp)


class EnviarTemplateIn(BaseModel):
    numero: str | None = None
    conversa_id: str | None = None
    template_name: str
    language: str = "pt_BR"
    components: list | None = None


class JanelaStatusOut(BaseModel):
    aberta: bool
    ultima_entrada: datetime | None
    horas_restantes: float | None
    mensagem: str


@router.get("/canais/{canal_id}/janela-24h/{conversa_id}", response_model=JanelaStatusOut)
def verificar_janela_24h(
    canal_id: uuid.UUID,
    conversa_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    """Verifica se a janela de 24h está aberta para uma conversa."""
    c = _get_canal_or_404(canal_id, db)
    _exigir_admin_canal(usuario, c, db)
    from sqlalchemy import text
    from datetime import datetime, timezone, timedelta

    result = db.execute(
        text("""
            SELECT recebida_em FROM public.crm_whatsapp_mensagens
            WHERE conversa_id = :cid AND direcao = 'entrada'
            ORDER BY recebida_em DESC LIMIT 1
        """),
        {"cid": str(conversa_id)},
    )
    row = result.fetchone()
    
    if not row or not row[0]:
        return JanelaStatusOut(
            aberta=False,
            ultima_entrada=None,
            horas_restantes=None,
            mensagem="Janela de 24h fechada. Sem mensagem de entrada anterior."
        )
    
    ultima_entrada = row[0]
    agora = datetime.now(timezone.utc)
    if isinstance(ultima_entrada, datetime):
        diff = agora - ultima_entrada
        horas_restantes = max(0, 24 - diff.total_seconds() / 3600)
        aberta = diff <= timedelta(hours=24)
        return JanelaStatusOut(
            aberta=aberta,
            ultima_entrada=ultima_entrada,
            horas_restantes=horas_restantes,
            mensagem="Janela aberta" if aberta else "Janela de 24h fechada. Use um template HSM."
        )
    
    return JanelaStatusOut(
        aberta=False,
        ultima_entrada=None,
        horas_restantes=None,
        mensagem="Erro ao verificar janela"
    )


@router.post("/canais/{canal_id}/enviar-mensagem", response_model=EnviarMensagemOut)
def enviar_mensagem_canal(
    canal_id: uuid.UUID,
    payload: EnviarMensagemIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    c = _get_canal_or_404(canal_id, db)
    _exigir_permissao_atendimento(usuario, c, db)

    if c.tipo == "whatsapp_oficial":
        return _enviar_mensagem_meta_cloud(c, payload, db, usuario)

    if c.tipo == "webhook":
        provider = webhook_provider_from_config(c.config)
        if provider == CRM_EXTERNO_ZAPI_PROVIDER:
            return _enviar_mensagem_helena_chat(c, payload, db, usuario)
        if provider == "helena":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Canal Helena é inbound. Configure provider crm_externo_zapi para usar Helena Chat no outbound.",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Canal webhook sem outbound configurado. Configure provider crm_externo_zapi para enviar via Helena Chat.",
        )

    if c.tipo == "whatsapp_waha":
        return _enviar_mensagem_waha(c, payload, db, usuario)

    if c.tipo != "whatsapp_evolution":
        raise HTTPException(status_code=400, detail="Operação disponível apenas para WhatsApp Evolution")

    instance, instance_id, instance_token = _evolution_meta(c)
    from sqlalchemy import text
    from datetime import datetime, timedelta, timezone

    # Verificar janela de 24h apenas para Meta Cloud API (oficial); Evolution não tem essa restrição
    if c.tipo == "whatsapp_oficial" and payload.tipo != "template":
        janela_fechada = False
        ultima_entrada = None
        
        if payload.conversa_id:
            # Busca última mensagem de entrada na conversa
            result = db.execute(
                text("""
                    SELECT recebida_em FROM public.crm_whatsapp_mensagens
                    WHERE conversa_id = :cid AND direcao = 'entrada'
                    ORDER BY recebida_em DESC LIMIT 1
                """),
                {"cid": payload.conversa_id},
            )
            row = result.fetchone()
            if row:
                ultima_entrada = row[0]
        elif payload.numero:
            # Busca última mensagem de entrada do contato
            numero_jid = payload.numero.replace("@s.whatsapp.net", "").replace("@c.us", "")
            result = db.execute(
                text("""
                    SELECT m.recebida_em 
                    FROM public.crm_whatsapp_mensagens m
                    JOIN public.crm_whatsapp_conversas c ON c.id = m.conversa_id
                    WHERE c.instance = :inst AND c.remote_jid LIKE :jid
                      AND m.direcao = 'entrada'
                    ORDER BY m.recebida_em DESC LIMIT 1
                """),
                {"inst": instance, "jid": f"%{numero_jid}%"},
            )
            row = result.fetchone()
            if row:
                ultima_entrada = row[0]
        
        if ultima_entrada:
            # Verifica se passou mais de 24h
            agora = datetime.now(timezone.utc)
            if isinstance(ultima_entrada, datetime):
                diff = agora - ultima_entrada
                if diff > timedelta(hours=24):
                    janela_fechada = True
        else:
            # Sem mensagem de entrada anterior = janela fechada
            janela_fechada = True
        
        if janela_fechada:
            raise HTTPException(
                status_code=400,
                detail="Janela de 24h fechada. Use um template de mensagem (HSM) para iniciar a conversa."
            )

    # Resolve conversa e contato
    if payload.conversa_id:
        conv_result = db.execute(
            text("""
                SELECT c.id, c.contato_id, ct.numero_evo, ct.telefone, ct.jid
                FROM public.crm_whatsapp_conversas c
                JOIN public.crm_whatsapp_contatos ct ON ct.id = c.contato_id
                WHERE c.id = :cid
            """),
            {"cid": payload.conversa_id},
        )
        conv_row = conv_result.fetchone()
        if not conv_row:
            raise HTTPException(status_code=404, detail="Conversa não encontrada")
        conversa_id = conv_row[0]
        contato_id = conv_row[1]
        numero_evo = conv_row[2] or conv_row[3] or conv_row[4]
        numero_jid = conv_row[4]  # jid da conversa/contato (LID ou número)

        # LID contact: resolve numero_evo para phone JID correto usando candidate expansion
        if "@lid" in str(numero_jid) or "@lid" in str(numero_evo):
            phone_from_evo = re.sub(r"\D", "", (conv_row[2] or "").split("@")[0])
            candidates = []
            if len(phone_from_evo) == 12 and phone_from_evo.startswith("55"):
                # Gera candidato com 9 (13 dígitos) — formato WhatsApp BR atual
                candidates.append(f"{phone_from_evo[:4]}9{phone_from_evo[4:]}@s.whatsapp.net")
                candidates.append(f"{phone_from_evo}@s.whatsapp.net")
            elif len(phone_from_evo) == 13 and phone_from_evo.startswith("55"):
                candidates.append(f"{phone_from_evo}@s.whatsapp.net")
                candidates.append(f"{phone_from_evo[:4]}{phone_from_evo[5:]}@s.whatsapp.net")
            if candidates:
                # Verifica qual JID realmente existe no banco (via conversa phone-based)
                for cand in candidates:
                    found = db.execute(
                        text("""
                            SELECT id FROM public.crm_whatsapp_conversas
                            WHERE instance = :inst AND remote_jid = :jid
                            ORDER BY updated_at DESC LIMIT 1
                        """),
                        {"inst": instance, "jid": cand},
                    ).fetchone()
                    if found:
                        numero_evo = cand
                        logger.info("[enviar] LID contact resolvido para %s", numero_evo)
                        break
                else:
                    numero_evo = candidates[0]
                    logger.info("[enviar] LID candidate nao encontrado no banco, usando %s", numero_evo)

    elif payload.numero:
        numero_jid = payload.numero.replace("@s.whatsapp.net", "").replace("@c.us", "")
        # Preserva @g.us para grupos
        is_group_jid = "@g.us" in payload.numero
        numero_evo = numero_jid + ("@g.us" if is_group_jid else "@s.whatsapp.net") if "@" not in numero_jid else numero_jid
        # Busca conversa pelo JID
        conv_result = db.execute(
            text("""
                SELECT id, contato_id FROM public.crm_whatsapp_conversas
                WHERE instance = :inst AND remote_jid = :jid AND status != 'resolvido'
                ORDER BY updated_at DESC LIMIT 1
            """),
            {"inst": instance, "jid": numero_evo},
        )
        conv_row = conv_result.fetchone()
        if conv_row:
            conversa_id = conv_row[0]
            contato_id = conv_row[1]
        else:
            conversa_id = None
            contato_id = None
    else:
        raise HTTPException(status_code=400, detail="Informe numero ou conversa_id")

    # Normaliza número para envio à Evolution
    # Grupos precisam de @g.us; contatos individuais de @s.whatsapp.net
    is_group_jid = "@g.us" in str(numero_jid) or "@g.us" in str(numero_evo)
    if "@" not in numero_evo:
        numero_evo = numero_evo + ("@g.us" if is_group_jid else "@s.whatsapp.net")

    texto_seguro = payload.texto or ""
    if payload.tipo == "texto" and not texto_seguro.strip() and not payload.media_url:
        raise HTTPException(status_code=400, detail="Texto obrigatório para mensagens do tipo 'texto'.")

    logger.info("[enviar] conversa_id=%s numero_evo=%s numero_jid=%s is_group=%s texto=%s", conversa_id, numero_evo, numero_jid, is_group_jid, texto_seguro[:50])

    # 1. Envia para Evolution API
    try:
        if payload.tipo == "texto" or not payload.media_url:
            evo_resp = evo_service.enviar_mensagem_texto(instance, numero_evo, payload.texto or "", instance_id=instance_id, instance_token=instance_token)
        else:
            evo_resp = evo_service.enviar_mensagem_midia(
                instance, numero_evo, payload.tipo, payload.media_url,
                caption=payload.caption or payload.texto,
                file_name=payload.caption,
                instance_id=instance_id,
                instance_token=instance_token,
            )
    except evo_service.EvolutionError as exc:
        logger.error("[canais] falha ao enviar mensagem: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))

    # Extrai evolution_msg_id do response para reconciliação de receipt
    evo_msg_id = evo_service.extract_evolution_message_id(evo_resp)

    # 2. Atualiza ou cria conversa
    if not conversa_id:
        # Cria contato e conversa rapidamente
        contato_result = db.execute(
            text("""
                INSERT INTO public.crm_whatsapp_contatos (workspace_id, jid, telefone, numero_evo, nome, origem, created_at, updated_at)
                VALUES (:ws, :jid, :tel, :evo, :nome, 'evolution', NOW(), NOW())
                ON CONFLICT (workspace_id, jid) DO UPDATE SET numero_evo = COALESCE(NULLIF(EXCLUDED.numero_evo, ''), public.crm_whatsapp_contatos.numero_evo), updated_at = NOW()
                RETURNING id
            """),
            {
                "ws": str(c.workspace_id),
                "jid": numero_jid,
                "tel": numero_evo.split("@")[0],
                "evo": numero_evo,
                "nome": numero_evo.split("@")[0],
            },
        )
        contato_id = contato_result.scalar()
        new_conv = db.execute(
            text("""
                INSERT INTO public.crm_whatsapp_conversas
                (workspace_id, canal_id, contato_id, instance, remote_jid, status, nao_lidas, ultima_mensagem, ultima_direcao, ultima_msg_at, created_at, updated_at)
                VALUES (:ws, :canal, :ct, :inst, :jid, 'em_atendimento', 0, :msg, 'saida', NOW(), NOW(), NOW())
                RETURNING id
            """),
            {
                "ws": str(c.workspace_id),
                "canal": str(c.id),
                "ct": str(contato_id),
                "inst": instance,
                "jid": numero_jid,
                "msg": texto_seguro[:500],
            },
        )
        conversa_id = new_conv.scalar()
    else:
        # Atualiza conversa existente
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_conversas
                SET ultima_mensagem = :msg,
                    ultima_direcao = 'saida',
                    ultima_msg_at = NOW(),
                    updated_at = NOW()
                WHERE id = :cid
            """),
            {"msg": texto_seguro[:500], "cid": str(conversa_id)},
        )

    # 3. Salva mensagem no banco como 'enviada' (com evolution_msg_id para deduplicação futura)
    msg_tipo = payload.tipo if payload.tipo != "texto" else "conversation"
    msg_conteudo = payload.texto or payload.caption or "[mídia]"
    msg_result = db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_mensagens
            (workspace_id, canal_id, conversa_id, contato_id, evolution_msg_id, instance, remote_jid, direcao, from_me, remetente_tipo, remetente_nome, conteudo, message_type, status, media_status, recebida_em, created_at, updated_at)
            VALUES (:ws, :canal, :cid, :ct, :evid, :inst, :jid, 'saida', true, 'agente', :rn, :msg, :mt, 'enviada', :media_status, NOW(), NOW(), NOW())
            RETURNING id
        """),
        {
            "ws": str(c.workspace_id),
            "canal": str(c.id),
            "cid": str(conversa_id),
            "ct": str(contato_id),
            "evid": evo_msg_id,
            "inst": instance,
            "jid": numero_jid,
            "rn": usuario.nome or usuario.email or "agente",
            "msg": msg_conteudo,
            "mt": msg_tipo,
            "media_status": "ready" if payload.media_url and payload.tipo != "texto" else None,
        },
    )
    mensagem_id = msg_result.scalar()
    if payload.media_url and payload.tipo != "texto":
        stored_like = StoredMedia(
            bucket="whatsapp-media",
            object_key=payload.media_url.split("/meta/storage/whatsapp-media/", 1)[1] if "/meta/storage/whatsapp-media/" in payload.media_url else payload.media_url,
            url=payload.media_url,
            mimetype="application/octet-stream",
            size=0,
            sha256="",
            filename=payload.caption or str(mensagem_id),
            media_type=payload.tipo,
        )
        register_media_record(
            db,
            workspace_id=str(c.workspace_id),
            canal_id=str(c.id),
            conversa_id=str(conversa_id),
            mensagem_id=str(mensagem_id),
            stored=stored_like,
            caption=payload.caption or payload.texto,
            storage_status="ready",
        )
    db.commit()

    # 4. Publica no Redis para realtime
    try:
        publish_whatsapp_event({
            "type": "message.upsert",
            "workspaceId": str(c.workspace_id),
            "conversaId": str(conversa_id),
            "remoteJid": numero_jid,
            "direction": "saida",
            "text": msg_conteudo,
            "instance": instance,
            "messageType": msg_tipo,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.info("[enviar] REDIS FALHOU: %s", e)

    return EnviarMensagemOut(ok=True, mensagem_id=str(mensagem_id), evolution_response=evo_resp)


@router.post("/canais/{canal_id}/enviar-template", response_model=EnviarMensagemOut)
def enviar_template_canal(
    canal_id: uuid.UUID,
    payload: EnviarTemplateIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    """Envia template HSM via Evolution API (não requer janela de 24h)."""
    c = _get_canal_or_404(canal_id, db)
    _exigir_admin_canal(usuario, c, db)

    if c.tipo != "whatsapp_evolution":
        raise HTTPException(status_code=400, detail="Operação disponível apenas para WhatsApp Evolution")

    instance, instance_id, instance_token = _evolution_meta(c)
    from sqlalchemy import text

    # Resolve conversa e contato
    if payload.conversa_id:
        conv_result = db.execute(
            text("""
                SELECT c.id, c.contato_id, ct.numero_evo, ct.telefone, ct.jid
                FROM public.crm_whatsapp_conversas c
                JOIN public.crm_whatsapp_contatos ct ON ct.id = c.contato_id
                WHERE c.id = :cid
            """),
            {"cid": payload.conversa_id},
        )
        conv_row = conv_result.fetchone()
        if not conv_row:
            raise HTTPException(status_code=404, detail="Conversa não encontrada")
        conversa_id = conv_row[0]
        contato_id = conv_row[1]
        numero_evo = conv_row[2] or conv_row[3] or conv_row[4]
    elif payload.numero:
        numero_jid = payload.numero.replace("@s.whatsapp.net", "").replace("@c.us", "")
        # Preserva @g.us para grupos
        is_group_jid = "@g.us" in payload.numero
        numero_evo = numero_jid + ("@g.us" if is_group_jid else "@s.whatsapp.net") if "@" not in numero_jid else numero_jid
        # Busca conversa pelo JID
        conv_result = db.execute(
            text("""
                SELECT id, contato_id FROM public.crm_whatsapp_conversas
                WHERE instance = :inst AND remote_jid = :jid AND status != 'resolvido'
                ORDER BY updated_at DESC LIMIT 1
            """),
            {"inst": instance, "jid": numero_evo},
        )
        conv_row = conv_result.fetchone()
        if conv_row:
            conversa_id = conv_row[0]
            contato_id = conv_row[1]
        else:
            conversa_id = None
            contato_id = None
    else:
        raise HTTPException(status_code=400, detail="Informe numero ou conversa_id")

    # Normaliza número: grupos usam @g.us, contatos @s.whatsapp.net
    is_group_jid = is_group_jid if 'is_group_jid' in locals() else ("@g.us" in str(numero_jid) or "@g.us" in str(numero_evo))
    if "@" not in numero_evo:
        numero_evo = numero_evo + ("@g.us" if is_group_jid else "@s.whatsapp.net")

    # Envia template para Evolution
    try:
        evo_resp = evo_service.enviar_template_hsm(
            instance, numero_evo, payload.template_name,
            language=payload.language, components=payload.components,
            instance_id=instance_id,
            instance_token=instance_token,
        )
    except evo_service.EvolutionError as exc:
        logger.error("[canais] falha ao enviar template: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))

    evo_msg_id = evo_service.extract_evolution_message_id(evo_resp)

    # Cria/atualiza conversa
    if not conversa_id:
        contato_result = db.execute(
            text("""
                INSERT INTO public.crm_whatsapp_contatos (workspace_id, jid, telefone, numero_evo, nome, origem, created_at, updated_at)
                VALUES (:ws, :jid, :tel, :evo, :nome, 'evolution', NOW(), NOW())
                ON CONFLICT (workspace_id, jid) DO UPDATE SET numero_evo = COALESCE(NULLIF(EXCLUDED.numero_evo, ''), public.crm_whatsapp_contatos.numero_evo), updated_at = NOW()
                RETURNING id
            """),
            {
                "ws": str(c.workspace_id),
                "jid": numero_jid,
                "tel": numero_evo.split("@")[0],
                "evo": numero_evo,
                "nome": numero_evo.split("@")[0],
            },
        )
        contato_id = contato_result.scalar()
        new_conv = db.execute(
            text("""
                INSERT INTO public.crm_whatsapp_conversas
                (workspace_id, contato_id, instance, remote_jid, status, nao_lidas, ultima_mensagem, ultima_direcao, ultima_msg_at, created_at, updated_at)
                VALUES (:ws, :ct, :inst, :jid, 'em_atendimento', 0, :msg, 'saida', NOW(), NOW(), NOW())
                RETURNING id
            """),
            {
                "ws": str(c.workspace_id),
                "ct": str(contato_id),
                "inst": instance,
                "jid": numero_jid,
                "msg": f"[Template: {payload.template_name}]",
            },
        )
        conversa_id = new_conv.scalar()

    # Salva mensagem
    msg_result = db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_mensagens
            (conversa_id, contato_id, evolution_msg_id, instance, remote_jid, direcao, from_me, remetente_tipo, remetente_nome, conteudo, message_type, status, recebida_em, created_at)
            VALUES (:cid, :ct, :evid, :inst, :jid, 'saida', true, 'agente', :rn, :msg, 'template', 'enviada', NOW(), NOW())
            RETURNING id
        """),
        {
            "cid": str(conversa_id),
            "ct": str(contato_id),
            "evid": evo_msg_id,
            "inst": instance,
            "jid": numero_jid,
            "rn": usuario.nome or usuario.email or "agente",
            "msg": f"[Template: {payload.template_name}]",
        },
    )
    mensagem_id = msg_result.scalar()
    db.commit()

    # Notifica Redis
    try:
        publish_whatsapp_event({
            "type": "message.upsert",
            "workspaceId": str(c.workspace_id),
            "conversaId": str(conversa_id),
            "remoteJid": numero_jid,
            "direction": "saida",
            "text": f"[Template: {payload.template_name}]",
            "instance": instance,
            "messageType": "template",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.info("[enviar-template] REDIS FALHOU: %s", e)

    return EnviarMensagemOut(ok=True, mensagem_id=str(mensagem_id), evolution_response=evo_resp)


# ── Enriquecimento em massa ────────────────────────────────────────

@router.post("/canais/{canal_id}/enriquecer-todos")
def enriquecer_todos_contatos(
    canal_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
):
    """Dispara enriquecimento de todos os contatos e grupos sem avatar/nome.
    Processa em background — não bloqueia a requisição."""
    canal = _get_canal_or_404(canal_id, db)
    verificar_acesso_workspace(usuario, canal.workspace_id, db)

    instance = canal.evolution_instance_id or _nome_instancia_evo(canal)
    ws_id = str(canal.workspace_id)

    # Contatos sem avatar_url OU avatar_fetched_at IS NULL
    contatos = db.execute(
        text("""
            SELECT jid FROM public.crm_whatsapp_contatos
            WHERE workspace_id = :ws AND ativo = true
              AND (avatar_url IS NULL OR avatar_fetched_at IS NULL)
            LIMIT 200
        """),
        {"ws": ws_id},
    ).fetchall()

    # Grupos sem group_avatar_url
    grupos = db.execute(
        text("""
            SELECT remote_jid FROM public.crm_whatsapp_conversas
            WHERE workspace_id = :ws AND ativo = true
              AND is_group = true
              AND (group_avatar_url IS NULL OR group_name IS NULL)
            LIMIT 50
        """),
        {"ws": ws_id},
    ).fetchall()

    total_contatos = len(contatos)
    total_grupos = len(grupos)

    for row in contatos:
        jid = row[0]
        background_tasks.add_task(
            _enriquecer_contato_background,
            instance=instance,
            jid=jid,
            workspace_id=ws_id,
        )

    for row in grupos:
        group_jid = row[0]
        background_tasks.add_task(
            _enriquecer_grupo_background,
            instance=instance,
            group_jid=group_jid,
            workspace_id=ws_id,
        )

    return {
        "status": "processando",
        "contatos_agendados": total_contatos,
        "grupos_agendados": total_grupos,
        "instance": instance,
    }


# ── Webhooks ─────────────────────────────────────────────────────────

@router.get("/webhook/meta/{token}")
async def verificar_webhook_meta(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Verificação do challenge da Meta Cloud API (subscribe)."""
    canal = db.query(CanalEntrada).filter(CanalEntrada.webhook_token == token).first()
    if not canal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token inválido")

    mode = request.query_params.get("hub.mode")
    verify_token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    config = canal.config or {}
    expected_verify_token = config.get("verify_token", "")

    if mode == "subscribe" and verify_token == expected_verify_token and challenge:
        logger.info("[webhook-meta] verificação OK canal=%s", canal.nome)
        return int(challenge)  # Meta espera o challenge como resposta

    logger.warning("[webhook-meta] verificação FALHOU canal=%s", canal.nome)
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verificação falhou")


@router.post("/webhook/meta/{token}")
async def receber_webhook_meta(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Recebe webhooks da Meta Cloud API (mensagens e status)."""
    from app.services import meta_cloud as meta_service

    canal = db.query(CanalEntrada).filter(CanalEntrada.webhook_token == token).first()
    if not canal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token inválido")

    # Lê body bruto para verificação de assinatura
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    if not meta_service.verificar_assinatura(body, signature):
        logger.warning("[webhook-meta] assinatura inválida canal=%s", canal.nome)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Assinatura inválida")

    payload = json.loads(body) if body else {}
    logger.info("[webhook-meta] canal=%s payload_keys=%s", canal.nome, list(payload.keys()))

    # Salva evento bruto
    _salvar_evento_raw(db, canal.id, canal.evolution_instance_id or "meta", "meta_webhook", payload)

    # Processa payload
    resultado = meta_service.processar_webhook(payload)

    for entry in resultado.get("entries", []):
        if entry["type"] == "message":
            _processar_mensagem_meta(db, canal, entry)
        elif entry["type"] == "status":
            _processar_status_meta(db, canal, entry)

    db.commit()
    return {"recebido": True}


@router.post("/webhook/{token}")
async def receber_webhook(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    raw_body = await request.body()
    if len(raw_body) > 1_048_576:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "webhook_payload_too_large", "message": "Payload excede 1 MB"},
        )

    canal = db.query(CanalEntrada).filter(CanalEntrada.webhook_token == token).first()
    if not canal or canal.tipo != "webhook":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token inválido")

    try:
        result = process_webhook_api_ingestion(
            db,
            canal,
            raw_body,
            timestamp_header=request.headers.get("X-OP7-Timestamp"),
            signature_header=request.headers.get("X-OP7-Signature"),
        )
    except WebhookAPIError as exc:
        db.rollback()
        raise exc.to_http_exception()
    except Exception:
        db.rollback()
        logger.exception("[webhook-generic] falha no processamento canal=%s", canal.id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Falha ao processar webhook")

    return result.to_dict()


@router.post("/webhook/evolution/test")
async def receber_webhook_evolution_test(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    """Endpoint de teste — aceita payload manualmente sem validar token."""
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    event = payload.get("event", "")
    event_norm = _normalizar_evento_evolution(event)
    instance_data = payload.get("data", {}) if isinstance(payload.get("data", {}), dict) else {}

    logger.info("[webhook-test] event=%s payload_keys=%s", event, list(payload.keys()))

    # Salvar payload bruto
    _salvar_evento_raw(db, "test", "test", event, payload)

    if event_norm in {"MESSAGE", "MESSAGES_UPSERT", "MESSAGE_UPSERT", "MESSAGE_RECEIVED"}:
        logger.info("[webhook-test] processando mensagem de teste")
        try:
            # Usar canal mock para teste
            from app.models.canal_entrada import CanalEntrada
            canal = CanalEntrada(
                id=uuid.uuid4(),
                workspace_id=uuid.UUID("5cbc61b9-66bd-4de2-8272-39fff5c9dcc3"),
                tipo="whatsapp_evolution",
                nome="teste",
                evolution_instance_id="opcl",
            )
            resultado = _processar_mensagem_evolution(db, canal, instance_data)
            if resultado and resultado.get("is_media"):
                background_tasks.add_task(
                    _baixar_e_salvar_midia,
                    instance_name=canal.evolution_instance_id or "opcl",
                    evolution_msg_id=resultado.get("evolution_msg_id", ""),
                    mensagem_db_id=resultado.get("mensagem_id", ""),
                    conversa_db_id=resultado.get("conversa_id", ""),
                    message_type_raw=resultado.get("message_type", ""),
                    media_base64=resultado.get("media_base64"),
                    media_url=resultado.get("media_url"),
                    media_mime_type=resultado.get("media_mime_type"),
                    media_filename=resultado.get("media_filename"),
                )
        except Exception as e:
            logger.exception("[webhook-test] ERRO: %s", e)
            return {"recebido": False, "erro": str(e)}

    return {"recebido": True}


@router.post("/webhook/evolution/{token}")
async def receber_webhook_evolution(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    canal = db.query(CanalEntrada).filter(CanalEntrada.webhook_token == token).first()
    if not canal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token inválido")

    event = payload.get("event", "")
    event_norm = _normalizar_evento_evolution(event)

    logger.info("[webhook-evolution] canal=%s event=%s normalized=%s", canal.nome, event, event_norm)

    try:
        queued = enqueue_evolution_event(db, canal, event, payload)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("[webhook-evolution] falha ao enfileirar evento canal=%s event=%s", canal.nome, event)
        raise HTTPException(status_code=500, detail="Falha ao enfileirar webhook")

    return {
        "recebido": True,
        "event_id": queued.get("event_id"),
        "queued": queued.get("queued", False),
        "duplicate": not queued.get("inserted", False),
    }


@router.post("/webhook/waha/{token}")
async def receber_webhook_waha(
    token: str,
    request: Request,
    db: Session = Depends(get_db),
):
    try:
        raw = await request.json()
    except Exception:
        raw = {}

    canal = db.query(CanalEntrada).filter(
        CanalEntrada.webhook_token == token,
        CanalEntrada.tipo == "whatsapp_waha",
    ).first()
    if not canal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token inválido")

    adapted = adapt_waha_to_evolution(raw)
    event = adapted.get("event", "messages.upsert")

    logger.info("[webhook-waha] canal=%s event=%s", canal.nome, event)

    try:
        queued = enqueue_evolution_event(db, canal, event, adapted)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("[webhook-waha] falha ao enfileirar canal=%s", canal.nome)
        raise HTTPException(status_code=500, detail="Falha ao enfileirar webhook")

    return {"ok": True, "queued": queued.get("queued", False)}


def _processar_evento_evolution(
    db: Session,
    canal: CanalEntrada,
    event_norm: str,
    instance_data: dict,
    *,
    media_mode: str = "inline",
    background_tasks: BackgroundTasks | None = None,
    raw_event_id: str | None = None,
) -> None:
    connection_events = {"CONNECTION_UPDATE", "CONNECTED", "LOGGEDOUT", "LOGGED_OUT", "DISCONNECTED", "QRCODE", "QR_CODE"}
    message_events = {"MESSAGE", "MESSAGES_UPSERT", "MESSAGE_UPSERT", "MESSAGE_RECEIVED"}
    receipt_events = {"RECEIPT", "READ_RECEIPT", "READRECEIPT", "MESSAGES_UPDATE", "MESSAGE_STATUS"}

    if event_norm in connection_events:
        connection = normalize_connection_event(instance_data, event_norm, instance=canal.evolution_instance_id)
        if connection.state == "connected":
            canal.status = "ativo"
            canal.connection_status = "connected"
            from datetime import datetime, timezone
            canal.conectado_em = datetime.now(timezone.utc)
            numero = connection.number or _extrair_numero_evolution(instance_data)
            if numero:
                canal.numero_telefone = numero
            db.commit()
            try:
                _configurar_webhook_evolution(canal, db)
            except evo_service.EvolutionError as exc:
                logger.error("[canais] falha ao reconfigurar webhook Evolution: %s", exc)
        elif connection.state == "connecting":
            canal.connection_status = "connecting"
            db.commit()
        elif connection.state == "disconnected":
            canal.status = "inativo"
            canal.connection_status = "disconnected"
            db.commit()

    if event_norm in message_events:
        logger.info("[webhook-evolution] processando evento de mensagem")
        try:
            resultado = _processar_mensagem_evolution(db, canal, instance_data, raw_event_id=raw_event_id)
            if resultado and resultado.get("is_media"):
                _waha_inner = (canal.config or {}).get("waha", {}) if canal.tipo == "whatsapp_waha" else {}
                enqueue_inbound_media_download(
                    db,
                    workspace_id=resultado.get("workspace_id", ""),
                    canal_id=str(canal.id),
                    raw_event_id=raw_event_id,
                    mensagem_id=resultado.get("mensagem_id", ""),
                    conversa_id=resultado.get("conversa_id", ""),
                    instance_name=canal.evolution_instance_id or "opcl",
                    evolution_msg_id=resultado.get("evolution_msg_id", ""),
                    message_type_raw=resultado.get("message_type", ""),
                    media_base64=resultado.get("media_base64"),
                    media_url=resultado.get("media_url"),
                    media_mime_type=resultado.get("media_mime_type"),
                    media_filename=resultado.get("media_filename"),
                    media_caption=resultado.get("media_caption"),
                    media_error=resultado.get("media_error"),
                    waha_session=_waha_inner.get("session"),
                    waha_chat_id=resultado.get("remote_jid"),
                    waha_api_base_url=_waha_inner.get("api_base_url"),
                    waha_api_key_ref=_waha_inner.get("api_key_ref"),
                )
                db.commit()
            if resultado:
                instance_name = canal.evolution_instance_id or "opcl"
                ws_id = resultado.get("workspace_id", "")
                sender_jid = resultado.get("participant_jid") or resultado.get("remote_jid", "")
                if sender_jid and ws_id:
                    if media_mode == "background" and background_tasks is not None:
                        background_tasks.add_task(
                            _enriquecer_contato_background,
                            instance=instance_name,
                            jid=sender_jid,
                            workspace_id=ws_id,
                        )
                    else:
                        _enriquecer_contato_background(
                            instance=instance_name,
                            jid=sender_jid,
                            workspace_id=ws_id,
                        )
                if resultado.get("is_group") and resultado.get("remote_jid") and ws_id:
                    if media_mode == "background" and background_tasks is not None:
                        background_tasks.add_task(
                            _enriquecer_grupo_background,
                            instance=instance_name,
                            group_jid=resultado.get("remote_jid"),
                            workspace_id=ws_id,
                        )
                    else:
                        _enriquecer_grupo_background(
                            instance=instance_name,
                            group_jid=resultado.get("remote_jid"),
                            workspace_id=ws_id,
                        )
        except Exception:
            logger.exception("[webhook-evolution] ERRO no processamento")
            raise

    if event_norm in receipt_events:
        logger.info("[webhook-evolution] processando evento de receipt/status")
        try:
            _processar_status_mensagem(db, canal, instance_data, event=event_norm)
        except Exception:
            logger.exception("[webhook-evolution] ERRO no processamento de status")
            raise

def _salvar_evento_raw(db: Session, canal_id: uuid.UUID, instance: str, event: str, payload: dict) -> None:
    """Salva o payload bruto do webhook para audit trail e debug."""
    from datetime import datetime, timezone
    from sqlalchemy import text
    import json

    try:
        remote_jid = ""
        info = _evolution_info(payload)
        if info:
            remote_jid = info.get("Chat") or info.get("chat") or info.get("RemoteJid") or info.get("jid") or ""
        if not remote_jid and isinstance(payload.get("data"), dict):
            remote_jid = payload.get("data", {}).get("key", {}).get("remoteJid", "")

        db.execute(
            text("""
                INSERT INTO public.crm_whatsapp_eventos (event, instance, remote_jid, payload, recebido_em)
                VALUES (:ev, :inst, :rj, :payload, :ts)
            """),
            {
                "ev": event,
                "inst": instance,
                "rj": remote_jid,
                "payload": json.dumps(payload),
                "ts": datetime.now(timezone.utc),
            },
        )
        db.commit()
    except Exception:
        logger.exception("[webhook] falha ao salvar evento raw")

def _processar_mensagem_evolution(db: Session, canal: CanalEntrada, data: dict) -> dict | None:
    from datetime import datetime, timezone
    from sqlalchemy import text

    normalized = normalize_message_event(data, instance=canal.evolution_instance_id or "opcl")
    info = _evolution_info(data)
    message = _evolution_message(data) or data.get("message", {})
    remote_jid = normalized.remote_jid
    participant_jid = normalized.participant_jid
    from_me = normalized.from_me
    evolution_msg_id = normalized.evolution_msg_id
    push_name = normalized.push_name
    message_type = normalized.message_type
    recebida_em = normalized.received_at
    instance = canal.evolution_instance_id or "opcl"
    media_payload = normalized.media.model_dump()

    # Detecta se é mensagem de grupo
    is_group = normalized.is_group
    # Em grupos, o remetente real é o participant, não o remote_jid
    sender_jid = normalized.sender_jid
    sender_name = push_name

    logger.info(
        "[webhook-process] remote_jid=%s is_group=%s participant=%s from_me=%s msg_id=%s msg_type=%s",
        remote_jid, is_group, participant_jid, from_me, evolution_msg_id, message_type
    )

    # ── Extrair UTM / origem da mensagem ──────────────────────────────
    def _extrair_origem_lead(data: dict, msg_text: str) -> dict:
        """Extrai UTM/campanha da mensagem de entrada (Meta referral ou regex orgânico)."""
        origem = {
            "campanha_origem": None,
            "utm_source": None,
            "utm_medium": None,
            "utm_campaign": None,
            "meta_ad_id": None,
            "meta_ctwa_clid": None,
            "meta_headline": None,
            "meta_body": None,
            "meta_source_url": None,
            "meta_media_type": None,
            "meta_image_url": None,
            "meta_referral_json": None,
        }
        # Prioridade 1: Meta Ads referral (Click-to-WhatsApp)
        # Pode estar em data.referral, data.message.referral, ou data.context.referral
        referral = None
        for path in ("referral", "message.referral", "context.referral", "data.referral"):
            parts = path.split(".")
            ptr = data
            for p in parts:
                if isinstance(ptr, dict):
                    ptr = ptr.get(p)
                else:
                    ptr = None
                    break
            if ptr:
                referral = ptr
                break
        if not referral and isinstance(message, dict):
            referral = message.get("referral")
        if referral and isinstance(referral, dict):
            origem["meta_ad_id"] = referral.get("source_id")
            origem["meta_ctwa_clid"] = referral.get("ctwa_clid")
            origem["meta_headline"] = referral.get("headline")
            origem["meta_body"] = referral.get("body")
            origem["meta_source_url"] = referral.get("source_url")
            origem["meta_media_type"] = referral.get("media_type")
            origem["meta_image_url"] = referral.get("image_url")
            origem["meta_referral_json"] = json.dumps(referral)
            origem["utm_source"] = "meta_ads"
            origem["utm_medium"] = "cpc"
            origem["campanha_origem"] = referral.get("headline") or referral.get("source_id") or "Meta Ads"
            return origem
        # Prioridade 2: Regex no texto (orgânico / pre-filled message)
        padroes = [
            (r"(?i)vim?\s+(?:pela\s+)?campanha[:\s]+([^\n]+?)(?:\s*$|\s+\n)", "campanha"),
            (r"(?i)campanha[:\s]+([^\n]+?)(?:\s*$|\s+\n)", "campanha"),
            (r"(?i)vi\s+(?:no|pelo)\s+(?:anúncio|ad|link)\s+([^\n]+?)(?:\s*$|\s+\n)", "anuncio"),
            (r"(?i)origem[:\s]+([^\n]+?)(?:\s*$|\s+\n)", "origem"),
        ]
        for padrao, tipo in padroes:
            match = re.search(padrao, msg_text)
            if match:
                valor = match.group(1).strip()
                origem["utm_source"] = "whatsapp"
                origem["utm_medium"] = "organic"
                origem["utm_campaign"] = valor
                origem["campanha_origem"] = valor
                if tipo == "anuncio":
                    origem["utm_medium"] = "cpc"
                return origem
        return origem

    msg_text = normalized.text
    is_mentioned = normalized.is_channel_mentioned(canal.numero_telefone)

    # Extrair UTM / origem da mensagem (após texto extraído)
    lead_origem = _extrair_origem_lead(data, msg_text)

    logger.info("[webhook-process] texto_extraido=%s remote_jid=%s is_mentioned=%s", repr(msg_text), remote_jid, is_mentioned)

    if not remote_jid or not msg_text:
        logger.info("[webhook-process] ABORTANDO: remote_jid ou msg_text vazio")
        return

    direcao = "saida" if from_me else "entrada"
    workspace_id = str(canal.workspace_id)

    # Extrai número real do payload (senderPn) se disponível — presente em mensagens LID
    sender_pn = normalized.sender_pn
    is_lid = normalized.is_lid
    numero_evo = sender_pn if sender_pn else (remote_jid if "@s.whatsapp.net" in remote_jid else "")

    # Para JIDs LID com senderPn, tenta resolver para conversa/contato existente pelo telefone
    # Isso evita criar conversa duplicada quando o mesmo usuário usa LID em vez de JID numérico
    resolved_remote_jid = remote_jid  # JID a usar para busca/criação de conversa
    contato_id_existente = None
    if is_lid and sender_pn:
        phone_digits = re.sub(r"\D", "", sender_pn.split("@")[0])
        # Gera variações do número brasileiro (com e sem o 9º dígito)
        phone_candidates = [sender_pn] if sender_pn else []
        if len(phone_digits) == 12 and phone_digits.startswith("55"):
            phone_candidates.append(f"{phone_digits}@s.whatsapp.net")
            phone_candidates.append(f"{phone_digits[:4]}9{phone_digits[4:]}@s.whatsapp.net")
        elif len(phone_digits) == 13 and phone_digits.startswith("55"):
            phone_candidates.append(f"{phone_digits}@s.whatsapp.net")
            if phone_digits[4] == "9":
                phone_candidates.append(f"{phone_digits[:4]}{phone_digits[5:]}@s.whatsapp.net")

        for candidate_jid in phone_candidates:
            # Tenta encontrar conversa ativa por JID numérico
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
                resolved_remote_jid = candidate_jid
                contato_id_existente = phone_conv[2]
                logger.info("[webhook-process] LID %s resolvido para JID %s via senderPn", remote_jid, candidate_jid)
                break

    # 1. Upsert contato (para o remetente real — participant em grupos, remote_jid em 1:1)
    contact_jid = sender_jid if sender_jid else resolved_remote_jid
    contact_tel = contact_jid.split("@")[0] if "@" in contact_jid else contact_jid
    
    # Se for grupo, precisamos garantir que o contato do participant existe
    participant_contato_id = None
    if is_group and participant_jid:
        part_result = db.execute(
            text("""
                INSERT INTO public.crm_whatsapp_contatos (workspace_id, jid, telefone, numero_evo, nome, push_name, origem, created_at, updated_at)
                VALUES (:ws, :jid, :tel, :evo, :nome, :push, 'evolution', NOW(), NOW())
                ON CONFLICT (workspace_id, jid) DO UPDATE SET
                    nome = COALESCE(EXCLUDED.nome, public.crm_whatsapp_contatos.nome),
                    push_name = COALESCE(EXCLUDED.push_name, public.crm_whatsapp_contatos.push_name),
                    updated_at = NOW()
                RETURNING id
            """),
            {
                "ws": workspace_id,
                "jid": participant_jid,
                "tel": participant_jid.split("@")[0] if "@" in participant_jid else participant_jid,
                "evo": participant_jid,
                "nome": sender_name or participant_jid.split("@")[0],
                "push": sender_name,
            },
        )
        participant_contato_id = part_result.scalar()

    upsert_jid = resolved_remote_jid
    upsert_tel = upsert_jid.split("@")[0] if "@s.whatsapp.net" in upsert_jid else (
        re.sub(r"\D", "", sender_pn.split("@")[0]) if sender_pn else remote_jid.split("@")[0]
    )
    if contato_id_existente:
        db.execute(
            text("""
                UPDATE public.crm_whatsapp_contatos
                SET push_name = COALESCE(:push, push_name),
                    nome = COALESCE(:nome, nome),
                    updated_at = NOW()
                WHERE id = :cid
            """),
            {"push": push_name or None, "nome": push_name or None, "cid": str(contato_id_existente)},
        )
        contato_id = contato_id_existente
    else:
        # Determina primeira_conversa_at para contatos novos
        is_novo_contato = True
        contato_result = db.execute(
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
                    :ws, :jid, :tel, :evo, :nome, :push, 'evolution', NOW(),
                    :campanha, :utm_source, :utm_medium, :utm_campaign,
                    :meta_ad_id, :meta_ctwa_clid, :meta_headline, :meta_body,
                    :meta_source_url, :meta_media_type, :meta_image_url, :meta_referral_json,
                    NOW(), NOW()
                )
                ON CONFLICT (workspace_id, jid) DO UPDATE SET
                    nome = COALESCE(EXCLUDED.nome, public.crm_whatsapp_contatos.nome),
                    push_name = COALESCE(EXCLUDED.push_name, public.crm_whatsapp_contatos.push_name),
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
                "nome": push_name or upsert_tel,
                "push": push_name,
                "campanha": lead_origem.get("campanha_origem"),
                "utm_source": lead_origem.get("utm_source"),
                "utm_medium": lead_origem.get("utm_medium"),
                "utm_campaign": lead_origem.get("utm_campaign"),
                "meta_ad_id": lead_origem.get("meta_ad_id"),
                "meta_ctwa_clid": lead_origem.get("meta_ctwa_clid"),
                "meta_headline": lead_origem.get("meta_headline"),
                "meta_body": lead_origem.get("meta_body"),
                "meta_source_url": lead_origem.get("meta_source_url"),
                "meta_media_type": lead_origem.get("meta_media_type"),
                "meta_image_url": lead_origem.get("meta_image_url"),
                "meta_referral_json": lead_origem.get("meta_referral_json"),
            },
        )
        contato_id = contato_result.scalar()

    # 2. Verificar se conversa existe (busca pelo JID resolvido)
    conv_result = db.execute(
        text("""
            SELECT id, status FROM public.crm_whatsapp_conversas
            WHERE instance = :inst AND remote_jid = :jid
            ORDER BY updated_at DESC
            LIMIT 1
        """),
        {"inst": instance, "jid": resolved_remote_jid},
    )
    conv_row = conv_result.fetchone()

    if conv_row:
        conversa_id = conv_row[0]
        conv_status = conv_row[1]
        # Se resolvida e nova mensagem de entrada -> criar NOVA conversa (regra de negócio)
        if conv_status == "resolvido" and direcao == "entrada":
            # Criar nova conversa
            new_conv = db.execute(
                text("""
                    INSERT INTO public.crm_whatsapp_conversas
                    (workspace_id, contato_id, instance, remote_jid, is_group, group_name, status, nao_lidas, ultima_mensagem, ultima_direcao, ultima_msg_at, created_at, updated_at)
                    VALUES (:ws, :ct, :inst, :jid, :is_group, :group_name, 'nova', 1, :msg, :dir, :ts, NOW(), NOW())
                    RETURNING id
                """),
                {
                    "ws": workspace_id,
                    "ct": str(contato_id),
                    "inst": instance,
                    "jid": remote_jid,
                    "is_group": is_group,
                    "group_name": None,
                    "msg": msg_text[:500],
                    "dir": direcao,
                    "ts": recebida_em,
                },
            )
            conversa_id = new_conv.scalar()
        else:
            # Atualiza conversa existente
            db.execute(
                text("""
                    UPDATE public.crm_whatsapp_conversas
                    SET ultima_mensagem = :msg,
                        ultima_direcao = :dir,
                        ultima_msg_at = :ts,
                        is_group = COALESCE(:is_group, is_group),
                        nao_lidas = nao_lidas + CASE WHEN :dir = 'entrada' THEN 1 ELSE 0 END,
                        updated_at = NOW()
                    WHERE id = :cid
                """),
                {"msg": msg_text[:500], "dir": direcao, "ts": recebida_em, "is_group": is_group, "cid": str(conversa_id)},
            )
    else:
        # Criar nova conversa
        new_conv = db.execute(
            text("""
                INSERT INTO public.crm_whatsapp_conversas
                (workspace_id, contato_id, instance, remote_jid, is_group, group_name, status, nao_lidas, ultima_mensagem, ultima_direcao, ultima_msg_at, created_at, updated_at)
                VALUES (:ws, :ct, :inst, :jid, :is_group, :group_name, 'nova', CASE WHEN :dir = 'entrada' THEN 1 ELSE 0 END, :msg, :dir, :ts, NOW(), NOW())
                RETURNING id
            """),
            {
                "ws": workspace_id,
                "ct": str(contato_id),
                "inst": instance,
                "jid": remote_jid,
                "is_group": is_group,
                "group_name": None,
                "dir": direcao,
                "msg": msg_text[:500],
                "ts": recebida_em,
            },
        )
        conversa_id = new_conv.scalar()

    # 3. Inserir ou atualizar mensagem
    if from_me:
        # Mensagem de saída: pode ser confirmação de envio anterior (status='enviada')
        # Preferencialmente match por evolution_msg_id (preciso); fallback por conteúdo (legado)
        if evolution_msg_id:
            recente = db.execute(
                text("""
                    SELECT id FROM public.crm_whatsapp_mensagens
                    WHERE conversa_id = :cid
                      AND evolution_msg_id = :evid
                      AND direcao = 'saida'
                      AND status = 'enviada'
                    ORDER BY created_at DESC LIMIT 1
                """),
                {"cid": str(conversa_id), "evid": evolution_msg_id},
            )
        else:
            recente = db.execute(
                text("""
                    SELECT id FROM public.crm_whatsapp_mensagens
                    WHERE conversa_id = :cid
                      AND conteudo = :msg
                      AND direcao = 'saida'
                      AND status = 'enviada'
                      AND created_at >= NOW() - interval '60 seconds'
                    ORDER BY created_at DESC LIMIT 1
                """),
                {"cid": str(conversa_id), "msg": msg_text},
            )
        msg_existente = recente.fetchone()

        if msg_existente:
            db.execute(
                text("""
                    UPDATE public.crm_whatsapp_mensagens
                    SET evolution_msg_id = :evid,
                        status = 'entregue',
                        payload = :payload,
                        recebida_em = :ts,
                        updated_at = NOW()
                    WHERE id = :mid
                """),
                {
                    "evid": evolution_msg_id,
                    "payload": json.dumps(data),
                    "ts": recebida_em,
                    "mid": str(msg_existente[0]),
                },
            )
            logger.info("[webhook-process] mensagem de saída atualizada para 'entregue': %s", evolution_msg_id)
        else:
            # Não encontrou envio anterior — insere normalmente (mensagem enviada fora do sistema)
            try:
                db.execute(
                    text("""
                    INSERT INTO public.crm_whatsapp_mensagens
                    (conversa_id, contato_id, evolution_msg_id, instance, remote_jid, direcao, from_me, remetente_tipo, remetente_nome, conteudo, message_type, status, payload, recebida_em, participant_jid, participant_name, is_mentioned, created_at)
                    VALUES (:cid, :ct, :evid, :inst, :jid, 'saida', true, 'agente', :rn, :msg, :mt, 'entregue', :payload, :ts, NULL, NULL, false, NOW())
                """),
                    {
                        "cid": str(conversa_id),
                        "ct": str(contato_id),
                        "evid": evolution_msg_id,
                        "inst": instance,
                        "jid": remote_jid,
                        "rn": "Agente",
                        "msg": msg_text,
                        "mt": message_type,
                        "payload": json.dumps(data),
                        "ts": recebida_em,
                    },
                )
            except Exception as e:
                if "duplicate" in str(e).lower() or "unique" in str(e).lower():
                    logger.info("[webhook-process] Mensagem duplicada ignorada: %s", evolution_msg_id)
                else:
                    raise
    else:
        # Mensagem de entrada: insere normalmente
        mensagem_id = None
        try:
            result = db.execute(
                text("""
                    INSERT INTO public.crm_whatsapp_mensagens
                    (conversa_id, contato_id, evolution_msg_id, instance, remote_jid, direcao, from_me, remetente_tipo, remetente_nome, conteudo, message_type, payload, recebida_em, participant_jid, participant_name, is_mentioned, created_at)
                    VALUES (:cid, :ct, :evid, :inst, :jid, 'entrada', false, 'contato', :rn, :msg, :mt, :payload, :ts, :part_jid, :part_name, :is_mentioned, NOW())
                    RETURNING id
                """),
                {
                    "cid": str(conversa_id),
                    "ct": str(contato_id),
                    "evid": evolution_msg_id,
                    "inst": instance,
                    "jid": remote_jid,
                    "rn": push_name or (participant_jid.split("@")[0] if participant_jid else remote_jid.split("@")[0]),
                    "msg": msg_text,
                    "mt": message_type,
                    "payload": json.dumps(data),
                    "ts": recebida_em,
                    "part_jid": participant_jid if is_group else None,
                    "part_name": sender_name if is_group else None,
                    "is_mentioned": is_mentioned,
                },
            )
            mensagem_id = result.scalar()
        except Exception as e:
            if "duplicate" in str(e).lower() or "unique" in str(e).lower():
                logger.info("[webhook-process] Mensagem duplicada ignorada: %s", evolution_msg_id)
            else:
                raise

    db.commit()
    logger.info("[webhook-process] COMMIT OK conversa_id=%s", conversa_id)

    # 4. Publicar no Redis para realtime
    try:
        publish_whatsapp_event({
            "type": "message.upsert",
            "workspaceId": workspace_id,
            "conversaId": str(conversa_id),
            "remoteJid": remote_jid,
            "direction": direcao,
            "text": msg_text,
            "instance": instance,
            "messageType": message_type,
            "timestamp": recebida_em.isoformat(),
        })
        logger.info("[webhook-process] REDIS PUBLICADO")
    except Exception as e:
        logger.info("[webhook-process] REDIS FALHOU: %s", e)

    # Retorna metadados para o endpoint decidir se precisa baixar mídia
    is_media = message_type in ("imageMessage", "videoMessage", "audioMessage", "documentMessage", "stickerMessage", "ptvMessage", "media") or bool(media_payload.get("base64") or media_payload.get("url"))
    return {
        "is_media": is_media and not from_me,
        "mensagem_id": str(mensagem_id) if mensagem_id else None,
        "conversa_id": str(conversa_id),
        "evolution_msg_id": evolution_msg_id,
        "message_type": message_type,
        "from_me": from_me,
        "is_group": is_group,
        "remote_jid": remote_jid,
        "participant_jid": participant_jid,
        "workspace_id": workspace_id,
        "media_base64": media_payload.get("base64"),
        "media_url": media_payload.get("url"),
        "media_mime_type": media_payload.get("mimetype"),
        "media_filename": media_payload.get("filename"),
    }


def _processar_mensagem_evolution(
    db: Session,
    canal: CanalEntrada,
    data: dict,
    *,
    raw_event_id: str | None = None,
) -> dict | None:
    return process_evolution_message(db, canal, data, raw_event_id=raw_event_id)


_STATUS_RANK: dict[str, int] = {"pending": 1, "sent": 2, "delivered": 3, "read": 4}


def _resolve_receipt_instance(data: dict, canal: CanalEntrada) -> str:
    """Resolve a instância para lookup de receipt.
    Prioridade: payload["instance"] > canal.evolution_instance_id > fallback "opcl".
    Para canais WAHA, evolution_instance_id é NULL; o payload traz a session WAHA.
    """
    return data.get("instance") or canal.evolution_instance_id or "opcl"


def _status_allows_update(current: str | None, new: str) -> bool:
    """Retorna True se `new` pode sobrescrever `current`.

    Regras:
    - read nunca regride
    - delivered não regride para sent/pending
    - failed só sobrescreve pending/sent/None
    - failed não é sobrescrito por sent/delivered/read (falha confirmada é permanente)
    - status desconhecido não atualiza
    """
    if new == "failed":
        return current in (None, "pending", "sent")
    if current == "failed":
        return False
    new_rank = _STATUS_RANK.get(new)
    if new_rank is None:
        return False
    current_rank = _STATUS_RANK.get(current or "pending", 0)
    return new_rank > current_rank


def _processar_status_mensagem(db: Session, canal: CanalEntrada, data: dict, event: str = "") -> None:
    """Processa evento de receipt/status para atualizar entrega/leitura."""
    from datetime import datetime, timezone
    from sqlalchemy import text

    event_norm = _normalizar_evento_evolution(event)
    instance   = _resolve_receipt_instance(data, canal)
    receipt = normalize_receipt_event(data, event_norm, instance=instance)

    if not receipt.message_ids or not receipt.status:
        logger.info("[webhook-status] ABORTANDO: evolution_msg_id ou status vazio")
        return

    message_ids = receipt.message_ids
    wa_status = receipt.status
    remote_jid = receipt.remote_jid
    timestamp = datetime.now(timezone.utc)

    updated_ids: list[str] = []
    for evolution_msg_id in dict.fromkeys(message_ids):
        row = db.execute(
            text(
                "SELECT wa_status FROM public.crm_whatsapp_mensagens "
                "WHERE evolution_msg_id = :evid AND instance = :inst"
            ),
            {"evid": evolution_msg_id, "inst": instance},
        ).fetchone()
        current_status = row[0] if row else None
        if not _status_allows_update(current_status, wa_status):
            logger.debug(
                "[webhook-status] ignorando regressão %s → %s evid=%.8s",
                current_status, wa_status, evolution_msg_id,
            )
            continue
        result = db.execute(
            text("""
                UPDATE public.crm_whatsapp_mensagens
                SET wa_status = :status,
                    delivered_at = CASE WHEN :status = 'delivered' AND delivered_at IS NULL THEN NOW() ELSE delivered_at END,
                    read_at = CASE WHEN :status = 'read' AND read_at IS NULL THEN NOW() ELSE read_at END,
                    updated_at = NOW()
                WHERE evolution_msg_id = :evid
                  AND instance = :inst
            """),
            {"status": wa_status, "evid": evolution_msg_id, "inst": instance},
        )
        if result.rowcount > 0:
            updated_ids.append(evolution_msg_id)
        else:
            logger.debug(
                "[webhook-status] 0 rows updated evid=%.8s inst=%s status=%s",
                evolution_msg_id, instance, wa_status,
            )

    if not updated_ids:
        logger.debug("[webhook-status] nenhum update aplicado msg_ids=%s status=%s", message_ids, wa_status)
        db.rollback()
        return

    db.commit()

    logger.info("[webhook-status] msg_ids=%s status=%s", updated_ids, wa_status)

    try:
        for evolution_msg_id in updated_ids:
            publish_whatsapp_event({
                "type": "message.status",
                "workspaceId": str(canal.workspace_id),
                "evolutionMsgId": evolution_msg_id,
                "remoteJid": remote_jid,
                "status": wa_status,
                "instance": instance,
                "timestamp": timestamp.isoformat(),
            })
        logger.info("[webhook-status] REDIS PUBLICADO")
    except Exception as e:
        logger.info("[webhook-status] REDIS FALHOU: %s", e)


MEDIA_BUCKET = "whatsapp-media"


def _baixar_e_salvar_midia(
    instance_name: str,
    evolution_msg_id: str,
    mensagem_db_id: str,
    conversa_db_id: str,
    message_type_raw: str,
    media_base64: str | None = None,
    media_url: str | None = None,
    media_mime_type: str | None = None,
    media_filename: str | None = None,
) -> None:
    """Background task: baixa mídia da Evolution, salva no MinIO e registra no DB."""
    from app.core.config import settings
    from urllib.request import urlopen

    logger.info("[midia-bg] iniciando download msg_id=%s", evolution_msg_id)

    try:
        content = None
        mime = media_mime_type or "application/octet-stream"
        filename = media_filename or evolution_msg_id

        if media_base64:
            raw_b64 = media_base64.split(",", 1)[1] if media_base64.startswith("data:") and "," in media_base64 else media_base64
            content = base64.b64decode(raw_b64)
        elif media_url:
            try:
                with urlopen(media_url) as resp:
                    content = resp.read()
                    headers = getattr(resp, "headers", None)
                    if headers:
                        mime = headers.get_content_type() or headers.get("content-type") or mime
            except Exception:
                logger.warning("[midia-bg] falha ao baixar mídia por URL, tentando fallback Evolution: %s", evolution_msg_id)

        if content is None:
            info = evo_service.baixar_midia(instance_name, evolution_msg_id)
            if not info.get("found"):
                logger.warning("[midia-bg] mídia não encontrada na Evolution: %s", evolution_msg_id)
                return

            b64_data = info.get("base64", "")
            if not b64_data:
                logger.warning("[midia-bg] base64 vazio: %s", evolution_msg_id)
                return

            raw_b64 = b64_data.split(",", 1)[1] if isinstance(b64_data, str) and b64_data.startswith("data:") and "," in b64_data else b64_data
            content = base64.b64decode(raw_b64)
            mime = info.get("mimetype") or info.get("mimeType") or mime
            if not media_filename:
                filename = info.get("caption") or filename

        tipo_map = {
            "imageMessage": "image",
            "videoMessage": "video",
            "audioMessage": "audio",
            "documentMessage": "document",
            "stickerMessage": "sticker",
            "ptvMessage": "video",
            "image": "image",
            "video": "video",
            "audio": "audio",
            "document": "document",
        }
        tipo = tipo_map.get(message_type_raw, "file")
        if tipo == "file" and isinstance(mime, str):
            if mime.startswith("image/"):
                tipo = "image"
            elif mime.startswith("video/"):
                tipo = "video"
            elif mime.startswith("audio/"):
                tipo = "audio"
            elif mime in {"application/pdf"} or mime.startswith("application/"):
                tipo = "document"

        ext = os.path.splitext(filename)[1]
        if not ext:
            ext = mimetypes.guess_extension(mime) or ".bin"

        object_key = f"whatsapp/{conversa_db_id}/{mensagem_db_id}{ext}"
        put_bytes(MEDIA_BUCKET, object_key, content, mime)
        url = public_url(MEDIA_BUCKET, object_key)

        engine = create_engine(settings.DATABASE_URL)
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO public.crm_whatsapp_midia
                    (conversa_id, mensagem_id, tipo, minio_path, url_publica, mimetype, tamanho, filename, created_at)
                    VALUES (:cid, :mid, :tipo, :path, :url, :mime, :size, :fname, NOW())
                """),
                {
                    "cid": conversa_db_id,
                    "mid": mensagem_db_id,
                    "tipo": tipo,
                    "path": object_key,
                    "url": url,
                    "mime": mime,
                    "size": len(content),
                    "fname": f"{mensagem_db_id}{ext}",
                },
            )
        logger.info("[midia-bg] OK msg_id=%s tipo=%s size=%s", evolution_msg_id, tipo, len(content))
    except Exception as exc:
        logger.exception("[midia-bg] ERRO msg_id=%s: %s", evolution_msg_id, exc)


def _processar_mensagem_meta(db: Session, canal: CanalEntrada, entry: dict) -> None:
    """Processa mensagem recebida da Meta Cloud API e salva no banco."""
    from datetime import datetime, timezone
    from sqlalchemy import text

    wa_id = entry.get("wa_id", "")
    wamid = entry.get("wamid", "")
    timestamp = entry.get("timestamp", "")
    message_type = entry.get("message_type", "text")
    text_content = entry.get("text", "")

    if not wa_id or not wamid:
        logger.warning("[webhook-meta-msg] ABORTANDO: wa_id ou wamid vazio")
        return

    recebida_em = datetime.fromtimestamp(int(timestamp), tz=timezone.utc) if timestamp and timestamp.isdigit() else datetime.now(timezone.utc)
    workspace_id = str(canal.workspace_id)
    instance = canal.evolution_instance_id or "meta"

    # Extrai nome do contato
    contacts = entry.get("contacts", [])
    push_name = contacts[0].get("profile", {}).get("name", "") if contacts else ""

    # 1. Upsert contato
    contato_result = db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_contatos (workspace_id, jid, telefone, nome, push_name, origem, created_at, updated_at)
            VALUES (:ws, :jid, :tel, :nome, :push, 'meta', NOW(), NOW())
            ON CONFLICT (workspace_id, jid) DO UPDATE SET
                nome = COALESCE(EXCLUDED.nome, public.crm_whatsapp_contatos.nome),
                push_name = COALESCE(EXCLUDED.push_name, public.crm_whatsapp_contatos.push_name),
                updated_at = NOW()
            RETURNING id
        """),
        {
            "ws": workspace_id,
            "jid": wa_id,
            "tel": wa_id,
            "nome": push_name or wa_id,
            "push": push_name,
        },
    )
    contato_id = contato_result.scalar()

    # 2. Verifica/cria conversa
    conv_result = db.execute(
        text("""
            SELECT id, status FROM public.crm_whatsapp_conversas
            WHERE instance = :inst AND remote_jid = :jid
            ORDER BY updated_at DESC LIMIT 1
        """),
        {"inst": instance, "jid": wa_id},
    )
    conv_row = conv_result.fetchone()

    if conv_row:
        conversa_id = conv_row[0]
        conv_status = conv_row[1]
        # Se resolvida e nova mensagem de entrada -> criar NOVA conversa
        if conv_status == "resolvido":
            new_conv = db.execute(
                text("""
                    INSERT INTO public.crm_whatsapp_conversas
                    (workspace_id, contato_id, instance, remote_jid, status, nao_lidas, ultima_mensagem, ultima_direcao, ultima_msg_at, created_at, updated_at)
                    VALUES (:ws, :ct, :inst, :jid, 'nova', 1, :msg, 'entrada', :ts, NOW(), NOW())
                    RETURNING id
                """),
                {
                    "ws": workspace_id,
                    "ct": str(contato_id),
                    "inst": instance,
                    "jid": wa_id,
                    "msg": text_content[:500] if text_content else "[mídia]",
                    "ts": recebida_em,
                },
            )
            conversa_id = new_conv.scalar()
        else:
            db.execute(
                text("""
                    UPDATE public.crm_whatsapp_conversas
                    SET ultima_mensagem = :msg,
                        ultima_direcao = 'entrada',
                        ultima_msg_at = :ts,
                        nao_lidas = nao_lidas + 1,
                        updated_at = NOW()
                    WHERE id = :cid
                """),
                {"msg": (text_content[:500] if text_content else "[mídia]"), "ts": recebida_em, "cid": str(conversa_id)},
            )
    else:
        new_conv = db.execute(
            text("""
                INSERT INTO public.crm_whatsapp_conversas
                (workspace_id, contato_id, instance, remote_jid, status, nao_lidas, ultima_mensagem, ultima_direcao, ultima_msg_at, created_at, updated_at)
                VALUES (:ws, :ct, :inst, :jid, 'nova', 1, :msg, 'entrada', :ts, NOW(), NOW())
                RETURNING id
            """),
            {
                "ws": workspace_id,
                "ct": str(contato_id),
                "inst": instance,
                "jid": wa_id,
                "msg": text_content[:500] if text_content else "[mídia]",
                "ts": recebida_em,
            },
        )
        conversa_id = new_conv.scalar()

    # 3. Salva mensagem
    try:
        db.execute(
            text("""
                INSERT INTO public.crm_whatsapp_mensagens
                (conversa_id, contato_id, evolution_msg_id, instance, remote_jid, direcao, from_me, remetente_tipo, remetente_nome, conteudo, message_type, payload, recebida_em, created_at)
                VALUES (:cid, :ct, :wamid, :inst, :jid, 'entrada', false, 'contato', :rn, :msg, :mt, :payload, :ts, NOW())
            """),
            {
                "cid": str(conversa_id),
                "ct": str(contato_id),
                "wamid": wamid,
                "inst": instance,
                "jid": wa_id,
                "rn": push_name or wa_id,
                "msg": text_content if text_content else "[mídia]",
                "mt": message_type,
                "payload": json.dumps(entry),
                "ts": recebida_em,
            },
        )
    except Exception as e:
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            logger.info("[webhook-meta-msg] Mensagem duplicada ignorada: %s", wamid)
        else:
            raise

    # 4. Publica no Redis
    try:
        publish_whatsapp_event({
            "type": "message.upsert",
            "workspaceId": workspace_id,
            "conversaId": str(conversa_id),
            "remoteJid": wa_id,
            "direction": "entrada",
            "text": text_content if text_content else "[mídia]",
            "instance": instance,
            "messageType": message_type,
            "timestamp": recebida_em.isoformat(),
        })
    except Exception as e:
        logger.info("[webhook-meta-msg] REDIS FALHOU: %s", e)


def _processar_status_meta(db: Session, canal: CanalEntrada, entry: dict) -> None:
    """Processa status de entrega da Meta Cloud API."""
    from datetime import datetime, timezone
    from sqlalchemy import text

    wamid = entry.get("wamid", "")
    status = entry.get("status", "").lower()
    timestamp = entry.get("timestamp", "")
    instance = canal.evolution_instance_id or "meta"

    if not wamid or not status:
        logger.warning("[webhook-meta-status] ABORTANDO: wamid ou status vazio")
        return

    status_map = {
        "sent": "sent",
        "delivered": "delivered",
        "read": "read",
        "failed": "failed",
    }
    wa_status = status_map.get(status, status)

    db.execute(
        text("""
            UPDATE public.crm_whatsapp_mensagens
            SET wa_status = :status,
                delivered_at = CASE WHEN :status = 'delivered' AND delivered_at IS NULL THEN NOW() ELSE delivered_at END,
                read_at = CASE WHEN :status = 'read' AND read_at IS NULL THEN NOW() ELSE read_at END,
                updated_at = NOW()
            WHERE evolution_msg_id = :wamid AND instance = :inst
        """),
        {"status": wa_status, "wamid": wamid, "inst": instance},
    )

    logger.info("[webhook-meta-status] wamid=%s status=%s", wamid, wa_status)

    try:
        publish_whatsapp_event({
            "type": "message.status",
            "workspaceId": str(canal.workspace_id),
            "evolutionMsgId": wamid,
            "status": wa_status,
            "instance": instance,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.info("[webhook-meta-status] REDIS FALHOU: %s", e)


# ── Enriquecimento de contatos e grupos (BackgroundTasks) ───────────

def _enriquecer_contato_background(
    instance: str,
    jid: str,
    workspace_id: str,
) -> None:
    """Busca foto de perfil e nome amigável do contato na Evolution API.
    Roda em BackgroundTasks — não bloqueia o webhook."""
    from app.core.config import settings
    engine = create_engine(settings.DATABASE_URL)

    try:
        # 1. Verifica se já foi enriquecido nas últimas 24h
        with engine.begin() as conn:
            row = conn.execute(
                text("""
                    SELECT avatar_url, avatar_fetched_at, nome, push_name
                    FROM public.crm_whatsapp_contatos
                    WHERE workspace_id = :ws AND jid = :jid AND ativo = true
                    LIMIT 1
                """),
                {"ws": workspace_id, "jid": jid},
            ).fetchone()

        if not row:
            logger.info("[enrich-contato] contato não encontrado: jid=%s", jid)
            return

        avatar_url, fetched_at, current_nome, current_push = row
        if fetched_at and (datetime.now(timezone.utc) - fetched_at).total_seconds() < 86400:
            logger.info("[enrich-contato] skip (cooldown 24h): jid=%s", jid)
            return

        # 2. Busca foto de perfil
        foto_info = evo_service.buscar_foto_perfil(instance, jid)
        minio_avatar_url = None
        if foto_info:
            safe_jid = jid.replace("@", "_").replace(".", "_")
            if isinstance(foto_info, dict):
                avatar_url = foto_info.get("url")
                avatar_b64 = foto_info.get("base64")
                avatar_mime = foto_info.get("mime_type") or foto_info.get("mimetype") or "image/jpeg"
                if avatar_b64:
                    try:
                        raw_b64 = avatar_b64.split(",", 1)[1] if isinstance(avatar_b64, str) and avatar_b64.startswith("data:") and "," in avatar_b64 else avatar_b64
                        avatar_bytes = base64.b64decode(raw_b64)
                        ext = mimetypes.guess_extension(avatar_mime) or ".jpg"
                        object_key = f"contacts/{safe_jid}{ext}"
                        put_bytes("whatsapp-avatars", object_key, avatar_bytes, avatar_mime)
                        minio_avatar_url = public_url("whatsapp-avatars", object_key)
                    except Exception:
                        logger.exception("[enrich-contato] falha ao salvar avatar base64: jid=%s", jid)
                elif avatar_url:
                    minio_avatar_url = download_and_put(
                        "whatsapp-avatars",
                        f"contacts/{safe_jid}.jpg",
                        avatar_url,
                        avatar_mime,
                    )
            elif isinstance(foto_info, str):
                if foto_info.startswith("http"):
                    minio_avatar_url = download_and_put(
                        "whatsapp-avatars",
                        f"contacts/{safe_jid}.jpg",
                        foto_info,
                        "image/jpeg",
                    )
                else:
                    try:
                        avatar_bytes = base64.b64decode(foto_info.split(",", 1)[1] if foto_info.startswith("data:") and "," in foto_info else foto_info)
                        object_key = f"contacts/{safe_jid}.jpg"
                        put_bytes("whatsapp-avatars", object_key, avatar_bytes, "image/jpeg")
                        minio_avatar_url = public_url("whatsapp-avatars", object_key)
                    except Exception:
                        logger.exception("[enrich-contato] falha ao salvar avatar em string base64: jid=%s", jid)
            if minio_avatar_url:
                logger.info("[enrich-contato] avatar salvo no MinIO: %s", minio_avatar_url)

        # 3. Busca nome amigável
        contatos = evo_service.buscar_contato(instance, jid)
        best_name = None
        best_push = None
        if contatos and isinstance(contatos, list):
            c = contatos[0]
            best_name = c.get("name") or c.get("verifiedName")
            best_push = c.get("pushName") or c.get("notify")

        # 4. Atualiza banco
        with engine.begin() as conn:
            conn.execute(
                text("""
                    UPDATE public.crm_whatsapp_contatos
                    SET avatar_url = COALESCE(:avatar, avatar_url),
                        avatar_fetched_at = NOW(),
                        nome = COALESCE(NULLIF(:nome, ''), nome),
                        push_name = COALESCE(NULLIF(:push, ''), push_name),
                        updated_at = NOW()
                    WHERE workspace_id = :ws AND jid = :jid
                """),
                {
                    "avatar": minio_avatar_url,
                    "nome": best_name,
                    "push": best_push,
                    "ws": workspace_id,
                    "jid": jid,
                },
            )

        logger.info(
            "[enrich-contato] OK jid=%s avatar=%s nome=%s push=%s",
            jid, bool(minio_avatar_url), best_name, best_push,
        )
    except Exception as exc:
        logger.exception("[enrich-contato] ERRO jid=%s: %s", jid, exc)


def _enriquecer_grupo_background(
    instance: str,
    group_jid: str,
    workspace_id: str,
) -> None:
    """Busca nome, foto e participantes do grupo na Evolution API.
    Roda em BackgroundTasks — não bloqueia o webhook."""
    from app.core.config import settings
    engine = create_engine(settings.DATABASE_URL)

    try:
        # 1. Busca info do grupo
        info = evo_service.buscar_grupo(instance, group_jid)
        if not info:
            logger.info("[enrich-grupo] grupo não encontrado na Evolution: %s", group_jid)
            return

        group_name = info.get("subject") or info.get("id", "").split("@")[0]
        picture_url = info.get("pictureUrl")

        # 2. Baixa foto do grupo para MinIO
        minio_group_avatar = None
        if picture_url:
            safe_gid = group_jid.replace("@", "_").replace(".", "_")
            minio_group_avatar = download_and_put(
                "whatsapp-avatars",
                f"groups/{safe_gid}.jpg",
                picture_url,
                "image/jpeg",
            )

        # 3. Atualiza conversa
        with engine.begin() as conn:
            conn.execute(
                text("""
                    UPDATE public.crm_whatsapp_conversas
                    SET group_name = COALESCE(NULLIF(:gname, ''), group_name),
                        group_avatar_url = COALESCE(:gavatar, group_avatar_url),
                        updated_at = NOW()
                    WHERE workspace_id = :ws AND remote_jid = :jid AND ativo = true
                """),
                {
                    "gname": group_name,
                    "gavatar": minio_group_avatar,
                    "ws": workspace_id,
                    "jid": group_jid,
                },
            )

        # 4. Upsert participantes como contatos (reutiliza avatar existente)
        participants = info.get("participants", []) or evo_service.listar_participantes_grupo(instance, group_jid)
        if participants:
            for p in participants:
                p_jid = p.get("id", "")
                if not p_jid:
                    continue
                p_tel = p_jid.split("@")[0] if "@" in p_jid else p_jid

                with engine.begin() as conn:
                    # Tenta reutilizar avatar de contato existente
                    existing = conn.execute(
                        text("""
                            SELECT avatar_url FROM public.crm_whatsapp_contatos
                            WHERE workspace_id = :ws AND jid = :jid AND ativo = true
                            LIMIT 1
                        """),
                        {"ws": workspace_id, "jid": p_jid},
                    ).fetchone()
                    existing_avatar = existing[0] if existing else None

                    conn.execute(
                        text("""
                            INSERT INTO public.crm_whatsapp_contatos
                            (workspace_id, jid, telefone, numero_evo, nome, push_name, origem, avatar_url, created_at, updated_at)
                            VALUES (:ws, :jid, :tel, :evo, :nome, :push, 'grupo', :avatar, NOW(), NOW())
                            ON CONFLICT (workspace_id, jid) DO UPDATE SET
                                nome = COALESCE(NULLIF(EXCLUDED.nome, ''), public.crm_whatsapp_contatos.nome),
                                push_name = COALESCE(NULLIF(EXCLUDED.push_name, ''), public.crm_whatsapp_contatos.push_name),
                                avatar_url = COALESCE(public.crm_whatsapp_contatos.avatar_url, EXCLUDED.avatar_url),
                                updated_at = NOW()
                        """),
                        {
                            "ws": workspace_id,
                            "jid": p_jid,
                            "tel": p_tel,
                            "evo": p_jid,
                            "nome": p_tel,
                            "push": None,
                            "avatar": existing_avatar,
                        },
                    )

        logger.info(
            "[enrich-grupo] OK gid=%s nome=%s avatar=%s participants=%s",
            group_jid, group_name, bool(minio_group_avatar), len(participants),
        )
    except Exception as exc:
        logger.exception("[enrich-grupo] ERRO gid=%s: %s", group_jid, exc)
