"""Rotas de PMP — Plano de Marketing Personalizado."""

import uuid
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, model_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_usuario_atual, verificar_acesso_workspace
from app.models.user import User

router = APIRouter(prefix="/pmp", tags=["pmp"])

FASES_VALIDAS = {"diagnostico", "identidade", "conteudo", "midia-paga", "analise"}
CATEGORIAS_VALIDAS = {"MIDIA_PAGA", "CONTEUDO", "SEO", "EVENTO", "REUNIAO", "EMAIL_MARKETING", "SOCIAL", "OUTRO"}
STATUS_VALIDOS = {"TODO", "IN_PROGRESS", "DONE", "BLOCKED"}
PRIORIDADES_VALIDAS = {"baixa", "media", "alta"}

# Projeção padrão de plano (sem insights_cache para listas; incluída em obter_plano)
_PLAN_COLS = """
    id, workspace_id, client_name, title, version,
    start_date, end_date, status, unidade_id, ativo,
    created_at, updated_at
"""

# Projeção completa de tarefa
_TASK_COLS = """
    id, workspace_id, plan_id, phase, title, description,
    responsible_id, responsible_email, category, status,
    start_date, end_date, completed_at, blocked_reason,
    display_order, prioridade, ativo, created_at, updated_at
"""


# ── Schemas ──────────────────────────────────────────────────────────

class PlanIn(BaseModel):
    workspace_id: uuid.UUID
    client_name: str
    title: str
    start_date: date
    end_date: date
    unidade_id: Optional[uuid.UUID] = None

    @model_validator(mode="after")
    def check_dates(self):
        if self.start_date > self.end_date:
            raise ValueError("start_date deve ser <= end_date")
        return self


class PlanUpdate(BaseModel):
    client_name: Optional[str] = None
    title: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    unidade_id: Optional[uuid.UUID] = None  # pass None to clear

    @model_validator(mode="after")
    def check_dates(self):
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date deve ser <= end_date")
        return self


class UnidadeIn(BaseModel):
    nome: str


class TaskIn(BaseModel):
    phase: str
    title: str
    category: str
    start_date: date
    end_date: date
    description: Optional[str] = None
    responsible_id: Optional[uuid.UUID] = None
    responsible_email: Optional[str] = None
    display_order: int = 0
    prioridade: str = "media"

    @model_validator(mode="after")
    def check_fields(self):
        if self.phase not in FASES_VALIDAS:
            raise ValueError(f"phase inválida: {self.phase}")
        if self.category not in CATEGORIAS_VALIDAS:
            raise ValueError(f"category inválida: {self.category}")
        if self.prioridade not in PRIORIDADES_VALIDAS:
            raise ValueError(f"prioridade inválida: {self.prioridade}")
        if self.start_date > self.end_date:
            raise ValueError("start_date deve ser <= end_date")
        return self


class TaskUpdate(BaseModel):
    """Todos os campos são opcionais — suporta tanto atualização parcial de status
    (retrocompat com o drawer) quanto edição completa da tarefa."""
    phase: Optional[str] = None
    title: Optional[str] = None
    category: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    description: Optional[str] = None
    responsible_email: Optional[str] = None
    display_order: Optional[int] = None
    prioridade: Optional[str] = None
    status: Optional[str] = None
    completed_at: Optional[datetime] = None
    blocked_reason: Optional[str] = None

    @model_validator(mode="after")
    def check_fields(self):
        if self.phase is not None and self.phase not in FASES_VALIDAS:
            raise ValueError(f"phase inválida: {self.phase}")
        if self.category is not None and self.category not in CATEGORIAS_VALIDAS:
            raise ValueError(f"category inválida: {self.category}")
        if self.prioridade is not None and self.prioridade not in PRIORIDADES_VALIDAS:
            raise ValueError(f"prioridade inválida: {self.prioridade}")
        if self.status is not None and self.status not in STATUS_VALIDOS:
            raise ValueError(f"status inválido: {self.status}")
        if self.status == "DONE" and not self.completed_at:
            raise ValueError("completed_at obrigatório ao concluir tarefa")
        if self.status == "BLOCKED" and not self.blocked_reason:
            raise ValueError("blocked_reason obrigatório ao bloquear tarefa")
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date deve ser <= end_date")
        return self


# Mantido para compatibilidade — não exposto como body de rota, mas
# o TypeScript pode enviar apenas {status, completed_at, blocked_reason}
# via TaskUpdate e funciona porque todos os campos são opcionais.
class TaskStatusUpdate(BaseModel):
    status: str
    completed_at: Optional[datetime] = None
    blocked_reason: Optional[str] = None

    @model_validator(mode="after")
    def check_status_rules(self):
        if self.status not in STATUS_VALIDOS:
            raise ValueError(f"status inválido: {self.status}")
        if self.status == "DONE" and not self.completed_at:
            raise ValueError("completed_at obrigatório ao concluir tarefa")
        if self.status == "BLOCKED" and not self.blocked_reason:
            raise ValueError("blocked_reason obrigatório ao bloquear tarefa")
        return self


class CheckinIn(BaseModel):
    response: str
    note: Optional[str] = None

    @model_validator(mode="after")
    def check_response(self):
        if self.response not in {"ON_TRACK", "NEEDS_ATTENTION", "BLOCKED"}:
            raise ValueError(f"response inválida: {self.response}")
        return self


# ── Helpers ───────────────────────────────────────────────────────────

def _get_plan_or_404(plan_id: uuid.UUID, db: Session, require_ativo: bool = True):
    """Carrega o plano e levanta 404 se não encontrado (ou inativo)."""
    where = "WHERE id = :id AND ativo = true" if require_ativo else "WHERE id = :id"
    row = db.execute(
        text(f"SELECT * FROM public.pmp_plans {where}"),
        {"id": plan_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    return row


# ── Unidades ──────────────────────────────────────────────────────────

@router.get("/workspaces/{workspace_id}/unidades")
def listar_unidades(
    workspace_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    verificar_acesso_workspace(usuario, workspace_id, db)
    rows = db.execute(
        text("""
            SELECT id, workspace_id, nome, ativo, created_at, updated_at
            FROM public.pmp_unidades
            WHERE workspace_id = :ws AND ativo = true
            ORDER BY nome ASC
        """),
        {"ws": workspace_id},
    ).mappings().all()
    return [dict(r) for r in rows]


@router.post("/workspaces/{workspace_id}/unidades", status_code=status.HTTP_201_CREATED)
def criar_unidade(
    workspace_id: uuid.UUID,
    body: UnidadeIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    verificar_acesso_workspace(usuario, workspace_id, db)
    row = db.execute(
        text("""
            INSERT INTO public.pmp_unidades (workspace_id, nome)
            VALUES (:ws, :nome)
            RETURNING id, workspace_id, nome, ativo, created_at, updated_at
        """),
        {"ws": workspace_id, "nome": body.nome.strip()},
    ).mappings().one()
    db.commit()
    return dict(row)


@router.patch("/unidades/{unidade_id}")
def atualizar_unidade(
    unidade_id: uuid.UUID,
    body: UnidadeIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text("SELECT workspace_id FROM public.pmp_unidades WHERE id = :id AND ativo = true"),
        {"id": unidade_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Unidade não encontrada")
    verificar_acesso_workspace(usuario, row["workspace_id"], db)

    updated = db.execute(
        text("""
            UPDATE public.pmp_unidades
            SET nome = :nome, updated_at = NOW()
            WHERE id = :id
            RETURNING id, workspace_id, nome, ativo, created_at, updated_at
        """),
        {"nome": body.nome.strip(), "id": unidade_id},
    ).mappings().one()
    db.commit()
    return dict(updated)


@router.delete("/unidades/{unidade_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_unidade(
    unidade_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text("SELECT workspace_id FROM public.pmp_unidades WHERE id = :id AND ativo = true"),
        {"id": unidade_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Unidade não encontrada")
    verificar_acesso_workspace(usuario, row["workspace_id"], db)

    db.execute(
        text("UPDATE public.pmp_unidades SET ativo = false, updated_at = NOW() WHERE id = :id"),
        {"id": unidade_id},
    )
    db.commit()


# ── Plans ─────────────────────────────────────────────────────────────

@router.post("/plans", status_code=status.HTTP_201_CREATED)
def criar_plano(
    body: PlanIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    verificar_acesso_workspace(usuario, body.workspace_id, db)

    # Validar unidade_id pertence ao mesmo workspace (se informada)
    if body.unidade_id:
        u = db.execute(
            text("SELECT id FROM public.pmp_unidades WHERE id = :id AND workspace_id = :ws AND ativo = true"),
            {"id": body.unidade_id, "ws": body.workspace_id},
        ).mappings().first()
        if not u:
            raise HTTPException(status_code=400, detail="unidade_id inválida para este workspace")

    row = db.execute(
        text("""
            INSERT INTO public.pmp_plans
                (workspace_id, client_name, title, start_date, end_date, unidade_id, created_by)
            VALUES
                (:ws, :cn, :t, :sd, :ed, :uid, :cb)
            RETURNING id, workspace_id, client_name, title, version,
                      start_date, end_date, status, unidade_id, ativo, created_at, updated_at
        """),
        {
            "ws": body.workspace_id,
            "cn": body.client_name,
            "t": body.title,
            "sd": body.start_date,
            "ed": body.end_date,
            "uid": body.unidade_id,
            "cb": usuario.id,
        },
    ).mappings().one()
    db.commit()
    return dict(row)


@router.get("/plans")
def listar_planos(
    workspace_id: uuid.UUID = Query(...),
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    verificar_acesso_workspace(usuario, workspace_id, db)
    rows = db.execute(
        text("""
            SELECT id, workspace_id, client_name, title, version,
                   start_date, end_date, status, unidade_id, ativo, created_at, updated_at
            FROM public.pmp_plans
            WHERE workspace_id = :ws AND ativo = true
            ORDER BY created_at DESC
        """),
        {"ws": workspace_id},
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/plans/{plan_id}")
def obter_plano(
    plan_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text("""
            SELECT id, workspace_id, client_name, title, version,
                   start_date, end_date, status, unidade_id, ativo,
                   insights_cache, insights_updated_at,
                   created_at, updated_at
            FROM public.pmp_plans
            WHERE id = :id AND ativo = true
        """),
        {"id": plan_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    verificar_acesso_workspace(usuario, row["workspace_id"], db)
    return dict(row)


@router.patch("/plans/{plan_id}")
def atualizar_plano(
    plan_id: uuid.UUID,
    body: PlanUpdate,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    plan = _get_plan_or_404(plan_id, db)
    verificar_acesso_workspace(usuario, plan["workspace_id"], db)

    # Validar datas cruzadas (campo individual enviado + valor existente)
    sd = body.start_date or plan["start_date"]
    ed = body.end_date or plan["end_date"]
    if sd > ed:
        raise HTTPException(status_code=422, detail="start_date deve ser <= end_date")

    # Validar unidade_id pertence ao workspace (se enviada)
    if body.unidade_id is not None:
        u = db.execute(
            text("SELECT id FROM public.pmp_unidades WHERE id = :id AND workspace_id = :ws AND ativo = true"),
            {"id": body.unidade_id, "ws": plan["workspace_id"]},
        ).mappings().first()
        if not u:
            raise HTTPException(status_code=400, detail="unidade_id inválida para este workspace")

    # UPDATE dinâmico — só campos enviados
    sets = ["updated_at = NOW()"]
    params: dict = {"id": plan_id}
    if body.client_name is not None:
        sets.append("client_name = :client_name")
        params["client_name"] = body.client_name.strip()
    if body.title is not None:
        sets.append("title = :title")
        params["title"] = body.title.strip()
    if body.start_date is not None:
        sets.append("start_date = :start_date")
        params["start_date"] = body.start_date
    if body.end_date is not None:
        sets.append("end_date = :end_date")
        params["end_date"] = body.end_date
    # unidade_id: None no body = não enviado; precisamos distinguir "não enviar" de "limpar"
    # Usamos model_fields_set do Pydantic para detectar se foi explicitamente enviado
    if "unidade_id" in body.model_fields_set:
        sets.append("unidade_id = :unidade_id")
        params["unidade_id"] = body.unidade_id  # pode ser None (limpar)

    updated = db.execute(
        text(f"""
            UPDATE public.pmp_plans
            SET {', '.join(sets)}
            WHERE id = :id
            RETURNING id, workspace_id, client_name, title, version,
                      start_date, end_date, status, unidade_id, ativo,
                      insights_cache, insights_updated_at, created_at, updated_at
        """),
        params,
    ).mappings().one()
    db.commit()
    return dict(updated)


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_plano(
    plan_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    plan = _get_plan_or_404(plan_id, db)
    verificar_acesso_workspace(usuario, plan["workspace_id"], db)
    db.execute(
        text("UPDATE public.pmp_plans SET ativo = false, updated_at = NOW() WHERE id = :id"),
        {"id": plan_id},
    )
    db.commit()


@router.post("/plans/{plan_id}/duplicate", status_code=status.HTTP_201_CREATED)
def duplicar_plano(
    plan_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    plan = _get_plan_or_404(plan_id, db)
    verificar_acesso_workspace(usuario, plan["workspace_id"], db)

    # Inserir plano novo
    novo_plano = db.execute(
        text("""
            INSERT INTO public.pmp_plans
                (workspace_id, client_name, title, start_date, end_date,
                 unidade_id, version, status, ativo, created_by)
            VALUES
                (:ws, :cn, :title, :sd, :ed,
                 :uid, '1.0', 'TODO', true, :cb)
            RETURNING id, workspace_id, client_name, title, version,
                      start_date, end_date, status, unidade_id, ativo,
                      insights_cache, insights_updated_at, created_at, updated_at
        """),
        {
            "ws": plan["workspace_id"],
            "cn": plan["client_name"],
            "title": plan["title"] + " (cópia)",
            "sd": plan["start_date"],
            "ed": plan["end_date"],
            "uid": plan.get("unidade_id"),
            "cb": usuario.id,
        },
    ).mappings().one()

    novo_plan_id = novo_plano["id"]

    # Copiar tarefas ativas, resetando status
    db.execute(
        text("""
            INSERT INTO public.pmp_tasks
                (workspace_id, plan_id, phase, title, description,
                 responsible_email, category, start_date, end_date,
                 display_order, prioridade, status, ativo, created_by)
            SELECT
                workspace_id, :novo_plan_id, phase, title, description,
                responsible_email, category, start_date, end_date,
                display_order, prioridade, 'TODO', true, :cb
            FROM public.pmp_tasks
            WHERE plan_id = :origem_id AND ativo = true
        """),
        {
            "novo_plan_id": novo_plan_id,
            "cb": usuario.id,
            "origem_id": plan_id,
        },
    )

    db.commit()
    return dict(novo_plano)


# ── Tasks ─────────────────────────────────────────────────────────────

@router.post("/plans/{plan_id}/tasks", status_code=status.HTTP_201_CREATED)
def criar_tarefa(
    plan_id: uuid.UUID,
    body: TaskIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    plan = db.execute(
        text("SELECT workspace_id FROM public.pmp_plans WHERE id = :id AND ativo = true"),
        {"id": plan_id},
    ).mappings().first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    verificar_acesso_workspace(usuario, plan["workspace_id"], db)

    row = db.execute(
        text("""
            INSERT INTO public.pmp_tasks
                (workspace_id, plan_id, phase, title, description,
                 responsible_id, responsible_email, category,
                 start_date, end_date, display_order, prioridade, created_by)
            VALUES
                (:ws, :pid, :ph, :t, :desc,
                 :resp_id, :resp_email, :cat,
                 :sd, :ed, :ord, :prio, :cb)
            RETURNING """ + _TASK_COLS,
        ),
        {
            "ws": plan["workspace_id"],
            "pid": plan_id,
            "ph": body.phase,
            "t": body.title,
            "desc": body.description,
            "resp_id": body.responsible_id,
            "resp_email": body.responsible_email,
            "cat": body.category,
            "sd": body.start_date,
            "ed": body.end_date,
            "ord": body.display_order,
            "prio": body.prioridade,
            "cb": usuario.id,
        },
    ).mappings().one()
    db.commit()
    return dict(row)


@router.get("/plans/{plan_id}/tasks")
def listar_tarefas(
    plan_id: uuid.UUID,
    status_filter: Optional[str] = Query(None, alias="status"),
    phase: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    plan = db.execute(
        text("SELECT workspace_id FROM public.pmp_plans WHERE id = :id AND ativo = true"),
        {"id": plan_id},
    ).mappings().first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    verificar_acesso_workspace(usuario, plan["workspace_id"], db)

    filters = "AND ativo = true"
    params: dict = {"pid": plan_id}
    if status_filter:
        filters += " AND status = :status"
        params["status"] = status_filter
    if phase:
        filters += " AND phase = :phase"
        params["phase"] = phase
    if category:
        filters += " AND category = :category"
        params["category"] = category

    rows = db.execute(
        text(f"""
            SELECT {_TASK_COLS}
            FROM public.pmp_tasks
            WHERE plan_id = :pid {filters}
            ORDER BY display_order ASC, created_at ASC
        """),
        params,
    ).mappings().all()
    return [dict(r) for r in rows]


@router.patch("/plans/{plan_id}/tasks/{task_id}")
def atualizar_tarefa(
    plan_id: uuid.UUID,
    task_id: uuid.UUID,
    body: TaskUpdate,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text("""
            SELECT t.id, t.workspace_id, t.start_date, t.end_date
            FROM public.pmp_tasks t
            WHERE t.id = :tid AND t.plan_id = :pid AND t.ativo = true
        """),
        {"tid": task_id, "pid": plan_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    verificar_acesso_workspace(usuario, row["workspace_id"], db)

    # Validar datas cruzadas com valores existentes quando só um lado vier
    sd = body.start_date or row["start_date"]
    ed = body.end_date or row["end_date"]
    if sd > ed:
        raise HTTPException(status_code=422, detail="start_date deve ser <= end_date")

    # UPDATE dinâmico — só os campos enviados
    sets = ["updated_at = NOW()"]
    params: dict = {"tid": task_id}

    field_map = {
        "phase": "phase",
        "title": "title",
        "category": "category",
        "start_date": "start_date",
        "end_date": "end_date",
        "description": "description",
        "responsible_email": "responsible_email",
        "display_order": "display_order",
        "prioridade": "prioridade",
        "status": "status",
        "completed_at": "completed_at",
        "blocked_reason": "blocked_reason",
    }
    for field, col in field_map.items():
        val = getattr(body, field)
        if val is not None:
            sets.append(f"{col} = :{field}")
            params[field] = val

    # Zerar completed_at quando status muda para fora de DONE (comportamento antigo)
    if body.status is not None and body.status != "DONE":
        sets = [s for s in sets if not s.startswith("completed_at")]
        params.pop("completed_at", None)
        sets.append("completed_at = NULL")

    updated = db.execute(
        text(f"""
            UPDATE public.pmp_tasks
            SET {', '.join(sets)}
            WHERE id = :tid
            RETURNING {_TASK_COLS}
        """),
        params,
    ).mappings().one()
    db.commit()
    return dict(updated)


@router.delete("/plans/{plan_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_tarefa(
    plan_id: uuid.UUID,
    task_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text("""
            SELECT t.workspace_id FROM public.pmp_tasks t
            WHERE t.id = :tid AND t.plan_id = :pid AND t.ativo = true
        """),
        {"tid": task_id, "pid": plan_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    verificar_acesso_workspace(usuario, row["workspace_id"], db)

    db.execute(
        text("UPDATE public.pmp_tasks SET ativo = false, updated_at = NOW() WHERE id = :tid"),
        {"tid": task_id},
    )
    db.commit()


# ── Check-ins ─────────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/checkin", status_code=status.HTTP_201_CREATED)
def fazer_checkin(
    task_id: uuid.UUID,
    body: CheckinIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    task = db.execute(
        text("SELECT workspace_id FROM public.pmp_tasks WHERE id = :id AND ativo = true"),
        {"id": task_id},
    ).mappings().first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    verificar_acesso_workspace(usuario, task["workspace_id"], db)

    row = db.execute(
        text("""
            INSERT INTO public.pmp_task_checkins (workspace_id, task_id, user_id, response, note)
            VALUES (:ws, :tid, :uid, :r, :n)
            RETURNING id, task_id, user_id, response, note, created_at
        """),
        {
            "ws": task["workspace_id"],
            "tid": task_id,
            "uid": usuario.id,
            "r": body.response,
            "n": body.note,
        },
    ).mappings().one()
    db.commit()
    return dict(row)


@router.get("/tasks/{task_id}/checkins")
def listar_checkins(
    task_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    task = db.execute(
        text("SELECT workspace_id FROM public.pmp_tasks WHERE id = :id AND ativo = true"),
        {"id": task_id},
    ).mappings().first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    verificar_acesso_workspace(usuario, task["workspace_id"], db)

    rows = db.execute(
        text("""
            SELECT c.id, c.response, c.note, c.created_at,
                   u.nome as user_name
            FROM public.pmp_task_checkins c
            LEFT JOIN public.users u ON u.id = c.user_id
            WHERE c.task_id = :tid
            ORDER BY c.created_at DESC
        """),
        {"tid": task_id},
    ).mappings().all()
    return [dict(r) for r in rows]


# ── Notificações ──────────────────────────────────────────────────────

@router.get("/notifications")
def listar_notificacoes(
    workspace_id: uuid.UUID = Query(...),
    unread: bool = Query(False),
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    verificar_acesso_workspace(usuario, workspace_id, db)
    extra = "AND n.read_at IS NULL" if unread else ""
    rows = db.execute(
        text(f"""
            SELECT n.id, n.task_id, n.type, n.sent_at, n.read_at, n.channel, n.payload,
                   t.title as task_title
            FROM public.pmp_notifications n
            LEFT JOIN public.pmp_tasks t ON t.id = n.task_id
            WHERE n.user_id = :uid AND n.workspace_id = :ws {extra}
            ORDER BY n.sent_at DESC
            LIMIT 50
        """),
        {"uid": usuario.id, "ws": workspace_id},
    ).mappings().all()
    return [dict(r) for r in rows]


@router.post("/notifications/{notification_id}/read")
def marcar_lida(
    notification_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    db.execute(
        text("""
            UPDATE public.pmp_notifications
            SET read_at = NOW()
            WHERE id = :id AND user_id = :uid AND read_at IS NULL
        """),
        {"id": notification_id, "uid": usuario.id},
    )
    db.commit()
    return {"ok": True}
