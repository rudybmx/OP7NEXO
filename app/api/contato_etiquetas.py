"""Vínculo etiqueta <-> contato (aplicar / remover).

Router separado do `/contatos` principal de propósito: NÃO usa o gate
`exigir_acesso_contatos` (tela de contatos). Marcar/desmarcar etiqueta de um
contato acontece no painel do Atendimento, então o acesso é controlado apenas
por workspace — mesmo padrão dos endpoints de etiqueta de conversa em
`conversas.py`. O isolamento multi-tenant é garantido por
`get_workspace_atual` + checagem `etiqueta.workspace_id == contato.workspace_id`.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_usuario_atual, get_workspace_atual, verificar_acesso_workspace
from app.models.crm import Contato
from app.models.crm.etiqueta import CrmEtiqueta
from app.models.user import User

router = APIRouter(prefix="/contatos", tags=["contatos"])


def _get_contato_or_404(
    contato_id: uuid.UUID,
    db: Session,
    workspace_filter: uuid.UUID | list | None,
) -> Contato:
    q = db.query(Contato).filter(Contato.id == contato_id, Contato.ativo.is_(True))
    if workspace_filter is not None:
        if isinstance(workspace_filter, list):
            q = q.filter(Contato.workspace_id.in_(workspace_filter))
        else:
            q = q.filter(Contato.workspace_id == workspace_filter)
    contato = q.first()
    if not contato:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contato não encontrado")
    return contato


@router.post("/{contato_id}/etiquetas/{etiqueta_id}", status_code=status.HTTP_204_NO_CONTENT)
def aplicar_etiqueta_no_contato(
    contato_id: uuid.UUID,
    etiqueta_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    contato = _get_contato_or_404(contato_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, contato.workspace_id, db)
    etiqueta = db.query(CrmEtiqueta).filter(
        CrmEtiqueta.id == etiqueta_id,
        CrmEtiqueta.workspace_id == contato.workspace_id,
        CrmEtiqueta.ativo.is_(True),
    ).first()
    if not etiqueta:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Etiqueta não encontrada")
    if etiqueta not in contato.etiquetas:
        contato.etiquetas.append(etiqueta)
        db.commit()
    return None


@router.delete("/{contato_id}/etiquetas/{etiqueta_id}", status_code=status.HTTP_204_NO_CONTENT)
def remover_etiqueta_do_contato(
    contato_id: uuid.UUID,
    etiqueta_id: uuid.UUID,
    usuario: User = Depends(get_usuario_atual),
    workspace_filter=Depends(get_workspace_atual),
    db: Session = Depends(get_db),
):
    contato = _get_contato_or_404(contato_id, db, workspace_filter)
    verificar_acesso_workspace(usuario, contato.workspace_id, db)
    etiqueta = db.query(CrmEtiqueta).filter(CrmEtiqueta.id == etiqueta_id).first()
    if etiqueta and etiqueta in contato.etiquetas:
        contato.etiquetas.remove(etiqueta)
        db.commit()
    return None
