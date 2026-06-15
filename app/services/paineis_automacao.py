"""Automações do Kanban e sincronização conversa <-> card.

Acoplado ao fluxo de mensagens do CRM (não cria serviço novo):
  - sincronizar_paineis_apos_mensagem: chamado dentro de process_evolution_message,
    antes do commit, em SAVEPOINT. Cria/atualiza o card de Recepcionamento Leads e,
    quando o lead responde, arquiva o card de Leads sem Resposta.
  - criar_ou_reabrir_card_lead_sem_resposta: chamado pelo job periódico do scheduler.
  - sincronizar_cards_da_conversa: chamado no PUT /conversas/{id} (card <- conversa).

Grupos (conversa.is_group) NÃO geram card — decisão de produto.
"""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.crm.conversa import Conversa
from app.models.crm.painel import Painel, PainelCard, PainelFase
from app.services.paineis_padrao import ensure_paineis_padrao, fase_entrada

logger = logging.getLogger(__name__)


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _proxima_ordem(db: Session, fase_id: uuid.UUID) -> int:
    maximo = (
        db.query(func.coalesce(func.max(PainelCard.ordem), -1))
        .filter(PainelCard.fase_id == fase_id, PainelCard.ativo.is_(True))
        .scalar()
    )
    return int(maximo) + 1


def _painel_por_tipo(db: Session, workspace_id: uuid.UUID, tipo: str) -> Painel | None:
    return (
        db.query(Painel)
        .filter(
            Painel.workspace_id == workspace_id,
            Painel.tipo == tipo,
            Painel.ativo.is_(True),
        )
        .first()
    )


def _dados_lead(conversa: Conversa) -> dict:
    contato = conversa.contato
    nome = (contato.nome or contato.push_name) if contato else None
    telefone = contato.telefone if contato else None
    titulo = nome or telefone or "Lead"
    return {
        "nome": nome,
        "telefone": telefone,
        "titulo": titulo,
        "canal_entrada_id": conversa.canal_id,
        "resumo_conversa": conversa.resumo_ia,
        "conversa_id": conversa.id,
        "contato_id": conversa.contato_id,
        "responsavel_user_id": conversa.responsavel_id,
        "origem_agente": conversa.agente,
    }


def _card_da_conversa(db: Session, painel_id: uuid.UUID, conversa_id: uuid.UUID) -> PainelCard | None:
    return (
        db.query(PainelCard)
        .filter(
            PainelCard.painel_id == painel_id,
            PainelCard.conversa_id == conversa_id,
            PainelCard.ativo.is_(True),
        )
        .first()
    )


def _upsert_card_recepcionamento(db: Session, painel: Painel, conversa: Conversa) -> PainelCard | None:
    if not painel.automacao_ativa:
        return None
    fase = fase_entrada(painel)
    if fase is None:
        return None
    dados = _dados_lead(conversa)
    card = _card_da_conversa(db, painel.id, conversa.id)
    if card:
        # Atualiza dados básicos do lead; mantém a fase atual (não puxa de volta p/ Entrada).
        card.nome = dados["nome"] or card.nome
        card.telefone = dados["telefone"] or card.telefone
        card.canal_entrada_id = dados["canal_entrada_id"] or card.canal_entrada_id
        card.resumo_conversa = dados["resumo_conversa"] or card.resumo_conversa
        if dados["responsavel_user_id"] and not card.responsavel_user_id:
            card.responsavel_user_id = dados["responsavel_user_id"]
        return card

    card = PainelCard(
        workspace_id=conversa.workspace_id,
        painel_id=painel.id,
        fase_id=fase.id,
        titulo=dados["titulo"],
        nome=dados["nome"],
        telefone=dados["telefone"],
        canal_entrada_id=dados["canal_entrada_id"],
        resumo_conversa=dados["resumo_conversa"],
        conversa_id=dados["conversa_id"],
        contato_id=dados["contato_id"],
        responsavel_user_id=dados["responsavel_user_id"],
        origem_agente=dados["origem_agente"],
        ordem=_proxima_ordem(db, fase.id),
    )
    db.add(card)
    db.flush()
    return card


def _arquivar_card_lead_sem_resposta(db: Session, workspace_id: uuid.UUID, conversa_id: uuid.UUID) -> None:
    painel = _painel_por_tipo(db, workspace_id, "leads_sem_resposta")
    if not painel:
        return
    card = _card_da_conversa(db, painel.id, conversa_id)
    if card:
        card.ativo = False
        card.arquivado_em = _agora()


def sincronizar_paineis_apos_mensagem(db: Session, conversa: Conversa, direcao: str) -> None:
    """Hook chamado após persistir uma mensagem (antes do commit, em SAVEPOINT)."""
    if conversa is None or conversa.is_group:
        return
    ensure_paineis_padrao(db, conversa.workspace_id, commit=False)

    painel_recep = _painel_por_tipo(db, conversa.workspace_id, "recepcionamento_leads")
    if painel_recep:
        _upsert_card_recepcionamento(db, painel_recep, conversa)

    # Lead respondeu (entrada): tira da fila de "sem resposta".
    if direcao == "entrada":
        _arquivar_card_lead_sem_resposta(db, conversa.workspace_id, conversa.id)


def criar_ou_reabrir_card_lead_sem_resposta(db: Session, conversa: Conversa) -> PainelCard | None:
    """Cria (ou reabre, se já existir arquivado) o card de Leads sem Resposta."""
    if conversa is None or conversa.is_group:
        return None
    ensure_paineis_padrao(db, conversa.workspace_id, commit=False)
    painel = _painel_por_tipo(db, conversa.workspace_id, "leads_sem_resposta")
    if not painel or not painel.automacao_ativa:
        return None
    fase = fase_entrada(painel)
    if fase is None:
        return None

    # Já existe card ativo? Nada a fazer.
    ativo = _card_da_conversa(db, painel.id, conversa.id)
    if ativo:
        return ativo

    dados = _dados_lead(conversa)

    # Existe card arquivado dessa conversa? Reabre o MESMO card no fim da Entrada.
    arquivado = (
        db.query(PainelCard)
        .filter(
            PainelCard.painel_id == painel.id,
            PainelCard.conversa_id == conversa.id,
            PainelCard.ativo.is_(False),
        )
        .order_by(PainelCard.arquivado_em.desc())
        .first()
    )
    if arquivado:
        arquivado.ativo = True
        arquivado.arquivado_em = None
        arquivado.fase_id = fase.id
        arquivado.ordem = _proxima_ordem(db, fase.id)
        arquivado.nome = dados["nome"] or arquivado.nome
        arquivado.telefone = dados["telefone"] or arquivado.telefone
        arquivado.resumo_conversa = dados["resumo_conversa"] or arquivado.resumo_conversa
        return arquivado

    card = PainelCard(
        workspace_id=conversa.workspace_id,
        painel_id=painel.id,
        fase_id=fase.id,
        titulo=dados["titulo"],
        nome=dados["nome"],
        telefone=dados["telefone"],
        canal_entrada_id=dados["canal_entrada_id"],
        resumo_conversa=dados["resumo_conversa"],
        conversa_id=dados["conversa_id"],
        contato_id=dados["contato_id"],
        responsavel_user_id=dados["responsavel_user_id"],
        origem_agente=dados["origem_agente"],
        ordem=_proxima_ordem(db, fase.id),
    )
    db.add(card)
    db.flush()
    return card


def sincronizar_cards_da_conversa(db: Session, conversa: Conversa) -> None:
    """Espelha resumo/responsável da conversa nos cards vinculados e move o card
    se conversa.etapa_funil casar (case-insensitive) com o nome de uma fase do painel."""
    if conversa is None:
        return
    cards = (
        db.query(PainelCard)
        .filter(PainelCard.conversa_id == conversa.id, PainelCard.ativo.is_(True))
        .all()
    )
    if not cards:
        return

    etapa = (conversa.etapa_funil or "").strip().lower()
    for card in cards:
        if conversa.resumo_ia:
            card.resumo_conversa = conversa.resumo_ia
        card.responsavel_user_id = conversa.responsavel_id
        if etapa:
            fase = (
                db.query(PainelFase)
                .filter(
                    PainelFase.painel_id == card.painel_id,
                    PainelFase.ativo.is_(True),
                    func.lower(PainelFase.nome) == etapa,
                )
                .first()
            )
            if fase and fase.id != card.fase_id:
                card.fase_id = fase.id
                card.ordem = _proxima_ordem(db, fase.id)
