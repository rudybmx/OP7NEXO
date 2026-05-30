export type AdminUserRole =
  | 'platform_admin'
  | 'network_admin'
  | 'network_viewer'
  | 'company_admin'
  | 'company_agent'

export interface WorkspaceOption {
  id: string
  nome: string
}

export interface WorkspaceAccessApiRow {
  workspace_id: string
  workspace_nome: string | null
  role: string
  ativo: boolean
  padrao: boolean
}

export interface WorkspaceAccessDraft {
  workspace_id: string
  workspace_nome: string
  checked: boolean
  hasRow: boolean
  originalActive: boolean
  role: string
  originalRole: string
  padrao: boolean
  originalPadrao: boolean
}

export interface WorkspaceAccessPlan {
  toAdd: WorkspaceAccessDraft[]
  toUpdate: WorkspaceAccessDraft[]
  toRemove: WorkspaceAccessDraft[]
  defaultWorkspaceId: string | null
}

export function buildWorkspaceAccessDrafts(
  workspaces: WorkspaceOption[],
  acessos: WorkspaceAccessApiRow[],
): WorkspaceAccessDraft[] {
  const accessByWorkspaceId = new Map(acessos.map((acesso) => [acesso.workspace_id, acesso] as const))

  return workspaces.map((workspace) => {
    const acesso = accessByWorkspaceId.get(workspace.id)
    return {
      workspace_id: workspace.id,
      workspace_nome: workspace.nome,
      checked: acesso?.ativo ?? false,
      hasRow: Boolean(acesso),
      originalActive: acesso?.ativo ?? false,
      role: acesso?.role ?? 'viewer',
      originalRole: acesso?.role ?? 'viewer',
      padrao: acesso?.padrao ?? false,
      originalPadrao: acesso?.padrao ?? false,
    }
  })
}

export function validateWorkspaceAccessDrafts(
  drafts: WorkspaceAccessDraft[],
  role: AdminUserRole,
): string | null {
  const selected = drafts.filter((draft) => draft.checked)

  if (selected.length === 0) {
    return role === 'platform_admin' ? null : 'Selecione ao menos um workspace ativo'
  }

  const defaults = selected.filter((draft) => draft.padrao)
  if (defaults.length !== 1) {
    return 'Escolha um workspace padrão entre os selecionados'
  }

  return null
}

export function buildWorkspaceAccessPlan(drafts: WorkspaceAccessDraft[]): WorkspaceAccessPlan {
  const toAdd: WorkspaceAccessDraft[] = []
  const toUpdate: WorkspaceAccessDraft[] = []
  const toRemove: WorkspaceAccessDraft[] = []
  let defaultWorkspaceId: string | null = null

  for (const draft of drafts) {
    if (draft.checked) {
      if (!draft.hasRow || !draft.originalActive) {
        toAdd.push(draft)
      } else if (draft.role !== draft.originalRole) {
        toUpdate.push(draft)
      }

      if (draft.padrao) {
        defaultWorkspaceId = draft.workspace_id
      }
      continue
    }

    if (draft.hasRow && draft.originalActive) {
      toRemove.push(draft)
    }
  }

  return { toAdd, toUpdate, toRemove, defaultWorkspaceId }
}

export function hasWorkspaceAccessChanges(drafts: WorkspaceAccessDraft[]): boolean {
  return drafts.some((draft) => (
    draft.checked !== draft.originalActive
    || (draft.checked && draft.role !== draft.originalRole)
    || draft.padrao !== draft.originalPadrao
  ))
}
