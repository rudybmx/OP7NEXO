from app.schemas.user import WorkspaceAcessoOut


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
