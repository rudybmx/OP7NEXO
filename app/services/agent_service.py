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
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import func, inspect as sa_inspect, text
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


_DIRETRIZES_TABELA_PRESENTE: bool | None = None


def _contexto_temporal() -> str:
    """Bloco de contexto temporal para o system prompt — data/hora atuais no horário de
    Brasília (UTC-3 fixo, sem dependência de tzdata) + instrução para resolver datas
    relativas. O Brasil não tem horário de verão desde 2019. Recalculado a cada mensagem."""
    agora = datetime.now(timezone(timedelta(hours=-3)))
    dias = (
        "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira",
        "sexta-feira", "sábado", "domingo",
    )
    meses = (
        "janeiro", "fevereiro", "março", "abril", "maio", "junho",
        "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
    )
    hoje = f"{dias[agora.weekday()]}, {agora.day} de {meses[agora.month - 1]} de {agora.year}"
    return (
        "CONTEXTO TEMPORAL (sempre atual):\n"
        f"- Hoje é {hoje} ({agora:%Y-%m-%d}).\n"
        f"- Hora atual: {agora:%H:%M} (horário de Brasília, UTC-3).\n"
        "- Para qualquer referência relativa (ontem, amanhã, semana que vem, daqui a N dias, "
        "próximo mês), calcule SEMPRE a partir da data de hoje acima."
    )


def _diretrizes_workspace(db: Session, workspace_id) -> str:
    """Diretrizes de IA do workspace (texto injetado no system prompt de todos os agentes).
    Tolerante a falha como o RAG (ver embedding_service._kb_table_existe): se a tabela ainda
    não existir (janela de deploy) ou a query falhar, faz rollback e retorna "" — NUNCA
    envenena a transação nem derruba o reply. Cache de existência por processo."""
    global _DIRETRIZES_TABELA_PRESENTE
    if _DIRETRIZES_TABELA_PRESENTE is None:
        try:
            _DIRETRIZES_TABELA_PRESENTE = sa_inspect(db.get_bind()).has_table(
                "agente_diretrizes_workspace"
            )
        except Exception:  # noqa: BLE001 — na dúvida, trata como ausente (degrada p/ "")
            _DIRETRIZES_TABELA_PRESENTE = False
    if not _DIRETRIZES_TABELA_PRESENTE:
        return ""
    try:
        row = db.execute(
            text(
                "SELECT diretrizes FROM agente_diretrizes_workspace "
                "WHERE workspace_id = CAST(:ws AS uuid)"
            ),
            {"ws": str(workspace_id)},
        ).first()
        return (row[0] or "").strip() if row else ""
    except Exception as exc:  # noqa: BLE001 — diretrizes nunca derrubam a geração
        log.info("[diretrizes] leitura falhou ws=%s: %s", workspace_id, exc)
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        return ""


_AJUSTES_TABELA_PRESENTE: bool | None = None
_AJUSTES_FEW_SHOT_LIMITE = 6
_AJUSTES_MAX_CHARS = 400


def _ajustes_few_shot(db: Session, agente_id) -> str:
    """Sugestões de 'resposta melhor' aprovadas pela equipe (Fase 2) injetadas como few-shot no
    system prompt. Calibram TOM e CONSISTÊNCIA — NÃO são correção de conteúdo por situação (os
    exemplos não carregam a mensagem-gatilho do cliente). Mesma tolerância a falha de
    _diretrizes_workspace: tabela ausente (janela de deploy) / query ruim → rollback + "" (nunca
    envenena a transação nem derruba o reply). Teto de recência p/ não inchar o prompt. Cache por
    processo. Gate de curadoria = `ativo` (admin desliga deletando na Central, Fase 2)."""
    global _AJUSTES_TABELA_PRESENTE
    if _AJUSTES_TABELA_PRESENTE is None:
        try:
            _AJUSTES_TABELA_PRESENTE = sa_inspect(db.get_bind()).has_table(
                "agente_ajustes_resposta"
            )
        except Exception:  # noqa: BLE001 — na dúvida, trata como ausente (degrada p/ "")
            _AJUSTES_TABELA_PRESENTE = False
    if not _AJUSTES_TABELA_PRESENTE:
        return ""
    try:
        rows = db.execute(
            text(
                "SELECT resposta_original, resposta_sugerida FROM agente_ajustes_resposta "
                "WHERE agente_id = CAST(:ag AS uuid) AND ativo = true "
                "ORDER BY criado_em DESC LIMIT :lim"
            ),
            {"ag": str(agente_id), "lim": _AJUSTES_FEW_SHOT_LIMITE},
        ).all()
    except Exception as exc:  # noqa: BLE001 — ajustes nunca derrubam a geração
        log.info("[ajustes] leitura falhou agente=%s: %s", agente_id, exc)
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        return ""
    exemplos: list[str] = []
    for original, sugerida in rows:
        sug = (sugerida or "").strip()[:_AJUSTES_MAX_CHARS]
        if not sug:
            continue
        orig = (original or "").strip()[:_AJUSTES_MAX_CHARS]
        if orig:
            exemplos.append(f"- Em vez de «{orig}», prefira: «{sug}»")
        else:
            exemplos.append(f"- Exemplo de resposta ideal: «{sug}»")
    return "\n".join(exemplos)


def _montar_system(
    agente: Agente,
    prompt: str,
    rag_chunks: list[str] | None = None,
    diretrizes_ws: str | None = None,
    ajustes_few_shot: str | None = None,
    contato_nome: str | None = None,
    resumo_conversa: str | None = None,
) -> str:
    partes = [prompt.strip() or "Você é um assistente de atendimento prestativo e objetivo."]
    if diretrizes_ws and diretrizes_ws.strip():
        partes.append("DIRETRIZES (regras desta empresa — siga sempre):\n" + diretrizes_ws.strip())
    partes.append(_contexto_temporal())
    if contato_nome and contato_nome.strip():
        partes.append(
            f"DADOS DO CONTATO:\n- Nome (confirmado pelo cliente): {contato_nome.strip()} (use com "
            "parcimônia — sobretudo na saudação e na confirmação; não repita a cada mensagem). O "
            "telefone já está registrado no sistema; não peça."
        )
    else:
        partes.append(
            "DADOS DO CONTATO:\n- O nome do cliente AINDA NÃO foi confirmado. NUNCA presuma, invente ou "
            "deduza o nome do cliente (o nome que aparece no WhatsApp é não-confiável e NÃO deve ser "
            "usado para se dirigir a ele). Se precisar do nome para atender melhor, pergunte de forma "
            "natural; só use o nome depois que o cliente o informar. O telefone já está registrado no "
            "sistema; não peça."
        )
    if resumo_conversa and resumo_conversa.strip():
        partes.append(
            "CONTEXTO DESTA CONVERSA (resumo do que já aconteceu com este cliente, gerado "
            "automaticamente — use como referência para dar continuidade e NÃO repetir perguntas já "
            "respondidas; as mensagens recentes abaixo são a fonte autoritativa):\n"
            + resumo_conversa.strip()
        )
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
    if rag_chunks:
        bloco = "\n".join(f"- {c}" for c in rag_chunks)
        partes.append(
            "Use as informações abaixo, da base de conhecimento, para responder quando relevantes "
            f"(se não cobrirem a pergunta, diga que vai verificar):\n{bloco}"
        )
    if ajustes_few_shot and ajustes_few_shot.strip():
        partes.append(
            "EXEMPLOS DE RESPOSTAS IDEAIS (aprovadas pela equipe — referência de tom e conteúdo; "
            "adapte ao contexto, não copie literalmente nem mencione algo que o cliente não "
            "perguntou):\n" + ajustes_few_shot.strip()
        )
    if agente.codigo_responsavel:
        # Transferência p/ humano (gatilho LLM): o worker transfere quando intent=="transferir_humano".
        # Opt-in (só quando há responsável). Barra-alta p/ não transferir à toa em modelo pequeno.
        partes.append(
            "TRANSFERÊNCIA PARA UM ATENDENTE HUMANO: se o cliente pedir EXPLICITAMENTE para falar "
            "com um atendente/humano, ou se o assunto estiver claramente FORA do que você atende, "
            'defina "intent": "transferir_humano" (exatamente esse valor) e escreva em "resposta" '
            "uma despedida curta avisando que vai passar para um atendente. Na dúvida, responda "
            'normalmente e NÃO use esse intent — use "transferir_humano" só nesse caso.'
        )
    partes.append(
        'Responda SEMPRE em JSON válido com as chaves exatas: '
        '"resposta" (string, o texto a enviar ao cliente), '
        '"score_confianca" (número de 0 a 1 = sua confiança na resposta), '
        '"intent" (string curta com a intenção detectada) e '
        '"nome_cliente" (string): se o cliente DECLAROU o próprio nome nesta conversa '
        '(ex.: "meu nome é Ana", "sou o João", "aqui é a Maria"), coloque o nome informado; '
        'caso contrário, ou se for nome de OUTRA pessoa (ex.: agendamento para um terceiro), '
        'retorne "". NUNCA invente nem deduza o nome.'
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


def _validar_nome_cliente(valor: str | None) -> str | None:
    """Valida um nome declarado pelo cliente (capturado pela IA). Rejeita vazios, placeholders,
    telefones/números e strings sem letra. Retorna o nome limpo ou None."""
    nome = (valor or "").strip()
    if len(nome) < 2 or len(nome) > 60:
        return None
    if nome.casefold() in (
        "null", "none", "n/a", "na", "cliente", "contato", "desconhecido",
        "nao informado", "não informado", "sem nome",
    ):
        return None
    if "@" in nome or not re.search(r"[A-Za-zÀ-ÿ]", nome):
        return None
    return nome


def _aplicar_nome_confirmado_ia(db: Session, contato_id, nome_candidato: str | None) -> bool:
    """Grava `nome_confirmado` (nome_origem='ia') a partir de um nome captado pela IA. NUNCA
    sobrescreve um nome confirmado por humano (nome_origem='humano'). Não commita — o caller decide.
    Retorna True se atualizou alguma linha."""
    nome = _validar_nome_cliente(nome_candidato)
    if not nome or not contato_id:
        return False
    res = db.execute(
        text("""
            UPDATE public.crm_whatsapp_contatos
            SET nome_confirmado = :nome, nome_origem = 'ia', updated_at = NOW()
            WHERE id = CAST(:cid AS uuid)
              AND COALESCE(nome_origem, '') <> 'humano'
              AND COALESCE(nome_confirmado, '') <> :nome
        """),
        {"nome": nome, "cid": str(contato_id)},
    )
    return res.rowcount > 0


def gerar_resposta(
    db: Session,
    agente: Agente,
    mensagem: str,
    historico: list | None = None,
    contato_nome: str | None = None,
    resumo_conversa: str | None = None,
) -> dict:
    """Gera a resposta do agente para uma mensagem. NÃO grava nada, NÃO envia.

    Retorna {resposta, score_confianca, intent, tokens_input, tokens_output, modelo}.
    JSON malformado do LLM → score 0 (sinaliza handoff). RAG ativo; as sugestões aprovadas pela
    equipe (Fase 2) entram como few-shot via _ajustes_few_shot (calibram tom/consistência).
    `contato_nome` (passado pelo worker) injeta o nome do contato no system; vazio (ex.: sandbox
    `/testar`, que não tem conversa) → bloco omitido.
    """
    prompt = _prompt_efetivo(db, agente)
    diretrizes = _diretrizes_workspace(db, agente.workspace_id)
    ajustes = _ajustes_few_shot(db, agente.id)
    from app.services import embedding_service

    rag_chunks = embedding_service.retrieve(db, agente.id, mensagem)
    content, usage = llm_client_service.chamar_json(
        db,
        agente,
        _montar_system(
            agente, prompt, rag_chunks, diretrizes_ws=diretrizes, ajustes_few_shot=ajustes,
            contato_nome=contato_nome, resumo_conversa=resumo_conversa,
        ),
        _montar_user(mensagem, historico),
    )
    tokens_input = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
    tokens_output = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)

    nome_cliente = None
    try:
        data = json.loads(content)
        resposta = str(data.get("resposta") or "").strip()
        score = max(0.0, min(1.0, float(data.get("score_confianca"))))
        intent_raw = data.get("intent")
        intent = str(intent_raw) if intent_raw is not None else None
        nome_cliente = _validar_nome_cliente(data.get("nome_cliente"))
    except (json.JSONDecodeError, TypeError, ValueError):
        resposta, score, intent = "", 0.0, "parse_error"

    return {
        "resposta": resposta,
        "score_confianca": score,
        "intent": intent,
        "nome_cliente": nome_cliente,
        "tokens_input": tokens_input,
        "tokens_output": tokens_output,
        "rag_chunks_usados": rag_chunks,
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
    # Chave por conversa desligada → não enfileira (gate autoritativo fica em processar_reply).
    ativo = db.execute(
        text("SELECT ai_ativo FROM crm_whatsapp_conversas WHERE id = CAST(:cid AS uuid)"),
        {"cid": str(conversa_id)},
    ).scalar()
    if not ativo:
        return
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


# ── análise de conversa (inteligência de IA — Fase 1) ─────────────────────────
# Prompts de análise vivem AQUI (backend, versionados) — o "segredo" da qualidade,
# fora do prompt editável do agente. Bump _ANALISE_PROMPT_VERSAO ao mudar o prompt.
_ANALISE_PROMPT_VERSAO = "2"  # v2: extrai nome_cliente declarado pelo lead
_ANALISE_DEBOUNCE_S = 20      # quiet-period após a última msg do lead
_ANALISE_COOLDOWN_S = 180     # no máx. 1 análise / 3 min por conversa (custo)

_ANALISE_INSTRUCOES = (
    "Você é um analista de qualidade de atendimento e de qualificação de leads. Recebe o "
    "histórico de uma conversa de WhatsApp entre um lead e um atendente (humano ou IA) e "
    "produz uma análise objetiva para o supervisor.\n\n"
    "Analise a conversa à luz do papel e do objetivo do agente acima e responda SOMENTE em "
    "JSON válido, com as chaves exatas:\n"
    '- "resumo": resumo curto e objetivo do que aconteceu (2-3 frases).\n'
    '- "temperatura": "quente", "morno" ou "frio". quente = pronto para avançar/fechar; '
    "morno = interessado mas com dúvidas/sem decisão; frio = pouco engajado, evasivo ou fora de perfil.\n"
    '- "temperatura_score": número de 0 a 100 (0-39 frio, 40-69 morno, 70-100 quente).\n'
    '- "interesse": o que o lead quer especificamente em relação ao OBJETIVO do agente '
    '(ex.: objetivo "agendar consulta"; lead diz que quer limpeza dental → "agendar limpeza dental"). '
    'Se o lead não expressou interesse claro, retorne "".\n'
    '- "observacoes": observações sobre o ANDAMENTO do atendimento (não repita o resumo): '
    "pontos de atenção, próximos passos, riscos, inconsistências do atendente.\n"
    '- "nome_cliente": APENAS se o LEAD declarou EXPLICITAMENTE o próprio nome na conversa '
    '(ex.: "meu nome é Ana", "sou o João"), retorne o nome informado; senão, ou se for o nome '
    'de outra pessoa, retorne "". NUNCA invente nem deduza o nome a partir do contexto.\n\n'
    "Não invente informação que não esteja na conversa. Responda em português do Brasil."
)


def _transcript_para_analise(db: Session, conversa_id, limite: int = 24) -> str:
    rows = db.execute(
        text("""
            SELECT direcao, conteudo
            FROM public.crm_whatsapp_mensagens
            WHERE conversa_id = CAST(:cid AS uuid) AND conteudo IS NOT NULL AND conteudo <> ''
            ORDER BY created_at DESC
            LIMIT :lim
        """),
        {"cid": str(conversa_id), "lim": limite},
    ).fetchall()
    linhas = [f"{'Lead' if d == 'entrada' else 'Atendente'}: {c}" for d, c in reversed(rows)]
    return "\n".join(linhas)


def analisar_conversa(db: Session, agente: Agente, conversa_id) -> dict | None:
    """Roda a análise da conversa com o MODELO DO AGENTE. Tolerante a falha (try/except +
    rollback) — degrada para None, nunca derruba o worker nem envenena a transação."""
    transcript = _transcript_para_analise(db, conversa_id)
    if not transcript.strip():
        return None
    papel = (_prompt_efetivo(db, agente) or "(não definido)").strip()
    objetivo = (getattr(agente, "objetivo", None) or "(não definido)").strip()
    system = (
        f"PAPEL DO AGENTE (referência):\n{papel}\n\n"
        f"OBJETIVO DO AGENTE: {objetivo}\n\n"
        f"{_ANALISE_INSTRUCOES}"
    )
    user = f"Conversa:\n{transcript}\n\nProduza a análise em JSON."
    try:
        content, _usage = llm_client_service.chamar_json(db, agente, system, user)
        data = json.loads(content)
        temperatura = str(data.get("temperatura") or "").strip().lower()
        if temperatura not in ("quente", "morno", "frio"):
            temperatura = "morno"
        try:
            score = int(max(0.0, min(100.0, float(data.get("temperatura_score")))))
        except (TypeError, ValueError):
            score = {"frio": 20, "morno": 55, "quente": 85}[temperatura]
        return {
            "resumo": str(data.get("resumo") or "").strip(),
            "temperatura": temperatura,
            "temperatura_score": score,
            "interesse": str(data.get("interesse") or "").strip(),
            "observacoes": str(data.get("observacoes") or "").strip(),
            "nome_cliente": _validar_nome_cliente(data.get("nome_cliente")),
        }
    except Exception as exc:  # noqa: BLE001 — análise nunca derruba nada
        log.info("[analise] falhou conversa=%s: %s", conversa_id, exc)
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        return None


def enfileirar_analise(db: Session, *, workspace_id, canal_id, conversa_id) -> None:
    """Enfileira job de análise (debounce + cooldown). INDEPENDENTE de `ai_ativo` — analisa
    qualquer conversa de canal com agente, mesmo com auto-resposta desligada (supervisão de
    atendimento humano também). Cooldown evita re-análise frequente (modelo de raciocínio é caro)."""
    if _agente_ativo_do_canal(db, canal_id) is None:
        return  # canal sem agente → nada a analisar como referência
    last = db.execute(
        text("SELECT (contexto_ia->>'analisado_em')::timestamptz FROM public.crm_whatsapp_conversas "
             "WHERE id = CAST(:cid AS uuid)"),
        {"cid": str(conversa_id)},
    ).scalar()
    agora = datetime.now(timezone.utc)
    floor = (last + timedelta(seconds=_ANALISE_COOLDOWN_S)) if last else agora
    run_at = max(agora + timedelta(seconds=_ANALISE_DEBOUNCE_S), floor).isoformat()
    payload = json.dumps({
        "conversa_id": str(conversa_id),
        "canal_id": str(canal_id) if canal_id else None,
        "workspace_id": str(workspace_id),
    })
    res = db.execute(
        text("""
            UPDATE public.crm_message_jobs
            SET next_run_at = CAST(:run_at AS timestamptz), payload = CAST(:payload AS jsonb), updated_at = NOW()
            WHERE job_type = 'conversa_analise' AND status = 'pending' AND payload->>'conversa_id' = :cid
        """),
        {"run_at": run_at, "payload": payload, "cid": str(conversa_id)},
    )
    if res.rowcount == 0:
        db.execute(
            text("""
                INSERT INTO public.crm_message_jobs
                    (workspace_id, canal_id, job_type, status, next_run_at, payload)
                VALUES
                    (CAST(:ws AS uuid), CAST(:canal AS uuid), 'conversa_analise', 'pending',
                     CAST(:run_at AS timestamptz), CAST(:payload AS jsonb))
            """),
            {"ws": str(workspace_id), "canal": str(canal_id) if canal_id else None, "run_at": run_at, "payload": payload},
        )
    db.commit()


def processar_analise(db: Session, payload: dict) -> None:
    """Entrada do worker para job_type='conversa_analise'. Grava resumo + contexto_ia."""
    conversa_id = payload.get("conversa_id")
    canal_id = payload.get("canal_id")
    workspace_id = payload.get("workspace_id")
    if not conversa_id:
        return
    agente = _agente_ativo_do_canal(db, canal_id)
    if agente is None:
        return
    res = analisar_conversa(db, agente, conversa_id)
    if res is None:
        return
    contexto = {
        "temperatura": res["temperatura"],
        "temperatura_score": res["temperatura_score"],
        "interesse": res["interesse"],
        "observacoes": res["observacoes"],
        "prompt_versao": _ANALISE_PROMPT_VERSAO,
        "analisado_em": datetime.now(timezone.utc).isoformat(),
        "agente_id": str(agente.id),
    }
    db.execute(
        text("""
            UPDATE public.crm_whatsapp_conversas
            SET resumo_ia = :resumo, contexto_ia = CAST(:contexto AS jsonb)
            WHERE id = CAST(:cid AS uuid)
        """),
        {"resumo": res["resumo"], "contexto": json.dumps(contexto), "cid": str(conversa_id)},
    )
    # Fase 2: se a análise captou um nome DECLARADO pelo lead, confirma (origem 'ia'),
    # nunca sobrescrevendo um nome confirmado por humano.
    if res.get("nome_cliente"):
        _cid = db.execute(
            text("SELECT contato_id FROM public.crm_whatsapp_conversas WHERE id = CAST(:cid AS uuid)"),
            {"cid": str(conversa_id)},
        ).scalar()
        if _cid:
            _aplicar_nome_confirmado_ia(db, _cid, res["nome_cliente"])
    db.commit()
    log.info("[analise] conversa=%s temperatura=%s score=%s", conversa_id, res["temperatura"], res["temperatura_score"])
    try:
        from app.services.redis_pub import publish_whatsapp_event
        publish_whatsapp_event({
            "type": "whatsapp.refresh",
            "workspaceId": str(workspace_id),
            "conversaId": str(conversa_id),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:  # noqa: BLE001
        log.info("[analise] publish refresh falhou conversa=%s: %s", conversa_id, exc)


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


def _enviar_resposta(conversa, canal, texto: str) -> tuple[bool, str | None]:
    """Envia o texto pelo canal, dispatch por `canal.tipo`. Suporta WhatsApp Evolution,
    WAHA e Cloud API (whatsapp_oficial). Instagram/Facebook/webhook → (False, None) (handoff).
    Retorna (enviado, evolution_msg_id): o msg_id (só Evolution) habilita recibo de entrega/leitura."""
    if canal is None or not texto:
        return False, None
    tipo = (canal.tipo or "").strip()
    config = canal.config if isinstance(canal.config, dict) else {}
    jid = conversa.remote_jid or ""
    ev = config.get("evolution") if isinstance(config.get("evolution"), dict) else None
    try:
        if tipo == "whatsapp_evolution" or ev is not None:
            ev = ev or {}
            if not conversa.instance or not jid:
                return False, None
            from app.services import evolution as evo_service

            resp = evo_service.enviar_mensagem_texto(
                conversa.instance, jid, texto,
                instance_id=ev.get("instance_id"), instance_token=ev.get("instance_token"),
            )
            return True, evo_service.extract_evolution_message_id(resp)

        if tipo == "whatsapp_waha":
            waha_cfg = config.get("waha") if isinstance(config.get("waha"), dict) else {}
            session = waha_cfg.get("session") or canal.nome or "default"
            chat_id = _waha_chat_id(jid)
            if not chat_id:
                return False, None
            from app.services import waha_service

            waha_service.enviar_mensagem_texto(session, waha_cfg, chat_id, texto)
            return True, None

        if tipo == "whatsapp_oficial":
            phone_number_id = config.get("phone_number_id") or ""
            access_token = config.get("access_token") or ""
            to = jid.replace("@s.whatsapp.net", "").replace("@c.us", "")
            if not (phone_number_id and access_token and to):
                return False, None
            from app.services import meta_cloud

            meta_cloud.enviar_mensagem_texto(
                phone_number_id=phone_number_id, access_token=access_token, to=to, text=texto
            )
            return True, None
    except Exception as exc:  # noqa: BLE001 — falha de envio → handoff humano
        log.warning("[agente] envio %s falhou conversa=%s: %s", tipo, conversa.id, exc)
        return False, None

    # instagram/facebook/webhook/desconhecido: envio não suportado → handoff.
    log.info("[agente] envio não suportado p/ conversa=%s tipo=%s → handoff", conversa.id, tipo)
    return False, None


def _publish(conversa, *, tipo: str, texto: str | None = None, message_type: str | None = None) -> None:
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
                "instance": conversa.instance,
                "messageType": message_type,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception as exc:  # noqa: BLE001
        log.info("[agente] publish redis falhou conversa=%s: %s", conversa.id, exc)


_HANDOFF_LABEL = {
    "baixa_confianca": "confiança baixa na resposta",
    "fora_horario": "fora do horário de atendimento",
    "limite_tokens": "limite diário de uso atingido",
    "config": "configuração do agente inválida",
    "erro_llm": "erro ao gerar a resposta",
    "envio_falhou": "falha ao enviar a resposta",
    "transferencia": "transferência solicitada pelo agente",
}

# Motivos que roteiam p/ o responsável (Fase 4). Os "o agente não consegue responder ISTO" +
# "transferencia" (deliberada via intent — também desliga `ai_ativo` em definitivo). Os TRANSITÓRIOS
# (fora_horario, limite_tokens — o agente voltaria a funcionar sozinho) NÃO entram, senão a 1ª msg
# fora de hora mataria um agente saudável.
_ROTEAR_NO_HANDOFF = {"baixa_confianca", "erro_llm", "config", "envio_falhou", "transferencia"}


def _nome_usuario(db: Session, user_id) -> str:
    if not user_id:
        return "atendente"
    try:
        row = db.execute(
            text("SELECT nome FROM users WHERE id = CAST(:id AS uuid)"), {"id": str(user_id)}
        ).first()
        return row[0] if row and row[0] else "atendente"
    except Exception:  # noqa: BLE001
        return "atendente"


def _postar_msg_sistema(db: Session, conversa, agente: Agente, motivo: str) -> None:
    """Mensagem interna (remetente_tipo='sistema') com o resumo de handoff p/ o humano que
    assume. Reusa a análise da Fase 1 (resumo_ia/contexto_ia) quando houver; senão só o motivo.
    NÃO envia ao cliente, NÃO mexe no preview/nao_lidas do inbox (é nota interna da thread)."""
    responsavel_nome = _nome_usuario(db, agente.codigo_responsavel)
    motivo_legivel = _HANDOFF_LABEL.get(motivo, motivo)
    partes = [
        f"🔄 Conversa transferida para {responsavel_nome} pelo agente "
        f"{agente.nome or 'IA'} (motivo: {motivo_legivel})."
    ]
    resumo = (getattr(conversa, "resumo_ia", None) or "").strip()
    if resumo:
        partes.append(f"Resumo: {resumo}")
    ctx = getattr(conversa, "contexto_ia", None)
    if isinstance(ctx, dict):
        extras = []
        if ctx.get("temperatura"):
            extras.append(f"termômetro: {ctx['temperatura']}")
        if ctx.get("interesse"):
            extras.append(f"interesse: {ctx['interesse']}")
        if extras:
            partes.append(" · ".join(extras))
    db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_mensagens
            (workspace_id, canal_id, conversa_id, contato_id, instance, remote_jid,
             direcao, from_me, remetente_tipo, remetente_nome, conteudo, message_type,
             status, recebida_em, created_at, updated_at)
            VALUES (:ws, :canal, :cid, :ct, :inst, :jid,
                    'saida', false, 'sistema', 'Sistema', :msg, 'sistema',
                    'enviada', NOW(), NOW(), NOW())
        """),
        {
            "ws": str(conversa.workspace_id),
            "canal": str(conversa.canal_id) if conversa.canal_id else None,
            "cid": str(conversa.id),
            "ct": str(conversa.contato_id) if conversa.contato_id else None,
            "inst": conversa.instance,
            "jid": conversa.remote_jid,
            "msg": "\n".join(partes),
        },
    )


def _set_digitando(conversa, canal, *, ativo: bool, wamid: str | None = None) -> None:
    """Liga/desliga o indicador "digitando" no canal enquanto o agente pensa — deixa o atendimento
    com cara de humano. **Best-effort/cosmético**: nunca propaga erro nem atrasa o reply (timeout
    curto nas chamadas). Dispatch por `canal.tipo`, espelhando `_enviar_resposta`. Evolution/WAHA
    ligam e desligam; Meta Cloud só LIGA (typing expira sozinho ~25s) e exige o wamid da msg recebida."""
    if canal is None:
        return
    tipo = (canal.tipo or "").strip()
    config = canal.config if isinstance(canal.config, dict) else {}
    jid = conversa.remote_jid or ""
    try:
        ev = config.get("evolution") if isinstance(config.get("evolution"), dict) else None
        if tipo == "whatsapp_evolution" or ev is not None:
            ev = ev or {}
            if conversa.instance and jid:
                from app.services import evolution as evo_service

                evo_service.enviar_presenca(
                    conversa.instance, jid, "composing" if ativo else "paused",
                    instance_id=ev.get("instance_id"), instance_token=ev.get("instance_token"),
                )
            return
        if tipo == "whatsapp_waha":
            waha_cfg = config.get("waha") if isinstance(config.get("waha"), dict) else {}
            session = waha_cfg.get("session") or canal.nome or "default"
            chat_id = _waha_chat_id(jid)
            if chat_id:
                from app.services import waha_service

                waha_service.definir_digitando(session, waha_cfg, chat_id, ativo)
            return
        if tipo == "whatsapp_oficial" and ativo and wamid:
            phone_number_id = config.get("phone_number_id") or ""
            access_token = config.get("access_token") or ""
            if phone_number_id and access_token:
                from app.services import meta_cloud

                meta_cloud.enviar_digitando(phone_number_id, access_token, wamid)
            return
    except Exception as exc:  # noqa: BLE001 — presença é cosmética, NUNCA derruba/atrasa o reply
        log.info("[agente] presença(%s ativo=%s) falhou conversa=%s: %s", tipo, ativo, conversa.id, exc)


def _handoff(db: Session, conversa, agente: Agente, *, canal_id, score, tokens, motivo: str, canal=None) -> None:
    if canal is not None:
        _set_digitando(conversa, canal, ativo=False)  # encerra o "digitando" se estava ligado
    conversa.ai_escalado = True
    conversa.ai_handoff_motivo = motivo
    conversa.ai_handoff_at = datetime.now(timezone.utc)
    conversa.ai_agente_id = agente.id
    if score is not None:
        conversa.ai_score_confianca = score
    db.commit()  # handoff marcado (garantido — independe do roteamento abaixo)
    registrar_uso(
        db, agente, canal_id=canal_id, conversa_id=conversa.id,
        tokens_input=tokens[0], tokens_output=tokens[1], escalado=True, score=score,
    )
    log.info("[agente] handoff conversa=%s motivo=%s score=%s", conversa.id, motivo, score)
    # Fase 4: se o agente tem responsável, roteia a conversa p/ esse humano + posta o resumo na
    # thread. Opt-in (sem codigo_responsavel = comportamento antigo, só marca ai_escalado).
    # Transação SEPARADA: falha aqui NÃO desfaz o handoff já commitado.
    if agente.codigo_responsavel and motivo in _ROTEAR_NO_HANDOFF:
        try:
            from app.services.whatsapp_crm_persistence import aplicar_transferencia

            mudou = aplicar_transferencia(
                db,
                conversa,
                responsavel_id=agente.codigo_responsavel,
                actor_user_id=None,
                source="agente.handoff",
                payload_extra={"motivo": motivo, "agente_id": str(agente.id)},
            )
            if mudou:
                _postar_msg_sistema(db, conversa, agente, motivo)
            db.commit()
        except Exception as exc:  # noqa: BLE001 — roteamento nunca derruba o worker
            log.warning("[agente] roteamento de handoff falhou conversa=%s: %s", conversa.id, exc)
            db.rollback()
    _publish(conversa, tipo="conversation.refresh")


def _enviar_e_persistir(db: Session, conversa, canal, agente: Agente, *, texto: str, score) -> bool:
    """Envia `texto` pelo canal e, se enviado, persiste a mensagem outbound + atualiza os campos
    neutros da conversa (ultima_mensagem/last_outbound_at/ai_respondido/ai_score_confianca). NÃO toca
    em ai_escalado/ai_handoff_motivo/ai_ativo nem dá commit — quem chama decide (envio normal limpa a
    marcação; handoff-falante escala) e commita. Retorna True se enviou."""
    enviado, evo_msg_id = _enviar_resposta(conversa, canal, texto)
    if not enviado:
        return False
    agora = datetime.now(timezone.utc)
    # Persiste a mensagem enviada em crm_whatsapp_mensagens (espelha o envio humano em
    # canais.enviar_mensagem_canal). Necessário: o Evolution NÃO ecoa o envio de volta para o
    # webhook, então sem este INSERT a resposta não aparece no chat.
    db.execute(
        text("""
            INSERT INTO public.crm_whatsapp_mensagens
            (workspace_id, canal_id, conversa_id, contato_id, instance, remote_jid,
             direcao, from_me, remetente_tipo, remetente_nome, conteudo, message_type,
             status, evolution_msg_id, recebida_em, created_at, updated_at)
            VALUES (:ws, :canal, :cid, :ct, :inst, :jid,
                    'saida', true, 'agente', :rn, :msg, 'conversation',
                    'enviada', :evid, NOW(), NOW(), NOW())
        """),
        {
            "ws": str(conversa.workspace_id),
            "canal": str(conversa.canal_id) if conversa.canal_id else None,
            "cid": str(conversa.id),
            "ct": str(conversa.contato_id) if conversa.contato_id else None,
            "inst": conversa.instance,
            "jid": conversa.remote_jid,
            "rn": agente.nome or "Agente IA",
            "msg": texto,
            "evid": evo_msg_id,
        },
    )
    conversa.ai_respondido = True
    conversa.ai_agente_id = agente.id
    conversa.ai_score_confianca = score
    conversa.ultima_mensagem = texto
    conversa.ultima_direcao = "saida"
    conversa.ultima_msg_at = agora
    conversa.last_outbound_at = agora
    return True


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
    if not conversa.ai_ativo:
        return  # chave do agente desligada nesta conversa → humano cuida (sem handoff)
    agente = _agente_ativo_do_canal(db, conversa.canal_id)
    if agente is None:
        return
    canal = db.get(CanalEntrada, conversa.canal_id) if conversa.canal_id else None
    canal_id = conversa.canal_id

    historico, ultima_msg = _carregar_contexto(db, conversa)
    if not ultima_msg:
        return

    contato_nome = None
    if conversa.contato_id:
        from app.models.crm.contato import Contato

        _ct = db.get(Contato, conversa.contato_id)
        if _ct is not None:
            # só o nome CONFIRMADO — nunca o push_name (nome do WhatsApp, não-confiável).
            # Sem confirmado → None → o prompt instrui o agente a perguntar (ver _montar_system).
            contato_nome = (_ct.nome_confirmado or "").strip() or None

    # "memória longa" da conversa: resumo/interesse da análise (Fase 1, job conversa_analise) já
    # gravados em resumo_ia/contexto_ia. Cobre o que sai da janela de 12 msgs e dá continuidade quando
    # o cliente volta dias depois. Ausente/~1 ciclo atrasado em conversa nova → degrada p/ None.
    resumo_conversa = None
    _resumo = (getattr(conversa, "resumo_ia", None) or "").strip()
    _ctx = getattr(conversa, "contexto_ia", None)
    _interesse = (_ctx.get("interesse") or "").strip() if isinstance(_ctx, dict) else ""
    _partes_resumo = [p for p in (_resumo, f"Interesse do cliente: {_interesse}" if _interesse else "") if p]
    if _partes_resumo:
        resumo_conversa = " · ".join(_partes_resumo)

    if not dentro_do_horario(agente):
        _handoff(db, conversa, agente, canal_id=canal_id, score=None, tokens=(0, 0), motivo="fora_horario")
        return
    if agente.limite_tokens_dia and tokens_usados_hoje(db, agente) >= agente.limite_tokens_dia:
        _handoff(db, conversa, agente, canal_id=canal_id, score=None, tokens=(0, 0), motivo="limite_tokens")
        return

    # "digitando…" enquanto o modelo pensa — o v4-flash é de raciocínio (~3-20s), então o indicador
    # dá cara de atendente humano. Best-effort/cosmético: não atrasa nem derruba o reply. Meta exige
    # o wamid da última mensagem recebida (Evolution/WAHA usam o jid da conversa).
    wamid = None
    if canal is not None and (canal.tipo or "").strip() == "whatsapp_oficial":
        wamid = db.execute(
            text(
                "SELECT evolution_msg_id FROM public.crm_whatsapp_mensagens "
                "WHERE conversa_id = :cid AND direcao = 'entrada' AND evolution_msg_id IS NOT NULL "
                "ORDER BY created_at DESC LIMIT 1"
            ),
            {"cid": str(conversa.id)},
        ).scalar()
    _set_digitando(conversa, canal, ativo=True, wamid=wamid)

    try:
        res = gerar_resposta(
            db, agente, ultima_msg, historico, contato_nome=contato_nome, resumo_conversa=resumo_conversa
        )
    except llm_client_service.LLMConfigError as exc:
        log.warning("[agente] config LLM inválida agente=%s: %s", agente.id, exc)
        _handoff(db, conversa, agente, canal_id=canal_id, score=None, tokens=(0, 0), motivo="config", canal=canal)
        return
    except Exception as exc:  # noqa: BLE001 — qualquer falha (token/rede/LLM) → handoff, nunca retry-loop
        log.warning("[agente] falha ao gerar resposta agente=%s: %s", agente.id, exc)
        db.rollback()
        _handoff(db, conversa, agente, canal_id=canal_id, score=None, tokens=(0, 0), motivo="erro_llm", canal=canal)
        return

    score = res["score_confianca"]
    ti, to = res["tokens_input"], res["tokens_output"]
    intent = (res.get("intent") or "").strip().lower()

    # Fase 2: nome declarado pelo cliente, captado pelo agente → confirma (origem 'ia'),
    # nunca sobrescreve humano. Sem commit aqui — entra na transação do envio/handoff abaixo.
    if res.get("nome_cliente") and conversa.contato_id:
        _aplicar_nome_confirmado_ia(db, conversa.contato_id, res["nome_cliente"])

    # Transferência DELIBERADA (o agente sinalizou intent="transferir_humano"): envia o aviso ao
    # cliente E escala para humano, DESLIGANDO a IA nesta conversa. Sem desligar ai_ativo, a próxima
    # mensagem reativaria o bot (responderia / "transferiria" em loop) até alguém assumir. Checado
    # ANTES do score: numa transferência o agente costuma estar confiante (score alto).
    if intent == "transferir_humano" and res["resposta"]:
        if _enviar_e_persistir(db, conversa, canal, agente, texto=res["resposta"], score=score):
            conversa.ai_ativo = False  # transferência DELIBERADA → IA encerra a vez nesta conversa
            _publish(conversa, tipo="message.upsert", texto=res["resposta"], message_type="conversation")
            # _enviar_e_persistir deixou as mudanças pendentes; o _handoff marca ai_escalado, commita
            # tudo junto, registra o uso e (Fase 4) roteia p/ o responsável do agente + posta o resumo.
            _handoff(db, conversa, agente, canal_id=canal_id, score=score, tokens=(ti, to), motivo="transferencia", canal=canal)
        else:
            _handoff(db, conversa, agente, canal_id=canal_id, score=score, tokens=(ti, to), motivo="envio_falhou", canal=canal)
        return

    if score >= agente.threshold_confianca and res["resposta"]:
        if _enviar_e_persistir(db, conversa, canal, agente, texto=res["resposta"], score=score):
            conversa.ai_escalado = False  # resposta OK → limpa a marcação de falha
            conversa.ai_handoff_motivo = None
            db.commit()
            registrar_uso(
                db, agente, canal_id=canal_id, conversa_id=conversa.id,
                tokens_input=ti, tokens_output=to, escalado=False, score=score,
            )
            _publish(conversa, tipo="message.upsert", texto=res["resposta"], message_type="conversation")
        else:
            _handoff(db, conversa, agente, canal_id=canal_id, score=score, tokens=(ti, to), motivo="envio_falhou", canal=canal)
    else:
        _handoff(db, conversa, agente, canal_id=canal_id, score=score, tokens=(ti, to), motivo="baixa_confianca", canal=canal)
