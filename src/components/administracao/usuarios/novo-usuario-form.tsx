'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Building2, Loader2, Search, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Input } from '@heroui/react'
import { Switch } from '@/components/ui/switch'
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

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--ws-text-1)',
  display: 'block',
  marginBottom: 8,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  fontSize: 14,
  background: 'var(--card, #fff)',
  border: '1px solid rgba(15,23,42,0.12)',
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  outline: 'none',
  boxSizing: 'border-box',
  color: 'var(--ws-text-1)',
}

const smallSelectStyle: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 6,
  border: '1px solid rgba(15,23,42,0.14)', background: 'var(--card, #fff)',
  color: 'var(--ws-text-2)', fontSize: 12, cursor: 'pointer',
}

function Req() { return <span style={{ color: '#f43f5e' }}> *</span> }

function emptyForm(): NovoUsuarioForm {
  return { nome: '', email: '', senha: '', role: 'company_agent', ativo: true }
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
    next[workspace.id] = { checked: false, role: roleDefault }
  }
  if (selectedWorkspaceId && next[selectedWorkspaceId]) {
    next[selectedWorkspaceId] = { checked: true, role: roleDefault }
  }
  return next
}

const LISTA_HREF = '/administracao/usuarios'

export function NovoUsuarioForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialWorkspaceId = searchParams.get('workspace_id')

  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([])
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState<NovoUsuarioForm>(emptyForm())
  const [workspaceSelections, setWorkspaceSelections] = useState<Record<string, WorkspaceSelection>>({})
  const [primaryWorkspaceId, setPrimaryWorkspaceId] = useState('')
  const [workspaceBusca, setWorkspaceBusca] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [usuarioCriado, setUsuarioCriado] = useState<UsuarioCriado | null>(null)
  const [erroSalvamento, setErroSalvamento] = useState<string | null>(null)

  const workspacesOrdenados = useMemo(
    () => [...workspaces].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })),
    [workspaces],
  )

  useEffect(() => {
    let ativo = true
    void (async () => {
      try {
        const ws = await api.get<WorkspaceOption[]>('/workspaces')
        if (!ativo) return
        const ordenados = [...ws].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
        setWorkspaces(ws)
        const pid = initialWorkspaceId && ordenados.some(w => w.id === initialWorkspaceId) ? initialWorkspaceId : null
        setPrimaryWorkspaceId(pid ?? '')
        setWorkspaceSelections(buildInitialWorkspaceSelections(ordenados, pid, 'company_agent'))
      } catch (err: unknown) {
        if (ativo) toast.error(getErrorMessage(err, 'Erro ao carregar workspaces'))
      } finally {
        if (ativo) setCarregando(false)
      }
    })()
    return () => { ativo = false }
  }, [initialWorkspaceId])

  const selectedWorkspaceIds = useMemo(() => (
    Object.entries(workspaceSelections).filter(([, s]) => s.checked).map(([id]) => id)
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
  const voltar = useCallback(() => router.push(LISTA_HREF), [router])

  function handleWorkspacePrimaryChange(workspaceId: string) {
    setErroSalvamento(null)
    setPrimaryWorkspaceId(workspaceId)
    setWorkspaceSelections((prev) => {
      const next = { ...prev }
      if (!workspaceId) return next
      const current = next[workspaceId] ?? { checked: false, role: defaultWorkspaceAccessRole(form.role) }
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
      const current = prev[workspaceId] ?? { checked: false, role: defaultWorkspaceAccessRole(form.role) }
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
      [workspaceId]: { checked: prev[workspaceId]?.checked ?? false, role },
    }))
  }

  async function sincronizarVinculos(usuario: UsuarioCriado) {
    const primarySelection = primaryWorkspaceId ? workspaceSelections[primaryWorkspaceId] : null
    if (primaryWorkspaceId && primarySelection) {
      const roleDerivado = defaultWorkspaceAccessRole(form.role)
      if (primarySelection.role !== roleDerivado) {
        await api.patch(`/users/${usuario.id}/workspaces/${primaryWorkspaceId}`, { role: primarySelection.role })
      }
    }
    for (const workspace of workspacesOrdenados) {
      if (workspace.id === primaryWorkspaceId) continue
      const selection = workspaceSelections[workspace.id]
      if (!selection?.checked) continue
      await api.post(`/users/${usuario.id}/workspaces`, { workspace_id: workspace.id, role: selection.role })
    }
  }

  async function salvar() {
    const nome = form.nome.trim()
    const email = form.email.trim().toLowerCase()
    const senha = form.senha.trim()
    const hasSelectedWorkspace = selectedWorkspaceIds.length > 0

    if (!nome) { toast.error('Nome é obrigatório'); return }
    if (!email) { toast.error('Email é obrigatório'); return }
    if (!usuarioCriado && !senha) { toast.error('Senha é obrigatória'); return }
    if (!usuarioCriado && senha.length < 6) { toast.error('Senha deve ter no mínimo 6 caracteres'); return }
    if (form.role !== 'platform_admin' && !primaryWorkspaceId) { toast.error('Selecione um workspace principal'); return }
    if (hasSelectedWorkspace && !primaryWorkspaceId) { toast.error('Selecione um workspace principal para os vínculos escolhidos'); return }

    setSalvando(true)
    setErroSalvamento(null)
    try {
      let usuario = usuarioCriado
      if (!usuario) {
        usuario = await api.post<UsuarioCriado>('/auth/registro-usuario', {
          nome, email, senha, role: form.role, ativo: form.ativo, workspace_id: primaryWorkspaceId,
        })
        setUsuarioCriado(usuario)
      }
      if (!usuario) throw new Error('Não foi possível criar o usuário')
      await sincronizarVinculos(usuario)
      toast.success(usuarioCriado ? 'Vínculos do usuário atualizados com sucesso' : 'Usuário criado com sucesso')
      router.push(LISTA_HREF)
    } catch (err: unknown) {
      const message = getErrorMessage(err, usuarioCriado ? 'Erro ao sincronizar vínculos do usuário' : 'Erro ao criar usuário')
      setErroSalvamento(message)
      toast.error(message)
    } finally {
      setSalvando(false)
    }
  }

  const primaryWorkspaceRole = primaryWorkspaceId ? workspaceSelections[primaryWorkspaceId]?.role : null
  const disabledCampos = salvando || Boolean(usuarioCriado)

  if (carregando) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
        <Loader2 size={22} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 24px 120px', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
        <button
          type="button" onClick={voltar} aria-label="Voltar"
          style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: 'var(--card, #fff)', border: '1px solid rgba(15,23,42,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
          }}
        >
          <ArrowLeft size={18} style={{ color: 'var(--ws-text-1)' }} />
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ws-text-1)', letterSpacing: '-0.02em' }}>
            Novo Usuário
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ws-text-2)' }}>
            Cadastre o usuário, defina a role global e vincule os workspaces necessários.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {usuarioCriado && (
          <div style={{
            padding: '12px 14px', borderRadius: 12,
            border: '1px solid rgba(62,91,255,0.22)', background: 'rgba(62,91,255,0.08)',
            color: 'var(--ws-text-1)', fontSize: 13, lineHeight: 1.45,
          }}>
            O usuário já foi criado. Clique em salvar novamente para concluir a sincronização dos vínculos de workspace.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <div>
            <label style={labelStyle}>Nome<Req /></label>
            <Input value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} placeholder="Nome completo" disabled={disabledCampos} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email<Req /></label>
            <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="usuario@empresa.com.br" disabled={disabledCampos} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Senha<Req /></label>
            <Input type="password" value={form.senha} onChange={e => setForm(p => ({ ...p, senha: e.target.value }))} placeholder="Mínimo 6 caracteres" disabled={disabledCampos} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Role global<Req /></label>
            <select
              value={form.role}
              onChange={e => setForm(p => ({ ...p, role: e.target.value as RoleUsuario }))}
              disabled={disabledCampos}
              style={{ ...inputStyle, cursor: disabledCampos ? 'not-allowed' : 'pointer' }}
            >
              {ROLES.map(role => <option key={role.id} value={role.id}>{role.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Status</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 44 }}>
              <Switch checked={form.ativo} disabled={disabledCampos} onCheckedChange={checked => setForm(p => ({ ...p, ativo: checked }))} />
              <span style={{ fontSize: 14, fontWeight: 500, color: form.ativo ? 'var(--ws-green)' : '#a32d2d' }}>
                {form.ativo ? 'Ativo' : 'Inativo'}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>Workspace principal{form.role !== 'platform_admin' ? <Req /> : null}</label>
            <select
              value={primaryWorkspaceId}
              onChange={e => { if (!disabledCampos) handleWorkspacePrimaryChange(e.target.value) }}
              disabled={disabledCampos}
              style={{ ...inputStyle, cursor: disabledCampos ? 'not-allowed' : 'pointer' }}
            >
              <option value="">Sem workspace</option>
              {workspacesOrdenados.map(w => <option key={w.id} value={w.id}>{w.nome}</option>)}
            </select>
            <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '4px 0 0' }}>
              {form.role === 'platform_admin' ? 'Opção disponível para salvar sem workspace' : 'Selecione o workspace principal'}
            </p>
          </div>
          <div>
            <label style={labelStyle}>Role do workspace principal</label>
            <select
              value={primaryWorkspaceId && primaryWorkspaceRole ? primaryWorkspaceRole : defaultWorkspaceAccessRole(form.role)}
              onChange={e => { if (!disabledCampos && primaryWorkspaceId) changeWorkspaceRole(primaryWorkspaceId, e.target.value as WorkspaceAccessRole) }}
              disabled={disabledCampos || !primaryWorkspaceId}
              style={{ ...inputStyle, cursor: disabledCampos || !primaryWorkspaceId ? 'not-allowed' : 'pointer' }}
            >
              {ACCESS_ROLE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '4px 0 0' }}>
              O workspace principal será salvo como padrão.
            </p>
          </div>
        </div>

        {/* Workspaces adicionais */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Workspaces adicionais</label>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-3)' }}>
              {countSelectedWorkspaces} selecionado{countSelectedWorkspaces === 1 ? '' : 's'}
            </span>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
            padding: '10px 12px', borderRadius: 10,
            background: 'var(--card, #fff)', border: '1px solid rgba(15,23,42,0.12)',
          }}>
            <Search size={14} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
            <input
              type="text" value={workspaceBusca} onChange={e => setWorkspaceBusca(e.target.value)}
              placeholder="Buscar workspace..." disabled={disabledCampos}
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: 'var(--ws-text-1)', minWidth: 0 }}
            />
          </div>

          {workspacesAdicionaisFiltrados.length === 0 ? (
            <div style={{ padding: '14px 12px', borderRadius: 10, border: '1px dashed rgba(15,23,42,0.18)', color: 'var(--ws-text-3)', fontSize: 12 }}>
              {workspaceBusca ? 'Nenhum workspace encontrado para este filtro.' : 'Nenhum workspace adicional disponível.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
              {workspacesAdicionaisFiltrados.map((workspace) => {
                const selection = workspaceSelections[workspace.id] ?? { checked: false, role: defaultWorkspaceAccessRole(form.role) }
                return (
                  <div
                    key={workspace.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8,
                      border: `1px solid ${selection.checked ? 'rgba(62,91,255,0.25)' : 'rgba(15,23,42,0.12)'}`,
                      background: selection.checked ? 'rgba(62,91,255,0.06)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox" checked={selection.checked} disabled={disabledCampos}
                      onChange={e => toggleWorkspaceAccess(workspace.id, e.target.checked)}
                      style={{ flexShrink: 0, cursor: disabledCampos ? 'not-allowed' : 'pointer' }}
                    />
                    <Building2 size={13} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--ws-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {workspace.nome}
                    </span>
                    {selection.checked && (
                      <select
                        value={selection.role} disabled={disabledCampos}
                        onChange={e => changeWorkspaceRole(workspace.id, e.target.value as WorkspaceAccessRole)}
                        style={smallSelectStyle}
                      >
                        {ACCESS_ROLE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {erroSalvamento && (
          <div style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(163,45,45,0.22)', background: 'rgba(163,45,45,0.08)', color: '#a32d2d', fontSize: 13, lineHeight: 1.45 }}>
            {erroSalvamento}
          </div>
        )}
      </div>

      {/* Footer fixo */}
      <div style={{
        position: 'sticky', bottom: 0, left: 0, right: 0, marginTop: 28,
        display: 'flex', justifyContent: 'flex-end', gap: 12,
        padding: '16px 0', background: 'linear-gradient(to top, var(--bg) 70%, transparent)',
      }}>
        <Button variant="ghost" onPress={voltar} isDisabled={salvando}>Cancelar</Button>
        <Button variant="primary" onPress={salvar} isDisabled={salvando}>
          {salvando ? <Loader2 size={14} className="animate-spin" style={{ marginRight: 6 }} /> : <UserPlus size={14} style={{ marginRight: 6 }} />}
          {salvando ? 'Salvando...' : usuarioCriado ? 'Salvar vínculos' : 'Salvar'}
        </Button>
      </div>
    </div>
  )
}
