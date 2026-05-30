'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Building2, Loader2, Search, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { wsSheetCreamCloseButtonStyle, wsSheetCreamInputStyle, wsSheetCreamStyle, wsSheetCreamTokens } from '@/components/ui/ws-sheet'
import api from '@/lib/api-client'
import type { AdminUserRole, WorkspaceOption } from '@/lib/admin-users-edit'

type RoleUsuario = AdminUserRole
type WorkspaceAccessRole = 'viewer' | 'editor' | 'admin'

interface UsuarioCriado {
  id: string
  nome: string
  email: string
  role: RoleUsuario
  ativo: boolean
  workspace_id: string | null
  workspace_nome: string | null
}

interface WorkspaceSelection {
  checked: boolean
  role: WorkspaceAccessRole
}

interface NovoUsuarioDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaces: WorkspaceOption[]
  initialWorkspaceId?: string | null
  onCreated: () => Promise<void> | void
}

interface NovoUsuarioForm {
  nome: string
  email: string
  senha: string
  role: RoleUsuario
  ativo: boolean
}

const ROLES: { id: RoleUsuario; label: string }[] = [
  { id: 'platform_admin', label: 'Administrador' },
  { id: 'network_admin', label: 'Gestor de Rede' },
  { id: 'network_viewer', label: 'Supervisor' },
  { id: 'company_admin', label: 'Admin Cliente' },
  { id: 'company_agent', label: 'Atendente' },
]

const ROLE_ACCESS_DEFAULTS: Record<RoleUsuario, WorkspaceAccessRole> = {
  platform_admin: 'admin',
  network_admin: 'admin',
  network_viewer: 'viewer',
  company_admin: 'admin',
  company_agent: 'editor',
}

const ACCESS_ROLE_OPTIONS: { id: WorkspaceAccessRole; label: string }[] = [
  { id: 'viewer', label: 'Viewer' },
  { id: 'editor', label: 'Editor' },
  { id: 'admin', label: 'Admin' },
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  ...wsSheetCreamInputStyle,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--ws-text-2)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

function emptyForm(): NovoUsuarioForm {
  return {
    nome: '',
    email: '',
    senha: '',
    role: 'company_agent',
    ativo: true,
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}

function defaultWorkspaceAccessRole(role: RoleUsuario): WorkspaceAccessRole {
  return ROLE_ACCESS_DEFAULTS[role]
}

function buildInitialWorkspaceSelections(
  workspaces: WorkspaceOption[],
  selectedWorkspaceId: string | null,
  role: RoleUsuario,
): Record<string, WorkspaceSelection> {
  const roleDefault = defaultWorkspaceAccessRole(role)
  const next: Record<string, WorkspaceSelection> = {}

  for (const workspace of workspaces) {
    next[workspace.id] = {
      checked: false,
      role: roleDefault,
    }
  }

  if (selectedWorkspaceId && next[selectedWorkspaceId]) {
    next[selectedWorkspaceId] = {
      checked: true,
      role: roleDefault,
    }
  }

  return next
}

export function NovoUsuarioDialog({
  open,
  onOpenChange,
  workspaces,
  initialWorkspaceId = null,
  onCreated,
}: NovoUsuarioDialogProps) {
  const [form, setForm] = useState<NovoUsuarioForm>(emptyForm())
  const [workspaceSelections, setWorkspaceSelections] = useState<Record<string, WorkspaceSelection>>({})
  const [primaryWorkspaceId, setPrimaryWorkspaceId] = useState('')
  const [workspaceBusca, setWorkspaceBusca] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [usuarioCriado, setUsuarioCriado] = useState<UsuarioCriado | null>(null)
  const [erroSalvamento, setErroSalvamento] = useState<string | null>(null)
  const initializedRef = useRef(false)

  const workspacesOrdenados = useMemo(
    () => [...workspaces].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })),
    [workspaces],
  )

  const workspacePrincipal = form.role === 'platform_admin'
    ? 'Opção disponível para salvar sem workspace'
    : 'Selecione o workspace principal'

  const selectedWorkspaceIds = useMemo(() => (
    Object.entries(workspaceSelections)
      .filter(([, selection]) => selection.checked)
      .map(([workspaceId]) => workspaceId)
  ), [workspaceSelections])

  const workspacesAdicionaisFiltrados = useMemo(() => {
    const termo = workspaceBusca.trim().toLowerCase()
    return workspacesOrdenados.filter((workspace) => {
      if (workspace.id === primaryWorkspaceId) return false
      if (!termo) return true
      return workspace.nome.toLowerCase().includes(termo) || workspace.id.toLowerCase().includes(termo)
    })
  }, [primaryWorkspaceId, workspaceBusca, workspacesOrdenados])

  const countSelectedWorkspaces = selectedWorkspaceIds.length

  const resetState = useCallback((nextWorkspaceId: string | null) => {
    setForm(emptyForm())
    setPrimaryWorkspaceId(nextWorkspaceId ?? '')
    setWorkspaceBusca('')
    setErroSalvamento(null)
    setSalvando(false)
    setUsuarioCriado(null)
    setWorkspaceSelections(buildInitialWorkspaceSelections(workspacesOrdenados, nextWorkspaceId, 'company_agent'))
  }, [workspacesOrdenados])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!open) {
        initializedRef.current = false
        resetState(null)
        return
      }

      if (initializedRef.current) return
      if (workspacesOrdenados.length === 0) return

      initializedRef.current = true
      resetState(initialWorkspaceId && workspacesOrdenados.some((workspace) => workspace.id === initialWorkspaceId)
        ? initialWorkspaceId
        : null)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [initialWorkspaceId, open, resetState, workspacesOrdenados])

  function handleClose() {
    if (salvando) return
    initializedRef.current = false
    resetState(null)
    onOpenChange(false)
  }

  function handleWorkspacePrimaryChange(workspaceId: string) {
    setErroSalvamento(null)
    setPrimaryWorkspaceId(workspaceId)
    setWorkspaceSelections((prev) => {
      const next = { ...prev }

      if (!workspaceId) {
        return next
      }

      const current = next[workspaceId] ?? {
        checked: false,
        role: defaultWorkspaceAccessRole(form.role),
      }

      next[workspaceId] = {
        checked: true,
        role: current.checked ? current.role : defaultWorkspaceAccessRole(form.role),
      }

      return next
    })
  }

  function toggleWorkspaceAccess(workspaceId: string, checked: boolean) {
    setErroSalvamento(null)
    setWorkspaceSelections((prev) => {
      const current = prev[workspaceId] ?? {
        checked: false,
        role: defaultWorkspaceAccessRole(form.role),
      }

      return {
        ...prev,
        [workspaceId]: {
          checked,
          role: checked && !current.checked ? defaultWorkspaceAccessRole(form.role) : current.role,
        },
      }
    })
  }

  function changeWorkspaceRole(workspaceId: string, role: WorkspaceAccessRole) {
    setErroSalvamento(null)
    setWorkspaceSelections((prev) => ({
      ...prev,
      [workspaceId]: {
        checked: prev[workspaceId]?.checked ?? false,
        role,
      },
    }))
  }

  async function sincronizarVinculos(usuario: UsuarioCriado) {
    const primaryWorkspaceIdAtual = primaryWorkspaceId
    const primarySelection = primaryWorkspaceIdAtual ? workspaceSelections[primaryWorkspaceIdAtual] : null

    if (primaryWorkspaceIdAtual && primarySelection) {
      const roleDerivado = defaultWorkspaceAccessRole(form.role)
      if (primarySelection.role !== roleDerivado) {
        await api.patch(`/users/${usuario.id}/workspaces/${primaryWorkspaceIdAtual}`, {
          role: primarySelection.role,
        })
      }
    }

    for (const workspace of workspacesOrdenados) {
      if (workspace.id === primaryWorkspaceIdAtual) continue
      const selection = workspaceSelections[workspace.id]
      if (!selection?.checked) continue

      await api.post(`/users/${usuario.id}/workspaces`, {
        workspace_id: workspace.id,
        role: selection.role,
      })
    }
  }

  async function salvar() {
    const nome = form.nome.trim()
    const email = form.email.trim().toLowerCase()
    const senha = form.senha.trim()
    const hasSelectedWorkspace = selectedWorkspaceIds.length > 0

    if (!nome) {
      toast.error('Nome é obrigatório')
      return
    }
    if (!email) {
      toast.error('Email é obrigatório')
      return
    }
    if (!usuarioCriado && !senha) {
      toast.error('Senha é obrigatória')
      return
    }
    if (!usuarioCriado && senha.length < 6) {
      toast.error('Senha deve ter no mínimo 6 caracteres')
      return
    }
    if (form.role !== 'platform_admin' && !primaryWorkspaceId) {
      toast.error('Selecione um workspace principal')
      return
    }
    if (hasSelectedWorkspace && !primaryWorkspaceId) {
      toast.error('Selecione um workspace principal para os vínculos escolhidos')
      return
    }

    setSalvando(true)
    setErroSalvamento(null)

    try {
      let usuario = usuarioCriado

      if (!usuario) {
        usuario = await api.post<UsuarioCriado>('/auth/registro-usuario', {
          nome,
          email,
          senha,
          role: form.role,
          ativo: form.ativo,
          workspace_id: primaryWorkspaceId,
        })
        setUsuarioCriado(usuario)
      }

      if (!usuario) {
        throw new Error('Não foi possível criar o usuário')
      }

      await sincronizarVinculos(usuario)

      await Promise.resolve(onCreated())
      toast.success(usuarioCriado ? 'Vínculos do usuário atualizados com sucesso' : 'Usuário criado com sucesso')
      handleClose()
    } catch (err: unknown) {
      const message = getErrorMessage(
        err,
        usuarioCriado ? 'Erro ao sincronizar vínculos do usuário' : 'Erro ao criar usuário',
      )
      setErroSalvamento(message)
      toast.error(message)
    } finally {
      setSalvando(false)
    }
  }

  const primaryWorkspaceRole = primaryWorkspaceId ? workspaceSelections[primaryWorkspaceId]?.role : null

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) {
        handleClose()
      } else {
        onOpenChange(true)
      }
    }}>
      <DialogContent
        showCloseButton={false}
        style={{
          width: 'min(1100px, calc(100vw - 16px))',
          maxHeight: 'calc(100vh - 16px)',
          borderRadius: 18,
          ...wsSheetCreamStyle,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <DialogTitle className="sr-only">Novo Usuário</DialogTitle>
        <DialogDescription className="sr-only">
          Cadastre um usuário com vínculos de workspace
        </DialogDescription>

        <div style={{
          padding: '24px 28px 20px',
          borderBottom: `1px solid ${wsSheetCreamTokens.border}`,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)' }}>
              Novo Usuário
            </h2>
            <p style={{ fontSize: 12, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
              Cadastre o usuário, defina a role global e vincule os workspaces necessários.
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={salvando}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              ...wsSheetCreamCloseButtonStyle,
              color: 'var(--ws-text-2)',
              cursor: salvando ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              opacity: salvando ? 0.5 : 1,
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {usuarioCriado && (
            <div style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid rgba(62,91,255,0.22)',
              background: 'rgba(62,91,255,0.08)',
              color: 'var(--ws-text-1)',
              fontSize: 13,
              lineHeight: 1.45,
            }}>
              O usuário já foi criado. Clique em salvar novamente para concluir a sincronização dos vínculos de workspace.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <div>
              <label style={labelStyle}>Nome *</label>
              <input
                type="text"
                name="novo-usuario-nome"
                autoComplete="off"
                value={form.nome}
                onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))}
                placeholder="Nome completo"
                disabled={salvando || Boolean(usuarioCriado)}
                style={{
                  ...inputStyle,
                  opacity: usuarioCriado ? 0.7 : 1,
                  cursor: usuarioCriado ? 'not-allowed' : 'text',
                }}
              />
            </div>

            <div>
              <label style={labelStyle}>Email *</label>
              <input
                type="email"
                name="novo-usuario-email"
                autoComplete="off"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="usuario@empresa.com.br"
                disabled={salvando || Boolean(usuarioCriado)}
                style={{
                  ...inputStyle,
                  opacity: usuarioCriado ? 0.7 : 1,
                  cursor: usuarioCriado ? 'not-allowed' : 'text',
                }}
              />
            </div>

            <div>
              <label style={labelStyle}>Senha *</label>
              <input
                type="password"
                name="novo-usuario-senha"
                autoComplete="new-password"
                value={form.senha}
                onChange={(event) => setForm((prev) => ({ ...prev, senha: event.target.value }))}
                placeholder="Mínimo 6 caracteres"
                disabled={salvando || Boolean(usuarioCriado)}
                style={{
                  ...inputStyle,
                  opacity: usuarioCriado ? 0.7 : 1,
                  cursor: usuarioCriado ? 'not-allowed' : 'text',
                }}
              />
            </div>

            <div>
              <label style={labelStyle}>Role global *</label>
              <select
                value={form.role}
                onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as RoleUsuario }))}
                disabled={salvando || Boolean(usuarioCriado)}
                style={{
                  ...inputStyle,
                  cursor: salvando || usuarioCriado ? 'not-allowed' : 'pointer',
                  opacity: usuarioCriado ? 0.7 : 1,
                }}
              >
                {ROLES.map((role) => (
                  <option key={role.id} value={role.id}>{role.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Status</label>
              <button
                type="button"
                onClick={() => {
                  if (salvando || usuarioCriado) return
                  setForm((prev) => ({ ...prev, ativo: !prev.ativo }))
                }}
                disabled={salvando || Boolean(usuarioCriado)}
                style={{
                  ...inputStyle,
                  cursor: salvando || usuarioCriado ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                  opacity: usuarioCriado ? 0.7 : 1,
                }}
              >
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: form.ativo ? 'var(--ws-green)' : '#a32d2d',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: form.ativo ? 'var(--ws-green)' : '#a32d2d' }}>
                  {form.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Workspace principal *</label>
              <select
                value={primaryWorkspaceId}
                onChange={(event) => {
                  if (salvando || usuarioCriado) return
                  handleWorkspacePrimaryChange(event.target.value)
                }}
                disabled={salvando || Boolean(usuarioCriado)}
                style={{
                  ...inputStyle,
                  cursor: salvando || usuarioCriado ? 'not-allowed' : 'pointer',
                  opacity: usuarioCriado ? 0.7 : 1,
                }}
              >
                <option value="">Sem workspace</option>
                {workspacesOrdenados.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.nome}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '4px 0 0' }}>
                {workspacePrincipal}
              </p>
            </div>

            <div>
              <label style={labelStyle}>Role do workspace principal</label>
              <select
                value={primaryWorkspaceId && primaryWorkspaceRole ? primaryWorkspaceRole : defaultWorkspaceAccessRole(form.role)}
                onChange={(event) => {
                  if (salvando || usuarioCriado || !primaryWorkspaceId) return
                  changeWorkspaceRole(primaryWorkspaceId, event.target.value as WorkspaceAccessRole)
                }}
                disabled={salvando || Boolean(usuarioCriado) || !primaryWorkspaceId}
                style={{
                  ...inputStyle,
                  cursor: salvando || usuarioCriado || !primaryWorkspaceId ? 'not-allowed' : 'pointer',
                  opacity: usuarioCriado || !primaryWorkspaceId ? 0.7 : 1,
                }}
              >
                {ACCESS_ROLE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '4px 0 0' }}>
                O workspace principal será salvo como padrão.
              </p>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
              <label style={labelStyle}>Workspaces adicionais</label>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--ws-text-3)',
              }}>
                {countSelectedWorkspaces} selecionado{countSelectedWorkspaces === 1 ? '' : 's'}
              </span>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 10,
              padding: '10px 12px',
              borderRadius: 10,
              background: wsSheetCreamTokens.surface,
              border: `1px solid ${wsSheetCreamTokens.border}`,
            }}>
              <Search size={14} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
              <input
                type="text"
                name="novo-usuario-workspace-search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                value={workspaceBusca}
                onChange={(event) => setWorkspaceBusca(event.target.value)}
                placeholder="Buscar workspace..."
                disabled={salvando || Boolean(usuarioCriado)}
                style={{
                  ...inputStyle,
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  height: 20,
                  minWidth: 0,
                  opacity: usuarioCriado ? 0.7 : 1,
                  cursor: usuarioCriado ? 'not-allowed' : 'text',
                }}
              />
            </div>

            {workspacesAdicionaisFiltrados.length === 0 ? (
              <div style={{
                padding: '14px 12px',
                borderRadius: 10,
                border: `1px dashed ${wsSheetCreamTokens.border}`,
                color: 'var(--ws-text-3)',
                fontSize: 12,
              }}>
                {workspaceBusca ? 'Nenhum workspace encontrado para este filtro.' : 'Nenhum workspace adicional disponível.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {workspacesAdicionaisFiltrados.map((workspace) => {
                  const selection = workspaceSelections[workspace.id] ?? {
                    checked: false,
                    role: defaultWorkspaceAccessRole(form.role),
                  }

                  return (
                    <div
                      key={workspace.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: `1px solid ${selection.checked ? 'rgba(62,91,255,0.25)' : wsSheetCreamTokens.border}`,
                        background: selection.checked ? 'rgba(62,91,255,0.06)' : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selection.checked}
                        disabled={salvando || Boolean(usuarioCriado)}
                        onChange={(event) => toggleWorkspaceAccess(workspace.id, event.target.checked)}
                        style={{ flexShrink: 0, cursor: salvando || usuarioCriado ? 'not-allowed' : 'pointer' }}
                      />
                      <Building2 size={13} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
                      <span
                        style={{
                          flex: 1,
                          fontSize: 13,
                          color: 'var(--ws-text-1)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {workspace.nome}
                      </span>
                      {selection.checked && (
                        <select
                          value={selection.role}
                          disabled={salvando || Boolean(usuarioCriado)}
                          onChange={(event) => changeWorkspaceRole(workspace.id, event.target.value as WorkspaceAccessRole)}
                          style={{
                            padding: '3px 6px',
                            borderRadius: 5,
                            border: `1px solid ${wsSheetCreamTokens.border}`,
                            background: 'var(--ws-glass-bg)',
                            color: 'var(--ws-text-2)',
                            fontSize: 11,
                            cursor: salvando || usuarioCriado ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {ACCESS_ROLE_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>{option.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {erroSalvamento && (
            <div style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid rgba(163,45,45,0.22)',
              background: 'rgba(163,45,45,0.08)',
              color: '#a32d2d',
              fontSize: 13,
              lineHeight: 1.45,
            }}>
              {erroSalvamento}
            </div>
          )}
        </div>

        <div
          style={{
            padding: '20px 28px',
            borderTop: `1px solid ${wsSheetCreamTokens.border}`,
            display: 'flex',
            gap: 12,
            background: 'rgba(255,255,255,0.42)',
          }}
        >
          <button
            onClick={handleClose}
            disabled={salvando}
            style={{
              flex: 1,
              height: 42,
              borderRadius: 10,
              border: `1px solid ${wsSheetCreamTokens.border}`,
              background: 'transparent',
              color: 'var(--ws-text-2)',
              fontSize: 14,
              fontWeight: 500,
              cursor: salvando ? 'not-allowed' : 'pointer',
              opacity: salvando ? 0.6 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            style={{
              flex: 2,
              height: 42,
              borderRadius: 10,
              border: 'none',
              background: salvando ? 'rgba(62,91,255,0.50)' : 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 600,
              cursor: salvando ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: salvando ? 'none' : '0 4px 12px rgba(62,91,255,0.30)',
            }}
          >
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
            {salvando ? 'Salvando...' : usuarioCriado ? 'Salvar vínculos' : 'Salvar'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
