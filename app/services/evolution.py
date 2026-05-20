"""Serviço de integração com Evolution API v2."""

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

META = settings.EVOLUTION_API_URL.rstrip("/")
API_KEY = settings.EVOLUTION_API_KEY
HEADERS = {"apikey": API_KEY, "Content-Type": "application/json"}


class EvolutionError(Exception):
    pass


def _handle_error(resp: httpx.Response, ctx: str) -> None:
    if resp.status_code >= 400:
        try:
            data = resp.json()
            msg = data.get("response", {}).get("message", data.get("error", resp.text))
        except Exception:
            msg = resp.text
        logger.error("[evolution] %s — HTTP %s: %s", ctx, resp.status_code, msg)
        raise EvolutionError(f"{ctx}: {msg}")


def criar_instancia(instance_name: str) -> dict:
    """Cria uma nova instância na Evolution."""
    with httpx.Client(timeout=30) as client:
        resp = client.post(
            f"{META}/instance/create",
            headers=HEADERS,
            json={"instanceName": instance_name, "integration": "WHATSAPP-BAILEYS"},
        )
        _handle_error(resp, "criar_instancia")
        return resp.json()


def deletar_instancia(instance_name: str) -> dict:
    """Deleta uma instância na Evolution."""
    with httpx.Client(timeout=30) as client:
        resp = client.delete(
            f"{META}/instance/delete/{instance_name}",
            headers=HEADERS,
        )
        if resp.status_code == 404:
            logger.warning("[evolution] instância %s não encontrada para deletar", instance_name)
            return {"status": "NOT_FOUND"}
        _handle_error(resp, "deletar_instancia")
        return resp.json()


def logout_instancia(instance_name: str) -> dict:
    """Desconecta (logout) uma instância na Evolution sem deletá-la."""
    with httpx.Client(timeout=30) as client:
        resp = client.delete(
            f"{META}/instance/logout/{instance_name}",
            headers=HEADERS,
        )
        if resp.status_code == 404:
            logger.warning("[evolution] instância %s não encontrada para logout", instance_name)
            return {"status": "NOT_FOUND"}
        # 400 = não está conectado, o que é aceitável
        if resp.status_code == 400:
            logger.info("[evolution] instância %s não estava conectada para logout", instance_name)
            return {"status": "NOT_CONNECTED"}
        _handle_error(resp, "logout_instancia")
        return resp.json()


def estado_conexao(instance_name: str) -> dict:
    """Retorna o estado atual da conexão."""
    with httpx.Client(timeout=15) as client:
        resp = client.get(
            f"{META}/instance/connectionState/{instance_name}",
            headers=HEADERS,
        )
        _handle_error(resp, "estado_conexao")
        return resp.json()


def obter_qr_code(instance_name: str) -> dict:
    """Solicita QR code para conexão. Retorna base64 do QR."""
    with httpx.Client(timeout=30) as client:
        resp = client.get(
            f"{META}/instance/connect/{instance_name}",
            headers=HEADERS,
        )
        _handle_error(resp, "obter_qr_code")
        return resp.json()


def configurar_webhook(instance_name: str, webhook_url: str) -> dict:
    """Configura o webhook da instância para enviar eventos."""
    with httpx.Client(timeout=30) as client:
        resp = client.post(
            f"{META}/webhook/set/{instance_name}",
            headers=HEADERS,
            json={
                "webhook": {
                    "enabled": True,
                    "url": webhook_url,
                    "events": [
                        "CONNECTION_UPDATE",
                        "MESSAGES_UPSERT",
                        "MESSAGES_UPDATE",
                    ],
                }
            },
        )
        _handle_error(resp, "configurar_webhook")
        return resp.json()


def enviar_mensagem_texto(instance_name: str, numero: str, texto: str) -> dict:
    """Envia mensagem de texto via Evolution API v2."""
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{META}/message/sendText/{instance_name}",
            headers=HEADERS,
            json={"number": numero, "text": texto},
        )
        _handle_error(resp, "enviar_mensagem_texto")
        return resp.json()


def remover_webhook(instance_name: str) -> dict:
    """Remove o webhook da instância."""
    with httpx.Client(timeout=15) as client:
        resp = client.delete(
            f"{META}/webhook/delete/{instance_name}",
            headers=HEADERS,
        )
        _handle_error(resp, "remover_webhook")
        return resp.json()


def baixar_midia(instance_name: str, message_id: str) -> dict:
    """Baixa mídia (imagem, áudio, vídeo, documento) da Evolution API v2.
    Retorna dict com 'base64' e 'mimetype'."""
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{META}/message/getBase64FromMediaMessage/{instance_name}",
            headers=HEADERS,
            json={
                "message": {
                    "key": {"id": message_id},
                }
            },
        )
        if resp.status_code == 404:
            logger.warning("[evolution] mídia não encontrada para msg_id=%s", message_id)
            return {"found": False}
        _handle_error(resp, f"baixar_midia {message_id}")
        data = resp.json()
        return {
            "found": True,
            "base64": data.get("base64"),
            "mimetype": data.get("mimetype"),
            "file_length": data.get("fileLength"),
            "caption": data.get("caption"),
        }


def enviar_mensagem_midia(
    instance_name: str,
    numero: str,
    tipo: str,  # 'image', 'audio', 'video', 'document'
    media_url: str,
    caption: str | None = None,
    file_name: str | None = None,
) -> dict:
    """Envia mensagem de mídia via URL pública na Evolution API v2."""
    endpoint_map = {
        "image": "/message/sendImage/{instance}",
        "audio": "/message/sendAudio/{instance}",
        "video": "/message/sendVideo/{instance}",
        "document": "/message/sendDocument/{instance}",
    }
    endpoint = endpoint_map.get(tipo, "/message/sendMedia/{instance}")
    endpoint = endpoint.replace("{instance}", instance_name)

    body: dict = {"number": numero, "media": media_url}
    if caption:
        body["caption"] = caption
    if file_name and tipo == "document":
        body["fileName"] = file_name

    with httpx.Client(timeout=120) as client:
        resp = client.post(f"{META}{endpoint}", headers=HEADERS, json=body)
        _handle_error(resp, f"enviar_mensagem_midia {tipo}")
        return resp.json()


def enviar_template_hsm(
    instance_name: str,
    numero: str,
    template_name: str,
    language: str = "pt_BR",
    components: list | None = None,
) -> dict:
    """Envia template HSM (Highly Structured Message) via Evolution API v2."""
    body: dict = {
        "number": numero,
        "template": template_name,
        "language": language,
    }
    if components:
        body["components"] = components

    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{META}/message/sendTemplate/{instance_name}",
            headers=HEADERS,
            json=body,
        )
        _handle_error(resp, f"enviar_template_hsm {template_name}")
        return resp.json()


# ── Enriquecimento de contatos e grupos ───────────────────────────────

def buscar_contato(instance_name: str, jid: str) -> list[dict]:
    """Busca contato(s) sincronizados na instância. Retorna lista vazia se não encontrar."""
    body: dict = {"where": {}}
    if jid:
        body["where"]["id"] = jid
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.post(
                f"{META}/chat/findContacts/{instance_name}",
                headers=HEADERS,
                json=body,
            )
            if resp.status_code == 404:
                return []
            _handle_error(resp, f"buscar_contato {jid}")
            data = resp.json()
            if isinstance(data, list):
                return data
            if isinstance(data, dict):
                return [data] if data else []
            return []
    except Exception:
        logger.exception("[evolution] buscar_contato falhou: instance=%s jid=%s", instance_name, jid)
        return []


def buscar_foto_perfil(instance_name: str, numero: str) -> str | None:
    """Busca URL da foto de perfil. Retorna URL ou None."""
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.post(
                f"{META}/chat/fetchProfilePictureUrl/{instance_name}",
                headers=HEADERS,
                json={"number": numero},
            )
            if resp.status_code == 404:
                return None
            _handle_error(resp, f"buscar_foto_perfil {numero}")
            data = resp.json()
            return data.get("profilePictureUrl") or data.get("url") or None
    except Exception:
        logger.exception("[evolution] buscar_foto_perfil falhou: instance=%s numero=%s", instance_name, numero)
        return None


def buscar_grupo(instance_name: str, group_jid: str) -> dict | None:
    """Busca informações de um grupo pelo JID. Retorna dict ou None."""
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.get(
                f"{META}/group/findGroupInfos/{instance_name}",
                headers=HEADERS,
                params={"groupJid": group_jid},
            )
            if resp.status_code == 404:
                return None
            _handle_error(resp, f"buscar_grupo {group_jid}")
            return resp.json()
    except Exception:
        logger.exception("[evolution] buscar_grupo falhou: instance=%s group=%s", instance_name, group_jid)
        return None


def listar_participantes_grupo(instance_name: str, group_jid: str) -> list[dict]:
    """Lista participantes de um grupo. Retorna lista de dicts com 'id' e 'admin'."""
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.get(
                f"{META}/group/participants/{instance_name}",
                headers=HEADERS,
                params={"groupJid": group_jid},
            )
            if resp.status_code == 404:
                return []
            _handle_error(resp, f"listar_participantes_grupo {group_jid}")
            data = resp.json()
            return data.get("participants", []) if isinstance(data, dict) else []
    except Exception:
        logger.exception("[evolution] listar_participantes_grupo falhou: instance=%s group=%s", instance_name, group_jid)
        return []
