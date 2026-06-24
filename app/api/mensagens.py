import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_usuario_atual, get_workspace_atual, verificar_acesso_workspace
from app.models.crm import Conversa, Mensagem
from app.models.user import User
from app.services.whatsapp_media import infer_media_type
from app.services.whatsapp_normalizer import _extract_mentions, payload_message, payload_root
from app.services.crm_escopo import pode_ver_conversa

router = APIRouter(prefix="/mensagens", tags=["mensagens"])


class MensagemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    conversa_id: str
    contato_id: str | None
    evolution_msg_id: str | None
    instance: str | None
    remote_jid: str | None
    direcao: str
    from_me: bool
    remetente_tipo: str
    remetente_nome: str | None
    conteudo: str | None
    message_type: str | None
    wa_status: str | None
    payload: dict | None
    tokens_estimados: int | None
    embedding_status: str | None
    enviada_em: datetime | None
    recebida_em: datetime | None
    delivered_at: datetime | None
    read_at: datetime | None
    failed_reason: str | None
    media_status: str | None = None
    media_error: str | None = None
    media_kind: str | None = None
    media_mimetype: str | None = None
    media_filename: str | None = None
    media_caption: str | None = None
    media_gif: bool = False
    participant_jid: str | None
    participant_name: str | None
    is_mentioned: bool
    mentioned_jids: list[str] = []
    quoted_message_id: str | None = None
    quoted_remote_jid: str | None = None
    quoted_message_type: str | None = None
    quoted_text: str | None = None
    midias: list[dict] = []
    ativo: bool
    criado_em: datetime
    atualizado_em: datetime | None = None


class MensagemIn(BaseModel):
    conversa_id: uuid.UUID
    conteudo: str
    direcao: str = "saida"
    remetente_tipo: str = "agente"
    remetente_nome: str | None = None
    message_type: str = "text"


_MEDIA_MESSAGE_TYPES = frozenset({
    "imageMessage", "audioMessage", "pttMessage",
    "videoMessage", "documentMessage", "stickerMessage",
})

_NULL_MEDIA: dict = {
    "media_kind": None,
    "media_mimetype": None,
    "media_filename": None,
    "media_caption": None,
}


def _derive_is_gif(m: Mensagem) -> bool:
    """True quando a mídia é um GIF (no WhatsApp chega como videoMessage com
    gifPlayback=true, ou mimetype image/gif) — o front renderiza autoplay/loop."""
    payload = m.payload if isinstance(m.payload, dict) else None
    if payload:
        msg = payload_message(payload)
        for key in ("videoMessage", "VideoMessage"):
            node = msg.get(key) if isinstance(msg, dict) else None
            if isinstance(node, dict) and (node.get("gifPlayback") or node.get("GifPlayback")):
                return True
    for media in (m.midias or []):
        if getattr(media, "ativo", True) and str(getattr(media, "mimetype", "") or "").lower() == "image/gif":
            return True
    return False


def _derive_mentioned_jids(m: Mensagem) -> list[str]:
    """Lista de JIDs mencionados (@), extraída do payload bruto. O modelo só
    guarda o boolean is_mentioned; a lista completa fica no payload."""
    payload = m.payload if isinstance(m.payload, dict) else None
    if not payload:
        return []
    try:
        return _extract_mentions(payload_message(payload), payload_root(payload))
    except Exception:
        return []


def _derive_media_fields(m: Mensagem) -> dict:
    # 1. Preferir dados da midia já salva
    for media in (m.midias or []):
        if media.ativo:
            return {
                "media_kind": media.tipo,
                "media_mimetype": media.mimetype,
                "media_filename": getattr(media, "filename", None),
                "media_caption": getattr(media, "caption", None),
            }

    # 2. Verificar se há evidência real de mídia antes de inspecionar payload
    has_media_type = (m.message_type or "") in _MEDIA_MESSAGE_TYPES

    # Payload protegido contra tipos não-dict
    payload = m.payload if isinstance(m.payload, dict) else {}
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    msg_obj = data.get("message") if isinstance(data.get("message"), dict) else {}
    msg_key = m.message_type or ""
    media_node = msg_obj.get(msg_key) if isinstance(msg_obj.get(msg_key), dict) else {}
    if not media_node:
        for v in msg_obj.values():
            if isinstance(v, dict) and any(
                k in v for k in ("mimetype", "mimeType", "fileName", "filename", "caption", "url", "base64")
            ):
                media_node = v
                break

    has_payload_media = bool(media_node)

    # Se não há evidência de mídia, retornar null sem chamar infer_media_type
    if not (has_media_type or has_payload_media):
        return _NULL_MEDIA

    # 3. Extrair campos do nó de mídia
    raw_mimetype = media_node.get("mimetype") or media_node.get("mimeType") or ""
    raw_filename = media_node.get("fileName") or media_node.get("filename") or None
    raw_caption = media_node.get("caption") or None

    kind = infer_media_type(raw_mimetype, msg_key, raw_filename or "")

    return {
        "media_kind": kind or None,
        "media_mimetype": raw_mimetype or None,
        "media_filename": raw_filename,
        "media_caption": raw_caption,
    }


def _get_mensagem_or_404(
    mensagem_id: uuid.UUID,
    db: Session,
    workspace_filter: uuid.UUID | list | None,
) -> Mensagem:
    q = db.query(Mensagem).filter(Mensagem.id == mensagem_id, Mensagem.ativo.is_(True))
    if workspace_filter is not None:
        if isinstance(workspace_filter, list):
            q = q.filter(Mensagem.workspace_id.in_(workspace_filter))
        else:
            q = q.filter(Mensagem.workspace_id == workspace_filter)
    m = q.first()
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mensagem não encontrada")
    return m


def _dedup_midias(midias: list) -> list[dict]:
    """Deduplica registros de mídia pelo tipo, mantendo apenas um por tipo.

    Contexto: mensagens outbound podem gerar dois registros na tabela
    crm_whatsapp_midia — um criado no envio e outro pelo echo do webhook
    da Evolution. Deduplicamos por tipo, preferindo o registro com
    storage_status='ready' e, em caso de empate, o de created_at mais antigo.
    """
    seen: dict[str, dict] = {}
    for media in midias:
        if not media.ativo:
            continue
        tipo = media.tipo or "unknown"
        entry = {
            "id": str(media.id),
            "tipo": tipo,
            "url": media.url_publica,
            "minio_path": media.minio_path,
            "mimetype": media.mimetype,
            "tamanho": media.tamanho,
            "filename": getattr(media, "filename", None),
            "caption": getattr(media, "caption", None),
            "storage_status": getattr(media, "storage_status", None),
            "sha256": getattr(media, "sha256", None),
            "_created_at": getattr(media, "criado_em", None),
        }
        if tipo not in seen:
            seen[tipo] = entry
        else:
            existing = seen[tipo]
            # Preferir storage_status='ready'; em empate, registro mais antigo
            existing_ready = existing.get("storage_status") == "ready"
            entry_ready = entry.get("storage_status") == "ready"
            if entry_ready and not existing_ready:
                seen[tipo] = entry
            elif entry_ready == existing_ready:
                # ambos têm mesmo status — manter o mais antigo (menor created_at)
                existing_ts = existing.get("_created_at")
                entry_ts = entry.get("_created_at")
                if entry_ts and existing_ts and entry_ts < existing_ts:
                    seen[tipo] = entry
    return [{k: v for k, v in m.items() if k != "_created_at"} for m in seen.values()]


def _mensagem_out(m: Mensagem) -> MensagemOut:
    mf = _derive_media_fields(m)
    return MensagemOut(
        id=str(m.id),
        workspace_id=str(m.workspace_id),
        conversa_id=str(m.conversa_id),
        contato_id=str(m.contato_id) if m.contato_id else None,
        evolution_msg_id=m.evolution_msg_id,
        instance=m.instance,
        remote_jid=m.remote_jid,
        direcao=m.direcao,
        from_me=m.from_me,
        remetente_tipo=m.remetente_tipo,
        remetente_nome=m.remetente_nome,
        conteudo=m.conteudo,
        message_type=m.message_type,
        wa_status=m.wa_status,
        payload=m.payload or {},
        tokens_estimados=m.tokens_estimados,
        embedding_status=m.embedding_status,
        enviada_em=m.enviada_em,
        recebida_em=m.recebida_em,
        delivered_at=m.delivered_at,
        read_at=m.read_at,
        failed_reason=m.failed_reason,
        media_status=getattr(m, "media_status", None),
        media_error=getattr(m, "media_error", None),
        media_kind=mf["media_kind"],
        media_mimetype=mf["media_mimetype"],
        media_filename=mf["media_filename"],
        media_caption=mf["media_caption"],
        media_gif=_derive_is_gif(m),
        participant_jid=m.participant_jid,
        participant_name=m.participant_name,
        is_mentioned=m.is_mentioned,
        mentioned_jids=_derive_mentioned_jids(m),
        quoted_message_id=getattr(m, "quoted_message_id", None),
        quoted_remote_jid=getattr(m, "quoted_remote_jid", None),
        quoted_message_type=getattr(m, "quoted_message_type", None),
        quoted_text=getattr(m, "quoted_text", None),
        midias=_dedup_midias(m.midias or []),
        ativo=m.ativo,
        criado_em=m.criado_em,
        atualizado_em=getattr(m, 'atualizado_em', None),
    )


@router.get("", response_model=list[MensagemOut])
def listar_mensagens(
    conversa_id: uuid.UUID = Query(...),
    workspace_id: uuid.UUID | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    q = db.query(Mensagem).filter(
        Mensagem.conversa_id == conversa_id,
        Mensagem.ativo.is_(True),
    )

    workspace_target: uuid.UUID | None = workspace_id
    if workspace_target is None:
        if workspace_filter is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="workspace_id é obrigatório")
        if isinstance(workspace_filter, list):
            if len(workspace_filter) != 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Informe workspace_id quando há múltiplos workspaces.",
                )
            workspace_target = workspace_filter[0]
        else:
            workspace_target = workspace_filter

    verificar_acesso_workspace(usuario, workspace_target, db)
    q = q.filter(Mensagem.workspace_id == workspace_target)

    # Teto (Fase 1): só lê mensagens de conversa que o usuário enxerga.
    conversa = db.query(Conversa).filter(Conversa.id == conversa_id).first()
    if conversa is not None and not pode_ver_conversa(usuario, conversa):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversa não encontrada")

    q = q.order_by(Mensagem.criado_em.desc())
    total = q.offset(offset).limit(limit).all()
    return [_mensagem_out(m) for m in total]


@router.post("", response_model=MensagemOut, status_code=status.HTTP_201_CREATED)
def criar_mensagem(
    data: MensagemIn,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = workspace_filter if not isinstance(workspace_filter, list) else usuario.workspace_id
    if ws_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace não definido")

    verificar_acesso_workspace(usuario, ws_id, db)

    m = Mensagem(
        workspace_id=ws_id,
        conversa_id=data.conversa_id,
        conteudo=data.conteudo,
        direcao=data.direcao,
        remetente_tipo=data.remetente_tipo,
        remetente_nome=data.remetente_nome,
        message_type=data.message_type,
        wa_status="pending",
        enviada_em=datetime.utcnow() if data.direcao == "saida" else None,
        recebida_em=datetime.utcnow() if data.direcao == "entrada" else None,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _mensagem_out(m)


@router.get("/{mensagem_id}", response_model=MensagemOut)
def detalhar_mensagem(
    mensagem_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    m = _get_mensagem_or_404(mensagem_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, m.workspace_id, db)
    return _mensagem_out(m)


@router.put("/{mensagem_id}/status", response_model=MensagemOut)
def atualizar_status_mensagem(
    mensagem_id: uuid.UUID,
    wa_status: str,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    m = _get_mensagem_or_404(mensagem_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, m.workspace_id, db)

    m.wa_status = wa_status
    if wa_status == "delivered":
        m.delivered_at = datetime.utcnow()
    elif wa_status == "read":
        m.read_at = datetime.utcnow()
    elif wa_status == "failed":
        m.failed_reason = m.failed_reason or "unknown"

    db.commit()
    db.refresh(m)
    return _mensagem_out(m)
