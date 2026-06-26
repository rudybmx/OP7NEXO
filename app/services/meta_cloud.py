"""Serviço de integração com Meta Cloud API (WhatsApp Business API oficial)."""

import hmac
import hashlib
import json
import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

META_API_BASE = f"https://graph.facebook.com/{settings.META_GRAPH_API_VERSION}"
APP_SECRET = settings.META_APP_SECRET

# Mensagem fora da janela de 24h: a Meta exige template aprovado.
# https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
ERRO_FORA_JANELA_24H = 131047


class MetaCloudError(Exception):
    def __init__(self, message: str, *, code: int | None = None) -> None:
        super().__init__(message)
        self.code = code


def _appsecret_proof(access_token: str) -> str | None:
    """appsecret_proof recomendado pela Meta quando o app exige prova de segredo."""
    if not APP_SECRET:
        return None
    return hmac.new(APP_SECRET.encode("utf-8"), access_token.encode("utf-8"), hashlib.sha256).hexdigest()


def _params_com_proof(access_token: str, extra: dict | None = None) -> dict:
    params = dict(extra or {})
    proof = _appsecret_proof(access_token)
    if proof:
        params["appsecret_proof"] = proof
    return params


def _handle_error(resp: httpx.Response, ctx: str) -> None:
    if resp.status_code >= 400:
        code = None
        try:
            data = resp.json()
            err = data.get("error", {})
            msg = err.get("message", resp.text)
            code = err.get("code")
        except Exception:
            msg = resp.text
        logger.error("[meta-cloud] %s — HTTP %s: %s", ctx, resp.status_code, msg)
        raise MetaCloudError(f"{ctx}: {msg}", code=code)


def validar_credenciais(phone_number_id: str, access_token: str) -> dict:
    """GET /{phone_number_id} — valida token e retorna metadados do número.

    Usado como `getSessionStatus`/`ensureSession` na conexão do canal oficial.
    """
    url = f"{META_API_BASE}/{phone_number_id}"
    headers = {"Authorization": f"Bearer {access_token}"}
    params = _params_com_proof(access_token, {"fields": "verified_name,display_phone_number,quality_rating"})
    with httpx.Client(timeout=30) as client:
        resp = client.get(url, headers=headers, params=params)
        _handle_error(resp, "validar_credenciais")
        return resp.json()


def subscrever_app(waba_id: str, access_token: str) -> dict:
    """POST /{waba-id}/subscribed_apps — idempotente. Registra o app para receber webhooks."""
    url = f"{META_API_BASE}/{waba_id}/subscribed_apps"
    headers = {"Authorization": f"Bearer {access_token}"}
    with httpx.Client(timeout=30) as client:
        resp = client.post(url, headers=headers, params=_params_com_proof(access_token))
        _handle_error(resp, "subscrever_app")
        return resp.json()


def cancelar_subscricao_app(waba_id: str, access_token: str) -> dict:
    """DELETE /{waba-id}/subscribed_apps — remove a subscrição do app."""
    url = f"{META_API_BASE}/{waba_id}/subscribed_apps"
    headers = {"Authorization": f"Bearer {access_token}"}
    with httpx.Client(timeout=30) as client:
        resp = client.request("DELETE", url, headers=headers, params=_params_com_proof(access_token))
        _handle_error(resp, "cancelar_subscricao_app")
        return resp.json()


def listar_subscricoes(waba_id: str, access_token: str) -> dict:
    """GET /{waba-id}/subscribed_apps — lista apps subscritos (diagnóstico)."""
    url = f"{META_API_BASE}/{waba_id}/subscribed_apps"
    headers = {"Authorization": f"Bearer {access_token}"}
    with httpx.Client(timeout=30) as client:
        resp = client.get(url, headers=headers, params=_params_com_proof(access_token))
        _handle_error(resp, "listar_subscricoes")
        return resp.json()


def enviar_template(
    phone_number_id: str,
    access_token: str,
    to: str,
    template_name: str,
    language: str = "pt_BR",
    components: list | None = None,
) -> dict:
    """Envia mensagem de template (HSM) — necessário fora da janela de 24h."""
    url = f"{META_API_BASE}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    template: dict = {"name": template_name, "language": {"code": language}}
    if components:
        template["components"] = components
    body = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "template",
        "template": template,
    }
    with httpx.Client(timeout=60) as client:
        resp = client.post(url, headers=headers, json=body)
        _handle_error(resp, "enviar_template")
        return resp.json()


def verificar_assinatura(payload_body: bytes, signature: str) -> bool:
    """Verifica assinatura X-Hub-Signature-256 do webhook da Meta."""
    if not APP_SECRET:
        logger.warning("[meta-cloud] META_APP_SECRET não configurado — pulando verificação de assinatura")
        return True
    if not signature or not signature.startswith("sha256="):
        return False
    expected = hmac.new(
        APP_SECRET.encode("utf-8"),
        payload_body,
        hashlib.sha256,
    ).hexdigest()
    received = signature[7:]  # remove "sha256="
    return hmac.compare_digest(expected, received)


def enviar_mensagem_texto(
    phone_number_id: str,
    access_token: str,
    to: str,
    text: str,
    context_message_id: str | None = None,
) -> dict:
    """Envia mensagem de texto via Meta Cloud API.

    `context_message_id` (opcional): wamid da mensagem citada para responder
    citando (reply) — vira `"context": {"message_id": <wamid>}`.
    """
    url = f"{META_API_BASE}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    body: dict = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "text",
        "text": {"body": text},
    }
    if context_message_id:
        body["context"] = {"message_id": context_message_id}

    with httpx.Client(timeout=60) as client:
        resp = client.post(url, headers=headers, json=body)
        _handle_error(resp, "enviar_mensagem_texto")
        return resp.json()


def enviar_reacao(
    phone_number_id: str,
    access_token: str,
    to: str,
    wamid: str,
    emoji: str,
) -> dict:
    """Envia (ou remove) uma reação com emoji via Meta Cloud API.

    `wamid`: id da mensagem reagida. `emoji` vazio remove a reação.
    """
    url = f"{META_API_BASE}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    body = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "reaction",
        "reaction": {"message_id": wamid, "emoji": emoji or ""},
    }
    with httpx.Client(timeout=30) as client:
        resp = client.post(url, headers=headers, json=body)
        _handle_error(resp, "enviar_reacao")
        return resp.json() if resp.content else {}


def enviar_digitando(phone_number_id: str, access_token: str, message_id: str) -> dict:
    """Liga o indicador 'digitando' via Meta Cloud API. O typing_indicator é atrelado à última
    mensagem recebida do cliente (`message_id` = wamid) e também a marca como lida; expira sozinho
    (~25s) ou quando a resposta é enviada. Best-effort no chamador; timeout curto."""
    url = f"{META_API_BASE}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    body = {
        "messaging_product": "whatsapp",
        "status": "read",
        "message_id": message_id,
        "typing_indicator": {"type": "text"},
    }
    with httpx.Client(timeout=8) as client:
        resp = client.post(url, headers=headers, json=body)
        _handle_error(resp, "enviar_digitando")
        return resp.json() if resp.content else {}


def processar_webhook(payload: dict) -> dict:
    """Processa payload do webhook da Meta Cloud API.
    
    Retorna dict com:
    - event_type: 'message' | 'status' | 'unknown'
    - entries: lista de itens processados
    """
    entries = []

    if payload.get("object") != "whatsapp_business_account":
        logger.warning("[meta-cloud] webhook objeto desconhecido: %s", payload.get("object"))
        return {"event_type": "unknown", "entries": []}

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            value = change.get("value", {})

            # Mensagens recebidas
            for msg in value.get("messages", []):
                msg_type = msg.get("type", "text")

                # Reação: NÃO é mensagem nova — referencia a msg-alvo (reaction.message_id).
                if msg_type == "reaction":
                    reaction = msg.get("reaction", {}) if isinstance(msg.get("reaction"), dict) else {}
                    entries.append({
                        "type": "reaction",
                        "wa_id": msg.get("from"),
                        "wamid": msg.get("id"),
                        "timestamp": msg.get("timestamp"),
                        "target_wamid": reaction.get("message_id", ""),
                        "emoji": reaction.get("emoji", "") or "",
                        "contacts": value.get("contacts", []),
                        "metadata": value.get("metadata", {}),
                    })
                    continue

                # Citação (reply): context.id = wamid da mensagem citada.
                context = msg.get("context", {}) if isinstance(msg.get("context"), dict) else {}
                entries.append({
                    "type": "message",
                    "wa_id": msg.get("from"),
                    "wamid": msg.get("id"),
                    "timestamp": msg.get("timestamp"),
                    "message_type": msg_type,
                    "text": msg.get("text", {}).get("body", "") if msg_type == "text" else "",
                    "quoted_wamid": context.get("id", "") or "",
                    "contacts": value.get("contacts", []),
                    "metadata": value.get("metadata", {}),
                })

            # Status de entrega
            for status in value.get("statuses", []):
                entries.append({
                    "type": "status",
                    "wamid": status.get("id"),
                    "recipient_id": status.get("recipient_id"),
                    "status": status.get("status"),  # sent, delivered, read, failed
                    "timestamp": status.get("timestamp"),
                })

    event_type = "message" if any(e["type"] == "message" for e in entries) else (
        "status" if any(e["type"] == "status" for e in entries) else "unknown"
    )

    return {"event_type": event_type, "entries": entries}
