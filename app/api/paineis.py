"""Router do Kanban / Painéis CRM (/paineis).

Multi-tenant por workspace_id; JWT obrigatório. Status do card = a fase (não há
coluna status). O cadeado (painel.bloqueado) trava criar/mover/renomear/excluir
FASE, mas nunca trava mover CARD.

IMPORTANTE: rotas literais (/responsaveis, /cards/..., /fases/..., /campos/...)
são declaradas ANTES de /{painel_id} para não serem capturadas pelo path param.
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_usuario_atual, get_workspace_atual, verificar_acesso_workspace
from app.models.crm.conversa import Conversa
from app.models.crm.painel import (
    Painel,
    PainelCampo,
    PainelCard,
    PainelCardValor,
    PainelComentario,
    PainelFase,
)
from app.models.user import User
from app.models.user_workspace_access import UserWorkspaceAccess
from app.services.paineis_padrao import ensure_paineis_padrao, fase_entrada

router = APIRouter(prefix="/paineis", tags=["paineis"])


# ----------------------------------------------------------------------------- schemas
class FaseIn(BaseModel):
    nome: str
    cor: str = "#64748b"
    limite_wip: int | None = None


class FaseUpdate(BaseModel):
    nome: str | None = None
    cor: str | None = None
    limite_wip: int | None = None


class ReordenarFasesIn(BaseModel):
    ordem: list[uuid.UUID]


class CampoIn(BaseModel):
    nome: str
    tipo: str = "texto"
    opcoes: list[str] | None = None


class CampoUpdate(BaseModel):
    nome: str | None = None
    tipo: str | None = None
    opcoes: list[str] | None = None


class PainelIn(BaseModel):
    nome: str


class PainelUpdate(BaseModel):
    nome: str | None = None


class ToggleIn(BaseModel):
    valor: bool


class CardIn(BaseModel):
    titulo: str
    fase_id: uuid.UUID | None = None
    descricao: str | None = None
    prioridade: str | None = None
    responsavel_user_id: uuid.UUID | None = None
    data_vencimento: datetime | None = None
    nome: str | None = None
    telefone: str | None = None


class CardUpdate(BaseModel):
    titulo: str | None = None
    fase_id: uuid.UUID | None = None
    descricao: str | None = None
    prioridade: str | None = None
    responsavel_user_id: uuid.UUID | None = None
    responsavel_agente_id: uuid.UUID | None = None
    data_vencimento: datetime | None = None
    nome: str | None = None
    telefone: str | None = None
    resumo_conversa: str | None = None


class MoverCardIn(BaseModel):
    fase_id: uuid.UUID
    ordem: int | None = None


class ValorIn(BaseModel):
    campo_id: uuid.UUID
    valor: object | None = None


class ValoresIn(BaseModel):
    valores: list[ValorIn]


class ComentarioIn(BaseModel):
    texto: str


TIPOS_CAMPO = {"texto", "numero", "data", "select", "usuario", "checkbox", "url"}


# ----------------------------------------------------------------------------- helpers
def _resolver_ws(workspace_id, workspace_filter):
    ws_id = workspace_id or (workspace_filter if not isinstance(workspace_filter, list) else None)
    if ws_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="workspace_id é obrigatório")
    return ws_id


def _fase_out(f: PainelFase) -> dict:
    return {
        "id": str(f.id),
        "painel_id": str(f.painel_id),
        "nome": f.nome,
        "cor": f.cor,
        "ordem": f.ordem,
        "limite_wip": f.limite_wip,
        "fixa": f.fixa,
    }


def _campo_out(c: PainelCampo) -> dict:
    return {
        "id": str(c.id),
        "painel_id": str(c.painel_id),
        "nome": c.nome,
        "tipo": c.tipo,
        "opcoes": c.opcoes or [],
        "ordem": c.ordem,
    }


def _card_out(card: PainelCard, *, detalhe: bool = False) -> dict:
    out = {
        "id": str(card.id),
        "painel_id": str(card.painel_id),
        "fase_id": str(card.fase_id),
        "titulo": card.titulo,
        "descricao": card.descricao,
        "prioridade": card.prioridade,
        "responsavel_user_id": str(card.responsavel_user_id) if card.responsavel_user_id else None,
        "responsavel_nome": card.responsavel.nome if card.responsavel else None,
        "responsavel_agente_id": str(card.responsavel_agente_id) if card.responsavel_agente_id else None,
        "responsavel_agente_nome": card.responsavel_agente.nome if card.responsavel_agente else None,
        "origem_agente": card.origem_agente,
        "data_vencimento": card.data_vencimento,
        "nome": card.nome,
        "telefone": card.telefone,
        "canal_entrada_id": str(card.canal_entrada_id) if card.canal_entrada_id else None,
        "resumo_conversa": card.resumo_conversa,
        "conversa_id": str(card.conversa_id) if card.conversa_id else None,
        "contato_id": str(card.contato_id) if card.contato_id else None,
        # Pontuação da IA (espelho do contato; atualizada pela análise da conversa).
        "lead_temperatura": card.contato.sentimento_ia if card.contato else None,
        "lead_score": card.contato.score_lead_ia if card.contato else None,
        "ordem": card.ordem,
        "criado_em": card.criado_em,
        "atualizado_em": card.atualizado_em,
        "valores": {str(v.campo_id): v.valor for v in card.valores},
    }
    if detalhe:
        out["comentarios"] = [
            {
                "id": str(c.id),
                "autor_user_id": str(c.autor_user_id) if c.autor_user_id else None,
                "autor_nome": (c.autor.nome if c.autor else None) or c.autor_label,
                "origem": c.origem,
                "texto": c.texto,
                "criado_em": c.criado_em,
            }
            for c in card.comentarios
        ]
    return out


def _painel_resumo_out(p: Painel) -> dict:
    return {
        "id": str(p.id),
        "nome": p.nome,
        "tipo": p.tipo,
        "sistema": p.sistema,
        "automacao_ativa": p.automacao_ativa,
        "agente_funil": p.agente_funil,
        "bloqueado": p.bloqueado,
        "ordem": p.ordem,
    }


def _painel_detalhe_out(db: Session, p: Painel) -> dict:
    out = _painel_resumo_out(p)
    fases = sorted([f for f in p.fases if f.ativo], key=lambda f: f.ordem)
    campos = sorted([c for c in p.campos if c.ativo], key=lambda c: c.ordem)
    cards = (
        db.query(PainelCard)
        .filter(PainelCard.painel_id == p.id, PainelCard.ativo.is_(True))
        .order_by(PainelCard.fase_id, PainelCard.ordem)
        .all()
    )
    out["fases"] = [_fase_out(f) for f in fases]
    out["campos"] = [_campo_out(c) for c in campos]
    out["cards"] = [_card_out(c) for c in cards]
    return out


def _get_painel(db: Session, painel_id: uuid.UUID, usuario: User) -> Painel:
    p = db.query(Painel).filter(Painel.id == painel_id, Painel.ativo.is_(True)).first()
    if not p:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Painel não encontrado")
    verificar_acesso_workspace(usuario, p.workspace_id, db)
    return p


def _get_fase(db: Session, fase_id: uuid.UUID, usuario: User) -> PainelFase:
    f = db.query(PainelFase).filter(PainelFase.id == fase_id, PainelFase.ativo.is_(True)).first()
    if not f:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fase não encontrada")
    verificar_acesso_workspace(usuario, f.workspace_id, db)
    return f


def _get_campo(db: Session, campo_id: uuid.UUID, usuario: User) -> PainelCampo:
    c = db.query(PainelCampo).filter(PainelCampo.id == campo_id, PainelCampo.ativo.is_(True)).first()
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campo não encontrado")
    verificar_acesso_workspace(usuario, c.workspace_id, db)
    return c


def _get_card(db: Session, card_id: uuid.UUID, usuario: User) -> PainelCard:
    card = db.query(PainelCard).filter(PainelCard.id == card_id, PainelCard.ativo.is_(True)).first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card não encontrado")
    verificar_acesso_workspace(usuario, card.workspace_id, db)
    return card


def _proxima_ordem_card(db: Session, fase_id: uuid.UUID) -> int:
    maximo = (
        db.query(func.coalesce(func.max(PainelCard.ordem), -1))
        .filter(PainelCard.fase_id == fase_id, PainelCard.ativo.is_(True))
        .scalar()
    )
    return int(maximo) + 1


# ----------------------------------------------------------------------------- responsaveis (literal — antes de /{painel_id})
@router.get("/responsaveis")
def listar_responsaveis(
    workspace_id: uuid.UUID | None = Query(None),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolver_ws(workspace_id, workspace_filter)
    verificar_acesso_workspace(usuario, ws_id, db)
    ids = [
        a.user_id
        for a in db.query(UserWorkspaceAccess)
        .filter(UserWorkspaceAccess.workspace_id == ws_id, UserWorkspaceAccess.ativo.is_(True))
        .all()
    ]
    usuarios = (
        db.query(User)
        .filter(User.ativo.is_(True), or_(User.id.in_(ids), User.workspace_id == ws_id))
        .order_by(User.nome)
        .all()
    )
    return [{"id": str(u.id), "nome": u.nome, "email": u.email} for u in usuarios]


# ----------------------------------------------------------------------------- cards (literal)
@router.get("/cards/{card_id}")
def obter_card(
    card_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    card = _get_card(db, card_id, usuario)
    return _card_out(card, detalhe=True)


@router.put("/cards/{card_id}")
def atualizar_card(
    card_id: uuid.UUID,
    data: CardUpdate,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    card = _get_card(db, card_id, usuario)
    if data.titulo is not None:
        card.titulo = data.titulo.strip() or card.titulo
    if data.fase_id is not None:
        fase = _get_fase(db, data.fase_id, usuario)
        if fase.painel_id != card.painel_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fase de outro painel")
        if fase.id != card.fase_id:
            card.fase_id = fase.id
            card.ordem = _proxima_ordem_card(db, fase.id)
    if data.descricao is not None:
        card.descricao = data.descricao
    if data.prioridade is not None:
        card.prioridade = data.prioridade or None
    if data.data_vencimento is not None:
        card.data_vencimento = data.data_vencimento
    if data.nome is not None:
        card.nome = data.nome
    if data.telefone is not None:
        card.telefone = data.telefone
    if data.resumo_conversa is not None:
        card.resumo_conversa = data.resumo_conversa
    # Responsável é UM só: setar usuário limpa o agente e vice-versa.
    if "responsavel_user_id" in data.model_fields_set:
        card.responsavel_user_id = data.responsavel_user_id
        if data.responsavel_user_id is not None:
            card.responsavel_agente_id = None
        # Espelha no atendimento (card -> conversa).
        if card.conversa_id:
            conversa = db.get(Conversa, card.conversa_id)
            if conversa:
                conversa.responsavel_id = data.responsavel_user_id
    if "responsavel_agente_id" in data.model_fields_set:
        card.responsavel_agente_id = data.responsavel_agente_id
        if data.responsavel_agente_id is not None:
            card.responsavel_user_id = None
            # Agente assume o card -> desvincula responsável humano da conversa.
            if card.conversa_id:
                conversa = db.get(Conversa, card.conversa_id)
                if conversa:
                    conversa.responsavel_id = None
    db.commit()
    db.refresh(card)
    return _card_out(card, detalhe=True)


@router.patch("/cards/{card_id}/mover")
def mover_card(
    card_id: uuid.UUID,
    data: MoverCardIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    # NUNCA bloqueado pelo cadeado (cadeado é só de estrutura de fases).
    card = _get_card(db, card_id, usuario)
    fase = _get_fase(db, data.fase_id, usuario)
    if fase.painel_id != card.painel_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fase de outro painel")
    card.fase_id = fase.id
    card.ordem = data.ordem if data.ordem is not None else _proxima_ordem_card(db, fase.id)
    # Espelha a etapa no atendimento (move -> etapa_funil = nome da fase).
    if card.conversa_id:
        conversa = db.get(Conversa, card.conversa_id)
        if conversa:
            conversa.etapa_funil = fase.nome
    db.commit()
    db.refresh(card)
    return _card_out(card)


@router.delete("/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_card(
    card_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    card = _get_card(db, card_id, usuario)
    card.ativo = False
    card.arquivado_em = datetime.utcnow()
    db.commit()
    return None


@router.put("/cards/{card_id}/valores")
def salvar_valores(
    card_id: uuid.UUID,
    data: ValoresIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    card = _get_card(db, card_id, usuario)
    existentes = {v.campo_id: v for v in card.valores}
    for item in data.valores:
        if item.campo_id in existentes:
            existentes[item.campo_id].valor = item.valor
        else:
            db.add(PainelCardValor(card_id=card.id, campo_id=item.campo_id, valor=item.valor))
    db.commit()
    db.refresh(card)
    return _card_out(card, detalhe=True)


@router.post("/cards/{card_id}/comentarios", status_code=status.HTTP_201_CREATED)
def comentar_card(
    card_id: uuid.UUID,
    data: ComentarioIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    card = _get_card(db, card_id, usuario)
    if not data.texto.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comentário vazio")
    c = PainelComentario(card_id=card.id, autor_user_id=usuario.id, texto=data.texto.strip())
    db.add(c)
    db.commit()
    db.refresh(card)
    return _card_out(card, detalhe=True)


# ----------------------------------------------------------------------------- fases (literal)
@router.put("/fases/{fase_id}")
def atualizar_fase(
    fase_id: uuid.UUID,
    data: FaseUpdate,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    f = _get_fase(db, fase_id, usuario)
    if data.nome is not None and data.nome.strip() != f.nome:
        if f.fixa:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fase fixa não pode ser renomeada")
        f.nome = data.nome.strip()
    if data.cor is not None:
        f.cor = data.cor
    if data.limite_wip is not None:
        f.limite_wip = data.limite_wip or None
    db.commit()
    db.refresh(f)
    return _fase_out(f)


@router.delete("/fases/{fase_id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_fase(
    fase_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    f = _get_fase(db, fase_id, usuario)
    if f.fixa:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Fase fixa não pode ser excluída")
    painel = db.get(Painel, f.painel_id)
    if painel and painel.bloqueado:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Painel bloqueado")
    tem_cards = (
        db.query(PainelCard)
        .filter(PainelCard.fase_id == f.id, PainelCard.ativo.is_(True))
        .first()
    )
    if tem_cards:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mova os cards antes de excluir a fase")
    f.ativo = False
    db.commit()
    return None


# ----------------------------------------------------------------------------- campos (literal)
@router.put("/campos/{campo_id}")
def atualizar_campo(
    campo_id: uuid.UUID,
    data: CampoUpdate,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    c = _get_campo(db, campo_id, usuario)
    if data.nome is not None:
        c.nome = data.nome.strip()
    if data.tipo is not None:
        if data.tipo not in TIPOS_CAMPO:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tipo de campo inválido")
        c.tipo = data.tipo
    if data.opcoes is not None:
        c.opcoes = data.opcoes
    db.commit()
    db.refresh(c)
    return _campo_out(c)


@router.delete("/campos/{campo_id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_campo(
    campo_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    c = _get_campo(db, campo_id, usuario)
    c.ativo = False
    db.commit()
    return None


# ----------------------------------------------------------------------------- boards
@router.get("")
def listar_paineis(
    workspace_id: uuid.UUID | None = Query(None),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolver_ws(workspace_id, workspace_filter)
    verificar_acesso_workspace(usuario, ws_id, db)
    ensure_paineis_padrao(db, ws_id, commit=True)
    paineis = (
        db.query(Painel)
        .filter(Painel.workspace_id == ws_id, Painel.ativo.is_(True))
        .order_by(Painel.ordem, Painel.criado_em)
        .all()
    )
    return [_painel_resumo_out(p) for p in paineis]


@router.post("", status_code=status.HTTP_201_CREATED)
def criar_painel(
    data: PainelIn,
    workspace_id: uuid.UUID | None = Query(None),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolver_ws(workspace_id, workspace_filter)
    verificar_acesso_workspace(usuario, ws_id, db)
    proxima_ordem = (
        db.query(func.coalesce(func.max(Painel.ordem), -1))
        .filter(Painel.workspace_id == ws_id, Painel.ativo.is_(True))
        .scalar()
    ) + 1
    p = Painel(workspace_id=ws_id, nome=data.nome.strip() or "Novo painel", tipo="custom", ordem=proxima_ordem)
    db.add(p)
    db.flush()
    # Fase inicial padrão (não fixa, painéis custom são totalmente editáveis).
    db.add(PainelFase(workspace_id=ws_id, painel_id=p.id, nome="A fazer", cor="#64748b", ordem=0))
    db.commit()
    db.refresh(p)
    return _painel_detalhe_out(db, p)


@router.get("/{painel_id}")
def obter_painel(
    painel_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    p = _get_painel(db, painel_id, usuario)
    return _painel_detalhe_out(db, p)


@router.put("/{painel_id}")
def atualizar_painel(
    painel_id: uuid.UUID,
    data: PainelUpdate,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    p = _get_painel(db, painel_id, usuario)
    if data.nome is not None:
        p.nome = data.nome.strip() or p.nome
    db.commit()
    db.refresh(p)
    return _painel_resumo_out(p)


@router.delete("/{painel_id}", status_code=status.HTTP_204_NO_CONTENT)
def deletar_painel(
    painel_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    p = _get_painel(db, painel_id, usuario)
    if p.sistema:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Painel de sistema não pode ser excluído")
    p.ativo = False
    db.commit()
    return None


@router.patch("/{painel_id}/automacao")
def toggle_automacao(
    painel_id: uuid.UUID,
    data: ToggleIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    p = _get_painel(db, painel_id, usuario)
    p.automacao_ativa = data.valor
    db.commit()
    db.refresh(p)
    return _painel_resumo_out(p)


@router.patch("/{painel_id}/bloqueio")
def toggle_bloqueio(
    painel_id: uuid.UUID,
    data: ToggleIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    p = _get_painel(db, painel_id, usuario)
    p.bloqueado = data.valor
    db.commit()
    db.refresh(p)
    return _painel_resumo_out(p)


@router.patch("/{painel_id}/agente-funil")
def toggle_agente_funil(
    painel_id: uuid.UUID,
    data: ToggleIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    """Liga/desliga 'a IA move o card no funil' para este painel."""
    p = _get_painel(db, painel_id, usuario)
    p.agente_funil = data.valor
    db.commit()
    db.refresh(p)
    return _painel_resumo_out(p)


# ----------------------------------------------------------------------------- fases (sob painel)
@router.post("/{painel_id}/fases", status_code=status.HTTP_201_CREATED)
def criar_fase(
    painel_id: uuid.UUID,
    data: FaseIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    p = _get_painel(db, painel_id, usuario)
    if p.bloqueado:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Painel bloqueado")
    proxima = (
        db.query(func.coalesce(func.max(PainelFase.ordem), -1))
        .filter(PainelFase.painel_id == p.id, PainelFase.ativo.is_(True))
        .scalar()
    ) + 1
    f = PainelFase(
        workspace_id=p.workspace_id,
        painel_id=p.id,
        nome=data.nome.strip() or "Nova fase",
        cor=data.cor,
        ordem=proxima,
        limite_wip=data.limite_wip or None,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return _fase_out(f)


@router.patch("/{painel_id}/fases/reordenar")
def reordenar_fases(
    painel_id: uuid.UUID,
    data: ReordenarFasesIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    p = _get_painel(db, painel_id, usuario)
    if p.bloqueado:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Painel bloqueado")
    fases = {f.id: f for f in p.fases if f.ativo}
    for idx, fid in enumerate(data.ordem):
        if fid in fases:
            fases[fid].ordem = idx
    db.commit()
    return [_fase_out(f) for f in sorted([f for f in p.fases if f.ativo], key=lambda x: x.ordem)]


# ----------------------------------------------------------------------------- campos (sob painel)
@router.post("/{painel_id}/campos", status_code=status.HTTP_201_CREATED)
def criar_campo(
    painel_id: uuid.UUID,
    data: CampoIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    p = _get_painel(db, painel_id, usuario)
    if data.tipo not in TIPOS_CAMPO:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tipo de campo inválido")
    proxima = (
        db.query(func.coalesce(func.max(PainelCampo.ordem), -1))
        .filter(PainelCampo.painel_id == p.id, PainelCampo.ativo.is_(True))
        .scalar()
    ) + 1
    c = PainelCampo(
        workspace_id=p.workspace_id,
        painel_id=p.id,
        nome=data.nome.strip() or "Campo",
        tipo=data.tipo,
        opcoes=data.opcoes,
        ordem=proxima,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _campo_out(c)


# ----------------------------------------------------------------------------- cards (sob painel)
@router.post("/{painel_id}/cards", status_code=status.HTTP_201_CREATED)
def criar_card(
    painel_id: uuid.UUID,
    data: CardIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    p = _get_painel(db, painel_id, usuario)
    if data.fase_id is not None:
        fase = _get_fase(db, data.fase_id, usuario)
        if fase.painel_id != p.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fase de outro painel")
    else:
        fase = fase_entrada(p) or next(iter(sorted([f for f in p.fases if f.ativo], key=lambda x: x.ordem)), None)
        if fase is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Painel sem fases")
    card = PainelCard(
        workspace_id=p.workspace_id,
        painel_id=p.id,
        fase_id=fase.id,
        titulo=data.titulo.strip() or "Novo card",
        descricao=data.descricao,
        prioridade=data.prioridade or None,
        responsavel_user_id=data.responsavel_user_id,
        data_vencimento=data.data_vencimento,
        nome=data.nome,
        telefone=data.telefone,
        ordem=_proxima_ordem_card(db, fase.id),
    )
    db.add(card)
    db.commit()
    db.refresh(card)
    return _card_out(card, detalhe=True)
