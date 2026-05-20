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


# ── Schemas ──────────────────────────────────────────────────────────

class PlanIn(BaseModel):
    workspace_id: uuid.UUID
    client_name: str
    title: str
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def check_dates(self):
        if self.start_date > self.end_date:
            raise ValueError("start_date deve ser <= end_date")
        return self


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

    @model_validator(mode="after")
    def check_fields(self):
        if self.phase not in FASES_VALIDAS:
            raise ValueError(f"phase inválida: {self.phase}")
        if self.category not in CATEGORIAS_VALIDAS:
            raise ValueError(f"category inválida: {self.category}")
        if self.start_date > self.end_date:
            raise ValueError("start_date deve ser <= end_date")
        return self


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


# ── Plans ─────────────────────────────────────────────────────────────

@router.post("/plans", status_code=status.HTTP_201_CREATED)
def criar_plano(
    body: PlanIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    verificar_acesso_workspace(usuario, body.workspace_id, db)
    row = db.execute(
        text("""
            INSERT INTO public.pmp_plans
                (workspace_id, client_name, title, start_date, end_date, created_by)
            VALUES
                (:ws, :cn, :t, :sd, :ed, :cb)
            RETURNING id, workspace_id, client_name, title, version, start_date,
                      end_date, status, created_at, updated_at
        """),
        {
            "ws": body.workspace_id,
            "cn": body.client_name,
            "t": body.title,
            "sd": body.start_date,
            "ed": body.end_date,
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
                   start_date, end_date, status, created_at, updated_at
            FROM public.pmp_plans
            WHERE workspace_id = :ws
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
                   start_date, end_date, status,
                   insights_cache, insights_updated_at,
                   created_at, updated_at
            FROM public.pmp_plans WHERE id = :id
        """),
        {"id": plan_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Plano não encontrado")
    verificar_acesso_workspace(usuario, row["workspace_id"], db)
    return dict(row)


# ── Tasks ─────────────────────────────────────────────────────────────

@router.post("/plans/{plan_id}/tasks", status_code=status.HTTP_201_CREATED)
def criar_tarefa(
    plan_id: uuid.UUID,
    body: TaskIn,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    plan = db.execute(
        text("SELECT workspace_id FROM public.pmp_plans WHERE id = :id"),
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
                 start_date, end_date, display_order, created_by)
            VALUES
                (:ws, :pid, :ph, :t, :desc,
                 :resp_id, :resp_email, :cat,
                 :sd, :ed, :ord, :cb)
            RETURNING id, workspace_id, plan_id, phase, title, description,
                      responsible_id, responsible_email, category, status,
                      start_date, end_date, completed_at, blocked_reason,
                      display_order, created_at, updated_at
        """),
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
        text("SELECT workspace_id FROM public.pmp_plans WHERE id = :id"),
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
            SELECT id, workspace_id, plan_id, phase, title, description,
                   responsible_id, responsible_email, category, status,
                   start_date, end_date, completed_at, blocked_reason,
                   display_order, created_at, updated_at
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
    body: TaskStatusUpdate,
    usuario: User = Depends(get_usuario_atual),
    db: Session = Depends(get_db),
):
    row = db.execute(
        text("""
            SELECT t.id, t.workspace_id FROM public.pmp_tasks t
            WHERE t.id = :tid AND t.plan_id = :pid AND t.ativo = true
        """),
        {"tid": task_id, "pid": plan_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    verificar_acesso_workspace(usuario, row["workspace_id"], db)

    updated = db.execute(
        text("""
            UPDATE public.pmp_tasks
            SET status = :s,
                completed_at = :ca,
                blocked_reason = :br,
                updated_at = NOW()
            WHERE id = :tid
            RETURNING id, status, completed_at, blocked_reason, updated_at
        """),
        {
            "s": body.status,
            "ca": body.completed_at,
            "br": body.blocked_reason,
            "tid": task_id,
        },
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
