"""Núcleo do agente de atendimento (Central de Agentes, Fase 2).

Esta fração cobre o que NÃO toca o fluxo vivo de mensagens:
- `gerar_resposta`: monta o prompt, chama o LLM (via llm_client_service) e faz parsing
  do JSON estruturado {resposta, score_confianca, intent}. Usado pelo sandbox `/testar`
  e (no próximo incremento) pelo worker.
- helpers determinísticos: `dentro_do_horario`, `tokens_usados_hoje`, `registrar_uso`.

O `processar_reply` (entrada do worker: envio outbound por canal + marcação da conversa +
handoff) é o próximo incremento — depende do dispatch de envio por provider e do hook de
inbound, partes que mexem no fluxo de produção.
"""
from __future__ import annotations

import json
from datetime import datetime, time, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.agente import Agente, AgentePrompt, AgenteUsoToken
from app.services import llm_client_service


def _prompt_efetivo(db: Session, agente: Agente) -> str:
    """Prompt publicado mais recente; se não houver, o rascunho mais recente."""
    pub = (
        db.query(AgentePrompt)
        .filter(AgentePrompt.agente_id == agente.id, AgentePrompt.status == "publicado")
        .order_by(AgentePrompt.publicado_em.desc().nullslast())
        .first()
    )
    if pub and pub.prompt_texto.strip():
        return pub.prompt_texto
    draft = (
        db.query(AgentePrompt)
        .filter(AgentePrompt.agente_id == agente.id, AgentePrompt.status == "draft")
        .order_by(AgentePrompt.criado_em.desc())
        .first()
    )
    return draft.prompt_texto if draft else ""


def _montar_system(agente: Agente, prompt: str) -> str:
    partes = [prompt.strip() or "Você é um assistente de atendimento prestativo e objetivo."]
    if agente.tom:
        partes.append(f"Tom de voz: {agente.tom}.")
    if agente.idiomas:
        partes.append(f"Idiomas suportados: {', '.join(agente.idiomas)}.")
    if agente.blacklist_topicos:
        partes.append(
            "NUNCA responda sobre estes temas (recuse educadamente e ofereça atendimento humano): "
            + ", ".join(agente.blacklist_topicos)
            + "."
        )
    partes.append(
        'Responda SEMPRE em JSON válido com as chaves exatas: '
        '"resposta" (string, o texto a enviar ao cliente), '
        '"score_confianca" (número de 0 a 1 = sua confiança na resposta) e '
        '"intent" (string curta com a intenção detectada).'
    )
    return "\n\n".join(partes)


def _montar_user(mensagem: str, historico: list | None) -> str:
    linhas: list[str] = []
    for h in historico or []:
        if isinstance(h, dict):
            papel = h.get("papel") or "cliente"
            texto = h.get("texto") or ""
        else:
            papel, texto = "cliente", str(h)
        quem = "Cliente" if papel == "cliente" else "Agente"
        linhas.append(f"{quem}: {texto}")
    bloco = "\n".join(linhas)
    prefixo = f"Histórico da conversa:\n{bloco}\n\n" if bloco else ""
    return f"{prefixo}Mensagem atual do cliente:\n{mensagem}"


def gerar_resposta(db: Session, agente: Agente, mensagem: str, historico: list | None = None) -> dict:
    """Gera a resposta do agente para uma mensagem. NÃO grava nada, NÃO envia.

    Retorna {resposta, score_confianca, intent, tokens_input, tokens_output, modelo}.
    JSON malformado do LLM → score 0 (sinaliza handoff). RAG/few-shot entram nas fases 3-4.
    """
    prompt = _prompt_efetivo(db, agente)
    content, usage = llm_client_service.chamar_json(
        db, agente, _montar_system(agente, prompt), _montar_user(mensagem, historico)
    )
    tokens_input = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
    tokens_output = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)

    try:
        data = json.loads(content)
        resposta = str(data.get("resposta") or "").strip()
        score = max(0.0, min(1.0, float(data.get("score_confianca"))))
        intent_raw = data.get("intent")
        intent = str(intent_raw) if intent_raw is not None else None
    except (json.JSONDecodeError, TypeError, ValueError):
        resposta, score, intent = "", 0.0, "parse_error"

    return {
        "resposta": resposta,
        "score_confianca": score,
        "intent": intent,
        "tokens_input": tokens_input,
        "tokens_output": tokens_output,
        "modelo": agente.modelo,
    }


def dentro_do_horario(agente: Agente, agora: datetime | None = None) -> bool:
    """True se `agora` cai numa janela ativa. Sem janelas configuradas = 24/7.

    NOTA: `agora` deve vir no timezone do workspace (o worker passará isso na Fase 2.x);
    sem parâmetro usa UTC.
    """
    janelas = [h for h in agente.horarios if h.ativo]
    if not janelas:
        return True
    agora = agora or datetime.now(timezone.utc)
    dia = agora.weekday()  # 0=Seg .. 6=Dom (alinhado ao dia_semana)
    t: time = agora.timetz().replace(tzinfo=None) if agora.tzinfo else agora.time()
    return any(j.dia_semana == dia and j.hora_inicio <= t <= j.hora_fim for j in janelas)


def tokens_usados_hoje(db: Session, agente: Agente) -> int:
    inicio = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    total = (
        db.query(func.coalesce(func.sum(AgenteUsoToken.tokens_input + AgenteUsoToken.tokens_output), 0))
        .filter(AgenteUsoToken.agente_id == agente.id, AgenteUsoToken.criado_em >= inicio)
        .scalar()
    )
    return int(total or 0)


def registrar_uso(
    db: Session,
    agente: Agente,
    *,
    canal_id=None,
    conversa_id=None,
    tokens_input: int,
    tokens_output: int,
    escalado: bool,
    score: float | None,
) -> None:
    """Grava em agente_uso_tokens e espelha em ai_usage_log (dashboard global). Best-effort."""
    db.add(
        AgenteUsoToken(
            agente_id=agente.id,
            workspace_id=agente.workspace_id,
            canal_id=canal_id,
            conversa_id=conversa_id,
            modelo=agente.modelo,
            tokens_input=tokens_input,
            tokens_output=tokens_output,
            escalado=escalado,
            score_confianca=score,
        )
    )
    db.commit()
    try:
        from app.services import ai_usage

        ai_usage.registrar_uso(
            feature="agent",
            workspace_id=agente.workspace_id,
            model=agente.modelo or "",
            provider=None,
            usage={"prompt_tokens": tokens_input, "completion_tokens": tokens_output},
        )
    except Exception:  # noqa: BLE001 — espelho é best-effort
        pass
