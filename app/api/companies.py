import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_usuario_atual, verificar_acesso_company
from app.models.company import Company
from app.models.network import Network
from app.models.user import RoleUsuario, User
from app.models.user_company_access import UserCompanyAccess
from app.schemas.company import CompanyIn, CompanyOut

router = APIRouter(tags=["companies"])

def _company_out(c: Company) -> CompanyOut:
    return CompanyOut(
        id=str(c.id),
        network_id=str(c.network_id),
        nome=c.nome,
        slug=c.slug,
        cidade=c.cidade,
        estado=c.estado,
        telefone=c.telefone,
        ativo=c.ativo,
    )

def _get_company_or_404(company_id: uuid.UUID, db: Session) -> Company:
    c = db.query(Company).filter(Company.id == company_id).first()
    if not c:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company não encontrada")
    return c

def _get_network_or_404(network_id: uuid.UUID, db: Session) -> Network:
    n = db.query(Network).filter(Network.id == network_id, Network.ativo.is_(True)).first()
    if not n:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Network não encontrada")
    return n

def _verificar_acesso_network(usuario: User, network_id: uuid.UUID) -> None:
    if usuario.role == RoleUsuario.platform_admin:
        return
    if usuario.network_id != network_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem acesso a esta network")

def _companies_visiveis(usuario: User, network_id: uuid.UUID, db: Session) -> list[Company]:
    base = db.query(Company).filter(Company.network_id == network_id, Company.ativo.is_(True))

    if usuario.role == RoleUsuario.platform_admin:
        return base.all()

    if usuario.role == RoleUsuario.network_admin:
        if usuario.network_id != network_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem acesso a esta network")
        return base.all()

    # network_viewer, company_admin, company_agent — filtra por user_company_access
    acessos = db.query(UserCompanyAccess.company_id).filter(
        UserCompanyAccess.usuario_id == usuario.id
    ).subquery()
    return base.filter(Company.id.in_(acessos)).all()

@router.get("/networks/{network_id}/companies", response_model=list[CompanyOut])
def listar_companies(
    network_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    _get_network_or_404(network_id, db)
    companies = _companies_visiveis(usuario, network_id, db)
    return [_company_out(c) for c in companies]

@router.post(
    "/networks/{network_id}/companies",
    response_model=CompanyOut,
    status_code=status.HTTP_201_CREATED,
)
def criar_company(
    network_id: uuid.UUID,
    payload: CompanyIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    _get_network_or_404(network_id, db)
    _verificar_acesso_network(usuario, network_id)

    if usuario.role not in (RoleUsuario.platform_admin, RoleUsuario.network_admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para criar company")

    if db.query(Company).filter(Company.slug == payload.slug).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug já existe")

    c = Company(
        network_id=network_id,
        nome=payload.nome,
        slug=payload.slug,
        cidade=payload.cidade,
        estado=payload.estado,
        telefone=payload.telefone,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _company_out(c)

@router.get("/companies/{company_id}", response_model=CompanyOut)
def detalhe_company(
    company_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    c = _get_company_or_404(company_id, db)
    verificar_acesso_company(usuario, company_id, db)
    return _company_out(c)

@router.put("/companies/{company_id}", response_model=CompanyOut)
def atualizar_company(
    company_id: uuid.UUID,
    payload: CompanyIn,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    c = _get_company_or_404(company_id, db)
    verificar_acesso_company(usuario, company_id, db)

    if usuario.role not in (RoleUsuario.platform_admin, RoleUsuario.network_admin, RoleUsuario.company_admin):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para editar company")

    conflito = db.query(Company).filter(Company.slug == payload.slug, Company.id != company_id).first()
    if conflito:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Slug já existe")

    c.nome = payload.nome
    c.slug = payload.slug
    c.cidade = payload.cidade
    c.estado = payload.estado
    c.telefone = payload.telefone
    db.commit()
    db.refresh(c)
    return _company_out(c)

@router.delete("/companies/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
def desativar_company(
    company_id: uuid.UUID,
    db: Session = Depends(get_db),
    usuario: User = Depends(get_usuario_atual),
):
    c = _get_company_or_404(company_id, db)

    if usuario.role == RoleUsuario.platform_admin:
        pass
    elif usuario.role == RoleUsuario.network_admin and usuario.network_id == c.network_id:
        pass
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão para desativar company")

    c.ativo = False
    db.commit()
