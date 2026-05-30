from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import workspaces as workspaces_api
from app.models.user import RoleUsuario


class _Query:
    def __init__(self, rows: list[SimpleNamespace]):
        self._rows = rows

    def filter(self, *_args, **_kwargs):
        return self

    def all(self):
        return list(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None


class _FakeDb:
    def __init__(self, rows: list[SimpleNamespace] | None = None):
        self.rows = rows or []
        self.commits = 0
        self.refreshes: list[object] = []

    def query(self, _model):
        return _Query(self.rows)

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        self.refreshes.append(obj)


@pytest.fixture
def app():
    api = FastAPI()
    api.include_router(workspaces_api.router)
    return api


@pytest.fixture
def db():
    return _FakeDb()


@pytest.fixture
def client_factory(app, db):
    def _make(user, *, workspace_acesso=None):
        app.dependency_overrides[workspaces_api.get_db] = lambda: db
        app.dependency_overrides[workspaces_api.get_usuario_atual] = lambda: user
        app.dependency_overrides[workspaces_api.get_workspace_atual] = lambda: workspace_acesso
        return TestClient(app)

    yield _make
    app.dependency_overrides.clear()


def _workspace(
    *,
    workspace_id: uuid.UUID,
    nome: str = "Cliente Teste",
    razao_social: str | None = "Razão Social Teste",
    cnpj: str | None = "00.000.000/0001-00",
    ativo: bool = True,
):
    return SimpleNamespace(
        id=workspace_id,
        nome=nome,
        razao_social=razao_social,
        cnpj=cnpj,
        endereco={"logradouro": "Rua A", "numero": "10"},
        ativo=ativo,
    )


def test_get_workspaces_retorna_ativo(client_factory, db, monkeypatch):
    ws_ativo = _workspace(workspace_id=uuid.uuid4(), ativo=True)
    ws_inativo = _workspace(workspace_id=uuid.uuid4(), nome="Cliente Inativo", ativo=False)
    db.rows = [ws_ativo, ws_inativo]

    monkeypatch.setattr(workspaces_api, "_get_modulos", lambda workspace_id, _db: ["marketing"] if workspace_id == ws_ativo.id else [])

    user = SimpleNamespace(id=str(uuid.uuid4()), role=RoleUsuario.platform_admin)
    client = client_factory(user, workspace_acesso=None)

    response = client.get("/workspaces")

    assert response.status_code == 200
    body = response.json()
    assert body[0]["ativo"] is True
    assert body[1]["ativo"] is False
    assert body[0]["modulos"] == ["marketing"]


def test_put_workspace_persiste_campos_basicos(client_factory, db, monkeypatch):
    workspace = _workspace(workspace_id=uuid.uuid4())

    monkeypatch.setattr(workspaces_api, "_get_workspace_or_404", lambda _workspace_id, _db: workspace)
    monkeypatch.setattr(workspaces_api, "_get_modulos", lambda _workspace_id, _db: ["marketing", "crm"])
    salvar_modulos_calls: list[tuple[uuid.UUID, list[str]]] = []
    monkeypatch.setattr(
        workspaces_api,
        "_salvar_modulos",
        lambda workspace_id, modulos, _db: salvar_modulos_calls.append((workspace_id, list(modulos))),
    )

    user = SimpleNamespace(id=str(uuid.uuid4()), role=RoleUsuario.platform_admin)
    client = client_factory(user)

    payload = {
        "nome": "Cliente Atualizado",
        "razao_social": "Razão Social Atualizada",
        "cnpj": "11.111.111/0001-11",
        "endereco": {"logradouro": "Rua B", "numero": "20", "bairro": "Centro"},
        "modulos": ["marketing", "crm"],
    }
    response = client.put(f"/workspaces/{workspace.id}", json=payload)

    assert response.status_code == 200
    assert workspace.nome == "Cliente Atualizado"
    assert workspace.razao_social == "Razão Social Atualizada"
    assert workspace.cnpj == "11.111.111/0001-11"
    assert workspace.endereco == payload["endereco"]
    assert salvar_modulos_calls == [(workspace.id, ["marketing", "crm"])]
    assert response.json()["ativo"] is True


def test_patch_workspace_status_ativa_e_desativa(client_factory, db, monkeypatch):
    workspace = _workspace(workspace_id=uuid.uuid4(), ativo=True)

    monkeypatch.setattr(workspaces_api, "_get_workspace_or_404", lambda _workspace_id, _db: workspace)
    monkeypatch.setattr(workspaces_api, "_get_modulos", lambda _workspace_id, _db: ["marketing"])

    user = SimpleNamespace(id=str(uuid.uuid4()), role=RoleUsuario.platform_admin)
    client = client_factory(user)

    response = client.patch(f"/workspaces/{workspace.id}/status", json={"ativo": False})

    assert response.status_code == 200
    assert workspace.ativo is False
    assert response.json()["ativo"] is False
    assert db.commits == 1


@pytest.mark.parametrize(
    ("method", "url", "payload"),
    [
        ("put", "/workspaces/00000000-0000-0000-0000-000000000001", {
            "nome": "Cliente",
            "razao_social": None,
            "cnpj": None,
            "endereco": {},
            "modulos": [],
        }),
        ("patch", "/workspaces/00000000-0000-0000-0000-000000000002/status", {"ativo": False}),
    ],
)
def test_usuario_sem_platform_admin_nao_edita(client_factory, method, url, payload):
    user = SimpleNamespace(id=str(uuid.uuid4()), role=RoleUsuario.company_admin)
    client = client_factory(user)

    response = getattr(client, method)(url, json=payload)

    assert response.status_code == 403
    assert response.json()["detail"] == "Acesso restrito a platform_admin"
