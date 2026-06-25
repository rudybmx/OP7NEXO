"""Central de Agentes — CRUD de agentes (Fase 1), platform_admin.

Agentes têm `workspace_id` (isolamento de dado), mas a autorização é platform_admin
(gerencia agentes de qualquer workspace). Worker/RAG/dashboard/feedback são fases 2-4.
"""
from __future__ import annotations

import difflib
import uuid
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import exigir_platform_admin
from app.models.agente import (
    Agente,
    AgenteBaseConhecimento,
    AgenteCanal,
    AgenteDiretrizesWorkspace,
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
    DiretrizesIn,
    DiretrizesOut,
    HabilidadeIn,
    HabilidadeOut,
    BaseConhecimentoIn,
    BaseConhecimentoIngestOut,
    BaseConhecimentoOut,
    HorarioIn,
    HorarioOut,
    PromptVersaoOut,
    SandboxIn,
    SandboxOut,
    ToggleIn,
    UsoDashboardOut,
    UsoSeriePonto,
    UsoTotais,
)
from app.services import agent_service, embedding_service, llm_client_service

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
        objetivo=agente.objetivo,
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
        objetivo=payload.objetivo,
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
        "objetivo",
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
        rag_chunks_usados=res.get("rag_chunks_usados", []),
        tokens_estimados=res["tokens_input"] + res["tokens_output"],
    )


# ── diretrizes do workspace (injetadas no system prompt de TODOS os agentes) ───
@router.get("/workspaces/{workspace_id}/diretrizes", response_model=DiretrizesOut)
def obter_diretrizes(
    workspace_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    """Diretrizes de IA do workspace — texto injetado no system prompt de todos os
    agentes deste workspace. Vazio se ainda não houver."""
    _get_workspace_or_404(workspace_id, db)
    row = (
        db.query(AgenteDiretrizesWorkspace)
        .filter(AgenteDiretrizesWorkspace.workspace_id == workspace_id)
        .first()
    )
    if not row:
        return DiretrizesOut(diretrizes="", atualizado_em=None)
    return DiretrizesOut(diretrizes=row.diretrizes, atualizado_em=row.atualizado_em)


@router.put("/workspaces/{workspace_id}/diretrizes", response_model=DiretrizesOut)
def salvar_diretrizes(
    workspace_id: uuid.UUID,
    payload: DiretrizesIn,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    """Upsert das diretrizes do workspace (1 linha por workspace)."""
    _get_workspace_or_404(workspace_id, db)
    row = (
        db.query(AgenteDiretrizesWorkspace)
        .filter(AgenteDiretrizesWorkspace.workspace_id == workspace_id)
        .first()
    )
    texto = (payload.diretrizes or "").strip()
    if row:
        row.diretrizes = texto
    else:
        row = AgenteDiretrizesWorkspace(workspace_id=workspace_id, diretrizes=texto)
        db.add(row)
    db.commit()
    db.refresh(row)
    return DiretrizesOut(diretrizes=row.diretrizes, atualizado_em=row.atualizado_em)


def _fetch_url_texto(url: str) -> str:
    import re as _re

    import httpx

    try:
        resp = httpx.get(url, timeout=20, follow_redirects=True)
        resp.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Falha ao buscar URL: {exc}")
    html = _re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", resp.text, flags=_re.S | _re.I)
    texto = _re.sub(r"<[^>]+>", " ", html)
    return _re.sub(r"\s+", " ", texto).strip()


@router.post(
    "/workspaces/{workspace_id}/agentes/{agente_id}/base-conhecimento",
    response_model=BaseConhecimentoIngestOut,
    status_code=status.HTTP_201_CREATED,
)
def adicionar_base_conhecimento(
    workspace_id: uuid.UUID,
    agente_id: uuid.UUID,
    payload: BaseConhecimentoIn,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    """Indexa um item na base de conhecimento (chunk + embedding). tipo=url busca o texto
    da página. PDF não é suportado nesta fase (envie o texto como 'documento')."""
    _get_workspace_or_404(workspace_id, db)
    agente = _get_agente_or_404(workspace_id, agente_id, db)
    if payload.tipo == "url":
        if not payload.url:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="url obrigatória para tipo=url")
        conteudo = _fetch_url_texto(payload.url)
        titulo = payload.titulo or payload.url
    else:
        if not payload.conteudo or not payload.conteudo.strip():
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="conteudo obrigatório")
        conteudo, titulo = payload.conteudo, payload.titulo
    try:
        n = embedding_service.indexar(db, agente.id, payload.tipo, titulo, conteudo)
    except embedding_service.EmbeddingError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if n == 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Conteúdo vazio após processamento")
    return BaseConhecimentoIngestOut(titulo=titulo, tipo=payload.tipo, chunks=n)


@router.get(
    "/workspaces/{workspace_id}/agentes/{agente_id}/base-conhecimento",
    response_model=list[BaseConhecimentoOut],
)
def listar_base_conhecimento(
    workspace_id: uuid.UUID,
    agente_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    _get_workspace_or_404(workspace_id, db)
    _get_agente_or_404(workspace_id, agente_id, db)
    rows = (
        db.query(AgenteBaseConhecimento)
        .filter(AgenteBaseConhecimento.agente_id == agente_id)
        .order_by(AgenteBaseConhecimento.criado_em.desc())
        .all()
    )
    return [
        BaseConhecimentoOut(
            id=str(r.id),
            tipo=r.tipo,
            titulo=r.titulo,
            preview=(r.conteudo[:160] + ("…" if len(r.conteudo) > 160 else "")),
            criado_em=r.criado_em.isoformat() if r.criado_em else None,
        )
        for r in rows
    ]


@router.delete(
    "/workspaces/{workspace_id}/agentes/{agente_id}/base-conhecimento/{kb_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remover_base_conhecimento(
    workspace_id: uuid.UUID,
    agente_id: uuid.UUID,
    kb_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    _get_workspace_or_404(workspace_id, db)
    _get_agente_or_404(workspace_id, agente_id, db)
    row = (
        db.query(AgenteBaseConhecimento)
        .filter(AgenteBaseConhecimento.id == kb_id, AgenteBaseConhecimento.agente_id == agente_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item não encontrado")
    db.delete(row)
    db.commit()


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


# ── Fase 4: versionamento de prompt ──────────────────────────────────────────
def _prompt_versao_out(p: AgentePrompt, diff: str | None) -> PromptVersaoOut:
    return PromptVersaoOut(
        id=str(p.id),
        status=p.status,
        prompt_texto=p.prompt_texto,
        criado_em=p.criado_em.isoformat() if p.criado_em else None,
        publicado_em=p.publicado_em.isoformat() if p.publicado_em else None,
        publicado_por=str(p.publicado_por) if p.publicado_por else None,
        diff_vs_anterior=diff,
    )


@router.post("/workspaces/{workspace_id}/agentes/{agente_id}/publicar", response_model=PromptVersaoOut)
def publicar_prompt(
    workspace_id: uuid.UUID,
    agente_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    """Publica o rascunho atual: cria uma versão `publicado` (snapshot) com timestamp+autor."""
    _get_workspace_or_404(workspace_id, db)
    agente = _get_agente_or_404(workspace_id, agente_id, db)
    draft = (
        db.query(AgentePrompt)
        .filter(AgentePrompt.agente_id == agente.id, AgentePrompt.status == "draft")
        .order_by(AgentePrompt.criado_em.desc())
        .first()
    )
    if not draft or not draft.prompt_texto.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Não há rascunho de prompt para publicar")
    pub = AgentePrompt(
        agente_id=agente.id, prompt_texto=draft.prompt_texto, status="publicado",
        publicado_em=datetime.now(timezone.utc), publicado_por=usuario.id,
    )
    db.add(pub)
    db.commit()
    db.refresh(pub)
    return _prompt_versao_out(pub, None)


@router.get("/workspaces/{workspace_id}/agentes/{agente_id}/prompts", response_model=list[PromptVersaoOut])
def listar_prompts(
    workspace_id: uuid.UUID,
    agente_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    """Histórico de versões (draft + publicadas), recente→antigo, com diff entre publicadas adjacentes."""
    _get_workspace_or_404(workspace_id, db)
    _get_agente_or_404(workspace_id, agente_id, db)
    rows = (
        db.query(AgentePrompt)
        .filter(AgentePrompt.agente_id == agente_id)
        .order_by(AgentePrompt.criado_em.desc())
        .all()
    )
    publicados = sorted([r for r in rows if r.status == "publicado"], key=lambda x: x.criado_em or datetime.min)
    diffs: dict = {}
    for i in range(1, len(publicados)):
        ant, atual = publicados[i - 1], publicados[i]
        diffs[atual.id] = "\n".join(
            difflib.unified_diff(
                (ant.prompt_texto or "").splitlines(),
                (atual.prompt_texto or "").splitlines(),
                lineterm="", n=1,
            )
        )
    return [_prompt_versao_out(r, diffs.get(r.id)) for r in rows]


@router.post("/workspaces/{workspace_id}/agentes/{agente_id}/reverter/{prompt_id}", response_model=PromptVersaoOut)
def reverter_prompt(
    workspace_id: uuid.UUID,
    agente_id: uuid.UUID,
    prompt_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    """Reverter: cria NOVA versão publicada com o conteúdo de `prompt_id` e reflete no rascunho."""
    _get_workspace_or_404(workspace_id, db)
    agente = _get_agente_or_404(workspace_id, agente_id, db)
    alvo = (
        db.query(AgentePrompt)
        .filter(AgentePrompt.id == prompt_id, AgentePrompt.agente_id == agente.id)
        .first()
    )
    if not alvo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Versão de prompt não encontrada")
    nova = AgentePrompt(
        agente_id=agente.id, prompt_texto=alvo.prompt_texto, status="publicado",
        publicado_em=datetime.now(timezone.utc), publicado_por=usuario.id,
    )
    db.add(nova)
    _set_draft(agente.id, alvo.prompt_texto, db)  # editor reflete o conteúdo revertido
    db.commit()
    db.refresh(nova)
    return _prompt_versao_out(nova, None)


# ── Fase 4: dashboard de uso & consumo ───────────────────────────────────────
_DASH_WHERE = """
    u.workspace_id = CAST(:ws AS uuid)
    AND (:agente IS NULL OR u.agente_id = CAST(:agente AS uuid))
    AND (:canal  IS NULL OR u.canal_id  = CAST(:canal  AS uuid))
    AND (:modelo IS NULL OR u.modelo = :modelo)
    AND u.criado_em >= CAST(:inicio AS date) AND u.criado_em < CAST(:fim AS date)
"""


@router.get("/workspaces/{workspace_id}/agentes/uso/dashboard", response_model=UsoDashboardOut)
def uso_dashboard(
    workspace_id: uuid.UUID,
    agente_id: uuid.UUID | None = Query(None),
    canal_id: uuid.UUID | None = Query(None),
    modelo: str | None = Query(None),
    inicio: date | None = Query(None),
    fim: date | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    """Agregado de consumo do workspace (tokens/custo/conversas/handoff/score) + série diária.
    Custo via `ai_model_pricing`. Filtros opcionais: agente, canal, modelo, período."""
    _get_workspace_or_404(workspace_id, db)
    if fim is None:
        fim = date.today()
    if inicio is None:
        inicio = fim - timedelta(days=30)
    params = {
        "ws": str(workspace_id),
        "agente": str(agente_id) if agente_id else None,
        "canal": str(canal_id) if canal_id else None,
        "modelo": modelo,
        "inicio": inicio.isoformat(),
        "fim": (fim + timedelta(days=1)).isoformat(),
    }
    tot = db.execute(text(f"""
        SELECT
            COALESCE(SUM(u.tokens_input),0)  AS ti,
            COALESCE(SUM(u.tokens_output),0) AS tout,
            COUNT(*)                         AS chamadas,
            COUNT(DISTINCT u.conversa_id)    AS conversas,
            COALESCE(SUM(CASE WHEN u.escalado THEN 1 ELSE 0 END),0) AS handoffs,
            AVG(u.score_confianca)           AS score_medio,
            COALESCE(SUM(
                (u.tokens_input  / 1000000.0) * COALESCE(p.input_usd_1m, 0)
              + (u.tokens_output / 1000000.0) * COALESCE(p.output_usd_1m, 0)
            ), 0) AS custo_usd
        FROM agente_uso_tokens u
        LEFT JOIN ai_model_pricing p ON p.model = u.modelo
        WHERE {_DASH_WHERE}
    """), params).mappings().first()

    chamadas = int(tot["chamadas"] or 0)
    handoffs = int(tot["handoffs"] or 0)
    ti = int(tot["ti"] or 0)
    tout = int(tot["tout"] or 0)
    totais = UsoTotais(
        tokens_input=ti, tokens_output=tout, tokens_total=ti + tout,
        custo_usd=round(float(tot["custo_usd"] or 0), 6),
        chamadas=chamadas, conversas=int(tot["conversas"] or 0), handoffs=handoffs,
        taxa_handoff=round(handoffs / chamadas, 4) if chamadas else 0.0,
        score_medio=round(float(tot["score_medio"]), 4) if tot["score_medio"] is not None else None,
    )
    serie_rows = db.execute(text(f"""
        SELECT date_trunc('day', u.criado_em)::date AS dia,
               COALESCE(SUM(u.tokens_input + u.tokens_output),0) AS tokens
        FROM agente_uso_tokens u
        WHERE {_DASH_WHERE}
        GROUP BY 1 ORDER BY 1
    """), params).fetchall()
    serie = [UsoSeriePonto(dia=r[0].isoformat(), tokens=int(r[1] or 0)) for r in serie_rows]
    return UsoDashboardOut(totais=totais, serie=serie)
