import re
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import case
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import get_usuario_atual, get_workspace_atual, verificar_acesso_workspace
from app.models.canal_entrada import CanalEntrada
from app.models.agente import AgenteAjusteResposta
from app.models.crm import Contato, Conversa, CrmEtiqueta
from app.models.user import RoleUsuario, User
from app.schemas.agente import AjusteRespostaIn, AjusteRespostaOut
from app.services.whatsapp_jid_filters import visible_whatsapp_jid_clause
from app.services.whatsapp_crm_persistence import aplicar_transferencia, record_assignment_event
from app.services.crm_escopo import aplicar_teto_conversas, eh_supervisor, pode_transferir, pode_ver_conversa

router = APIRouter(prefix="/conversas", tags=["conversas"])


class EtiquetaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    nome: str
    cor: str


class ConversaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    contato_id: str
    canal_id: str | None
    instance: str | None
    remote_jid: str | None
    status: str
    nao_lidas: int
    marcada_nao_lida: bool = False
    ultima_mensagem: str | None
    ultima_direcao: str | None
    ultima_msg_at: datetime | None
    responsavel_id: str | None
    agente: str | None
    campanha: str | None
    etapa_funil: str | None
    prioridade: int | None
    resumo_ia: str | None
    contexto_ia: dict | None = None
    equipe_id: str | None
    first_response_at: datetime | None
    assigned_at: datetime | None
    closed_at: datetime | None
    resolution_time: int | None
    is_group: bool
    group_name: str | None
    group_avatar_url: str | None
    contato_nome: str | None
    contato_push_name: str | None
    contato_avatar_url: str | None
    contato_telefone: str | None
    contato_campanha_origem: str | None
    contato_meta_headline: str | None
    contato_meta_body: str | None
    contato_meta_image_url: str | None
    contato_meta_source_url: str | None
    contato_utm_source: str | None
    contato_utm_medium: str | None
    contato_primeira_conversa_at: datetime | None
    lead_status: str | None
    followup_due_at: datetime | None
    last_inbound_at: datetime | None
    last_outbound_at: datetime | None
    ativo: bool
    criado_em: datetime
    atualizado_em: datetime
    favorita: bool = False
    fixada: bool = False
    ai_ativo: bool = False
    ai_escalado: bool = False
    ai_handoff_motivo: str | None = None
    etiquetas: list[EtiquetaOut] = []


class ConversaIn(BaseModel):
    contato_id: uuid.UUID
    canal_id: uuid.UUID | None = None
    remote_jid: str | None = None
    status: str = "nova"
    ultima_mensagem: str | None = None
    ultima_direcao: str | None = None


class ConversaUpdate(BaseModel):
    status: str | None = None
    responsavel_id: uuid.UUID | None = None
    equipe_id: uuid.UUID | None = None
    agente: str | None = None
    campanha: str | None = None
    etapa_funil: str | None = None
    prioridade: int | None = None
    resumo_ia: str | None = None
    proximas_acoes_ia: list | None = None
    contexto_ia: dict | None = None
    lead_status: str | None = None
    followup_due_at: datetime | None = None
    favorita: bool | None = None
    fixada: bool | None = None
    nao_lidas: int | None = None


class AssumirIn(BaseModel):
    responsavel_id: uuid.UUID


class TransferirIn(BaseModel):
    responsavel_id: uuid.UUID | None = None
    equipe_id: uuid.UUID | None = None


class IniciarConversaIn(BaseModel):
    numero: str
    workspace_id: str | None = None


class IniciarContatoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    jid: str
    telefone: str | None
    nome: str | None
    push_name: str | None


class IniciarConversaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    conversa: ConversaOut
    contato: IniciarContatoOut
    existente: bool
    conflito_responsavel: bool = False
    responsavel_nome: str | None = None


def _digits(value: str | None) -> str:
    return re.sub(r"\D", "", value or "")


def _is_jid_like(value: str) -> bool:
    text = value.strip().lower()
    return "@" in text and (
        text.endswith("@s.whatsapp.net")
        or text.endswith("@c.us")
        or text.endswith("@g.us")
        or text.endswith("@lid")
    )


def _format_phone_display(value: str | None) -> str | None:
    digits = _digits(value)
    if not digits:
        return None
    national = digits[2:] if digits.startswith("55") and len(digits) > 11 else digits
    if len(national) == 11:
        return f"({national[:2]}) {national[2:7]}-{national[7:]}"
    if len(national) == 10:
        return f"({national[:2]}) {national[2:6]}-{national[6:]}"
    if len(national) > 2:
        return f"({national[:2]}) {national[2:]}"
    return national


def _valid_contact_display_name(value: str | None, *, jid: str | None = None) -> str:
    text_value = str(value or "").strip()
    if not text_value:
        return ""
    lowered = text_value.casefold()
    if lowered in {"contato", "contato whatsapp"}:
        return ""
    if _is_jid_like(text_value) or "@lid" in lowered:
        return ""
    compact = re.sub(r"[\s()+.-]", "", text_value)
    digits = _digits(text_value)
    if digits and compact == digits:
        return ""
    jid_digits = _digits((jid or "").split("@", 1)[0])
    if jid_digits and digits and digits == jid_digits:
        return ""
    return text_value


def _resolved_contact_name(c: Conversa) -> str:
    if c.is_group:
        return (c.group_name or "").strip() or "Grupo WhatsApp"
    contato = c.contato
    remote_jid = c.remote_jid or ""
    if contato:
        for candidate in (contato.push_name, contato.nome):
            display = _valid_contact_display_name(candidate, jid=remote_jid)
            if display:
                return display
        formatted = _format_phone_display(contato.telefone)
        if formatted:
            return formatted
    formatted = _format_phone_display(remote_jid.split("@", 1)[0])
    return formatted or "Contato"


def _get_conversa_or_404(
    conversa_id: uuid.UUID,
    db: Session,
    workspace_filter: uuid.UUID | list | None,
) -> Conversa:
    q = db.query(Conversa).filter(Conversa.id == conversa_id, Conversa.ativo.is_(True))
    if workspace_filter is not None:
        if isinstance(workspace_filter, list):
            q = q.filter(Conversa.workspace_id.in_(workspace_filter))
        else:
            q = q.filter(Conversa.workspace_id == workspace_filter)
    c = q.first()
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversa não encontrada")
    return c


def _conversa_out(c: Conversa) -> ConversaOut:
    return ConversaOut(
        id=str(c.id),
        workspace_id=str(c.workspace_id),
        contato_id=str(c.contato_id),
        canal_id=str(c.canal_id) if c.canal_id else None,
        instance=c.instance,
        remote_jid=c.remote_jid,
        status=c.status,
        nao_lidas=c.nao_lidas,
        marcada_nao_lida=getattr(c, "marcada_nao_lida", False),
        ultima_mensagem=c.ultima_mensagem,
        ultima_direcao=c.ultima_direcao,
        ultima_msg_at=c.ultima_msg_at,
        responsavel_id=str(c.responsavel_id) if c.responsavel_id else None,
        agente=c.agente,
        campanha=c.campanha,
        etapa_funil=c.etapa_funil,
        prioridade=c.prioridade,
        resumo_ia=c.resumo_ia,
        contexto_ia=c.contexto_ia,
        equipe_id=str(c.equipe_id) if c.equipe_id else None,
        first_response_at=c.first_response_at,
        assigned_at=c.assigned_at,
        closed_at=c.closed_at,
        resolution_time=c.resolution_time,
        is_group=c.is_group,
        group_name=c.group_name,
        group_avatar_url=c.group_avatar_url,
        contato_nome=_resolved_contact_name(c),
        contato_push_name=c.contato.push_name if c.contato else None,
        contato_avatar_url=c.contato.avatar_url if c.contato else None,
        contato_telefone=c.contato.telefone if c.contato else None,
        contato_campanha_origem=c.contato.campanha_origem if c.contato else None,
        contato_meta_headline=c.contato.meta_headline if c.contato else None,
        contato_meta_body=c.contato.meta_body if c.contato else None,
        contato_meta_image_url=c.contato.meta_image_url if c.contato else None,
        contato_meta_source_url=c.contato.meta_source_url if c.contato else None,
        contato_utm_source=c.contato.utm_source if c.contato else None,
        contato_utm_medium=c.contato.utm_medium if c.contato else None,
        contato_primeira_conversa_at=c.contato.primeira_conversa_at if c.contato else None,
        lead_status=getattr(c, "lead_status", None),
        followup_due_at=getattr(c, "followup_due_at", None),
        last_inbound_at=getattr(c, "last_inbound_at", None),
        last_outbound_at=getattr(c, "last_outbound_at", None),
        ativo=c.ativo,
        criado_em=c.criado_em,
        atualizado_em=c.atualizado_em,
        favorita=getattr(c, "favorita", False) or False,
        fixada=getattr(c, "fixada", False) or False,
        ai_ativo=getattr(c, "ai_ativo", False) or False,
        ai_escalado=getattr(c, "ai_escalado", False) or False,
        ai_handoff_motivo=getattr(c, "ai_handoff_motivo", None),
        etiquetas=[
            EtiquetaOut(id=str(e.id), nome=e.nome, cor=e.cor)
            for e in (getattr(c, "etiquetas", None) or [])
            if getattr(e, "ativo", True)
        ],
    )


@router.get("", response_model=list[ConversaOut])
def listar_conversas(
    status: str | None = Query(None),
    equipe_id: uuid.UUID | None = Query(None),
    responsavel_id: uuid.UUID | None = Query(None),
    busca: str | None = Query(None),
    etiqueta_ids: list[uuid.UUID] | None = Query(None),
    workspace_id: uuid.UUID | None = Query(None),
    # --- filtros V2 (todos opcionais; ausência => comportamento legado) ---
    canal_id: uuid.UUID | None = Query(None),
    escopo: str | None = Query(None, description="todas|novas|minhas|equipe"),
    acompanhamento: str | None = Query(None, description="em_atendimento|sem_resposta"),
    tipo: str | None = Query(None, description="todos|grupos|diretas"),
    arquivadas: bool | None = Query(None, description="None=legado; true=só resolvidas; false=exclui resolvidas"),
    nao_lidas: bool | None = Query(None),
    limit: int = Query(80, ge=1, le=200),
    offset: int = Query(0, ge=0),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    q = db.query(Conversa).options(joinedload(Conversa.contato)).filter(Conversa.ativo.is_(True))

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
    q = q.filter(Conversa.workspace_id == workspace_target)
    q = q.filter(visible_whatsapp_jid_clause(Conversa.remote_jid))

    # Teto de visibilidade (Fase 1): company_agent só vê as dele; demais veem todas.
    # ANTES dos filtros de UI — o usuário estreita dentro do teto, nunca amplia.
    q = aplicar_teto_conversas(q, usuario)

    # --- filtros diretos (legado + V2; todos antes de offset/limit => paginação correta) ---
    if equipe_id:
        q = q.filter(Conversa.equipe_id == equipe_id)
    if responsavel_id:
        q = q.filter(Conversa.responsavel_id == responsavel_id)
    if busca:
        q = q.filter(
            Conversa.ultima_mensagem.ilike(f"%{busca}%")
            | Conversa.remote_jid.ilike(f"%{busca}%")
        )
    if etiqueta_ids:
        # OR: conversas com pelo menos uma das etiquetas selecionadas.
        # distinct evita duplicar conversa que casa em mais de uma etiqueta.
        q = (
            q.join(Conversa.etiquetas)
            .filter(CrmEtiqueta.id.in_(etiqueta_ids))
            .distinct()
        )
    if canal_id:
        q = q.filter(Conversa.canal_id == canal_id)
    if tipo == "grupos":
        q = q.filter(Conversa.is_group.is_(True))
    elif tipo == "diretas":
        q = q.filter(Conversa.is_group.is_(False))
    if nao_lidas:
        # Fase 1: contador GLOBAL. Read-state por usuário é a Fase 2 (débito declarado).
        q = q.filter(Conversa.nao_lidas > 0)

    # --- dimensão STATUS (precedência: status explícito > arquivadas > acompanhamento) ---
    # `arquivadas` é tri-state: None=legado (sem filtro); True=só resolvidas; False=exclui resolvidas.
    arquivada_view = arquivadas is True and not status
    if status:
        q = q.filter(Conversa.status == status)
    elif arquivada_view:
        q = q.filter(Conversa.status == "resolvido")
    elif arquivadas is False:
        q = q.filter(Conversa.status != "resolvido")

    if not status and not arquivada_view:
        if acompanhamento == "em_atendimento":
            q = q.filter(Conversa.status == "em_atendimento")
        elif acompanhamento == "sem_resposta":
            # Espelha o job `leads_sem_resposta` (scheduler.py): mesma verdade de
            # tempo/direção/piso. NÃO embute is_group — `tipo` controla grupos x
            # diretas de forma ortogonal. Import lazy (scheduler já está carregado
            # no boot; BackgroundScheduler só instancia, não inicia thread no import).
            from app.services.scheduler import ATIVACAO_LEADS_SEM_RESPOSTA

            corte = datetime.now(timezone.utc) - timedelta(hours=2)
            q = q.filter(
                Conversa.ultima_direcao == "saida",
                Conversa.last_outbound_at.isnot(None),
                Conversa.last_outbound_at < corte,
                Conversa.last_outbound_at >= ATIVACAO_LEADS_SEM_RESPOSTA,
                Conversa.status != "resolvido",
            )

    # --- dimensão ESCOPO (responsável); ortogonal ao status (exceto 'novas') ---
    if escopo == "novas":
        q = q.filter(Conversa.responsavel_id.is_(None))
        if not status and not arquivada_view:
            q = q.filter(Conversa.status == "nova")
    elif escopo == "minhas":
        q = q.filter(Conversa.responsavel_id == usuario.id)
    elif escopo == "equipe":
        q = q.filter(
            Conversa.responsavel_id.isnot(None),
            Conversa.responsavel_id != usuario.id,
        )
    # escopo "todas"/None => sem restrição de responsável

    q = q.order_by(Conversa.fixada.desc(), Conversa.ultima_msg_at.desc().nullslast())
    total = q.offset(offset).limit(limit).all()
    return [_conversa_out(c) for c in total]


@router.post("", response_model=ConversaOut, status_code=status.HTTP_201_CREATED)
def criar_conversa(
    data: ConversaIn,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    # Usa workspace_id do usuário
    ws_id = workspace_filter if not isinstance(workspace_filter, list) else usuario.workspace_id
    if ws_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace não definido")

    verificar_acesso_workspace(usuario, ws_id, db)

    c = Conversa(
        workspace_id=ws_id,
        contato_id=data.contato_id,
        canal_id=data.canal_id,
        remote_jid=data.remote_jid,
        status=data.status,
        ultima_mensagem=data.ultima_mensagem,
        ultima_direcao=data.ultima_direcao,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _conversa_out(c)


@router.post("/iniciar", response_model=IniciarConversaOut, status_code=status.HTTP_201_CREATED)
def iniciar_conversa(
    data: IniciarConversaIn,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    # Resolve workspace_id
    ws_id: uuid.UUID | None = None
    if data.workspace_id:
        try:
            ws_id = uuid.UUID(data.workspace_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="workspace_id inválido")
        verificar_acesso_workspace(usuario, ws_id, db)
    elif workspace_filter is not None:
        if isinstance(workspace_filter, list):
            if len(workspace_filter) == 1:
                ws_id = workspace_filter[0]
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Informe workspace_id quando há múltiplos workspaces.",
                )
        else:
            ws_id = workspace_filter

    if ws_id is None and usuario.role != RoleUsuario.platform_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Workspace não definido")

    # Busca canal ativo
    q = (
        db.query(CanalEntrada)
        .filter(
            CanalEntrada.tipo == "whatsapp_evolution",
            (CanalEntrada.connection_status == "connected") | (CanalEntrada.status == "ativo"),
        )
        .order_by(
            case(
                (CanalEntrada.connection_status == "connected", 0),
                (CanalEntrada.status == "ativo", 1),
                else_=2,
            ),
            CanalEntrada.criado_em.desc(),
        )
    )

    if ws_id is not None:
        q = q.filter(CanalEntrada.workspace_id == ws_id)

    canal = q.first()

    # Fallback para platform_admin quando ws_id foi informado mas não achou canal nesse workspace
    if not canal and usuario.role == RoleUsuario.platform_admin and ws_id is not None:
        canal = (
            db.query(CanalEntrada)
            .filter(
                CanalEntrada.tipo == "whatsapp_evolution",
                (CanalEntrada.connection_status == "connected") | (CanalEntrada.status == "ativo"),
            )
            .order_by(
                case(
                    (CanalEntrada.connection_status == "connected", 0),
                    (CanalEntrada.status == "ativo", 1),
                    else_=2,
                ),
                CanalEntrada.criado_em.desc(),
            )
            .first()
        )

    if not canal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Nenhum canal WhatsApp ativo encontrado para este workspace.",
        )

    canal_ws_id = canal.workspace_id
    instance = canal.evolution_instance_id or f"op7-{canal_ws_id}-{canal.id}"

    # Normaliza número
    numero_limpo = "".join(ch for ch in data.numero if ch.isdigit())
    if len(numero_limpo) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Número inválido. Digite o DDD + número (mínimo 10 dígitos).",
        )
    jid = numero_limpo + "@s.whatsapp.net"

    numero_formatado = numero_limpo
    if numero_limpo.startswith("55") and len(numero_limpo) >= 12:
        numero_formatado = f"+55 {numero_limpo[2:4]} {numero_limpo[4:]}"

    # Upsert contato
    contato = (
        db.query(Contato)
        .filter(Contato.workspace_id == canal_ws_id, Contato.jid == jid, Contato.ativo.is_(True))
        .first()
    )

    if not contato:
        contato = Contato(
            workspace_id=canal_ws_id,
            jid=jid,
            telefone=numero_limpo,
            nome=numero_limpo,
            origem="manual",
        )
        db.add(contato)
        db.flush()
    else:
        if not contato.nome:
            contato.nome = numero_limpo
        if not contato.telefone:
            contato.telefone = numero_limpo

    # Verifica conversa existente
    conversa = (
        db.query(Conversa)
        .filter(
            Conversa.workspace_id == canal_ws_id,
            Conversa.canal_id == canal.id,
            Conversa.remote_jid == jid,
            Conversa.ativo.is_(True),
        )
        .order_by(Conversa.atualizado_em.desc())
        .first()
    )

    existente = bool(conversa)
    if not conversa:
        conversa = Conversa(
            workspace_id=canal_ws_id,
            contato_id=contato.id,
            canal_id=canal.id,
            instance=instance,
            remote_jid=jid,
            status="nova",
            nao_lidas=0,
            ultima_mensagem="",
            ultima_direcao="entrada",
            ultima_msg_at=datetime.utcnow(),
        )
        db.add(conversa)
        db.flush()
    elif conversa.status == "resolvido":
        conversa.status = "nova"
        conversa.closed_at = None
        conversa.resolution_time = None
        conversa.nao_lidas = 0
        conversa.deleted_at = None
        conversa.ativo = True
        conversa.instance = instance
        conversa.atualizado_em = datetime.utcnow()
    else:
        conversa.instance = instance

    # Auto-atribuição (Fase 1): conversa nova/sem dono/reaberta vira de quem iniciou
    # + desliga IA. Se já é de OUTRO humano => conflito (UI confirma via assumir).
    conflito = False
    responsavel_nome = None
    if conversa.responsavel_id is None or conversa.responsavel_id == usuario.id:
        old_resp = conversa.responsavel_id
        conversa.responsavel_id = usuario.id
        conversa.status = "em_atendimento"
        conversa.ai_ativo = False
        if conversa.assigned_at is None:
            conversa.assigned_at = datetime.utcnow()
        if old_resp != usuario.id:
            record_assignment_event(
                db,
                workspace_id=conversa.workspace_id,
                canal_id=conversa.canal_id,
                conversa_id=conversa.id,
                contato_id=conversa.contato_id,
                action="assign",
                from_responsavel_id=old_resp,
                to_responsavel_id=usuario.id,
                actor_user_id=usuario.id,
                payload={"source": "conversa.iniciar"},
            )
    else:
        conflito = True
        _outro = db.query(User).filter(User.id == conversa.responsavel_id).first()
        responsavel_nome = _outro.nome if _outro else None

    db.commit()
    db.refresh(conversa)
    db.refresh(contato)

    return IniciarConversaOut(
        conversa=_conversa_out(conversa),
        contato=IniciarContatoOut(
            id=str(contato.id),
            workspace_id=str(contato.workspace_id),
            jid=contato.jid,
            telefone=contato.telefone or numero_limpo,
            nome=contato.push_name or contato.nome or numero_formatado,
            push_name=contato.push_name,
        ),
        existente=existente,
        conflito_responsavel=conflito,
        responsavel_nome=responsavel_nome,
    )


@router.get("/{conversa_id}", response_model=ConversaOut)
def detalhar_conversa(
    conversa_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    c = _get_conversa_or_404(conversa_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, c.workspace_id, db)
    # Teto: fora do escopo do usuário => 404 (não vazar existência).
    if not pode_ver_conversa(usuario, c):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversa não encontrada")
    return _conversa_out(c)


@router.put("/{conversa_id}", response_model=ConversaOut)
def atualizar_conversa(
    conversa_id: uuid.UUID,
    data: ConversaUpdate,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    c = _get_conversa_or_404(conversa_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, c.workspace_id, db)

    if data.status is not None:
        c.status = data.status
        if data.status == "em_atendimento" and c.assigned_at is None:
            c.assigned_at = datetime.utcnow()
        if data.status in ("resolvido", "arquivada") and c.closed_at is None:
            c.closed_at = datetime.utcnow()
            if c.first_response_at:
                c.resolution_time = int((c.closed_at - c.first_response_at).total_seconds())
    old_responsavel_id = c.responsavel_id
    old_equipe_id = c.equipe_id
    if data.responsavel_id is not None:
        c.responsavel_id = data.responsavel_id
    if data.equipe_id is not None:
        c.equipe_id = data.equipe_id
    if data.agente is not None:
        c.agente = data.agente
    if data.campanha is not None:
        c.campanha = data.campanha
    if data.etapa_funil is not None:
        c.etapa_funil = data.etapa_funil
    if data.prioridade is not None:
        c.prioridade = data.prioridade
    if data.resumo_ia is not None:
        c.resumo_ia = data.resumo_ia
    if data.proximas_acoes_ia is not None:
        c.proximas_acoes_ia = data.proximas_acoes_ia
    if data.contexto_ia is not None:
        c.contexto_ia = data.contexto_ia
    if data.lead_status is not None:
        c.lead_status = data.lead_status
        if c.contato:
            c.contato.lead_status = data.lead_status
    if data.followup_due_at is not None:
        c.followup_due_at = data.followup_due_at
        if c.contato:
            c.contato.followup_due_at = data.followup_due_at
    if data.favorita is not None:
        c.favorita = data.favorita
    if data.fixada is not None:
        c.fixada = data.fixada
    if data.nao_lidas is not None:
        c.nao_lidas = max(0, data.nao_lidas)

    if data.responsavel_id is not None and data.responsavel_id != old_responsavel_id:
        record_assignment_event(
            db,
            workspace_id=c.workspace_id,
            canal_id=c.canal_id,
            conversa_id=c.id,
            contato_id=c.contato_id,
            action="assign",
            from_responsavel_id=old_responsavel_id,
            to_responsavel_id=data.responsavel_id,
            from_equipe_id=old_equipe_id,
            to_equipe_id=c.equipe_id,
            actor_user_id=usuario.id,
            payload={"source": "conversa.update"},
        )
    if data.equipe_id is not None and data.equipe_id != old_equipe_id:
        record_assignment_event(
            db,
            workspace_id=c.workspace_id,
            canal_id=c.canal_id,
            conversa_id=c.id,
            contato_id=c.contato_id,
            action="transfer",
            from_responsavel_id=old_responsavel_id,
            to_responsavel_id=c.responsavel_id,
            from_equipe_id=old_equipe_id,
            to_equipe_id=data.equipe_id,
            actor_user_id=usuario.id,
            payload={"source": "conversa.update"},
        )

    # Espelha mudanças nos cards do Kanban vinculados (resumo/responsável/etapa).
    try:
        from app.services.paineis_automacao import sincronizar_cards_da_conversa

        sincronizar_cards_da_conversa(db, c)
    except Exception:
        pass

    db.commit()
    db.refresh(c)
    return _conversa_out(c)


@router.patch("/{conversa_id}/marcar-lido", response_model=ConversaOut)
def marcar_conversa_lida(
    conversa_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    c = _get_conversa_or_404(conversa_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, c.workspace_id, db)
    c.nao_lidas = 0
    c.marcada_nao_lida = False
    db.commit()
    db.refresh(c)
    # Fecha o loop de agregação: marca a notificação "mensagem_nova" desta conversa como
    # lida p/ este usuário → a próxima mensagem volta a gerar uma notificação nova. Best-effort.
    try:
        from app.services.notificacoes import marcar_lida_por_entidade

        marcar_lida_por_entidade(db, usuario, c.workspace_id, "conversa", str(conversa_id))
    except Exception:
        pass
    return _conversa_out(c)


@router.patch("/{conversa_id}/marcar-nao-lido", response_model=ConversaOut)
def marcar_conversa_nao_lida(
    conversa_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    c = _get_conversa_or_404(conversa_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, c.workspace_id, db)
    c.marcada_nao_lida = True
    db.commit()
    db.refresh(c)
    return _conversa_out(c)


@router.post("/{conversa_id}/etiquetas/{etiqueta_id}", status_code=status.HTTP_204_NO_CONTENT)
def aplicar_etiqueta_na_conversa(
    conversa_id: uuid.UUID,
    etiqueta_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    from app.models.crm.etiqueta import CrmEtiqueta
    c = _get_conversa_or_404(conversa_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, c.workspace_id, db)
    etiqueta = db.query(CrmEtiqueta).filter(
        CrmEtiqueta.id == etiqueta_id,
        CrmEtiqueta.workspace_id == c.workspace_id,
        CrmEtiqueta.ativo.is_(True),
    ).first()
    if not etiqueta:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etiqueta não encontrada")
    if etiqueta not in c.etiquetas:
        c.etiquetas.append(etiqueta)
        db.commit()
    return None


@router.delete("/{conversa_id}/etiquetas/{etiqueta_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_etiqueta_da_conversa(
    conversa_id: uuid.UUID,
    etiqueta_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    from app.models.crm.etiqueta import CrmEtiqueta
    c = _get_conversa_or_404(conversa_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, c.workspace_id, db)
    etiqueta = db.query(CrmEtiqueta).filter(CrmEtiqueta.id == etiqueta_id).first()
    if etiqueta and etiqueta in c.etiquetas:
        c.etiquetas.remove(etiqueta)
        db.commit()
    return None


@router.delete("/{conversa_id}", status_code=status.HTTP_204_NO_CONTENT)
def desativar_conversa(
    conversa_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    c = _get_conversa_or_404(conversa_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, c.workspace_id, db)
    c.ativo = False
    c.deleted_at = datetime.utcnow()
    db.commit()
    return None


@router.post("/{conversa_id}/assumir", response_model=ConversaOut)
def assumir_conversa(
    conversa_id: uuid.UUID,
    data: AssumirIn,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    c = _get_conversa_or_404(conversa_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, c.workspace_id, db)
    # Atendente só age na própria/sem-dono; supervisor em qualquer.
    if not eh_supervisor(usuario) and c.responsavel_id not in (None, usuario.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para esta conversa")

    old_responsavel_id = c.responsavel_id
    old_equipe_id = c.equipe_id
    c.responsavel_id = data.responsavel_id
    c.status = "em_atendimento"
    c.ai_ativo = False  # handoff: humano assume => IA para de responder
    if c.assigned_at is None:
        c.assigned_at = datetime.utcnow()
    if data.responsavel_id != old_responsavel_id:
        record_assignment_event(
            db,
            workspace_id=c.workspace_id,
            canal_id=c.canal_id,
            conversa_id=c.id,
            contato_id=c.contato_id,
            action="assume",
            from_responsavel_id=old_responsavel_id,
            to_responsavel_id=data.responsavel_id,
            from_equipe_id=old_equipe_id,
            to_equipe_id=c.equipe_id,
            actor_user_id=usuario.id,
            payload={"source": "conversa.assumir"},
        )
    db.commit()
    db.refresh(c)
    return _conversa_out(c)


@router.post("/{conversa_id}/resolver", response_model=ConversaOut)
def resolver_conversa(
    conversa_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    c = _get_conversa_or_404(conversa_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, c.workspace_id, db)
    if not eh_supervisor(usuario) and c.responsavel_id not in (None, usuario.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para esta conversa")

    c.status = "resolvido"
    c.closed_at = datetime.utcnow()
    if c.first_response_at:
        c.resolution_time = int((c.closed_at - c.first_response_at).total_seconds())
    record_assignment_event(
        db,
        workspace_id=c.workspace_id,
        canal_id=c.canal_id,
        conversa_id=c.id,
        contato_id=c.contato_id,
        action="resolved",
        from_responsavel_id=c.responsavel_id,
        to_responsavel_id=c.responsavel_id,
        actor_user_id=usuario.id,
        payload={"source": "conversa.resolver"},
    )
    db.commit()
    db.refresh(c)
    return _conversa_out(c)


@router.post("/{conversa_id}/transferir", response_model=ConversaOut)
def transferir_conversa(
    conversa_id: uuid.UUID,
    data: TransferirIn,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    c = _get_conversa_or_404(conversa_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, c.workspace_id, db)
    # Atendente transfere só as dele; supervisor qualquer uma.
    if not pode_transferir(usuario, c):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para transferir esta conversa")

    aplicar_transferencia(
        db,
        c,
        responsavel_id=data.responsavel_id,
        equipe_id=data.equipe_id,
        actor_user_id=usuario.id,
        source="conversa.transferir",
    )
    db.commit()
    db.refresh(c)
    return _conversa_out(c)


@router.post("/{conversa_id}/ajuste-resposta", response_model=AjusteRespostaOut, status_code=status.HTTP_201_CREATED)
def sugerir_ajuste_resposta(
    conversa_id: uuid.UUID,
    data: AjusteRespostaIn,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    """Admin/supervisor sugere uma resposta melhor para uma mensagem do agente. Fica salvo
    na Central do agente (resolvido pelo canal da conversa) para curadoria e treino futuro."""
    c = _get_conversa_or_404(conversa_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, c.workspace_id, db)
    if not eh_supervisor(usuario):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para sugerir ajustes")
    from app.services.agent_service import _agente_ativo_do_canal

    agente = _agente_ativo_do_canal(db, c.canal_id)
    if agente is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Esta conversa não tem um agente configurado no canal")
    aj = AgenteAjusteResposta(
        workspace_id=c.workspace_id,
        agente_id=agente.id,
        conversa_id=c.id,
        mensagem_id=(uuid.UUID(data.mensagem_id) if data.mensagem_id else None),
        resposta_original=(data.resposta_original or ""),
        resposta_sugerida=data.resposta_sugerida.strip(),
        categoria=(data.categoria or None),
        autor_id=usuario.id,
    )
    db.add(aj)
    db.commit()
    db.refresh(aj)
    return AjusteRespostaOut(
        id=str(aj.id),
        agente_id=str(aj.agente_id),
        conversa_id=str(aj.conversa_id) if aj.conversa_id else None,
        mensagem_id=str(aj.mensagem_id) if aj.mensagem_id else None,
        resposta_original=aj.resposta_original,
        resposta_sugerida=aj.resposta_sugerida,
        categoria=aj.categoria,
        autor_nome=usuario.nome,
        criado_em=aj.criado_em,
    )


@router.post("/{conversa_id}/reabrir", response_model=ConversaOut)
def reabrir_conversa(
    conversa_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    c = _get_conversa_or_404(conversa_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, c.workspace_id, db)
    if not eh_supervisor(usuario) and c.responsavel_id not in (None, usuario.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para esta conversa")
    if c.status != "resolvido":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Conversa não está resolvida")

    c.status = "nova"
    c.closed_at = None
    c.resolution_time = None
    record_assignment_event(
        db,
        workspace_id=c.workspace_id,
        canal_id=c.canal_id,
        conversa_id=c.id,
        contato_id=c.contato_id,
        action="reopened",
        from_responsavel_id=c.responsavel_id,
        to_responsavel_id=c.responsavel_id,
        actor_user_id=usuario.id,
        payload={"source": "conversa.reabrir"},
    )
    db.commit()
    db.refresh(c)
    return _conversa_out(c)


@router.post("/{conversa_id}/remover-atribuicao", response_model=ConversaOut)
def remover_atribuicao_conversa(
    conversa_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    c = _get_conversa_or_404(conversa_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, c.workspace_id, db)
    if not pode_transferir(usuario, c):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para esta conversa")

    old_responsavel_id = c.responsavel_id
    old_equipe_id = c.equipe_id
    c.responsavel_id = None
    c.equipe_id = None
    # Devolve à fila: religa a IA SÓ se o canal tem agente ativo (op7nexo é opt-in;
    # não liga IA onde nunca houve agente).
    from app.services.agent_service import _agente_ativo_do_canal

    if _agente_ativo_do_canal(db, c.canal_id) is not None:
        c.ai_ativo = True
    if old_responsavel_id is not None or old_equipe_id is not None:
        record_assignment_event(
            db,
            workspace_id=c.workspace_id,
            canal_id=c.canal_id,
            conversa_id=c.id,
            contato_id=c.contato_id,
            action="transfer",
            from_responsavel_id=old_responsavel_id,
            to_responsavel_id=None,
            from_equipe_id=old_equipe_id,
            to_equipe_id=None,
            actor_user_id=usuario.id,
            payload={"source": "conversa.remover-atribuicao"},
        )
    db.commit()
    db.refresh(c)
    return _conversa_out(c)
