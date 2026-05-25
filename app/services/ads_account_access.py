from __future__ import annotations

import uuid
from collections import defaultdict
from typing import Iterable, Sequence

from sqlalchemy import or_, select
from sqlalchemy.orm import Query, Session

from app.models.ads_account import AdsAccount
from app.models.ads_account_workspace_access import AdsAccountWorkspaceAccess
from app.models.workspace import Workspace


def _base_query(
    db: Session,
    workspace_id: uuid.UUID | None,
    *,
    plataforma: str | None = None,
    include_inactive: bool = False,
) -> Query:
    q = db.query(AdsAccount)
    if workspace_id is not None:
        q = q.outerjoin(
            AdsAccountWorkspaceAccess,
            AdsAccountWorkspaceAccess.ads_account_id == AdsAccount.id,
        ).filter(
            or_(
                AdsAccount.workspace_id == workspace_id,
                AdsAccountWorkspaceAccess.workspace_id == workspace_id,
            )
        )
    if plataforma is not None:
        q = q.filter(AdsAccount.plataforma == plataforma)
    if not include_inactive:
        q = q.filter(AdsAccount.ativo.is_(True))
    return q.distinct()


def listar_ads_accounts_acessiveis(
    db: Session,
    workspace_id: uuid.UUID | None,
    *,
    plataforma: str | None = None,
    include_inactive: bool = False,
) -> list[AdsAccount]:
    contas = _base_query(
        db,
        workspace_id,
        plataforma=plataforma,
        include_inactive=include_inactive,
    ).all()
    return sorted(
        contas,
        key=lambda conta: (
            (conta.account_name or conta.account_id or "").lower(),
            conta.account_id.lower(),
        ),
    )


def listar_ads_account_ids_acessiveis(
    db: Session,
    workspace_id: uuid.UUID | None,
    *,
    ads_account_uuid: uuid.UUID | None = None,
    conta_ids: Sequence[str] | None = None,
    plataforma: str | None = None,
    include_inactive: bool = False,
) -> list[uuid.UUID]:
    q = _base_query(
        db,
        workspace_id,
        plataforma=plataforma,
        include_inactive=include_inactive,
    ).with_entities(AdsAccount.id)

    if ads_account_uuid is not None:
        q = q.filter(AdsAccount.id == ads_account_uuid)
    if conta_ids:
        conta_ids_filtrados = [item for item in conta_ids if item]
        if conta_ids_filtrados:
            q = q.filter(AdsAccount.account_id.in_(conta_ids_filtrados))

    return [row[0] for row in q.all()]


def carregar_workspace_acessos_por_conta(
    db: Session,
    ads_account_ids: Iterable[uuid.UUID],
) -> dict[uuid.UUID, list[dict[str, str]]]:
    ids = [uuid.UUID(str(item)) for item in ads_account_ids if item]
    if not ids:
        return {}

    rows = db.execute(
        select(
            AdsAccountWorkspaceAccess.ads_account_id,
            Workspace.id,
            Workspace.nome,
        )
        .join(Workspace, Workspace.id == AdsAccountWorkspaceAccess.workspace_id)
        .where(AdsAccountWorkspaceAccess.ads_account_id.in_(ids))
        .order_by(AdsAccountWorkspaceAccess.ads_account_id, Workspace.nome)
    ).all()

    acessos: dict[uuid.UUID, list[dict[str, str]]] = defaultdict(list)
    for ads_account_id, workspace_id, workspace_nome in rows:
        acessos[ads_account_id].append(
            {
                "id": str(workspace_id),
                "nome": workspace_nome,
            }
        )
    return dict(acessos)
