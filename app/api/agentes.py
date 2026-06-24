"""Central de Agentes — CRUD de agentes (Fase 1), platform_admin.

Agentes têm `workspace_id` (isolamento de dado), mas a autorização é platform_admin
(gerencia agentes de qualquer workspace). Worker/RAG/dashboard/feedback são fases 2-4.
"""
from __future__ import annotations

import uuid
from datetime import datetime, time, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import exigir_platform_admin
from app.models.agente import (
    Agente,
    AgenteCanal,
    AgenteHabilidade,
    AgenteHorario,
    AgentePrompt,
    LlmProvider,
)
from app.models.canal_entrada import CanalEntrada
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.agente import (
    AgenteIn,
    AgenteListItemOut,
    AgenteOut,
    AgenteUpdate,
    CanalVinculadoOut,
    HabilidadeIn,
    HabilidadeOut,
    HorarioIn,
    HorarioOut,
    SandboxIn,
    SandboxOut,
    ToggleIn,
)
from app.services import agent_service, llm_client_service

router = APIRouter(tags=["agentes"])


# ── helpers ──────────────────────────────────────────────────────────────────
def _get_workspace_or_404(workspace_id: uuid.UUID, db: Session) -> Workspace:
    w = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not w:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace não encontrado")
    return w


def _get_agente_or_404(workspace_id: uuid.UUID, agente_id: uuid.UUID, db: Session) -> Agente:
    a = (
        db.query(Agente)
        .filter(
            Agente.id == agente_id,
            Agente.workspace_id == workspace_id,
            Agente.deleted_at.is_(None),
        )
        .first()
    )
    if not a:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agente não encontrado")
    return a


def _validate_provider(provider_id: str | None, db: Session) -> uuid.UUID | None:
    if not provider_id:
        return None
    try:
        pid = uuid.UUID(provider_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="provider_id inválido")
    if not db.query(LlmProvider.id).filter(LlmProvider.id == pid).first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provider não encontrado")
    return pid


def _validate_canais(workspace_id: uuid.UUID, canal_ids: list[str], db: Session) -> list[uuid.UUID]:
    if not canal_ids:
        return []
    uniq = list(dict.fromkeys(canal_ids))
    try:
        ids = [uuid.UUID(c) for c in uniq]
    except ValueError:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="canal_id inválido")
    rows = (
        db.query(CanalEntrada.id)
        .filter(CanalEntrada.id.in_(ids), CanalEntrada.workspace_id == workspace_id)
        .all()
    )
    found = {str(r[0]) for r in rows}
    missing = [c for c in uniq if c not in found]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Canais não pertencem ao workspace: {missing}",
        )
    return ids


def _apply_canais(agente: Agente, canal_ids: list[uuid.UUID], link_ativo: bool, db: Session) -> None:
    """Substitui o conjunto de canais vinculados. `link_ativo` = (status do agente == ativo)."""
    db.query(AgenteCanal).filter(AgenteCanal.agente_id == agente.id).delete(synchronize_session=False)
    for cid in canal_ids:
        db.add(AgenteCanal(agente_id=agente.id, canal_id=cid, ativo=link_ativo))


def _sync_links_ativo(agente: Agente, link_ativo: bool, db: Session) -> None:
    """Sincroniza agente_canais.ativo com o status do agente (sem trocar o conjunto)."""
    db.query(AgenteCanal).filter(AgenteCanal.agente_id == agente.id).update(
        {AgenteCanal.ativo: link_ativo}, synchronize_session=False
    )


def _set_draft(agente_id: uuid.UUID, texto: str, db: Session) -> None:
    draft = (
        db.query(AgentePrompt)
        .filter(AgentePrompt.agente_id == agente_id, AgentePrompt.status == "draft")
        .order_by(AgentePrompt.criado_em.desc())
        .first()
    )
    if draft:
        draft.prompt_texto = texto
    else:
        db.add(AgentePrompt(agente_id=agente_id, prompt_texto=texto, status="draft"))


def _replace_horarios(agente_id: uuid.UUID, horarios: list[HorarioIn], db: Session) -> None:
    db.query(AgenteHorario).filter(AgenteHorario.agente_id == agente_id).delete(synchronize_session=False)
    for h in horarios:
        db.add(
            AgenteHorario(
                agente_id=agente_id,
                dia_semana=h.dia_semana,
                hora_inicio=h.hora_inicio,
                hora_fim=h.hora_fim,
                ativo=h.ativo,
            )
        )


def _replace_habilidades(agente_id: uuid.UUID, habilidades: list[HabilidadeIn], db: Session) -> None:
    db.query(AgenteHabilidade).filter(AgenteHabilidade.agente_id == agente_id).delete(synchronize_session=False)
    for hb in habilidades:
        db.add(
            AgenteHabilidade(
                agente_id=agente_id,
                tipo=hb.tipo,
                nome=hb.nome,
                config_json=hb.config_json,
                ativo=hb.ativo,
            )
        )


def _hhmm(t: time | None) -> str:
    return t.strftime("%H:%M") if t else ""


def _canais_out(agente: Agente) -> list[CanalVinculadoOut]:
    out: list[CanalVinculadoOut] = []
    for link in agente.canais:
        out.append(
            CanalVinculadoOut(
                canal_id=str(link.canal_id),
                canal_nome=(link.canal.nome if link.canal else None),
                ativo=link.ativo,
            )
        )
    return out


def _prompt_texts(agente_id: uuid.UUID, db: Session) -> tuple[str | None, str | None]:
    draft = (
        db.query(AgentePrompt)
        .filter(AgentePrompt.agente_id == agente_id, AgentePrompt.status == "draft")
        .order_by(AgentePrompt.criado_em.desc())
        .first()
    )
    publicado = (
        db.query(AgentePrompt)
        .filter(AgentePrompt.agente_id == agente_id, AgentePrompt.status == "publicado")
        .order_by(AgentePrompt.publicado_em.desc().nullslast())
        .first()
    )
    return (draft.prompt_texto if draft else None, publicado.prompt_texto if publicado else None)


def _agente_out(agente: Agente, db: Session) -> AgenteOut:
    prompt_draft, prompt_publicado = _prompt_texts(agente.id, db)
    return AgenteOut(
        id=str(agente.id),
        workspace_id=str(agente.workspace_id),
        nome=agente.nome,
        descricao=agente.descricao,
        provider_id=str(agente.provider_id) if agente.provider_id else None,
        provider_nome=(agente.provider.nome if agente.provider else None),
        modelo=agente.modelo,
        status=agente.status,
        tom=agente.tom,
        idiomas=list(agente.idiomas or []),
        blacklist_topicos=list(agente.blacklist_topicos or []),
        threshold_confianca=agente.threshold_confianca,
        tempo_resposta_target_ms=agente.tempo_resposta_target_ms,
        debounce_segundos=agente.debounce_segundos,
        limite_tokens_dia=agente.limite_tokens_dia,
        alerta_threshold_pct=agente.alerta_threshold_pct,
        mensagem_abertura=agente.mensagem_abertura,
        canais=_canais_out(agente),
        horarios=[
            HorarioOut(
                id=str(h.id),
                dia_semana=h.dia_semana,
                hora_inicio=_hhmm(h.hora_inicio),
                hora_fim=_hhmm(h.hora_fim),
                ativo=h.ativo,
            )
            for h in sorted(agente.horarios, key=lambda x: (x.dia_semana, x.hora_inicio))
        ],
        habilidades=[
            HabilidadeOut(id=str(hb.id), tipo=hb.tipo, nome=hb.nome, config_json=hb.config_json, ativo=hb.ativo)
            for hb in agente.habilidades
        ],
        prompt_draft=prompt_draft,
        prompt_publicado=prompt_publicado,
        criado_em=agente.criado_em.isoformat() if agente.criado_em else None,
        atualizado_em=agente.atualizado_em.isoformat() if agente.atualizado_em else None,
    )


def _list_item_out(agente: Agente) -> AgenteListItemOut:
    return AgenteListItemOut(
        id=str(agente.id),
        nome=agente.nome,
        status=agente.status,
        modelo=agente.modelo,
        provider_id=str(agente.provider_id) if agente.provider_id else None,
        provider_nome=(agente.provider.nome if agente.provider else None),
        canais=_canais_out(agente),
        ultima_atividade=None,  # populado na Fase 2 (agente_uso_tokens)
    )


_CONFLITO_CANAL = "Canal já possui um agente ativo. Inative o outro agente antes."


# ── rotas ────────────────────────────────────────────────────────────────────
@router.get("/workspaces/{workspace_id}/agentes", response_model=list[AgenteListItemOut])
def listar_agentes(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    _get_workspace_or_404(workspace_id, db)
    rows = (
        db.execute(
            select(Agente)
            .where(Agente.workspace_id == workspace_id, Agente.deleted_at.is_(None))
            .order_by(Agente.criado_em.desc())
        )
        .scalars()
        .all()
    )
    return [_list_item_out(a) for a in rows]


@router.post(
    "/workspaces/{workspace_id}/agentes",
    response_model=AgenteOut,
    status_code=status.HTTP_201_CREATED,
)
def criar_agente(
    workspace_id: uuid.UUID,
    payload: AgenteIn,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    _get_workspace_or_404(workspace_id, db)
    provider_id = _validate_provider(payload.provider_id, db)
    canal_ids = _validate_canais(workspace_id, payload.canais, db)

    agente = Agente(
        workspace_id=workspace_id,
        nome=payload.nome,
        descricao=payload.descricao,
        provider_id=provider_id,
        modelo=payload.modelo,
        status=payload.status,
        tom=payload.tom,
        idiomas=payload.idiomas,
        blacklist_topicos=payload.blacklist_topicos,
        threshold_confianca=payload.threshold_confianca,
        tempo_resposta_target_ms=payload.tempo_resposta_target_ms,
        debounce_segundos=payload.debounce_segundos,
        limite_tokens_dia=payload.limite_tokens_dia,
        alerta_threshold_pct=payload.alerta_threshold_pct,
        mensagem_abertura=payload.mensagem_abertura,
    )
    db.add(agente)
    db.flush()  # obtém agente.id

    link_ativo = payload.status == "ativo"
    _apply_canais(agente, canal_ids, link_ativo, db)
    _replace_horarios(agente.id, payload.horarios, db)
    _replace_habilidades(agente.id, payload.habilidades, db)
    if payload.prompt is not None:
        _set_draft(agente.id, payload.prompt, db)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_CONFLITO_CANAL)
    db.refresh(agente)
    return _agente_out(agente, db)


@router.get("/workspaces/{workspace_id}/agentes/{agente_id}", response_model=AgenteOut)
def obter_agente(
    workspace_id: uuid.UUID,
    agente_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    _get_workspace_or_404(workspace_id, db)
    agente = _get_agente_or_404(workspace_id, agente_id, db)
    return _agente_out(agente, db)


@router.put("/workspaces/{workspace_id}/agentes/{agente_id}", response_model=AgenteOut)
def atualizar_agente(
    workspace_id: uuid.UUID,
    agente_id: uuid.UUID,
    payload: AgenteUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    _get_workspace_or_404(workspace_id, db)
    agente = _get_agente_or_404(workspace_id, agente_id, db)

    if payload.provider_id is not None:
        agente.provider_id = _validate_provider(payload.provider_id, db)
    for campo in (
        "nome",
        "descricao",
        "modelo",
        "tom",
        "idiomas",
        "blacklist_topicos",
        "threshold_confianca",
        "tempo_resposta_target_ms",
        "debounce_segundos",
        "limite_tokens_dia",
        "alerta_threshold_pct",
        "mensagem_abertura",
    ):
        valor = getattr(payload, campo)
        if valor is not None:
            setattr(agente, campo, valor)
    if payload.status is not None:
        agente.status = payload.status

    final_status_ativo = agente.status == "ativo"

    # Canais: se enviados, substitui o conjunto; senão, só re-sincroniza o ativo com o status.
    if payload.canais is not None:
        canal_ids = _validate_canais(workspace_id, payload.canais, db)
        _apply_canais(agente, canal_ids, final_status_ativo, db)
    else:
        _sync_links_ativo(agente, final_status_ativo, db)

    if payload.horarios is not None:
        _replace_horarios(agente.id, payload.horarios, db)
    if payload.habilidades is not None:
        _replace_habilidades(agente.id, payload.habilidades, db)
    if payload.prompt is not None:
        _set_draft(agente.id, payload.prompt, db)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_CONFLITO_CANAL)
    db.refresh(agente)
    return _agente_out(agente, db)


@router.post("/workspaces/{workspace_id}/agentes/{agente_id}/toggle", response_model=AgenteOut)
def alternar_status(
    workspace_id: uuid.UUID,
    agente_id: uuid.UUID,
    payload: ToggleIn,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    _get_workspace_or_404(workspace_id, db)
    agente = _get_agente_or_404(workspace_id, agente_id, db)
    agente.status = payload.status
    _sync_links_ativo(agente, payload.status == "ativo", db)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_CONFLITO_CANAL)
    db.refresh(agente)
    return _agente_out(agente, db)


@router.post("/workspaces/{workspace_id}/agentes/{agente_id}/testar", response_model=SandboxOut)
def testar_agente(
    workspace_id: uuid.UUID,
    agente_id: uuid.UUID,
    payload: SandboxIn,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    """Sandbox (dry-run): gera a resposta que o agente daria, SEM gravar uso, SEM enviar
    ao canal e SEM marcar a conversa. RAG (`rag_chunks_usados`) entra na Fase 3."""
    _get_workspace_or_404(workspace_id, db)
    agente = _get_agente_or_404(workspace_id, agente_id, db)
    try:
        res = agent_service.gerar_resposta(
            db, agente, payload.mensagem, [t.model_dump() for t in payload.historico_simulado]
        )
    except llm_client_service.LLMConfigError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return SandboxOut(
        resposta=res["resposta"],
        score_confianca=res["score_confianca"],
        intent=res["intent"],
        rag_chunks_usados=[],
        tokens_estimados=res["tokens_input"] + res["tokens_output"],
    )


@router.delete("/workspaces/{workspace_id}/agentes/{agente_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_agente(
    workspace_id: uuid.UUID,
    agente_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    """Soft delete: marca deleted_at, inativa o agente e libera os canais
    (agente_canais.ativo=false). Hard-delete-quando-nunca-usado é refinamento da Fase 2
    (depende de agente_uso_tokens)."""
    _get_workspace_or_404(workspace_id, db)
    agente = _get_agente_or_404(workspace_id, agente_id, db)
    agente.status = "inativo"
    agente.deleted_at = datetime.now(timezone.utc)
    _sync_links_ativo(agente, False, db)
    db.commit()
