import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import exigir_platform_admin, get_usuario_atual, verificar_acesso_workspace
from app.models.ads_account import AdsAccount
from app.models.ads_account_workspace_access import AdsAccountWorkspaceAccess
from app.models.user import User
from app.models.workspace import Workspace
from app.services.ads_account_access import carregar_workspace_acessos_por_conta, listar_ads_accounts_acessiveis

router = APIRouter(tags=["ads_accounts"])


class WorkspaceResumoOut(BaseModel):
    id: str
    nome: str

    model_config = {"from_attributes": True}


class AdsAccountCreateIn(BaseModel):
    plataforma: str
    account_id: str
    account_name: str | None = None
    token_acesso: str | None = None
    bm_id: str | None = None
    status: str = "ativo"
    config: dict = Field(default_factory=dict)
    agrupamento: str | None = None
    workspace_ids_acesso: list[str] = Field(default_factory=list)
    sync_paused: bool = False


class AdsAccountUpdateIn(BaseModel):
    plataforma: str | None = None
    account_id: str | None = None
    account_name: str | None = None
    token_acesso: str | None = None
    bm_id: str | None = None
    status: str | None = None
    config: dict | None = None
    agrupamento: str | None = None
    workspace_ids_acesso: list[str] | None = None
    sync_paused: bool | None = None


class AdsAccountOut(BaseModel):
    id: str
    workspace_id: str
    workspace_nome: str | None = None
    workspace_acessos: list[WorkspaceResumoOut] = Field(default_factory=list)
    plataforma: str
    account_id: str
    account_name: str | None
    nome: str | None = None
    meta_account_name: str | None = None
    bm_id: str | None
    status: str
    ativo: bool = True
    sync_paused: bool = False
    config: dict = Field(default_factory=dict)
    sincronizado_em: str | None = None
    periodo_sync_inicio: str | None = None
    agrupamento: str | None = None

    model_config = {"from_attributes": True}

def _ads_account_out(
    a: AdsAccount,
    workspace_nome: str | None = None,
    workspace_acessos: list[WorkspaceResumoOut] | None = None,
) -> AdsAccountOut:
    return AdsAccountOut(
        id=str(a.id),
        workspace_id=str(a.workspace_id),
        workspace_nome=workspace_nome,
        workspace_acessos=workspace_acessos or [],
        plataforma=a.plataforma,
        account_id=a.account_id,
        account_name=a.account_name,
        nome=a.account_name,
        meta_account_name=a.meta_account_name,
        bm_id=a.bm_id,
        status=a.status,
        config=a.config or {},
        sincronizado_em=a.sincronizado_em.isoformat() if a.sincronizado_em else None,
        periodo_sync_inicio=a.periodo_sync_inicio.isoformat() if a.periodo_sync_inicio else None,
        agrupamento=a.agrupamento,
        ativo=a.ativo,
        sync_paused=a.sync_paused,
    )


def _workspace_nomes_por_ids(db: Session, workspace_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    if not workspace_ids:
        return {}
    rows = db.query(Workspace).filter(Workspace.id.in_(workspace_ids)).all()
    return {w.id: w.nome for w in rows}


def _workspace_accessos_por_conta(
    db: Session,
    ads_account_ids: list[uuid.UUID],
) -> dict[uuid.UUID, list[WorkspaceResumoOut]]:
    acessos = carregar_workspace_acessos_por_conta(db, ads_account_ids)
    return {
        ads_account_id: [WorkspaceResumoOut(**workspace) for workspace in workspaces]
        for ads_account_id, workspaces in acessos.items()
    }


def _normalizar_workspace_ids_acesso(
    workspace_ids_acesso: list[str] | None,
    owner_workspace_id: uuid.UUID,
    db: Session,
) -> list[uuid.UUID]:
    if workspace_ids_acesso is None:
        return []

    selecionados: set[uuid.UUID] = set()
    for workspace_id in workspace_ids_acesso:
        if not workspace_id:
            continue
        try:
            selecionados.add(uuid.UUID(str(workspace_id)))
        except (TypeError, ValueError):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Workspace inválido: {workspace_id}")

    selecionados.add(owner_workspace_id)

    workspaces = db.query(Workspace.id).filter(Workspace.id.in_(selecionados)).all()
    encontrados = {row[0] for row in workspaces}
    faltantes = selecionados - encontrados
    if faltantes:
        faltantes_str = ", ".join(str(ws) for ws in sorted(faltantes, key=str))
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Workspace não encontrado: {faltantes_str}")

    return [ws_id for ws_id in selecionados if ws_id != owner_workspace_id]


def _sincronizar_acessos_ads_account(
    db: Session,
    ads_account: AdsAccount,
    workspace_ids_acesso: list[str] | None,
) -> list[uuid.UUID] | None:
    if workspace_ids_acesso is None:
        return None

    workspace_ids_normalizados = _normalizar_workspace_ids_acesso(workspace_ids_acesso, ads_account.workspace_id, db)

    existentes = {
        row[0]
        for row in db.query(AdsAccountWorkspaceAccess.workspace_id).filter(
            AdsAccountWorkspaceAccess.ads_account_id == ads_account.id,
        ).all()
    }
    desejados = set(workspace_ids_normalizados)
    removidos = existentes - desejados
    adicionados = desejados - existentes

    if removidos:
        db.query(AdsAccountWorkspaceAccess).filter(
            AdsAccountWorkspaceAccess.ads_account_id == ads_account.id,
            AdsAccountWorkspaceAccess.workspace_id.in_(removidos),
        ).delete(synchronize_session=False)

    for workspace_id in adicionados:
        db.add(
            AdsAccountWorkspaceAccess(
                ads_account_id=ads_account.id,
                workspace_id=workspace_id,
            )
        )

    return workspace_ids_normalizados


def _get_ads_account_or_404(ads_account_id: uuid.UUID, db: Session) -> AdsAccount:
    a = db.query(AdsAccount).filter(AdsAccount.id == ads_account_id).first()
    if not a:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conta ads não encontrada")
    return a


def _get_workspace_or_404(workspace_id: uuid.UUID, db: Session) -> Workspace:
    w = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not w:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace não encontrado")
    return w


@router.get("/ads-accounts", response_model=list[AdsAccountOut])
def listar_todas_ads_accounts(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    contas = listar_ads_accounts_acessiveis(db, None, include_inactive=include_inactive)
    workspace_ids = {a.workspace_id for a in contas}
    workspaces = _workspace_nomes_por_ids(db, workspace_ids)
    workspace_acessos = _workspace_accessos_por_conta(db, [a.id for a in contas])
    return [_ads_account_out(a, workspaces.get(a.workspace_id), workspace_acessos.get(a.id)) for a in contas]


@router.get("/meta/ads-accounts", response_model=list[AdsAccountOut])
def listar_todas_ads_accounts_meta(
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    contas = listar_ads_accounts_acessiveis(db, None, include_inactive=include_inactive)
    workspace_ids = {a.workspace_id for a in contas}
    workspaces = _workspace_nomes_por_ids(db, workspace_ids)
    workspace_acessos = _workspace_accessos_por_conta(db, [a.id for a in contas])
    return [_ads_account_out(a, workspaces.get(a.workspace_id), workspace_acessos.get(a.id)) for a in contas]


@router.get("/workspaces/{workspace_id}/ads-accounts", response_model=list[AdsAccountOut])
def listar_ads_accounts(
    workspace_id: uuid.UUID,
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    _get_workspace_or_404(workspace_id, db)
    verificar_acesso_workspace(usuario, workspace_id, db)
    contas = listar_ads_accounts_acessiveis(db, workspace_id, include_inactive=include_inactive)
    workspace_ids = {a.workspace_id for a in contas}
    workspaces = _workspace_nomes_por_ids(db, workspace_ids)
    workspace_acessos = _workspace_accessos_por_conta(db, [a.id for a in contas])
    return [_ads_account_out(a, workspaces.get(a.workspace_id), workspace_acessos.get(a.id)) for a in contas]


@router.post(
    "/workspaces/{workspace_id}/ads-accounts",
    response_model=AdsAccountOut,
    status_code=status.HTTP_201_CREATED,
)
def criar_ads_account(
    workspace_id: uuid.UUID,
    payload: AdsAccountCreateIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    _get_workspace_or_404(workspace_id, db)
    verificar_acesso_workspace(usuario, workspace_id, db)

    duplicado = db.query(AdsAccount).filter(
        AdsAccount.plataforma == payload.plataforma,
        AdsAccount.account_id == payload.account_id,
    ).first()
    if duplicado:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Conta já cadastrada para esta plataforma",
        )

    a = AdsAccount(
        workspace_id=workspace_id,
        plataforma=payload.plataforma,
        account_id=payload.account_id,
        account_name=payload.account_name,
        meta_account_name=payload.account_name if payload.plataforma == "meta" else None,
        token_acesso=payload.token_acesso,
        bm_id=payload.bm_id,
        status=payload.status,
        config=payload.config,
        sync_paused=payload.sync_paused,
    )
    db.add(a)
    db.flush()
    _sincronizar_acessos_ads_account(db, a, payload.workspace_ids_acesso)
    db.commit()
    db.refresh(a)
    workspace_nome = db.query(Workspace.nome).filter(Workspace.id == a.workspace_id).scalar()
    workspace_acessos = _workspace_accessos_por_conta(db, [a.id]).get(a.id, [])
    return _ads_account_out(a, workspace_nome, workspace_acessos)


@router.put("/ads-accounts/{ads_account_id}", response_model=AdsAccountOut)
def atualizar_ads_account(
    ads_account_id: uuid.UUID,
    payload: AdsAccountUpdateIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    a = _get_ads_account_or_404(ads_account_id, db)

    if payload.plataforma is not None and payload.plataforma != a.plataforma:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Plataforma não pode ser alterada")
    if payload.account_id is not None and payload.account_id != a.account_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account ID não pode ser alterado")

    if payload.account_name is not None:
        a.account_name = payload.account_name
    if payload.token_acesso is not None:
        a.token_acesso = payload.token_acesso
    if payload.bm_id is not None:
        a.bm_id = payload.bm_id
    if payload.status is not None:
        a.status = payload.status
    if payload.config is not None:
        a.config = payload.config
    if payload.agrupamento is not None:
        a.agrupamento = payload.agrupamento
    if payload.sync_paused is not None:
        a.sync_paused = payload.sync_paused
    _sincronizar_acessos_ads_account(db, a, payload.workspace_ids_acesso)
    db.commit()
    db.refresh(a)
    workspace_acessos = _workspace_accessos_por_conta(db, [a.id]).get(a.id, [])
    workspace_nome = db.query(Workspace.nome).filter(Workspace.id == a.workspace_id).scalar()
    return _ads_account_out(a, workspace_nome, workspace_acessos)


@router.delete("/ads-accounts/{ads_account_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_ads_account(
    ads_account_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(exigir_platform_admin),
):
    a = _get_ads_account_or_404(ads_account_id, db)
    db.delete(a)
    db.commit()


class AdsAccountToggleOut(BaseModel):
    id: str
    ativo: bool
    nome: str | None


@router.patch("/meta/ads-accounts/{ads_account_id}/toggle", response_model=AdsAccountToggleOut)
def toggle_ads_account(
    ads_account_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(exigir_platform_admin),
):
    a = _get_ads_account_or_404(ads_account_id, db)
    a.ativo = not a.ativo
    db.commit()
    db.refresh(a)
    return AdsAccountToggleOut(id=str(a.id), ativo=a.ativo, nome=a.account_name)
