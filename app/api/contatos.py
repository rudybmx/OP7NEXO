import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import get_usuario_atual, get_workspace_atual, verificar_acesso_workspace
from app.models.crm import Contato, Conversa
from app.models.user import User
from app.services.whatsapp_crm_persistence import record_assignment_event

router = APIRouter(prefix="/contatos", tags=["contatos"])


class ContatoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    jid: str
    telefone: str | None
    nome: str | None
    push_name: str | None
    avatar_url: str | None
    origem: str | None
    tags: list[str] | None
    perfil_json: dict | None
    resumo_ia: str | None
    sentimento_ia: str | None
    score_lead_ia: int | None
    last_message_at: datetime | None

    # CRM / funil
    etapa_funil: str | None
    responsavel_id: str | None
    equipe_id: str | None
    notas: str | None
    instagram: str | None
    facebook: str | None
    primeira_conversa_at: datetime | None
    lead_status: str | None
    lead_score: int | None
    followup_due_at: datetime | None

    # UTM / tracking
    campanha_origem: str | None
    utm_source: str | None
    utm_medium: str | None
    utm_campaign: str | None

    # Meta Ads
    meta_ad_id: str | None
    meta_ctwa_clid: str | None
    meta_headline: str | None
    meta_body: str | None
    meta_source_url: str | None
    meta_media_type: str | None
    meta_image_url: str | None
    meta_referral_json: dict | None

    # Computed
    conversation_count: int = 0
    responsavel_nome: str | None = None
    equipe_nome: str | None = None

    ativo: bool
    criado_em: datetime
    atualizado_em: datetime


class ContatoIn(BaseModel):
    jid: str
    telefone: str | None = None
    nome: str | None = None
    push_name: str | None = None
    avatar_url: str | None = None
    origem: str | None = None
    tags: list[str] | None = None
    perfil_json: dict | None = None
    etapa_funil: str | None = None
    responsavel_id: str | None = None
    notas: str | None = None
    instagram: str | None = None
    facebook: str | None = None
    campanha_origem: str | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    lead_status: str | None = None
    lead_score: int | None = None
    followup_due_at: datetime | None = None


class ContatoUpdate(BaseModel):
    telefone: str | None = None
    nome: str | None = None
    push_name: str | None = None
    avatar_url: str | None = None
    origem: str | None = None
    tags: list[str] | None = None
    perfil_json: dict | None = None
    resumo_ia: str | None = None
    sentimento_ia: str | None = None
    score_lead_ia: int | None = None
    etapa_funil: str | None = None
    responsavel_id: str | None = None
    equipe_id: str | None = None
    notas: str | None = None
    instagram: str | None = None
    facebook: str | None = None
    campanha_origem: str | None = None
    utm_source: str | None = None
    utm_medium: str | None = None
    utm_campaign: str | None = None
    meta_ad_id: str | None = None
    meta_ctwa_clid: str | None = None
    meta_headline: str | None = None
    meta_body: str | None = None
    meta_source_url: str | None = None
    meta_media_type: str | None = None
    meta_image_url: str | None = None
    lead_status: str | None = None
    lead_score: int | None = None
    followup_due_at: datetime | None = None


def _get_contato_or_404(
    contato_id: uuid.UUID,
    db: Session,
    workspace_filter: uuid.UUID | list | None,
) -> Contato:
    q = db.query(Contato).filter(Contato.id == contato_id, Contato.ativo.is_(True))
    if workspace_filter is not None:
        if isinstance(workspace_filter, list):
            q = q.filter(Contato.workspace_id.in_(workspace_filter))
        else:
            q = q.filter(Contato.workspace_id == workspace_filter)
    c = q.first()
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contato não encontrado")
    return c


def _contato_out(c: Contato, conversation_count: int = 0) -> ContatoOut:
    return ContatoOut(
        id=str(c.id),
        workspace_id=str(c.workspace_id),
        jid=c.jid,
        telefone=c.telefone,
        nome=c.nome,
        push_name=c.push_name,
        avatar_url=c.avatar_url,
        origem=c.origem,
        tags=c.tags or [],
        perfil_json=c.perfil_json or {},
        resumo_ia=c.resumo_ia,
        sentimento_ia=c.sentimento_ia,
        score_lead_ia=c.score_lead_ia,
        last_message_at=c.last_message_at,
        etapa_funil=c.etapa_funil,
        responsavel_id=str(c.responsavel_id) if c.responsavel_id else None,
        equipe_id=str(c.equipe_id) if c.equipe_id else None,
        notas=c.notas,
        instagram=c.instagram,
        facebook=c.facebook,
        primeira_conversa_at=c.primeira_conversa_at,
        lead_status=getattr(c, "lead_status", None),
        lead_score=getattr(c, "lead_score", None),
        followup_due_at=getattr(c, "followup_due_at", None),
        campanha_origem=c.campanha_origem,
        utm_source=c.utm_source,
        utm_medium=c.utm_medium,
        utm_campaign=c.utm_campaign,
        meta_ad_id=c.meta_ad_id,
        meta_ctwa_clid=c.meta_ctwa_clid,
        meta_headline=c.meta_headline,
        meta_body=c.meta_body,
        meta_source_url=c.meta_source_url,
        meta_media_type=c.meta_media_type,
        meta_image_url=c.meta_image_url,
        meta_referral_json=c.meta_referral_json or {},
        conversation_count=conversation_count,
        responsavel_nome=c.responsavel.nome if getattr(c, 'responsavel', None) else None,
        equipe_nome=c.equipe.nome if getattr(c, 'equipe', None) else None,
        ativo=c.ativo,
        criado_em=c.criado_em,
        atualizado_em=c.atualizado_em,
    )


@router.get("", response_model=list[ContatoOut])
def listar_contatos(
    busca: str | None = Query(None),
    origem: str | None = Query(None),
    etapa_funil: str | None = Query(None),
    responsavel_id: uuid.UUID | None = Query(None),
    tag: str | None = Query(None),
    limit: int = Query(80, ge=1, le=200),
    offset: int = Query(0, ge=0),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    q = db.query(Contato).options(
        joinedload(Contato.responsavel),
        joinedload(Contato.equipe),
    ).filter(Contato.ativo.is_(True))

    if workspace_filter is not None:
        if isinstance(workspace_filter, list):
            q = q.filter(Contato.workspace_id.in_(workspace_filter))
        else:
            q = q.filter(Contato.workspace_id == workspace_filter)

    if busca:
        q = q.filter(
            Contato.nome.ilike(f"%{busca}%")
            | Contato.telefone.ilike(f"%{busca}%")
            | Contato.jid.ilike(f"%{busca}%")
        )

    if origem:
        q = q.filter(Contato.origem == origem)
    if etapa_funil:
        q = q.filter(Contato.etapa_funil == etapa_funil)
    if responsavel_id:
        q = q.filter(Contato.responsavel_id == responsavel_id)
    if tag:
        q = q.filter(Contato.tags.any(tag))

    q = q.order_by(Contato.last_message_at.desc().nullslast())
    total_query = q.offset(offset).limit(limit)
    contatos = total_query.all()

    # Compute conversation counts efficiently
    contato_ids = [c.id for c in contatos]
    counts = {}
    if contato_ids:
        from app.models.crm import Conversa
        counts_rows = (
            db.query(Conversa.contato_id, func.count(Conversa.id))
            .filter(Conversa.contato_id.in_(contato_ids), Conversa.ativo.is_(True))
            .group_by(Conversa.contato_id)
            .all()
        )
        counts = {row[0]: row[1] for row in counts_rows}

    return [_contato_out(c, counts.get(c.id, 0)) for c in contatos]


@router.post("", response_model=ContatoOut, status_code=status.HTTP_201_CREATED)
def criar_contato(
    data: ContatoIn,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = workspace_filter if not isinstance(workspace_filter, list) else usuario.workspace_id
    if ws_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace não definido")

    verificar_acesso_workspace(usuario, ws_id, db)

    # Upsert por (workspace_id, jid)
    existing = (
        db.query(Contato)
        .filter(Contato.workspace_id == ws_id, Contato.jid == data.jid)
        .first()
    )
    if existing:
        for field, value in data.model_dump(exclude_unset=True).items():
            if value is not None:
                setattr(existing, field, value)
        db.commit()
        db.refresh(existing)
        return _contato_out(existing)

    c = Contato(
        workspace_id=ws_id,
        jid=data.jid,
        telefone=data.telefone,
        nome=data.nome,
        push_name=data.push_name,
        avatar_url=data.avatar_url,
        origem=data.origem,
        tags=data.tags or [],
        perfil_json=data.perfil_json or {},
        etapa_funil=data.etapa_funil or "novo",
        responsavel_id=uuid.UUID(data.responsavel_id) if data.responsavel_id else None,
        notas=data.notas,
        instagram=data.instagram,
        facebook=data.facebook,
        campanha_origem=data.campanha_origem,
        utm_source=data.utm_source,
        utm_medium=data.utm_medium,
        utm_campaign=data.utm_campaign,
        lead_status=data.lead_status or "novo",
        lead_score=data.lead_score,
        followup_due_at=data.followup_due_at,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _contato_out(c)


@router.get("/{contato_id}", response_model=ContatoOut)
def detalhar_contato(
    contato_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    c = _get_contato_or_404(contato_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, c.workspace_id, db)

    from app.models.crm import Conversa
    conversation_count = (
        db.query(func.count(Conversa.id))
        .filter(Conversa.contato_id == c.id, Conversa.ativo.is_(True))
        .scalar()
    ) or 0

    return _contato_out(c, conversation_count)


@router.put("/{contato_id}", response_model=ContatoOut)
def atualizar_contato(
    contato_id: uuid.UUID,
    data: ContatoUpdate,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    c = _get_contato_or_404(contato_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, c.workspace_id, db)

    update_data = data.model_dump(exclude_unset=True)
    if "responsavel_id" in update_data and update_data["responsavel_id"] is not None:
        update_data["responsavel_id"] = uuid.UUID(update_data["responsavel_id"])
    if "equipe_id" in update_data and update_data["equipe_id"] is not None:
        update_data["equipe_id"] = uuid.UUID(update_data["equipe_id"])

    for field, value in update_data.items():
        setattr(c, field, value)

    db.commit()
    db.refresh(c)
    return _contato_out(c)


@router.post("/{contato_id}/atribuir", response_model=ContatoOut)
def atribuir_contato(
    contato_id: uuid.UUID,
    responsavel_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    """Atribui um responsável ao contato e propaga para conversas ativas."""
    c = _get_contato_or_404(contato_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, c.workspace_id, db)

    old_responsavel_id = c.responsavel_id
    c.responsavel_id = responsavel_id
    active_conversations = (
        db.query(Conversa)
        .filter(
            Conversa.contato_id == contato_id,
            Conversa.status.notin_(("resolvido", "arquivada")),
            Conversa.ativo.is_(True),
        )
        .all()
    )
    for conversa in active_conversations:
        if conversa.responsavel_id != responsavel_id:
            record_assignment_event(
                db,
                workspace_id=conversa.workspace_id,
                canal_id=conversa.canal_id,
                conversa_id=conversa.id,
                contato_id=conversa.contato_id,
                action="assign",
                from_responsavel_id=conversa.responsavel_id,
                to_responsavel_id=responsavel_id,
                from_equipe_id=conversa.equipe_id,
                to_equipe_id=conversa.equipe_id,
                actor_user_id=usuario.id,
                payload={"source": "contato.atribuir", "previous_contact_responsavel_id": str(old_responsavel_id) if old_responsavel_id else None},
            )

    # Propaga para conversas ativas (não resolvidas)
    from sqlalchemy import text
    db.execute(
        text("""
            UPDATE public.crm_whatsapp_conversas
            SET responsavel_id = :rid,
                updated_at = NOW()
            WHERE contato_id = :cid
              AND status NOT IN ('resolvido', 'arquivada')
              AND ativo = true
        """),
        {"rid": str(responsavel_id), "cid": str(contato_id)},
    )
    db.commit()

    return _contato_out(c)


@router.delete("/{contato_id}", status_code=status.HTTP_204_NO_CONTENT)
def desativar_contato(
    contato_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    c = _get_contato_or_404(contato_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, c.workspace_id, db)
    c.ativo = False
    c.deleted_at = datetime.utcnow()
    db.commit()
    return None
