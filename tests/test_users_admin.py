from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import users as users_api
from app.models.user import RoleUsuario, User
from app.models.user_workspace_access import UserWorkspaceAccess
from app.models.workspace import Workspace


class _Result:
    def __init__(self, rows: list[dict]):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return list(self._rows)


class _Query:
    def __init__(self, db: "_FakeDb", model):
        self.db = db
        self.model = model

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self.db.query_first_map.get(self.model)

    def all(self):
        return self.db.query_all_map.get(self.model, [])


class _FakeDb:
    def __init__(self):
        self.query_first_map: dict[object, object | None] = {}
        self.query_all_map: dict[object, list[object]] = {}
        self.users: dict[str, SimpleNamespace] = {}
        self.workspaces: dict[str, SimpleNamespace] = {}
        self.accesses: dict[tuple[str, str], UserWorkspaceAccess] = {}
        self.commits = 0
        self.refreshes: list[object] = []
        self.deletes: list[object] = []

    def query(self, model):
        return _Query(self, model)

    def execute(self, statement, params=None):
        sql = str(statement)
        if "FROM user_workspace_access" in sql:
            uid = str(params["uid"])
            rows: list[dict] = []
            for (user_id, workspace_id), access in self.accesses.items():
                if user_id != uid:
                    continue
                workspace = self.workspaces[workspace_id]
                criado_em = access.criado_em
                if criado_em is None:
                    criado_em = datetime.now(timezone.utc)
                    access.criado_em = criado_em
                rows.append(
                    {
                        "workspace_id": workspace_id,
                        "workspace_nome": workspace.nome,
                        "role": access.role,
                        "ativo": access.ativo,
                        "criado_em": criado_em.isoformat(),
                    }
                )
            rows.sort(key=lambda row: row["workspace_nome"])
            return _Result(rows)
        return _Result([])

    def add(self, obj):
        if isinstance(obj, UserWorkspaceAccess):
            if obj.criado_em is None:
                obj.criado_em = datetime.now(timezone.utc)
            self.accesses[(str(obj.user_id), str(obj.workspace_id))] = obj
            return
        if isinstance(obj, User):
            self.users[str(obj.id)] = SimpleNamespace(**obj.__dict__)
            return
        if isinstance(obj, Workspace):
            self.workspaces[str(obj.id)] = SimpleNamespace(**obj.__dict__)

    def delete(self, obj):
        if isinstance(obj, UserWorkspaceAccess):
            self.accesses.pop((str(obj.user_id), str(obj.workspace_id)), None)
        self.deletes.append(obj)

    def commit(self):
        self.commits += 1

    def refresh(self, obj):
        self.refreshes.append(obj)

    def flush(self):
        return None


@pytest.fixture
def app():
    api = FastAPI()
    api.include_router(users_api.router)
    return api


@pytest.fixture
def db():
    return _FakeDb()


@pytest.fixture
def client_factory(app, db):
    def _make(user):
        app.dependency_overrides[users_api.get_db] = lambda: db
        app.dependency_overrides[users_api.get_usuario_atual] = lambda: user
        return TestClient(app)

    yield _make
    app.dependency_overrides.clear()


def _workspace(nome: str | None = None):
    return SimpleNamespace(id=uuid.uuid4(), nome=nome or "Workspace")


def _user(
    *,
    nome: str = "Usuário",
    email: str = "usuario@exemplo.com",
    role: RoleUsuario = RoleUsuario.platform_admin,
    ativo: bool = True,
    workspace_id: uuid.UUID | None = None,
    network_id: uuid.UUID | None = None,
):
    return SimpleNamespace(
        id=uuid.uuid4(),
        nome=nome,
        email=email,
        senha_hash="hash-original",
        role=role,
        ativo=ativo,
        workspace_id=workspace_id,
        network_id=network_id,
    )


def _access(user_id: uuid.UUID, workspace_id: uuid.UUID, *, role: str = "viewer", ativo: bool = True):
    acesso = UserWorkspaceAccess(user_id=user_id, workspace_id=workspace_id, role=role, ativo=ativo)
    acesso.criado_em = datetime(2026, 1, 1, tzinfo=timezone.utc)
    return acesso


def test_put_user_persiste_dados_basicos_status_e_senha(client_factory, db, monkeypatch):
    alvo = _user()
    current_user = _user(nome="Admin", email="admin@exemplo.com", role=RoleUsuario.platform_admin)
    db.query_first_map[User] = None
    monkeypatch.setattr(users_api, "_get_usuario_or_404", lambda _usuario_id, _db: alvo)
    monkeypatch.setattr(users_api, "hash_senha", lambda senha: f"hash:{senha}")

    client = client_factory(current_user)
    response = client.put(
        f"/users/{alvo.id}",
        json={
            "nome": "Usuário Atualizado",
            "email": "novo@exemplo.com",
            "senha": "nova-senha",
            "role": "company_admin",
            "ativo": False,
        },
    )

    assert response.status_code == 200, response.text
    assert alvo.nome == "Usuário Atualizado"
    assert alvo.email == "novo@exemplo.com"
    assert alvo.senha_hash == "hash:nova-senha"
    assert alvo.role == RoleUsuario.company_admin
    assert alvo.ativo is False
    assert response.json()["ativo"] is False
    assert db.commits == 1


def test_put_user_nao_altera_senha_quando_nao_enviada(client_factory, db, monkeypatch):
    alvo = _user()
    current_user = _user(nome="Admin", email="admin@exemplo.com", role=RoleUsuario.platform_admin)
    db.query_first_map[User] = None
    monkeypatch.setattr(users_api, "_get_usuario_or_404", lambda _usuario_id, _db: alvo)
    monkeypatch.setattr(users_api, "hash_senha", lambda senha: f"hash:{senha}")

    client = client_factory(current_user)
    response = client.put(
        f"/users/{alvo.id}",
        json={
            "nome": "Usuário Atualizado",
            "email": "novo@exemplo.com",
            "role": "company_agent",
            "ativo": True,
        },
    )

    assert response.status_code == 200, response.text
    assert alvo.senha_hash == "hash-original"


def test_get_user_workspaces_retorna_padrao(client_factory, db, monkeypatch):
    ws1 = _workspace("Workspace A")
    ws2 = _workspace("Workspace B")
    db.workspaces[str(ws1.id)] = ws1
    db.workspaces[str(ws2.id)] = ws2

    alvo = _user(workspace_id=ws2.id, role=RoleUsuario.company_admin)
    db.accesses[(str(alvo.id), str(ws1.id))] = _access(alvo.id, ws1.id, role="viewer", ativo=True)
    db.accesses[(str(alvo.id), str(ws2.id))] = _access(alvo.id, ws2.id, role="editor", ativo=True)
    monkeypatch.setattr(users_api, "_get_usuario_or_404", lambda _usuario_id, _db: alvo)

    client = client_factory(_user(role=RoleUsuario.platform_admin))
    response = client.get(f"/users/{alvo.id}/workspaces")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body[0]["workspace_id"] == str(ws1.id)
    assert body[0]["padrao"] is False
    assert body[1]["workspace_id"] == str(ws2.id)
    assert body[1]["padrao"] is True
    assert body[1]["role"] == "editor"


@pytest.mark.parametrize("role", ["editor", "admin"])
def test_patch_workspace_access_atualiza_role(client_factory, db, monkeypatch, role):
    ws = _workspace("Workspace")
    db.workspaces[str(ws.id)] = ws
    alvo = _user(workspace_id=ws.id)
    acesso = _access(alvo.id, ws.id, role="viewer", ativo=True)
    db.query_first_map[UserWorkspaceAccess] = acesso
    db.query_first_map[Workspace] = ws
    monkeypatch.setattr(users_api, "_get_usuario_or_404", lambda _usuario_id, _db: alvo)

    client = client_factory(_user(role=RoleUsuario.platform_admin))
    response = client.patch(f"/users/{alvo.id}/workspaces/{ws.id}", json={"role": role})

    assert response.status_code == 200, response.text
    assert acesso.role == role
    assert response.json()["role"] == role
    assert db.commits == 1


def test_post_workspace_access_adiciona_e_reativa(client_factory, db, monkeypatch):
    ws = _workspace("Workspace")
    db.workspaces[str(ws.id)] = ws
    alvo = _user(workspace_id=ws.id)
    monkeypatch.setattr(users_api, "_get_usuario_or_404", lambda _usuario_id, _db: alvo)
    monkeypatch.setattr(users_api, "_get_workspace_or_404", lambda _workspace_id, _db: ws)
    db.query_first_map[UserWorkspaceAccess] = None

    client = client_factory(_user(role=RoleUsuario.platform_admin))
    response = client.post(f"/users/{alvo.id}/workspaces", json={"workspace_id": str(ws.id), "role": "admin"})

    assert response.status_code == 201, response.text
    access = db.accesses[(str(alvo.id), str(ws.id))]
    assert access.ativo is True
    assert access.role == "admin"
    assert response.json()["role"] == "admin"
    assert response.json()["padrao"] is True
    assert db.commits == 1

    access.ativo = False
    db.query_first_map[UserWorkspaceAccess] = access
    response = client.post(f"/users/{alvo.id}/workspaces", json={"workspace_id": str(ws.id), "role": "viewer"})

    assert response.status_code == 201, response.text
    assert access.ativo is True
    assert access.role == "viewer"
    assert response.json()["role"] == "viewer"
    assert db.commits == 2


def test_delete_workspace_access_remove(client_factory, db, monkeypatch):
    ws = _workspace("Workspace")
    db.workspaces[str(ws.id)] = ws
    alvo = _user(workspace_id=ws.id)
    acesso = _access(alvo.id, ws.id, role="viewer", ativo=True)
    db.query_first_map[UserWorkspaceAccess] = acesso
    monkeypatch.setattr(users_api, "_get_usuario_or_404", lambda _usuario_id, _db: alvo)

    client = client_factory(_user(role=RoleUsuario.platform_admin))
    response = client.delete(f"/users/{alvo.id}/workspaces/{ws.id}")

    assert response.status_code == 204, response.text
    assert (str(alvo.id), str(ws.id)) not in db.accesses
    assert db.commits == 1


def test_patch_workspace_padrao_atualiza_workspace_id(client_factory, db, monkeypatch):
    ws = _workspace("Workspace")
    db.workspaces[str(ws.id)] = ws
    alvo = _user(workspace_id=None)
    acesso = _access(alvo.id, ws.id, role="viewer", ativo=True)
    db.query_first_map[UserWorkspaceAccess] = acesso
    db.query_first_map[Workspace] = ws
    monkeypatch.setattr(users_api, "_get_usuario_or_404", lambda _usuario_id, _db: alvo)
    monkeypatch.setattr(users_api, "_get_workspace_or_404", lambda _workspace_id, _db: ws)

    client = client_factory(_user(role=RoleUsuario.platform_admin))
    response = client.patch(f"/users/{alvo.id}/workspace-padrao/{ws.id}", json={})

    assert response.status_code == 200, response.text
    assert alvo.workspace_id == ws.id
    assert response.json()["workspace_id"] == str(ws.id)
    assert db.commits == 1


def test_delete_usuario_eh_soft_delete(client_factory, db, monkeypatch):
    alvo = _user()
    monkeypatch.setattr(users_api, "_get_usuario_or_404", lambda _usuario_id, _db: alvo)

    client = client_factory(_user(role=RoleUsuario.platform_admin))
    response = client.delete(f"/users/{alvo.id}")

    assert response.status_code == 204, response.text
    assert alvo.ativo is False
    assert db.commits == 1


@pytest.mark.parametrize(
    ("method", "url", "payload"),
    [
        (
            "put",
            "/users/00000000-0000-0000-0000-000000000001",
            {
                "nome": "Cliente",
                "email": "cliente@exemplo.com",
                "role": "company_agent",
                "ativo": True,
            },
        ),
        (
            "post",
            "/users/00000000-0000-0000-0000-000000000001/workspaces",
            {"workspace_id": "00000000-0000-0000-0000-000000000010", "role": "viewer"},
        ),
        (
            "patch",
            "/users/00000000-0000-0000-0000-000000000001/workspaces/00000000-0000-0000-0000-000000000010",
            {"role": "editor"},
        ),
        (
            "delete",
            "/users/00000000-0000-0000-0000-000000000001",
            None,
        ),
    ],
)
def test_usuario_sem_permissao_nao_edita(client_factory, db, monkeypatch, method, url, payload):
    alvo = _user()
    monkeypatch.setattr(users_api, "_get_usuario_or_404", lambda _usuario_id, _db: alvo)
    if method in {"post", "patch"}:
        monkeypatch.setattr(users_api, "_get_workspace_or_404", lambda _workspace_id, _db: _workspace("Workspace"))

    client = client_factory(_user(role=RoleUsuario.company_agent, workspace_id=uuid.uuid4()))
    response = getattr(client, method)(url, json=payload)

    assert response.status_code == 403

