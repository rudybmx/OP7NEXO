import json
import os


def gerar_insights_meta(kpis: dict, contas: list[dict]) -> list[dict]:
    api_key = os.getenv("OPENAI_API_KEY", "")
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    if not api_key:
        return []

    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key, base_url=base_url)
    except ImportError:
        return []

    contas_resumo = "\n".join(
        f"- {c.get('account_name', c.get('account_id', '?'))}: "
        f"R${c.get('spend', 0):.2f} gasto, {c.get('leads', 0)} leads, "
        f"CPL R${c.get('cpl', 0):.2f}, CTR {c.get('ctr', 0):.2f}%"
        for c in contas[:5]
    )

    prompt = (
        "Analise esses dados de Meta Ads e gere exatamente 3 insights em português. "
        "Para cada insight diga se é OPORTUNIDADE ou ALERTA, e uma ação recomendada. "
        "Responda APENAS com JSON válido no formato:\n"
        '[{"tipo":"OPORTUNIDADE","mensagem":"...","acao":"..."}]\n\n'
        f"KPIs do período:\n"
        f"- Gasto: R${kpis.get('spend', 0):.2f}\n"
        f"- Leads: {kpis.get('leads', 0)}\n"
        f"- CPL: R${kpis.get('cpl', 0):.2f}\n"
        f"- CTR: {kpis.get('ctr', 0):.2f}%\n"
        f"- CPC: R${kpis.get('cpc', 0):.2f}\n"
        f"- CPM: R${kpis.get('cpm', 0):.2f}\n"
        f"- Frequência: {kpis.get('frequencia', 0):.2f}\n\n"
        f"Contas:\n{contas_resumo}"
    )

    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=4000,
        )
        content = resp.choices[0].message.content or "[]"
        if "```" in content:
            parts = content.split("```")
            content = parts[1] if len(parts) > 1 else content
            if content.startswith("json"):
                content = content[4:]
        return json.loads(content.strip())
    except Exception as exc:
        print(f"[ia_insights] erro: {exc}")
        return []
