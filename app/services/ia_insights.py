"""IA insights service — cache-aware, persisted to ai_insights table."""
import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

CACHE_TTL_HOURS = 6

PROMPT_GESTOR = """
IDENTIDADE: Você é um gestor de tráfego pago sênior
especializado em Meta Ads com 10+ anos de experiência.
Sua missão é identificar exatamente onde o dinheiro
está sendo desperdiçado e onde há potencial de escala
imediata — não em teoria, mas com os dados na mesa.

CONTEXTO:
Workspace: {account_name}
Período: {data_inicio} a {data_fim}
Investimento total: R$ {spend}
Leads totais: {leads}
CPL médio: R$ {cpl}
CTR médio: {ctr}%
CPM: R$ {cpm}
Frequência: {frequencia}
Alcance: {reach}

CONTAS:
{lista_contas}

TAREFA — gere exatamente 3 insights:

PASSO 1 — DIAGNÓSTICO CRÍTICO:
Identifique o problema ou oportunidade mais urgente
nos dados. Tipo: ALERTA. Foque na maior ineficiência
ou risco (CPL alto, frequência elevada, CTR baixo).

PASSO 2 — OPORTUNIDADE DE ESCALA:
Identifique qual conta ou métrica indica potencial
real de crescimento. Tipo: OPORTUNIDADE. Use números
concretos — não diga "aumentar orçamento", diga
"aumentar 30% o orçamento da conta X que tem CPL de
R$Y, 40% abaixo da média".

PASSO 3 — AÇÃO ESTRATÉGICA:
Uma observação relevante que não seja repetição dos
passos anteriores. Pode ser sobre criativo, frequência,
distribuição de verba ou tendência temporal.
Tipo: INFO ou ALERTA ou OPORTUNIDADE.

REGRAS ABSOLUTAS:
- Cada insight deve cobrir um aspecto DIFERENTE
- Use números reais dos dados fornecidos
- Nunca repita o mesmo ponto com palavras diferentes
- Seja específico para esta conta, não genérico
- Máximo 2 frases por mensagem
- Responda APENAS com JSON válido:
[{{"tipo":"ALERTA|OPORTUNIDADE|INFO","titulo":"máx 8 palavras","mensagem":"análise com números reais, máx 2 frases","acao":"ação concreta, máx 1 frase"}}]
"""


def calcular_hash_kpis(kpis: dict, contas: list[dict]) -> str:
    dados = {
        "spend": round(kpis.get("spend", 0), 2),
        "leads": kpis.get("leads", 0),
        "cpl": round(kpis.get("cpl", 0), 2),
    }
    return hashlib.md5(
        json.dumps(dados, sort_keys=True).encode()
    ).hexdigest()[:16]


def deve_regenerar(
    workspace_id: str,
    ads_account_id: str | None,
    dados_hash: str,
    db: Session,
) -> bool:
    if ads_account_id is None:
        row = db.execute(
            text("""
                SELECT gerado_em, dados_contexto->>'hash' AS hash
                FROM ai_insights
                WHERE workspace_id = CAST(:ws AS uuid)
                  AND ads_account_id IS NULL
                  AND NOT resolvido
                  AND expira_em > now()
                ORDER BY gerado_em DESC
                LIMIT 1
            """),
            {"ws": workspace_id},
        ).fetchone()
    else:
        row = db.execute(
            text("""
                SELECT gerado_em, dados_contexto->>'hash' AS hash
                FROM ai_insights
                WHERE ads_account_id = CAST(:acc AS uuid)
                  AND NOT resolvido
                  AND expira_em > now()
                ORDER BY gerado_em DESC
                LIMIT 1
            """),
            {"acc": ads_account_id},
        ).fetchone()

    if row is None:
        return True

    gerado_em: datetime = row[0]
    cached_hash: str | None = row[1]

    if gerado_em.tzinfo is None:
        gerado_em = gerado_em.replace(tzinfo=timezone.utc)

    if gerado_em < datetime.now(tz=timezone.utc) - timedelta(hours=CACHE_TTL_HOURS):
        return True

    if cached_hash != dados_hash:
        return True

    return False


def buscar_insights_vigentes(
    workspace_id: str,
    ads_account_id: str | None,
    db: Session,
) -> list[dict]:
    if ads_account_id is None:
        rows = db.execute(
            text("""
                SELECT id::text, tipo, titulo, mensagem, acao, gerado_em, ads_account_id
                FROM ai_insights
                WHERE workspace_id = CAST(:ws AS uuid)
                  AND ads_account_id IS NULL
                  AND NOT resolvido
                  AND expira_em > now()
                ORDER BY gerado_em DESC
                LIMIT 10
            """),
            {"ws": workspace_id},
        ).fetchall()
    else:
        rows = db.execute(
            text("""
                SELECT id::text, tipo, titulo, mensagem, acao, gerado_em, ads_account_id
                FROM ai_insights
                WHERE workspace_id = CAST(:ws AS uuid)
                  AND (ads_account_id = CAST(:acc AS uuid) OR ads_account_id IS NULL)
                  AND NOT resolvido
                  AND expira_em > now()
                ORDER BY gerado_em DESC
                LIMIT 10
            """),
            {"ws": workspace_id, "acc": ads_account_id},
        ).fetchall()

    return [_row_to_dict(r) for r in rows]


def buscar_todos_insights_vigentes(workspace_id: str, db: Session) -> list[dict]:
    rows = db.execute(
        text("""
            SELECT id::text, tipo, titulo, mensagem, acao, gerado_em, ads_account_id
            FROM ai_insights
            WHERE workspace_id = CAST(:ws AS uuid)
              AND NOT resolvido
              AND expira_em > now()
            ORDER BY
              CASE tipo
                WHEN 'ALERTA'      THEN 1
                WHEN 'OPORTUNIDADE' THEN 2
                ELSE 3
              END,
              gerado_em DESC
            LIMIT 10
        """),
        {"ws": workspace_id},
    ).fetchall()

    return [_row_to_dict(r) for r in rows]


def _row_to_dict(r) -> dict:
    tipo_raw = (r[1] or "info").lower()
    if tipo_raw == "alerta":
        severidade = "alerta"
    elif tipo_raw == "oportunidade":
        severidade = "oportunidade"
    else:
        severidade = "info"

    return {
        "id": r[0],
        "severidade": severidade,
        "tipo": r[1],
        "titulo": r[2],
        "mensagem": r[3],
        "acao": r[4] or "",
        "labelAcao": r[4] or "",
        "gerado_em": r[5].isoformat() if r[5] else None,
        "anuncioId": "",
        "analiseCompleta": r[3],
    }


def _chamar_openai(prompt: str) -> tuple[list[dict], dict]:
    """Devolve (insights, usage). usage vazio em falha/sem chave."""
    from app.core.ai_config import get_ai_config

    cfg = get_ai_config("insights")
    api_key = cfg.api_key
    if not api_key:
        log.warning("[ia_insights] chave de IA (insights) não configurada")
        return [], {}

    base_url = cfg.base_url
    model = cfg.model

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key, base_url=base_url)
    except ImportError:
        log.error("[ia_insights] openai package não instalado")
        return [], {}

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=6000,
        )
        usage = resp.usage.model_dump() if getattr(resp, "usage", None) else {}
        content = resp.choices[0].message.content or "[]"
        if "```" in content:
            parts = content.split("```")
            content = parts[1] if len(parts) > 1 else content
            if content.startswith("json"):
                content = content[4:]
        parsed = json.loads(content.strip())
        return (parsed if isinstance(parsed, list) else []), usage
    except Exception as exc:
        log.error("[ia_insights] erro OpenAI: %s", exc)
        return [], {}


def gerar_e_salvar_insights(
    workspace_id: str,
    ads_account_id: str | None,
    kpis: dict,
    contas: list[dict],
    data_inicio: str,
    data_fim: str,
    db: Session,
) -> list[dict]:
    dados_hash = calcular_hash_kpis(kpis, contas)

    if not deve_regenerar(workspace_id, ads_account_id, dados_hash, db):
        log.info("[ia_insights] cache hit para acc=%s", ads_account_id)
        return buscar_insights_vigentes(workspace_id, ads_account_id, db)

    log.info("[ia_insights] regenerando insights para acc=%s", ads_account_id)

    account_name = "Workspace geral"
    if ads_account_id and contas:
        match = next((c for c in contas if c.get("ads_account_id") == ads_account_id), None)
        if match:
            account_name = match.get("account_name") or account_name
        else:
            account_name = contas[0].get("account_name") or account_name

    lista_contas = "\n".join(
        f"- {c.get('account_name', c.get('account_id', '?'))}: "
        f"R${c.get('spend', 0):.2f} gasto, {c.get('leads', 0)} leads, "
        f"CPL R${c.get('cpl', 0):.2f}, CTR {c.get('ctr', 0):.2f}%"
        for c in contas[:5]
    )

    prompt = PROMPT_GESTOR.format(
        account_name=account_name,
        data_inicio=data_inicio,
        data_fim=data_fim,
        spend=f"{kpis.get('spend', 0):.2f}",
        leads=kpis.get("leads", 0),
        cpl=f"{kpis.get('cpl', 0):.2f}",
        ctr=f"{kpis.get('ctr', 0):.2f}",
        cpm=f"{kpis.get('cpm', 0):.2f}",
        frequencia=f"{kpis.get('frequencia', 0):.2f}",
        reach=kpis.get("reach", 0),
        lista_contas=lista_contas or "Sem dados de contas",
    )

    insights_raw, usage = _chamar_openai(prompt)
    if not insights_raw:
        return buscar_insights_vigentes(workspace_id, ads_account_id, db)

    from app.core.ai_config import get_ai_config
    modelo_usado = get_ai_config("insights").model

    # Telemetria de consumo (Fase 2) — best-effort, sessão própria.
    from app.services.ai_usage import registrar_uso
    registrar_uso(
        feature="insights",
        workspace_id=workspace_id,
        model=modelo_usado,
        kind="text",
        usage=usage,
    )

    expira_em = datetime.now(tz=timezone.utc) + timedelta(hours=CACHE_TTL_HOURS)
    dados_contexto = json.dumps({"hash": dados_hash, "kpis": {
        "spend": round(kpis.get("spend", 0), 2),
        "leads": kpis.get("leads", 0),
        "cpl": round(kpis.get("cpl", 0), 2),
    }})

    for item in insights_raw:
        tipo = (item.get("tipo") or "INFO").upper()
        titulo = (item.get("titulo") or "")[:150]
        mensagem = item.get("mensagem") or ""
        acao = item.get("acao") or ""

        db.execute(
            text("""
                INSERT INTO ai_insights
                    (workspace_id, ads_account_id, modulo, tipo, titulo,
                     mensagem, acao, dados_contexto, dados_hash, expira_em, model_usado)
                VALUES
                    (CAST(:ws AS uuid), CAST(:acc AS uuid), 'meta_ads', :tipo, :titulo,
                     :mensagem, :acao, CAST(:ctx AS jsonb), :hash, :expira, :model_usado)
            """),
            {
                "ws": workspace_id,
                "acc": ads_account_id,
                "tipo": tipo,
                "titulo": titulo,
                "mensagem": mensagem,
                "acao": acao,
                "ctx": dados_contexto,
                "hash": dados_hash,
                "expira": expira_em,
                "model_usado": modelo_usado,
            },
        )

    db.commit()
    return buscar_insights_vigentes(workspace_id, ads_account_id, db)


# Legacy shim — kept for backward compatibility with old callers
def gerar_insights_meta(kpis: dict, contas: list[dict]) -> list[dict]:
    raise RuntimeError("Use gerar_e_salvar_insights instead")
