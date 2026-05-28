from app.models.user import RoleUsuario
from app.schemas.user import UsuarioAdminOut, UsuarioAtualizarIn, UsuarioIn, WorkspaceAcessoIn, WorkspaceAcessoOut, WorkspaceRoleIn


def test_workspace_acesso_out_serializa_estado_e_padrao():
    workspace = WorkspaceAcessoOut(
        workspace_id="workspace-1",
        workspace_nome="Workspace Teste",
        role="admin",
        ativo=True,
        criado_em="",
        padrao=False,
    )

    assert workspace.model_dump() == {
        "workspace_id": "workspace-1",
        "workspace_nome": "Workspace Teste",
        "role": "admin",
        "ativo": True,
        "criado_em": "",
        "padrao": False,
    }


def test_usuario_in_aceita_senha_e_role_enum():
    usuario = UsuarioIn(
        nome="Usuário Teste",
        email="usuario@example.com",
        senha="segredo123",
        role="company_agent",
        workspace_id="workspace-1",
    )

    assert usuario.senha == "segredo123"
    assert usuario.role == RoleUsuario.company_agent
    assert usuario.workspace_id == "workspace-1"


def test_usuario_atualizar_in_aceita_senha_opcional():
    payload = UsuarioAtualizarIn(senha="nova-senha", role="company_admin")

    assert payload.senha == "nova-senha"
    assert payload.role == RoleUsuario.company_admin


def test_workspace_acesso_in_aceita_role_com_default_viewer():
    acesso_default = WorkspaceAcessoIn(workspace_id="workspace-1")
    acesso_admin = WorkspaceAcessoIn(workspace_id="workspace-1", role="admin")

    assert acesso_default.role == "viewer"
    assert acesso_admin.role == "admin"


def test_workspace_role_in_nao_exige_workspace_id_no_body():
    payload = WorkspaceRoleIn(role="editor")

    assert payload.model_dump() == {"role": "editor"}


def test_usuario_admin_out_serializa_workspace_nome():
    usuario = UsuarioAdminOut(
        id="user-1",
        nome="Usuário Teste",
        email="usuario@example.com",
        role="company_agent",
        ativo=True,
        workspace_id="workspace-1",
        workspace_nome="Workspace Teste",
    )

    assert usuario.model_dump()["workspace_nome"] == "Workspace Teste"
    assert "senha" not in usuario.model_dump()
