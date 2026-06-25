import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_usuario_atual, get_workspace_atual, verificar_acesso_workspace
from app.models.crm import Contato, Conversa, FollowUp
from app.models.user import User
from app.services.redis_pub import publish_whatsapp_event

router = APIRouter(prefix="/crm/followups", tags=["crm-followups"])


class FollowUpIn(BaseModel):
    workspace_id: uuid.UUID | None = None
    canal_id: uuid.UUID | None = None
    contato_id: uuid.UUID
    conversa_id: uuid.UUID | None = None
    responsavel_id: uuid.UUID | None = None
    due_at: datetime
    tipo: str = "retorno"
    nota: str | None = None


class FollowUpUpdate(BaseModel):
    status: str | None = None
    due_at: datetime | None = None
    responsavel_id: uuid.UUID | None = None
    tipo: str | None = None
    nota: str | None = None


class FollowUpOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    canal_id: str | None
    contato_id: str
    conversa_id: str | None
    responsavel_id: str | None
    tipo: str
    status: str
    due_at: datetime
    completed_at: datetime | None
    nota: str | None
    created_by: str | None
    updated_by: str | None
    created_at: datetime
    updated_at: datetime


def _followup_out(item: FollowUp) -> FollowUpOut:
    return FollowUpOut(
        id=str(item.id),
        workspace_id=str(item.workspace_id),
        canal_id=str(item.canal_id) if item.canal_id else None,
        contato_id=str(item.contato_id),
        conversa_id=str(item.conversa_id) if item.conversa_id else None,
        responsavel_id=str(item.responsavel_id) if item.responsavel_id else None,
        tipo=item.tipo,
        status=item.status,
        due_at=item.due_at,
        completed_at=item.completed_at,
        nota=item.nota,
        created_by=str(item.created_by) if item.created_by else None,
        updated_by=str(item.updated_by) if item.updated_by else None,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _resolve_workspace(workspace_filter, requested: uuid.UUID | None, usuario: User, db: Session) -> uuid.UUID:
    if requested:
        verificar_acesso_workspace(usuario, requested, db)
        return requested
    if isinstance(workspace_filter, list):
        if len(workspace_filter) != 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Informe workspace_id quando há múltiplos workspaces.")
        workspace_id = workspace_filter[0]
    else:
        workspace_id = workspace_filter
    if workspace_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="workspace_id é obrigatório")
    verificar_acesso_workspace(usuario, workspace_id, db)
    return workspace_id


def _sync_next_followup(db: Session, *, contato_id: uuid.UUID, conversa_id: uuid.UUID | None) -> None:
    next_item = (
        db.query(FollowUp)
        .filter(FollowUp.contato_id == contato_id, FollowUp.status.in_(("pendente", "adiado")))
        .order_by(FollowUp.due_at.asc())
        .first()
    )
    next_due = next_item.due_at if next_item else None
    contato = db.query(Contato).filter(Contato.id == contato_id).first()
    if contato:
        contato.followup_due_at = next_due
        if contato.lead_status == "novo" and next_due:
            contato.lead_status = "followup"
    if conversa_id:
        conversa = db.query(Conversa).filter(Conversa.id == conversa_id).first()
        if conversa:
            conversa.followup_due_at = next_due
            if conversa.lead_status == "novo" and next_due:
                conversa.lead_status = "followup"


# ── Página de Followup (worklist de leads em followup — etiqueta 'followup') ──────
class FollowupLeadOut(BaseModel):
    id: str
    org_id: str
    nome: str | None = None
    telefone: str
    email: str | None = None
    origem: str
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    followup_config_id: str | None = None
    status_followup: str
    tentativa_atual: int = 1
    max_tentativas: int = 1
    proximo_envio: str | None = None
    ultimo_contato: str | None = None
    ultimo_resumo: str | None = None
    temperatura: str | None = None
    interesse: str | None = None
    status_fechamento: str = "em_aberto"
    session_id: str | None = None
    agente_id: str | None = None
    agendamento_id: str | None = None
    recorrencia_ativa: bool = False
    recorrencia_config_id: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class FollowupMetricasOut(BaseModel):
    ativos: int
    vencidos: int
    esgotados: int
    ganhos: int
    percas: int
    total: int
    taxa_conversao: float
    responderam: int


class FollowupFechamentoIn(BaseModel):
    status_fechamento: str


def _map_origem(utm_source: str | None, campanha_origem: str | None) -> str:
    s = (utm_source or campanha_origem or "").lower()
    if any(k in s for k in ("meta", "facebook", "fb", "instagram", "ig")):
        return "meta_ads"
    if "google" in s:
        return "google_ads"
    if "tiktok" in s:
        return "tiktok_ads"
    if "linkedin" in s:
        return "linkedin_ads"
    if any(k in s for k in ("indica", "referr")):
        return "indicacao"
    return "whatsapp"


def _iso(v) -> str | None:
    return v.isoformat() if v else None


def _followup_leads(db: Session, workspace_id, limit: int = 500) -> list[dict]:
    rows = db.execute(
        text("""
            SELECT c.id::text AS id, c.workspace_id::text AS org_id, ct.nome, ct.telefone,
                   ct.utm_source, ct.utm_medium, ct.campanha_origem,
                   c.last_inbound_at, c.last_outbound_at, c.ultima_msg_at, c.followup_due_at,
                   c.resumo_ia, c.contexto_ia->>'temperatura' AS temperatura,
                   c.contexto_ia->>'interesse' AS interesse, c.followup_fechamento,
                   c.ai_agente_id::text AS agente_id, c.created_at, c.updated_at
            FROM crm_whatsapp_conversas c
            JOIN crm_whatsapp_contatos ct ON ct.id = c.contato_id
            JOIN crm_conversa_etiquetas ce ON ce.conversa_id = c.id
            JOIN crm_etiquetas e ON e.id = ce.etiqueta_id AND e.nome = 'followup' AND e.ativo = true
            WHERE c.workspace_id = CAST(:ws AS uuid) AND c.ativo = true
            ORDER BY c.last_outbound_at DESC NULLS LAST
            LIMIT :lim
        """),
        {"ws": str(workspace_id), "lim": limit},
    ).mappings().all()
    out: list[dict] = []
    for r in rows:
        respondeu = r["last_inbound_at"] is not None and (
            r["last_outbound_at"] is None or r["last_inbound_at"] > r["last_outbound_at"]
        )
        out.append({
            "id": r["id"], "org_id": r["org_id"], "nome": r["nome"], "telefone": r["telefone"] or "",
            "origem": _map_origem(r["utm_source"], r["campanha_origem"]),
            "utm_source": r["utm_source"], "utm_medium": r["utm_medium"],
            "status_followup": "respondeu" if respondeu else "ativo",
            "tentativa_atual": 1, "max_tentativas": 1,
            "proximo_envio": _iso(r["followup_due_at"]),
            "ultimo_contato": _iso(r["last_outbound_at"] or r["ultima_msg_at"]),
            "ultimo_resumo": r["resumo_ia"], "temperatura": r["temperatura"], "interesse": r["interesse"],
            "status_fechamento": r["followup_fechamento"] or "em_aberto",
            "session_id": r["id"], "agente_id": r["agente_id"],
            "recorrencia_ativa": False,
            "created_at": _iso(r["created_at"]), "updated_at": _iso(r["updated_at"]),
        })
    return out


@router.get("/leads", response_model=list[FollowupLeadOut])
def listar_followup_leads(
    workspace_id: uuid.UUID = Query(...),
    usuario: User = Depends(get_usuario_atual),
    _wf=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    """Leads em followup (conversas com a etiqueta 'followup'), enriquecidos com a análise da IA."""
    verificar_acesso_workspace(usuario, workspace_id, db)
    return [FollowupLeadOut(**d) for d in _followup_leads(db, workspace_id)]


@router.get("/metricas", response_model=FollowupMetricasOut)
def followup_metricas(
    workspace_id: uuid.UUID = Query(...),
    usuario: User = Depends(get_usuario_atual),
    _wf=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    verificar_acesso_workspace(usuario, workspace_id, db)
    leads = _followup_leads(db, workspace_id, limit=2000)
    total = len(leads)
    ganhos = sum(1 for x in leads if x["status_fechamento"] == "ganho")
    percas = sum(1 for x in leads if x["status_fechamento"] in ("perca", "perdido"))
    return FollowupMetricasOut(
        ativos=sum(1 for x in leads if x["status_followup"] == "ativo"),
        vencidos=0,
        esgotados=0,
        ganhos=ganhos,
        percas=percas,
        total=total,
        taxa_conversao=round((ganhos / total) * 100, 1) if total else 0.0,
        responderam=sum(1 for x in leads if x["status_followup"] == "respondeu"),
    )


@router.patch("/conversa/{conversa_id}/fechamento")
def atualizar_fechamento_followup(
    conversa_id: uuid.UUID,
    data: FollowupFechamentoIn,
    usuario: User = Depends(get_usuario_atual),
    _wf=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    valido = {"em_aberto", "ganho", "perca", "perdido", "reagendado"}
    if data.status_fechamento not in valido:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="status_fechamento inválido")
    c = db.query(Conversa).filter(Conversa.id == conversa_id).first()
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversa não encontrada")
    verificar_acesso_workspace(usuario, c.workspace_id, db)
    c.followup_fechamento = data.status_fechamento
    db.commit()
    return {"id": str(c.id), "status_fechamento": c.followup_fechamento}


@router.get("", response_model=list[FollowUpOut])
def listar_followups(
    workspace_id: uuid.UUID | None = Query(None),
    contato_id: uuid.UUID | None = Query(None),
    conversa_id: uuid.UUID | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolve_workspace(workspace_filter, workspace_id, usuario, db)
    q = db.query(FollowUp).filter(FollowUp.workspace_id == ws_id)
    if contato_id:
        q = q.filter(FollowUp.contato_id == contato_id)
    if conversa_id:
        q = q.filter(FollowUp.conversa_id == conversa_id)
    if status_filter:
        q = q.filter(FollowUp.status == status_filter)
    rows = q.order_by(FollowUp.due_at.asc()).offset(offset).limit(limit).all()
    return [_followup_out(row) for row in rows]


@router.post("", response_model=FollowUpOut, status_code=status.HTTP_201_CREATED)
def criar_followup(
    data: FollowUpIn,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolve_workspace(workspace_filter, data.workspace_id, usuario, db)
    contato = db.query(Contato).filter(Contato.id == data.contato_id, Contato.workspace_id == ws_id).first()
    if not contato:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contato não encontrado")
    conversa = None
    if data.conversa_id:
        conversa = db.query(Conversa).filter(Conversa.id == data.conversa_id, Conversa.workspace_id == ws_id).first()
        if not conversa:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversa não encontrada")

    item = FollowUp(
        workspace_id=ws_id,
        canal_id=data.canal_id or (conversa.canal_id if conversa else None),
        contato_id=data.contato_id,
        conversa_id=data.conversa_id,
        responsavel_id=data.responsavel_id,
        due_at=data.due_at,
        tipo=data.tipo,
        nota=data.nota,
        created_by=usuario.id,
        updated_by=usuario.id,
    )
    db.add(item)
    db.flush()
    _sync_next_followup(db, contato_id=data.contato_id, conversa_id=data.conversa_id)
    db.commit()
    db.refresh(item)
    _publish_followup(item)
    return _followup_out(item)


@router.patch("/{followup_id}", response_model=FollowUpOut)
def atualizar_followup(
    followup_id: uuid.UUID,
    data: FollowUpUpdate,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    item = db.query(FollowUp).filter(FollowUp.id == followup_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Follow-up não encontrado")
    verificar_acesso_workspace(usuario, item.workspace_id, db)
    update = data.model_dump(exclude_unset=True)
    if "status" in update:
        item.status = update["status"]
        if item.status == "feito" and item.completed_at is None:
            item.completed_at = datetime.now(timezone.utc)
        elif item.status != "feito":
            item.completed_at = None
    for field in ("due_at", "responsavel_id", "tipo", "nota"):
        if field in update:
            setattr(item, field, update[field])
    item.updated_by = usuario.id
    _sync_next_followup(db, contato_id=item.contato_id, conversa_id=item.conversa_id)
    db.commit()
    db.refresh(item)
    _publish_followup(item)
    return _followup_out(item)


def _publish_followup(item: FollowUp) -> None:
    try:
        publish_whatsapp_event(
            {
                "type": "followup.updated",
                "workspaceId": str(item.workspace_id),
                "canalId": str(item.canal_id) if item.canal_id else None,
                "conversaId": str(item.conversa_id) if item.conversa_id else None,
                "contatoId": str(item.contato_id),
                "followupId": str(item.id),
                "status": item.status,
                "dueAt": item.due_at.isoformat(),
            }
        )
    except Exception:
        pass
