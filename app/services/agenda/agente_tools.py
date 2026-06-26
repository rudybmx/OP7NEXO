"""Ferramentas (tool-calling) que o agente de IA usa para mexer na Agenda dentro da conversa.

Princípios:
- O MODELO só passa campos de negócio (data, serviço, nome). O EXECUTOR injeta `workspace_id`
  e o `telefone` da conversa — o modelo NUNCA os fornece (multi-tenant + vínculo por telefone).
- As tools só são oferecidas se o workspace tem ≥1 agenda com `agente_agendamento != 'desativado'`.
- Erros de domínio viram `{"erro": "..."}` (não quebram o loop): o agente explica ao cliente.

Ver docs/specs/agenda-agente-tools/.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.crm.agenda import Agenda, AgendaServico, Agendamento
from app.services.agenda import agendamento as agendamento_svc
from app.services.agenda.disponibilidade import STATUS_OCUPANTES, calcular_disponibilidade
from app.services.agenda.telefone import canonical_phone_digits

# ─── Schemas das 5 ferramentas (formato OpenAI tool/function) ───────────────────
TOOLS_SCHEMA: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "consultar_disponibilidade",
            "description": (
                "Lista os horários LIVRES de uma agenda numa data. Use antes de marcar para "
                "oferecer opções ao cliente. Respeita expediente, almoço, bloqueios e capacidade."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "data": {"type": "string", "description": "Data desejada no formato AAAA-MM-DD."},
                    "agenda_nome": {"type": "string", "description": "Nome da agenda/profissional. Omita se só houver uma."},
                    "servico_nome": {"type": "string", "description": "Serviço desejado (define a duração do horário)."},
                },
                "required": ["data"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "buscar_agendamentos_contato",
            "description": "Lista os agendamentos (próximos) do cliente desta conversa. Use para remarcar/cancelar ou informar.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "criar_agendamento",
            "description": (
                "Marca um agendamento para o cliente desta conversa. Só chame quando tiver data/hora "
                "e (se houver mais de uma agenda) qual agenda. NÃO peça o telefone — já é o da conversa."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "cliente_nome": {"type": "string", "description": "Nome de quem será atendido."},
                    "data_hora": {"type": "string", "description": "Início no formato AAAA-MM-DD HH:MM (horário local da agenda)."},
                    "agenda_nome": {"type": "string", "description": "Nome da agenda/profissional. Omita se só houver uma."},
                    "servico_nome": {"type": "string", "description": "Serviço/procedimento (define a duração)."},
                    "para_terceiro": {"type": "boolean", "description": "true se o agendamento é para OUTRA pessoa, não o dono da conversa."},
                    "paciente_nome": {"type": "string", "description": "Nome do paciente quando para_terceiro=true."},
                    "observacoes": {"type": "string", "description": "Observações livres."},
                },
                "required": ["cliente_nome", "data_hora"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reagendar_agendamento",
            "description": "Remarca um agendamento do cliente desta conversa para um novo horário.",
            "parameters": {
                "type": "object",
                "properties": {
                    "nova_data_hora": {"type": "string", "description": "Novo início AAAA-MM-DD HH:MM (horário local da agenda)."},
                    "agendamento_ref": {"type": "string", "description": "Data/hora atual do agendamento a remarcar (AAAA-MM-DD HH:MM), se o cliente tiver mais de um."},
                },
                "required": ["nova_data_hora"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "cancelar_agendamento",
            "description": "Cancela um agendamento do cliente desta conversa.",
            "parameters": {
                "type": "object",
                "properties": {
                    "motivo": {"type": "string", "description": "Motivo do cancelamento (opcional)."},
                    "agendamento_ref": {"type": "string", "description": "Data/hora do agendamento a cancelar (AAAA-MM-DD HH:MM), se houver mais de um."},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "confirmar_presenca",
            "description": "Confirma a presença do cliente no próximo agendamento (marca como confirmado). Use quando o cliente confirmar que vai comparecer (ex.: responder 'sim', 'confirmo', 'estarei lá').",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]

_NOMES_TOOLS = {t["function"]["name"] for t in TOOLS_SCHEMA}


# ─── Gate + contexto p/ o system prompt ─────────────────────────────────────────
def _agendas_agendaveis(
    db: Session, workspace_id: uuid.UUID, agenda_ids: set[uuid.UUID] | None = None
) -> list[Agenda]:
    """Agendas ativas do workspace cuja autonomia permite o agente agendar.

    `agenda_ids` (Fase 6, multi-clínica): se vier, restringe às agendas vinculadas ao agente.
    None/vazio = todas do workspace (fallback compatível: agente sem vínculo atende todas).
    """
    q = db.query(Agenda).filter(
        Agenda.workspace_id == workspace_id,
        Agenda.ativo.is_(True),
        Agenda.agente_agendamento != "desativado",
    )
    if agenda_ids:
        q = q.filter(Agenda.id.in_(agenda_ids))
    return q.order_by(Agenda.nome.asc()).all()


def tools_para_workspace(
    db: Session, workspace_id: uuid.UUID, agenda_ids: set[uuid.UUID] | None = None
) -> tuple[list[dict], str | None]:
    """(schemas, bloco_de_contexto) se houver agenda agendável; senão ([], None).

    `agenda_ids` restringe às agendas vinculadas ao agente (multi-clínica); None = todas.
    """
    agendas = _agendas_agendaveis(db, workspace_id, agenda_ids)
    if not agendas:
        return [], None

    modos = {a.agente_agendamento for a in agendas}
    # Comportamento de autonomia (se todas pedem confirmação, instrui a confirmar antes de gravar)
    if modos == {"direto"}:
        regra = "Você pode marcar/remarcar/cancelar diretamente quando tiver os dados necessários."
    elif "direto" not in modos:
        regra = "Antes de GRAVAR um agendamento, confirme o horário exato com o cliente na conversa (ex.: 'Posso confirmar para terça às 14h?') e só então use a ferramenta."
    else:
        regra = "Em geral confirme o horário com o cliente antes de gravar; algumas agendas permitem marcar direto."

    ids_no_escopo = {a.id for a in agendas}
    servicos = (
        db.query(AgendaServico)
        .filter(
            AgendaServico.workspace_id == workspace_id,
            AgendaServico.ativo.is_(True),
            or_(AgendaServico.agenda_id.in_(ids_no_escopo), AgendaServico.agenda_id.is_(None)),
        )
        .order_by(AgendaServico.nome.asc())
        .all()
    )
    linhas = [
        "",
        "## AGENDA — você marca/consulta agendamentos usando FERRAMENTAS (tool-calling).",
        "REGRA CRÍTICA: sempre que o cliente falar em horário, agendar, marcar, remarcar, cancelar ou "
        "confirmar consulta, você DEVE CHAMAR a ferramenta apropriada (consultar_disponibilidade, "
        "criar_agendamento, reagendar_agendamento, cancelar_agendamento, buscar_agendamentos_contato) "
        "ANTES de responder. É PROIBIDO dizer 'vou verificar', 'um momento', 'deixa eu checar' ou "
        "inventar horários sem antes chamar a ferramenta e usar o resultado dela. Primeiro a ferramenta, "
        "depois a resposta ao cliente com base no que ela retornou.",
        regra,
        "",
        "Agendas disponíveis:",
    ]
    for a in agendas:
        linhas.append(f"- {a.nome} ({a.tipo})")
    if servicos:
        linhas.append("Serviços (com duração):")
        for s in servicos:
            linhas.append(f"- {s.nome} ({s.duracao_minutos} min)")
    linhas.append("O telefone do cliente já é o da conversa — não peça.")
    return TOOLS_SCHEMA, "\n".join(linhas)


# ─── Helpers de resolução ───────────────────────────────────────────────────────
def _parse_dt_local(valor: str, fuso: str) -> datetime:
    """Interpreta 'AAAA-MM-DD HH:MM' (ou ISO) no fuso da agenda → datetime AWARE."""
    s = (valor or "").strip().replace("T", " ")
    fmt = "%Y-%m-%d %H:%M:%S" if s.count(":") >= 2 else "%Y-%m-%d %H:%M"
    dt = datetime.strptime(s[:19] if s.count(":") >= 2 else s[:16], fmt)
    return dt.replace(tzinfo=ZoneInfo(fuso))


def _resolver_agenda(
    db: Session, workspace_id: uuid.UUID, nome: str | None, agenda_ids: set[uuid.UUID] | None = None
) -> Agenda | list[Agenda]:
    """Agenda agendável pelo nome; se nome None e só houver uma, devolve-a; se ambíguo, devolve a lista.

    `agenda_ids` restringe ao escopo do agente (multi-clínica) — a resolução ('Dr. Gumercindo')
    casa só dentro das agendas vinculadas.
    """
    agendas = _agendas_agendaveis(db, workspace_id, agenda_ids)
    if not agendas:
        return []
    if nome:
        alvo = nome.strip().lower()
        exatas = [a for a in agendas if a.nome.strip().lower() == alvo]
        if exatas:
            return exatas[0]
        contidas = [a for a in agendas if alvo in a.nome.strip().lower()]
        if len(contidas) == 1:
            return contidas[0]
        return contidas or agendas
    if len(agendas) == 1:
        return agendas[0]
    return agendas


def _resolver_servico(db: Session, workspace_id: uuid.UUID, agenda_id: uuid.UUID, nome: str | None) -> AgendaServico | None:
    if not nome:
        return None
    alvo = nome.strip().lower()
    servicos = (
        db.query(AgendaServico)
        .filter(
            AgendaServico.workspace_id == workspace_id,
            AgendaServico.ativo.is_(True),
            or_(AgendaServico.agenda_id == agenda_id, AgendaServico.agenda_id.is_(None)),
        )
        .all()
    )
    exatos = [s for s in servicos if s.nome.strip().lower() == alvo]
    if exatos:
        return exatos[0]
    contidos = [s for s in servicos if alvo in s.nome.strip().lower()]
    return contidos[0] if len(contidos) == 1 else None


def _agendamentos_futuros_do_contato(
    db: Session, workspace_id: uuid.UUID, tel_norm: str | None, agenda_ids: set[uuid.UUID] | None = None
) -> list[Agendamento]:
    if not tel_norm:
        return []
    q = db.query(Agendamento).filter(
        Agendamento.workspace_id == workspace_id,
        Agendamento.ativo.is_(True),
        Agendamento.status.in_(STATUS_OCUPANTES),
        Agendamento.data_hora_inicio >= datetime.now(timezone.utc),
        or_(
            Agendamento.cliente_telefone_normalizado == tel_norm,
            Agendamento.agendado_por_telefone_normalizado == tel_norm,
        ),
    )
    if agenda_ids:  # multi-clínica: o agente só mexe nos agendamentos das suas agendas
        q = q.filter(Agendamento.agenda_id.in_(agenda_ids))
    return q.order_by(Agendamento.data_hora_inicio.asc()).all()


def _fmt_local(dt: datetime, fuso: str) -> dict:
    loc = dt.astimezone(ZoneInfo(fuso))
    return {"data": loc.strftime("%d/%m/%Y"), "hora": loc.strftime("%H:%M")}


def _match_ref(ags: list[Agendamento], ref: str | None, fuso: str) -> Agendamento | None:
    """Casa um agendamento pela referência de data/hora do cliente (tolerante)."""
    if not ags:
        return None
    if ref is None:
        return ags[0] if len(ags) == 1 else None
    alvo = "".join(ch for ch in ref if ch.isdigit())
    for a in ags:
        loc = a.data_hora_inicio.astimezone(ZoneInfo(fuso))
        chave = loc.strftime("%Y%m%d%H%M")
        if alvo and (alvo in chave or chave[:8] == alvo[:8]):
            return a
    return None


# ─── Executor ───────────────────────────────────────────────────────────────────
def executar_tool(
    db: Session, *, workspace_id: uuid.UUID, telefone: str | None, nome: str, args: dict,
    agenda_ids: set[uuid.UUID] | None = None,
) -> dict:
    """Executa uma tool. Retorna um dict JSON-serializável (resultado p/ realimentar o modelo).

    `agenda_ids` = escopo do agente (multi-clínica); None = todas as agendas do workspace.
    """
    if nome not in _NOMES_TOOLS:
        return {"erro": f"ferramenta desconhecida: {nome}"}
    tel_norm = canonical_phone_digits(telefone)
    try:
        if nome == "consultar_disponibilidade":
            return _tool_consultar(db, workspace_id, args, agenda_ids)
        if nome == "buscar_agendamentos_contato":
            return _tool_buscar(db, workspace_id, tel_norm, agenda_ids)
        if nome == "criar_agendamento":
            return _tool_criar(db, workspace_id, telefone, args, agenda_ids)
        if nome == "reagendar_agendamento":
            return _tool_reagendar(db, workspace_id, tel_norm, args, agenda_ids)
        if nome == "cancelar_agendamento":
            return _tool_cancelar(db, workspace_id, tel_norm, args, agenda_ids)
        if nome == "confirmar_presenca":
            return _tool_confirmar(db, workspace_id, tel_norm, agenda_ids)
    except agendamento_svc.AgendaError as exc:
        return {"erro": str(exc)}
    except Exception as exc:  # noqa: BLE001 — não envenenar a transação do agente
        try:
            db.rollback()
        except Exception:
            pass
        return {"erro": f"falha ao executar {nome}: {exc}"}
    return {"erro": "ferramenta não tratada"}


def _exigir_agenda(db, workspace_id, nome, agenda_ids=None) -> tuple[Agenda | None, dict | None]:
    ag = _resolver_agenda(db, workspace_id, nome, agenda_ids)
    if isinstance(ag, Agenda):
        return ag, None
    opcoes = [a.nome for a in ag]
    if not opcoes:
        return None, {"erro": "Não há agenda disponível para agendamento neste momento."}
    return None, {"erro": "Há mais de uma agenda; pergunte ao cliente qual.", "agendas": opcoes}


def _tool_consultar(db: Session, workspace_id, args: dict, agenda_ids=None) -> dict:
    ag, err = _exigir_agenda(db, workspace_id, args.get("agenda_nome"), agenda_ids)
    if err:
        return err
    data_str = (args.get("data") or "").strip()
    try:
        data = datetime.strptime(data_str[:10], "%Y-%m-%d").date()
    except ValueError:
        return {"erro": "data inválida; use AAAA-MM-DD"}
    serv = _resolver_servico(db, workspace_id, ag.id, args.get("servico_nome"))
    dur = serv.duracao_minutos if serv else None
    res = calcular_disponibilidade(db, workspace_id=workspace_id, agenda_id=ag.id, data=data, duracao_min=dur)
    if res is None:
        return {"erro": "agenda não encontrada"}
    horarios = [s["inicio"].astimezone(ZoneInfo(ag.fuso_horario)).strftime("%H:%M") for s in res["slots"]]
    return {
        "agenda": ag.nome,
        "data": data.strftime("%d/%m/%Y"),
        "servico": serv.nome if serv else None,
        "horarios_livres": horarios,
        "total": len(horarios),
    }


def _tool_buscar(db: Session, workspace_id, tel_norm: str | None, agenda_ids=None) -> dict:
    ags = _agendamentos_futuros_do_contato(db, workspace_id, tel_norm, agenda_ids)
    proximos = []
    for a in ags:
        f = _fmt_local(a.data_hora_inicio, a.agenda.fuso_horario if a.agenda else "America/Sao_Paulo")
        proximos.append({**f, "servico": a.servico, "agenda": a.agenda.nome if a.agenda else None, "status": a.status})
    return {"proximos": proximos, "total": len(proximos)}


def _tool_criar(db: Session, workspace_id, telefone: str | None, args: dict, agenda_ids=None) -> dict:
    ag, err = _exigir_agenda(db, workspace_id, args.get("agenda_nome"), agenda_ids)
    if err:
        return err
    if not args.get("cliente_nome"):
        return {"erro": "informe o nome de quem será atendido"}
    if not args.get("data_hora"):
        return {"erro": "informe a data e hora"}
    try:
        inicio = _parse_dt_local(args["data_hora"], ag.fuso_horario)
    except (ValueError, TypeError):
        return {"erro": "data_hora inválida; use AAAA-MM-DD HH:MM"}
    serv = _resolver_servico(db, workspace_id, ag.id, args.get("servico_nome"))
    dur = serv.duracao_minutos if serv else 30
    fim = inicio + timedelta(minutes=dur)
    para_terceiro = bool(args.get("para_terceiro"))
    nome_final = (args.get("paciente_nome") or args.get("cliente_nome")) if para_terceiro else args.get("cliente_nome")
    obs = args.get("observacoes")
    if para_terceiro:
        obs = (obs + " | " if obs else "") + "Agendamento para terceiro (marcado por outra pessoa)."
    novo = agendamento_svc.criar_agendamento(
        db,
        workspace_id=workspace_id,
        agenda_id=ag.id,
        cliente_nome=nome_final,
        data_hora_inicio=inicio,
        data_hora_fim=fim,
        cliente_telefone=None if para_terceiro else telefone,
        servico=serv.nome if serv else args.get("servico_nome"),
        servico_id=serv.id if serv else None,
        observacoes=obs,
        origem="agente",
        criado_por="agente",
        para_terceiro=para_terceiro,
        agendado_por_telefone=telefone,
    )
    return {"ok": True, "agendamento": {**_fmt_local(novo.data_hora_inicio, ag.fuso_horario), "servico": novo.servico, "agenda": ag.nome}}


def _tool_reagendar(db: Session, workspace_id, tel_norm: str | None, args: dict, agenda_ids=None) -> dict:
    ags = _agendamentos_futuros_do_contato(db, workspace_id, tel_norm, agenda_ids)
    if not ags:
        return {"erro": "o cliente não tem agendamento futuro para remarcar"}
    fuso = ags[0].agenda.fuso_horario if ags[0].agenda else "America/Sao_Paulo"
    alvo = _match_ref(ags, args.get("agendamento_ref"), fuso)
    if alvo is None:
        return {"erro": "há mais de um agendamento; peça a data/hora atual do que será remarcado", "agendamentos": [_fmt_local(a.data_hora_inicio, fuso) for a in ags]}
    try:
        novo_ini = _parse_dt_local(args["nova_data_hora"], alvo.agenda.fuso_horario if alvo.agenda else fuso)
    except (ValueError, TypeError, KeyError):
        return {"erro": "nova_data_hora inválida; use AAAA-MM-DD HH:MM"}
    dur = int((alvo.data_hora_fim - alvo.data_hora_inicio).total_seconds() // 60) or 30
    novo = agendamento_svc.reagendar(db, alvo, data_hora_inicio=novo_ini, data_hora_fim=novo_ini + timedelta(minutes=dur), cancelado_por="agente")
    return {"ok": True, "de": _fmt_local(alvo.data_hora_inicio, fuso), "para": _fmt_local(novo.data_hora_inicio, fuso)}


def _tool_cancelar(db: Session, workspace_id, tel_norm: str | None, args: dict, agenda_ids=None) -> dict:
    ags = _agendamentos_futuros_do_contato(db, workspace_id, tel_norm, agenda_ids)
    if not ags:
        return {"erro": "o cliente não tem agendamento futuro para cancelar"}
    fuso = ags[0].agenda.fuso_horario if ags[0].agenda else "America/Sao_Paulo"
    alvo = _match_ref(ags, args.get("agendamento_ref"), fuso)
    if alvo is None:
        return {"erro": "há mais de um agendamento; peça a data/hora do que será cancelado", "agendamentos": [_fmt_local(a.data_hora_inicio, fuso) for a in ags]}
    agendamento_svc.cancelar(db, alvo, motivo=args.get("motivo"), cancelado_por="agente")
    return {"ok": True, "cancelado": _fmt_local(alvo.data_hora_inicio, fuso)}


def _tool_confirmar(db: Session, workspace_id, tel_norm: str | None, agenda_ids=None) -> dict:
    ags = _agendamentos_futuros_do_contato(db, workspace_id, tel_norm, agenda_ids)
    if not ags:
        return {"erro": "o cliente não tem agendamento futuro para confirmar"}
    alvo = ags[0]
    fuso = alvo.agenda.fuso_horario if alvo.agenda else "America/Sao_Paulo"
    agendamento_svc.atualizar_status(db, alvo, status="confirmado")
    return {"ok": True, "confirmado": _fmt_local(alvo.data_hora_inicio, fuso)}
