"""Provisionamento lazy dos painéis padrão (sistema) de cada workspace.

São dois painéis criados automaticamente, cada um com a fase fixa "Entrada":
  - recepcionamento_leads  — todo lead que chega num canal vira card aqui.
  - leads_sem_resposta     — conversas com saída sem resposta há >2h.

Idempotente: usa o índice único parcial uq_painel_workspace_tipo. Chamar com
commit=False quando já estiver dentro de uma transação (ex.: hook na fila).
"""
import uuid

from sqlalchemy.orm import Session

from app.models.crm.painel import Painel, PainelFase

FASE_ENTRADA = "Entrada"

# (tipo, nome, ordem)
PAINEIS_PADRAO: list[tuple[str, str, int]] = [
    ("recepcionamento_leads", "Recepcionamento Leads", 0),
    ("leads_sem_resposta", "Leads sem Resposta", 1),
]

# Fases iniciais por tipo (a primeira é sempre a fixa "Entrada").
FASES_INICIAIS: dict[str, list[tuple[str, str]]] = {
    "recepcionamento_leads": [
        (FASE_ENTRADA, "#22c55e"),
        ("Em Atendimento", "#3b82f6"),
        ("Negociação", "#a855f7"),
        ("Convertido", "#16a34a"),
        ("Perdido", "#ef4444"),
    ],
    "leads_sem_resposta": [
        (FASE_ENTRADA, "#f59e0b"),
        ("Reabordado", "#3b82f6"),
        ("Recuperado", "#16a34a"),
        ("Descartado", "#ef4444"),
    ],
}


def fase_entrada(painel: Painel) -> PainelFase | None:
    """Retorna a fase fixa 'Entrada' do painel (1ª fase, fixa=True)."""
    fases = sorted(
        [f for f in painel.fases if f.ativo],
        key=lambda f: f.ordem,
    )
    for f in fases:
        if f.fixa or f.nome.strip().lower() == FASE_ENTRADA.lower():
            return f
    return fases[0] if fases else None


def ensure_paineis_padrao(
    db: Session,
    workspace_id: uuid.UUID | str,
    *,
    commit: bool = False,
) -> list[Painel]:
    """Garante que os 2 painéis padrão existam no workspace. Retorna-os."""
    ws_id = uuid.UUID(str(workspace_id)) if not isinstance(workspace_id, uuid.UUID) else workspace_id

    existentes = {
        p.tipo: p
        for p in db.query(Painel)
        .filter(Painel.workspace_id == ws_id, Painel.ativo.is_(True))
        .all()
        if p.tipo != "custom"
    }

    criados = False
    for tipo, nome, ordem in PAINEIS_PADRAO:
        if tipo in existentes:
            continue
        painel = Painel(
            workspace_id=ws_id,
            nome=nome,
            tipo=tipo,
            sistema=True,
            automacao_ativa=True,
            bloqueado=False,
            ordem=ordem,
        )
        db.add(painel)
        db.flush()
        for idx, (fase_nome, cor) in enumerate(FASES_INICIAIS[tipo]):
            db.add(
                PainelFase(
                    workspace_id=ws_id,
                    painel_id=painel.id,
                    nome=fase_nome,
                    cor=cor,
                    ordem=idx,
                    fixa=(idx == 0),
                )
            )
        existentes[tipo] = painel
        criados = True

    if criados and commit:
        db.commit()

    return [existentes[t] for t, _, _ in PAINEIS_PADRAO if t in existentes]
