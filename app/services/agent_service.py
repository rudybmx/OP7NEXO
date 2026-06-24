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
import logging
import re
import uuid
from datetime import datetime, time, timezone

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models.agente import Agente, AgenteCanal, AgentePrompt, AgenteUsoToken
from app.services import llm_client_service

log = logging.getLogger(__name__)


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


# ── fluxo vivo: enfileiramento (debounce) + processamento no worker ───────────
def _agente_ativo_do_canal(db: Session, canal_id) -> Agente | None:
    if not canal_id:
        return None
    return (
        db.query(Agente)
        .join(AgenteCanal, AgenteCanal.agente_id == Agente.id)
        .filter(
            AgenteCanal.canal_id == canal_id,
            AgenteCanal.ativo.is_(True),
            Agente.status == "ativo",
            Agente.deleted_at.is_(None),
        )
        .first()
    )


def enfileirar_agente_reply(db: Session, *, workspace_id, canal_id, conversa_id, mensagem_id=None) -> None:
    """Enfileira/atualiza um job agente_reply com debounce. Idempotente por conversa.

    Guarda anti-race: o UPDATE só toca jobs `status='pending'` (não reseta um job já
    pego pelo worker, que vira 'running'). Se 0 linhas, INSERT novo job. Ver Riscos no PLANO.
    """
    agente = _agente_ativo_do_canal(db, canal_id)
    if agente is None:
        return  # sem agente ativo → não cria jobs à toa
    deb = str(int(agente.debounce_segundos or 40))
    payload = json.dumps(
        {
            "conversa_id": str(conversa_id),
            "canal_id": str(canal_id) if canal_id else None,
            "workspace_id": str(workspace_id),
            "mensagem_id": str(mensagem_id) if mensagem_id else None,
        }
    )
    res = db.execute(
        text("""
            UPDATE public.crm_message_jobs
            SET next_run_at = NOW() + (CAST(:deb AS int) * INTERVAL '1 second'),
                payload = CAST(:payload AS jsonb),
                updated_at = NOW()
            WHERE job_type = 'agente_reply'
              AND status = 'pending'
              AND payload->>'conversa_id' = :cid
        """),
        {"deb": deb, "payload": payload, "cid": str(conversa_id)},
    )
    if res.rowcount == 0:
        db.execute(
            text("""
                INSERT INTO public.crm_message_jobs
                    (workspace_id, canal_id, job_type, status, next_run_at, payload)
                VALUES
                    (CAST(:ws AS uuid), CAST(:canal AS uuid), 'agente_reply', 'pending',
                     NOW() + (CAST(:deb AS int) * INTERVAL '1 second'), CAST(:payload AS jsonb))
            """),
            {"ws": str(workspace_id), "canal": str(canal_id) if canal_id else None, "deb": deb, "payload": payload},
        )
    db.commit()


def _carregar_contexto(db: Session, conversa, limite: int = 12) -> tuple[list[dict], str | None]:
    """Últimas N mensagens da conversa em ordem cronológica. Retorna (historico, ultima_msg
    do cliente). `historico` exclui a última mensagem de entrada (ela vai como mensagem atual)."""
    rows = db.execute(
        text("""
            SELECT direcao, conteudo
            FROM public.crm_whatsapp_mensagens
            WHERE conversa_id = :cid AND conteudo IS NOT NULL AND conteudo <> ''
            ORDER BY created_at DESC
            LIMIT :lim
        """),
        {"cid": str(conversa.id), "lim": limite},
    ).fetchall()
    rows = list(reversed(rows))  # cronológico
    idx_ultima = None
    for i in range(len(rows) - 1, -1, -1):
        if rows[i][0] == "entrada":
            idx_ultima = i
            break
    if idx_ultima is None:
        return [], None
    ultima = rows[idx_ultima][1]
    historico = [
        {"papel": "cliente" if r[0] == "entrada" else "agente", "texto": r[1]} for r in rows[:idx_ultima]
    ]
    return historico, ultima


def _waha_chat_id(remote_jid: str) -> str:
    """Espelha canais._waha_chat_id: mantém o @ se houver, senão dígitos + @c.us."""
    jid = (remote_jid or "").strip()
    if "@" in jid:
        return jid
    digits = re.sub(r"\D", "", jid)
    return f"{digits}@c.us" if digits else jid


def _enviar_resposta(conversa, canal, texto: str) -> bool:
    """Envia o texto pelo canal, dispatch por `canal.tipo`. Suporta WhatsApp Evolution,
    WAHA e Cloud API (whatsapp_oficial). Instagram/Facebook/webhook → False (handoff).
    Reusa os serviços de baixo nível; qualquer erro → False (cai em handoff)."""
    if canal is None or not texto:
        return False
    tipo = (canal.tipo or "").strip()
    config = canal.config if isinstance(canal.config, dict) else {}
    jid = conversa.remote_jid or ""
    ev = config.get("evolution") if isinstance(config.get("evolution"), dict) else None
    try:
        if tipo == "whatsapp_evolution" or ev is not None:
            ev = ev or {}
            if not conversa.instance or not jid:
                return False
            from app.services import evolution as evo_service

            evo_service.enviar_mensagem_texto(
                conversa.instance, jid, texto,
                instance_id=ev.get("instance_id"), instance_token=ev.get("instance_token"),
            )
            return True

        if tipo == "whatsapp_waha":
            waha_cfg = config.get("waha") if isinstance(config.get("waha"), dict) else {}
            session = waha_cfg.get("session") or canal.nome or "default"
            chat_id = _waha_chat_id(jid)
            if not chat_id:
                return False
            from app.services import waha_service

            waha_service.enviar_mensagem_texto(session, waha_cfg, chat_id, texto)
            return True

        if tipo == "whatsapp_oficial":
            phone_number_id = config.get("phone_number_id") or ""
            access_token = config.get("access_token") or ""
            to = jid.replace("@s.whatsapp.net", "").replace("@c.us", "")
            if not (phone_number_id and access_token and to):
                return False
            from app.services import meta_cloud

            meta_cloud.enviar_mensagem_texto(
                phone_number_id=phone_number_id, access_token=access_token, to=to, text=texto
            )
            return True
    except Exception as exc:  # noqa: BLE001 — falha de envio → handoff humano
        log.warning("[agente] envio %s falhou conversa=%s: %s", tipo, conversa.id, exc)
        return False

    # instagram/facebook/webhook/desconhecido: envio não suportado → handoff.
    log.info("[agente] envio não suportado p/ conversa=%s tipo=%s → handoff", conversa.id, tipo)
    return False


def _publish(conversa, *, tipo: str, texto: str | None = None) -> None:
    try:
        from app.services.redis_pub import publish_whatsapp_event

        publish_whatsapp_event(
            {
                "type": tipo,
                "workspaceId": str(conversa.workspace_id),
                "conversaId": str(conversa.id),
                "remoteJid": conversa.remote_jid or "",
                "direction": "saida",
                "text": texto or "",
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception as exc:  # noqa: BLE001
        log.info("[agente] publish redis falhou conversa=%s: %s", conversa.id, exc)


def _handoff(db: Session, conversa, agente: Agente, *, canal_id, score, tokens, motivo: str) -> None:
    conversa.ai_escalado = True
    conversa.ai_agente_id = agente.id
    if score is not None:
        conversa.ai_score_confianca = score
    db.commit()
    registrar_uso(
        db, agente, canal_id=canal_id, conversa_id=conversa.id,
        tokens_input=tokens[0], tokens_output=tokens[1], escalado=True, score=score,
    )
    log.info("[agente] handoff conversa=%s motivo=%s score=%s", conversa.id, motivo, score)
    _publish(conversa, tipo="conversation.refresh")


def processar_reply(db: Session, payload: dict) -> None:
    """Entrada do worker para job_type='agente_reply'. Resolve agente do canal, aplica
    gates (horário/limite → handoff), gera resposta e envia ou faz handoff por confiança."""
    conversa_id = payload.get("conversa_id")
    if not conversa_id:
        return
    from app.models.canal_entrada import CanalEntrada
    from app.models.crm.conversa import Conversa

    conversa = db.get(Conversa, uuid.UUID(str(conversa_id)))
    if conversa is None or conversa.deleted_at is not None:
        return
    agente = _agente_ativo_do_canal(db, conversa.canal_id)
    if agente is None:
        return
    canal = db.get(CanalEntrada, conversa.canal_id) if conversa.canal_id else None
    canal_id = conversa.canal_id

    historico, ultima_msg = _carregar_contexto(db, conversa)
    if not ultima_msg:
        return

    if not dentro_do_horario(agente):
        _handoff(db, conversa, agente, canal_id=canal_id, score=None, tokens=(0, 0), motivo="fora_horario")
        return
    if agente.limite_tokens_dia and tokens_usados_hoje(db, agente) >= agente.limite_tokens_dia:
        _handoff(db, conversa, agente, canal_id=canal_id, score=None, tokens=(0, 0), motivo="limite_tokens")
        return

    try:
        res = gerar_resposta(db, agente, ultima_msg, historico)
    except llm_client_service.LLMConfigError as exc:
        log.warning("[agente] config LLM inválida agente=%s: %s", agente.id, exc)
        _handoff(db, conversa, agente, canal_id=canal_id, score=None, tokens=(0, 0), motivo="config")
        return
    except Exception as exc:  # noqa: BLE001 — qualquer falha (token/rede/LLM) → handoff, nunca retry-loop
        log.warning("[agente] falha ao gerar resposta agente=%s: %s", agente.id, exc)
        db.rollback()
        _handoff(db, conversa, agente, canal_id=canal_id, score=None, tokens=(0, 0), motivo="erro_llm")
        return

    score = res["score_confianca"]
    ti, to = res["tokens_input"], res["tokens_output"]

    if score >= agente.threshold_confianca and res["resposta"]:
        if _enviar_resposta(conversa, canal, res["resposta"]):
            agora = datetime.now(timezone.utc)
            conversa.ai_respondido = True
            conversa.ai_agente_id = agente.id
            conversa.ai_score_confianca = score
            conversa.ultima_mensagem = res["resposta"]
            conversa.ultima_direcao = "saida"
            conversa.ultima_msg_at = agora
            conversa.last_outbound_at = agora
            db.commit()
            registrar_uso(
                db, agente, canal_id=canal_id, conversa_id=conversa.id,
                tokens_input=ti, tokens_output=to, escalado=False, score=score,
            )
            _publish(conversa, tipo="message.upsert", texto=res["resposta"])
        else:
            _handoff(db, conversa, agente, canal_id=canal_id, score=score, tokens=(ti, to), motivo="envio_falhou")
    else:
        _handoff(db, conversa, agente, canal_id=canal_id, score=score, tokens=(ti, to), motivo="baixa_confianca")
