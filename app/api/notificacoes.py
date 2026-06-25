import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_usuario_atual, get_workspace_atual, verificar_acesso_workspace
from app.models.user import RoleUsuario, User
from app.services import notificacoes as svc

router = APIRouter(prefix="/notificacoes", tags=["notificacoes"])

_ROLES_ADMIN = {RoleUsuario.platform_admin, RoleUsuario.network_admin, RoleUsuario.company_admin}
_ROLES_VALIDOS = {r.value for r in RoleUsuario}
_TIPO_LABEL = {"canal_offline": "Canal caiu", "canal_online": "Canal reconectado", "mensagem_nova": "Mensagem nova"}


def _resolver_ws(workspace_id, workspace_filter) -> uuid.UUID:
    ws_id = workspace_id or (workspace_filter if not isinstance(workspace_filter, list) else None)
    if ws_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="workspace_id é obrigatório")
    return ws_id


class ConfigUpdate(BaseModel):
    ativo: bool = True
    audiencia_papeis: list[str] = []


# ─────────────────────────────── feed / sino ────────────────────────────────
@router.get("")
def listar(
    workspace_id: uuid.UUID | None = Query(None),
    tipo: str | None = Query(None),
    nao_lidas: bool = Query(False),
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolver_ws(workspace_id, workspace_filter)
    verificar_acesso_workspace(usuario, ws_id, db)
    return svc.listar(db, usuario, ws_id, tipo=tipo, apenas_nao_lidas=nao_lidas, limit=limit, offset=offset)


@router.get("/contador")
def contador(
    workspace_id: uuid.UUID | None = Query(None),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolver_ws(workspace_id, workspace_filter)
    verificar_acesso_workspace(usuario, ws_id, db)
    return {"nao_lidas": svc.contar_nao_lidas(db, usuario, ws_id)}


@router.post("/marcar-todas-lidas")
def marcar_todas(
    workspace_id: uuid.UUID | None = Query(None),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolver_ws(workspace_id, workspace_filter)
    verificar_acesso_workspace(usuario, ws_id, db)
    return {"marcadas": svc.marcar_todas(db, usuario, ws_id)}


@router.post("/{notificacao_id}/lida")
def marcar_lida(
    notificacao_id: uuid.UUID,
    workspace_id: uuid.UUID | None = Query(None),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolver_ws(workspace_id, workspace_filter)
    verificar_acesso_workspace(usuario, ws_id, db)
    return {"marcadas": svc.marcar_lida(db, usuario, ws_id, notificacao_id)}


# ─────────────────────────── configuração (admin) ───────────────────────────
@router.get("/config")
def listar_config(
    workspace_id: uuid.UUID | None = Query(None),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolver_ws(workspace_id, workspace_filter)
    verificar_acesso_workspace(usuario, ws_id, db)
    if usuario.role not in _ROLES_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a administradores")
    itens = []
    for tipo in svc.TIPOS_CONHECIDOS:
        ativo, audiencia = svc.resolver_audiencia(db, ws_id, tipo)
        itens.append({"tipo": tipo, "label": _TIPO_LABEL.get(tipo, tipo), "ativo": ativo, "audiencia_papeis": audiencia})
    return itens


@router.put("/config/{tipo}")
def atualizar_config(
    tipo: str,
    data: ConfigUpdate,
    workspace_id: uuid.UUID | None = Query(None),
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    ws_id = _resolver_ws(workspace_id, workspace_filter)
    verificar_acesso_workspace(usuario, ws_id, db)
    if usuario.role not in _ROLES_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a administradores")
    if tipo not in svc.TIPOS_CONHECIDOS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tipo de notificação desconhecido")
    papeis = [p for p in data.audiencia_papeis if p in _ROLES_VALIDOS]
    # Guard: audiência [] significa "todos" no filtro de leitura. Com o tipo ATIVO,
    # salvar [] exporia a notificação a todo mundo — cai para a audiência default do tipo.
    if data.ativo and not papeis:
        papeis = list(svc.DEFAULT_AUDIENCIA.get(tipo, []))
    import json
    db.execute(
        text(
            """
            INSERT INTO notificacao_config (workspace_id, tipo, ativo, audiencia_papeis, atualizado_em)
            VALUES (:ws, :tipo, :ativo, CAST(:aud AS jsonb), now())
            ON CONFLICT (workspace_id, tipo)
            DO UPDATE SET ativo = EXCLUDED.ativo,
                          audiencia_papeis = EXCLUDED.audiencia_papeis,
                          atualizado_em = now()
            """
        ),
        {"ws": str(ws_id), "tipo": tipo, "ativo": data.ativo, "aud": json.dumps(papeis)},
    )
    db.commit()
    return {"tipo": tipo, "ativo": data.ativo, "audiencia_papeis": papeis}
