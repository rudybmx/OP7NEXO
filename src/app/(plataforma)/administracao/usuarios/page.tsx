'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Edit3, Loader2, Mail, Plus, Search, Shield, Star, Trash2, UserPlus, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import useSWR from 'swr'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { WSTable, WSTableShell } from '@/components/ui/ws-table'
import { wsSheetCreamCloseButtonStyle, wsSheetCreamInputStyle, wsSheetCreamStyle, wsSheetCreamTokens } from '@/components/ui/ws-sheet'
import { UsuarioWorkspacesSummary } from '@/components/administracao/usuarios/usuario-workspaces-summary'
import { useAuth } from '@/hooks/use-auth'
import api from '@/lib/api-client'

import {
  buildWorkspaceAccessDrafts,
  buildWorkspaceAccessPlan,
  hasWorkspaceAccessChanges,
  validateWorkspaceAccessDrafts,
  type AdminUserRole,
  type WorkspaceAccessApiRow,
  type WorkspaceAccessDraft,
  type WorkspaceOption,
} from '@/lib/admin-users-edit'

type RoleUsuario = AdminUserRole

interface UsuarioRow {
  id: string
  nome: string
  email: string
  role: RoleUsuario
  workspace_id: string | null
  workspace_nome: string | null
  ativo: boolean
}

type WorkspaceRow = WorkspaceOption
type WorkspaceAcesso = WorkspaceAccessApiRow
type AcessoWsLocal = WorkspaceAccessDraft

interface NovoUsuarioForm {
  nome: string
  email: string
  senha: string
  role: RoleUsuario
  workspace_id: string
}

interface EditUsuarioForm {
  nome: string
  email: string
  senha: string
  role: RoleUsuario
  ativo: boolean
}

type StatusFiltro = 'ativo' | 'inativo' | 'todos'

const ROLES: { id: RoleUsuario; label: string }[] = [
  { id: 'platform_admin', label: 'Administrador' },
  { id: 'network_admin', label: 'Gestor de Rede' },
  { id: 'network_viewer', label: 'Supervisor' },
  { id: 'company_admin', label: 'Admin Cliente' },
  { id: 'company_agent', label: 'Atendente' },
]

const STATUS_OPTIONS: { id: StatusFiltro; label: string }[] = [
  { id: 'ativo', label: 'Ativos' },
  { id: 'inativo', label: 'Inativos' },
  { id: 'todos', label: 'Todos' },
]

const ROLE_LABELS = ROLES.reduce<Record<RoleUsuario, string>>((acc, role) => {
  acc[role.id] = role.label
  return acc
}, {} as Record<RoleUsuario, string>)

const ROLE_STYLES: Record<RoleUsuario, { bg: string; color: string }> = {
  platform_admin: { bg: 'rgba(62,91,255,0.15)', color: 'var(--ws-blue)' },
  network_admin: { bg: 'rgba(122,90,248,0.15)', color: 'var(--ws-purple)' },
  network_viewer: { bg: 'rgba(0,245,255,0.12)', color: 'var(--ws-cyan-dark)' },
  company_admin: { bg: 'rgba(201,168,76,0.15)', color: '#c9a84c' },
  company_agent: { bg: 'rgba(15,168,86,0.15)', color: 'var(--ws-green)' },
}

const emptyForm = (): NovoUsuarioForm => ({
  nome: '',
  email: '',
  senha: '',
  role: 'company_agent',
  workspace_id: '',
})

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

const fetchUsuarios = (path: string) => api.get<UsuarioRow[]>(path)
const fetchWorkspaces = (path: string) => api.get<WorkspaceRow[]>(path)

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

export default function UsuariosAdministracaoPage() {
  const router = useRouter()
  const { user, isLoading: authLoading } = useAuth()

  const [busca, setBusca] = useState('')
  const [filtroRole, setFiltroRole] = useState<RoleUsuario | 'todas'>('todas')
  const [filtroStatus, setFiltroStatus] = useState<StatusFiltro>('ativo')
  const [filtroWorkspace, setFiltroWorkspace] = useState<string>('todos')
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState<NovoUsuarioForm>(emptyForm)

  const [editDrawerAberto, setEditDrawerAberto] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState<UsuarioRow | null>(null)
  const [editForm, setEditForm] = useState<EditUsuarioForm>({
    nome: '',
    email: '',
    senha: '',
    role: 'company_agent',
    ativo: true,
  })
  const [editSalvando, setEditSalvando] = useState(false)
  const [alterandoStatusId, setAlterandoStatusId] = useState<string | null>(null)
  const [acessosWs, setAcessosWs] = useState<AcessoWsLocal[]>([])
  const [acessosWsOriginais, setAcessosWsOriginais] = useState<AcessoWsLocal[]>([])
  const [acessosWsCarregando, setAcessosWsCarregando] = useState(false)
  const [buscaWorkspaceAcesso, setBuscaWorkspaceAcesso] = useState('')
  const [workspacesPorUsuario, setWorkspacesPorUsuario] = useState<Record<string, WorkspaceAcesso[]>>({})
  const acessosWsCarregadosParaUsuario = useRef<string | null>(null)
  const isPlatformAdmin = user?.role === 'platform_admin'

  const {
    data: usuarios = [],
    error: usuariosError,
    isLoading: carregando,
    mutate: mutateUsuarios,
  } = useSWR<UsuarioRow[]>(isPlatformAdmin ? '/usuarios' : null, fetchUsuarios)

  const {
    data: workspaces = [],
  } = useSWR<WorkspaceRow[]>(isPlatformAdmin ? '/workspaces' : null, fetchWorkspaces)

  const workspacesOrdenados = useMemo(
    () => [...workspaces].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })),
    [workspaces],
  )

  const workspacesPorUsuarioVisivel = useMemo<Record<string, WorkspaceAcesso[]>>(
    () => (isPlatformAdmin && usuarios.length > 0 ? workspacesPorUsuario : ({} as Record<string, WorkspaceAcesso[]>)),
    [isPlatformAdmin, usuarios.length, workspacesPorUsuario],
  )

  useEffect(() => {
    if (!authLoading && user && user.role !== 'platform_admin') router.push('/')
  }, [authLoading, user, router])

  useEffect(() => {
    if (usuariosError) toast.error(getErrorMessage(usuariosError, 'Erro ao carregar usuários'))
  }, [usuariosError])

  useEffect(() => {
    if (!isPlatformAdmin || usuarios.length === 0) return
    let cancelled = false
    ;(async () => {
      try {
        const results = await Promise.all(
          usuarios.map(async (usuario) => {
            const acessos = await api.get<WorkspaceAcesso[]>(`/users/${usuario.id}/workspaces`)
            return [usuario.id, acessos.filter((a) => a.ativo)] as const
          }),
        )
        if (cancelled) return
        setWorkspacesPorUsuario(Object.fromEntries(results))
      } catch (err) {
        console.error('[usuarios-admin] falha ao carregar workspaces por usuário', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isPlatformAdmin, usuarios])

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return usuarios.filter((usuario) => {
      const matchBusca =
        !termo ||
        usuario.nome.toLowerCase().includes(termo) ||
        usuario.email.toLowerCase().includes(termo)
      const matchRole = filtroRole === 'todas' || usuario.role === filtroRole
      const matchStatus =
        filtroStatus === 'todos'
          ? true
          : filtroStatus === 'ativo'
            ? usuario.ativo
            : !usuario.ativo
      const workspacesUsuario = workspacesPorUsuarioVisivel[usuario.id] ?? []
      const matchWorkspace =
        filtroWorkspace === 'todos'
        || usuario.workspace_id === filtroWorkspace
        || workspacesUsuario.some((acesso) => acesso.workspace_id === filtroWorkspace)

      return matchBusca && matchRole && matchStatus && matchWorkspace
    })
  }, [usuarios, busca, filtroRole, filtroStatus, filtroWorkspace, workspacesPorUsuarioVisivel])

  function fecharDrawer() {
    setDrawerAberto(false)
    setForm(emptyForm())
  }

  const carregarAcessosWs = useCallback(async (usuario: UsuarioRow, silent = false) => {
    setAcessosWsCarregando(true)
    setAcessosWs([])
    setAcessosWsOriginais([])
    try {
      const acessos = await api.get<WorkspaceAcesso[]>(`/users/${usuario.id}/workspaces`)
      const lista = buildWorkspaceAccessDrafts(workspaces, acessos)
      setAcessosWs(lista)
      setAcessosWsOriginais(lista)
    } catch (err: unknown) {
      if (!silent) {
        toast.error(getErrorMessage(err, 'Erro ao carregar acessos de workspace'))
      }
    } finally {
      setAcessosWsCarregando(false)
    }
  }, [workspaces])

  useEffect(() => {
    if (!editDrawerAberto || !usuarioEditando || workspaces.length === 0) return
    if (acessosWsCarregadosParaUsuario.current === usuarioEditando.id) return

    acessosWsCarregadosParaUsuario.current = usuarioEditando.id
    void carregarAcessosWs(usuarioEditando)
  }, [editDrawerAberto, usuarioEditando, workspaces, carregarAcessosWs])

  const acessosWsFiltrados = useMemo(() => {
    const termo = buscaWorkspaceAcesso.trim().toLowerCase()
    if (!termo) return acessosWs
    return acessosWs.filter((acesso) =>
      acesso.workspace_nome.toLowerCase().includes(termo)
      || acesso.workspace_id.toLowerCase().includes(termo),
    )
  }, [acessosWs, buscaWorkspaceAcesso])

  const acessosTemMudancas = useMemo(
    () => hasWorkspaceAccessChanges(acessosWs),
    [acessosWs],
  )

  const precisaEscolherPadrao = useMemo(
    () => acessosWs.some((acesso) => acesso.checked) && !acessosWs.some((acesso) => acesso.checked && acesso.padrao),
    [acessosWs],
  )

  function abrirEdicao(usuario: UsuarioRow) {
    setUsuarioEditando(usuario)
    acessosWsCarregadosParaUsuario.current = null
    setEditForm({
      nome: usuario.nome,
      email: usuario.email,
      senha: '',
      role: usuario.role,
      ativo: usuario.ativo,
    })
    setBuscaWorkspaceAcesso('')
    setEditDrawerAberto(true)
    setAcessosWsCarregando(true)
    setAcessosWs([])
    setAcessosWsOriginais([])
  }

  function fecharEdicao() {
    setEditDrawerAberto(false)
    setUsuarioEditando(null)
    setAcessosWs([])
    setAcessosWsOriginais([])
    acessosWsCarregadosParaUsuario.current = null
  }

  function alterarAcessoWorkspace(workspaceId: string, checked: boolean) {
    setAcessosWs((prev) => prev.map((acesso) => {
      if (acesso.workspace_id !== workspaceId) return acesso
      return {
        ...acesso,
        checked,
        padrao: checked ? acesso.padrao : false,
      }
    }))
  }

  function definirPadraoLocal(workspaceId: string) {
    setAcessosWs((prev) => prev.map((acesso) => ({
      ...acesso,
      padrao: acesso.checked && acesso.workspace_id === workspaceId,
    })))
  }

  async function salvarUsuario() {
    const nome = form.nome.trim()
    const email = form.email.trim().toLowerCase()
    const senha = form.senha.trim()

    if (!nome) { toast.error('Nome é obrigatório'); return }
    if (!email) { toast.error('Email é obrigatório'); return }
    if (!senha) { toast.error('Senha é obrigatória'); return }
    if (senha.length < 6) { toast.error('Senha deve ter no mínimo 6 caracteres'); return }

    setSalvando(true)
    try {
      const novo = await api.post<UsuarioRow>('/auth/registro-usuario', {
        nome,
        email,
        senha,
        role: form.role,
        workspace_id: form.workspace_id || null,
      })
      await mutateUsuarios((atuais = []) => [novo, ...atuais], { revalidate: false })
      fecharDrawer()
      toast.success('Usuário criado com sucesso')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao criar usuário'))
    } finally {
      setSalvando(false)
    }
  }

  async function salvarEdicao() {
    if (!usuarioEditando) return
    const nome = editForm.nome.trim()
    const email = editForm.email.trim().toLowerCase()

    if (!nome) { toast.error('Nome é obrigatório'); return }
    if (!email) { toast.error('Email é obrigatório'); return }
    if (editForm.senha.trim() && editForm.senha.trim().length < 6) {
      toast.error('Senha deve ter no mínimo 6 caracteres')
      return
    }

    const erroAcessos = validateWorkspaceAccessDrafts(acessosWs, editForm.role)
    if (erroAcessos) {
      toast.error(erroAcessos)
      return
    }

    const payload: Record<string, unknown> = {
      nome,
      email,
      role: editForm.role,
      ativo: editForm.ativo,
    }
    if (editForm.senha.trim()) {
      payload.senha = editForm.senha.trim()
    }

    const planoAcessos = buildWorkspaceAccessPlan(acessosWs)
    const workspacePadraoOriginal = acessosWsOriginais.find((acesso) => acesso.originalPadrao)?.workspace_id ?? null

    setEditSalvando(true)
    try {
      await api.put<UsuarioRow>(`/users/${usuarioEditando.id}`, payload)

      for (const acesso of planoAcessos.toAdd) {
        await api.post(`/users/${usuarioEditando.id}/workspaces`, {
          workspace_id: acesso.workspace_id,
          role: acesso.role,
        })
      }

      for (const acesso of planoAcessos.toUpdate) {
        await api.patch(`/users/${usuarioEditando.id}/workspaces/${acesso.workspace_id}`, {
          role: acesso.role,
        })
      }

      if (planoAcessos.defaultWorkspaceId && planoAcessos.defaultWorkspaceId !== workspacePadraoOriginal) {
        await api.patch(`/users/${usuarioEditando.id}/workspace-padrao/${planoAcessos.defaultWorkspaceId}`, {})
      }

      for (const acesso of planoAcessos.toRemove) {
        await api.delete(`/users/${usuarioEditando.id}/workspaces/${acesso.workspace_id}`)
      }

      fecharEdicao()
      toast.success('Usuário atualizado com sucesso')
      await mutateUsuarios().catch((syncErr: unknown) => {
        toast.error(getErrorMessage(syncErr, 'Usuário salvo, mas não foi possível atualizar a lista'))
      })
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao atualizar usuário'))
      if (usuarioEditando) {
        await carregarAcessosWs(usuarioEditando, true)
      }
      await mutateUsuarios().catch(() => {})
    } finally {
      setEditSalvando(false)
    }
  }

  async function alterarStatusUsuario(usuario: UsuarioRow) {
    const tornarAtivo = !usuario.ativo
    if (!tornarAtivo) {
      const confirmar = window.confirm(`Tem certeza que deseja inativar o usuário "${usuario.nome}"? Ele deixará de aparecer como ativo.`)
      if (!confirmar) return
    }

    setAlterandoStatusId(usuario.id)
    try {
      if (tornarAtivo) {
        await api.put(`/users/${usuario.id}`, { ativo: true })
      } else {
        await api.delete(`/users/${usuario.id}`)
      }

      await mutateUsuarios(
        (atuais = []) => atuais.map((item) => (
          item.id === usuario.id
            ? { ...item, ativo: tornarAtivo }
            : item
        )),
        { revalidate: false },
      )

      if (usuarioEditando?.id === usuario.id) {
        setEditForm((prev) => ({ ...prev, ativo: tornarAtivo }))
      }

      toast.success(tornarAtivo ? 'Usuário reativado com sucesso' : 'Usuário inativado com sucesso')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, tornarAtivo ? 'Erro ao reativar usuário' : 'Erro ao inativar usuário'))
    } finally {
      setAlterandoStatusId(null)
    }
  }

  if (authLoading || !user || user.role !== 'platform_admin') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)', letterSpacing: '-0.02em' }}>
            Usuários
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
            Gerencie acessos, roles e vínculo de workspace
          </p>
        </div>

        <button
          onClick={() => setDrawerAberto(true)}
          style={{
            height: 42,
            padding: '0 20px',
            borderRadius: 10,
            border: 'none',
            background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: '0 4px 12px rgba(62,91,255,0.30)',
            whiteSpace: 'nowrap',
          }}
        >
          <Plus size={16} />
          Novo Usuário
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{
          background: 'var(--ws-glass-bg)',
          border: '1px solid var(--ws-glass-border)',
          borderRadius: 12,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          backdropFilter: 'blur(10px)',
        }}>
          <Search size={16} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
          <input
            type="search"
            name="usuarios-busca"
            id="usuarios-busca"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Buscar por nome ou email..."
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', fontSize: 14, color: 'var(--ws-text-1)', outline: 'none' }}
          />
          <span style={{ fontSize: 12, color: 'var(--ws-text-3)', flexShrink: 0 }}>
            {usuariosFiltrados.length} usuário{usuariosFiltrados.length !== 1 ? 's' : ''}
          </span>
        </div>

        <select
          value={filtroRole}
          onChange={(event) => setFiltroRole(event.target.value as RoleUsuario | 'todas')}
          style={{ ...inputStyle, height: 48, cursor: 'pointer' }}
        >
          <option value="todas">Todas as roles</option>
          {ROLES.map((role) => (
            <option key={role.id} value={role.id}>{role.label}</option>
          ))}
        </select>

        <select
          value={filtroStatus}
          onChange={(event) => setFiltroStatus(event.target.value as StatusFiltro)}
          style={{ ...inputStyle, height: 48, cursor: 'pointer' }}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status.id} value={status.id}>{status.label}</option>
          ))}
        </select>

        <select
          value={filtroWorkspace}
          onChange={(event) => setFiltroWorkspace(event.target.value)}
          style={{ ...inputStyle, height: 48, cursor: 'pointer' }}
        >
          <option value="todos">Todos os workspaces</option>
          {workspacesOrdenados.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>{workspace.nome}</option>
          ))}
        </select>
      </div>

      <WSTableShell>
        {carregando ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
            <p style={{ fontSize: 13, color: 'var(--ws-text-2)', marginTop: 12 }}>Carregando usuários...</p>
          </div>
        ) : usuariosFiltrados.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Users size={32} style={{ color: 'var(--ws-text-3)', marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: 'var(--ws-text-2)' }}>
              {busca || filtroRole !== 'todas' || filtroStatus !== 'ativo' || filtroWorkspace !== 'todos'
                ? 'Nenhum usuário encontrado'
                : 'Nenhum usuário cadastrado'}
            </p>
          </div>
        ) : (
          <WSTable minWidth={900}>
            <thead>
              <tr>
                {['Nome', 'Email', 'Role', 'Workspace', 'Status', 'Ações'].map((header) => (
                  <th key={header} style={{
                    padding: '8px 14px', fontSize: 10, fontWeight: 600,
                    color: 'var(--ws-text-3)', textAlign: 'left',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    whiteSpace: 'nowrap', background: 'rgba(62,91,255,0.04)',
                    borderBottom: '1px solid var(--ws-divider)',
                  }}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usuariosFiltrados.map((usuario) => {
                const roleStyle = ROLE_STYLES[usuario.role] || ROLE_STYLES.company_agent
                return (
                  <tr
                    key={usuario.id}
                    style={{ borderBottom: '1px solid var(--ws-divider)', transition: 'var(--ws-transition)' }}
                    onMouseEnter={(event) => (event.currentTarget.style.background = 'rgba(62,91,255,0.03)')}
                    onMouseLeave={(event) => (event.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>
                        {usuario.nome}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ws-text-2)' }}>
                        <Mail size={13} style={{ color: 'var(--ws-text-3)' }} />
                        {usuario.email}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 10px',
                        borderRadius: 6,
                        background: roleStyle.bg,
                        color: roleStyle.color,
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}>
                        <Shield size={12} />
                        {ROLE_LABELS[usuario.role] || usuario.role}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <UsuarioWorkspacesSummary workspaces={workspacesPorUsuarioVisivel[usuario.id] ?? []} />
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 10px',
                        borderRadius: 6,
                        background: usuario.ativo ? 'rgba(15,168,86,0.15)' : 'rgba(163,45,45,0.15)',
                        color: usuario.ativo ? 'var(--ws-green)' : '#a32d2d',
                        fontSize: 12,
                        fontWeight: 600,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: usuario.ativo ? 'var(--ws-green)' : '#a32d2d' }} />
                        {usuario.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          onClick={() => alterarStatusUsuario(usuario)}
                          disabled={alterandoStatusId === usuario.id}
                          style={{
                            height: 30,
                            padding: '0 10px',
                            borderRadius: 6,
                            border: `1px solid ${usuario.ativo ? 'rgba(163,45,45,0.35)' : 'rgba(15,168,86,0.35)'}`,
                            background: 'transparent',
                            color: usuario.ativo ? '#a32d2d' : 'var(--ws-green)',
                            fontSize: 12,
                            cursor: alterandoStatusId === usuario.id ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            opacity: alterandoStatusId === usuario.id ? 0.6 : 1,
                          }}
                        >
                          {alterandoStatusId === usuario.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : usuario.ativo ? (
                            <Trash2 size={12} />
                          ) : (
                            <UserPlus size={12} />
                          )}
                          {usuario.ativo ? 'Inativar usuário' : 'Reativar usuário'}
                        </button>
                        <button
                          onClick={() => abrirEdicao(usuario)}
                          style={{
                            height: 30,
                            padding: '0 10px',
                            borderRadius: 6,
                            border: '1px solid var(--ws-glass-border)',
                            background: 'transparent',
                            color: 'var(--ws-text-2)',
                            fontSize: 12,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <Edit3 size={12} />
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </WSTable>
        )}
      </WSTableShell>

      <Sheet open={drawerAberto} onOpenChange={(open) => (open ? setDrawerAberto(true) : fecharDrawer())}>
        <SheetContent
          side="right"
          showCloseButton={false}
          style={{
            width: 'min(480px, 100vw)',
            ...wsSheetCreamStyle,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <SheetTitle className="sr-only">Novo Usuário</SheetTitle>
          <SheetDescription className="sr-only">Cadastre um acesso para a plataforma</SheetDescription>
          <div style={{
            padding: '24px 28px 20px',
            borderBottom: `1px solid ${wsSheetCreamTokens.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)' }}>
                Novo Usuário
              </h2>
              <p style={{ fontSize: 12, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
                Cadastre um acesso para a plataforma
              </p>
            </div>
            <button
              onClick={fecharDrawer}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                ...wsSheetCreamCloseButtonStyle,
                color: 'var(--ws-text-2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={labelStyle}>Nome *</label>
                <input
                  type="text"
                  name="novo-usuario-nome"
                  autoComplete="off"
                  value={form.nome}
                  onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))}
                  placeholder="Nome completo"
                  style={inputStyle}
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
                  style={inputStyle}
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
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Role *</label>
                <select
                  value={form.role}
                  onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as RoleUsuario }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {ROLES.map((role) => (
                    <option key={role.id} value={role.id}>{role.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Workspace <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opcional)</span></label>
                <select
                  value={form.workspace_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, workspace_id: event.target.value }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">Sem workspace</option>
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>{workspace.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div style={{
            padding: '20px 28px',
            borderTop: `1px solid ${wsSheetCreamTokens.border}`,
            display: 'flex',
            gap: 12,
          }}>
            <button
              onClick={fecharDrawer}
              style={{
                flex: 1,
                height: 42,
                borderRadius: 10,
                border: `1px solid ${wsSheetCreamTokens.border}`,
                background: 'transparent',
                color: 'var(--ws-text-2)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={salvarUsuario}
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
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={editDrawerAberto} onOpenChange={(open) => (open ? setEditDrawerAberto(true) : fecharEdicao())}>
        <DialogContent
          showCloseButton={false}
          style={{
            width: 'min(960px, calc(100vw - 16px))',
            maxHeight: 'calc(100vh - 16px)',
            borderRadius: 18,
            ...wsSheetCreamStyle,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <DialogTitle className="sr-only">Editar Usuário</DialogTitle>
          <DialogDescription className="sr-only">
            Atualize os dados do usuário, status e acessos de workspace
          </DialogDescription>
          <div style={{
            padding: '24px 28px 20px',
            borderBottom: `1px solid ${wsSheetCreamTokens.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)' }}>
                Editar Usuário
              </h2>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-1)', margin: '4px 0 0' }}>
                {usuarioEditando?.nome}
              </p>
              <p style={{ fontSize: 12, color: 'var(--ws-text-2)', margin: '2px 0 0' }}>
                {usuarioEditando?.email}
              </p>
            </div>
            <button
              onClick={fecharEdicao}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                ...wsSheetCreamCloseButtonStyle,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={labelStyle}>Nome *</label>
                <input
                  type="text"
                  name="editar-usuario-nome"
                  autoComplete="off"
                  value={editForm.nome}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, nome: e.target.value }))}
                  placeholder="Nome completo"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Email *</label>
                <input
                  type="email"
                  name="editar-usuario-email"
                  autoComplete="off"
                  value={editForm.email}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="usuario@empresa.com.br"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Role *</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value as RoleUsuario }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}
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
                  onClick={() => setEditForm((prev) => ({ ...prev, ativo: !prev.ativo }))}
                  style={{
                    ...inputStyle,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: editForm.ativo ? 'var(--ws-green)' : '#a32d2d',
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: editForm.ativo ? 'var(--ws-green)' : '#a32d2d' }}>
                    {editForm.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </button>
              </div>
              <div>
                <label style={labelStyle}>
                  Nova Senha <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opcional — deixe vazio para manter)</span>
                </label>
                <input
                  type="password"
                  name="editar-usuario-senha"
                  autoComplete="new-password"
                  value={editForm.senha}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, senha: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                  style={inputStyle}
                />
              </div>

              {/* Workspace Access Section */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                  <label style={labelStyle}>Acesso a Workspaces</label>
                  {acessosTemMudancas && (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      padding: '3px 8px',
                      borderRadius: 999,
                      background: 'rgba(62,91,255,0.12)',
                      border: '1px solid rgba(62,91,255,0.18)',
                      color: 'var(--ws-blue)',
                    }}>
                      Alterações pendentes
                    </span>
                  )}
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
                    name="editar-usuario-workspace-search"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={buscaWorkspaceAcesso}
                    onChange={(event) => setBuscaWorkspaceAcesso(event.target.value)}
                    placeholder="Buscar workspace..."
                    style={{
                      ...inputStyle,
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      height: 20,
                      minWidth: 0,
                    }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--ws-text-3)', whiteSpace: 'nowrap' }}>
                    {acessosWsFiltrados.length}/{acessosWs.length}
                  </span>
                </div>
                {precisaEscolherPadrao && (
                  <p style={{ fontSize: 11, color: '#a16207', margin: '0 0 10px' }}>
                    Escolha um workspace padrão entre os selecionados antes de salvar.
                  </p>
                )}
                {!editForm.ativo && (
                  <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 10px' }}>
                    O usuário está inativo; ajuste o status no topo se precisar reativar.
                  </p>
                )}
                {acessosWsCarregando ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                    <Loader2 size={18} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
                  </div>
                ) : acessosWsFiltrados.length === 0 ? (
                  <div style={{
                    padding: '14px 12px',
                    borderRadius: 10,
                    border: `1px dashed ${wsSheetCreamTokens.border}`,
                    color: 'var(--ws-text-3)',
                    fontSize: 12,
                  }}>
                    {buscaWorkspaceAcesso ? 'Nenhum workspace encontrado para este filtro.' : 'Nenhum workspace disponível.'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {acessosWsFiltrados.map((acesso) => (
                      <div
                        key={acesso.workspace_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: `1px solid ${acesso.checked ? 'rgba(62,91,255,0.25)' : wsSheetCreamTokens.border}`,
                          background: acesso.checked ? 'rgba(62,91,255,0.06)' : 'transparent',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={acesso.checked}
                          disabled={editSalvando}
                          onChange={(e) => alterarAcessoWorkspace(acesso.workspace_id, e.target.checked)}
                          style={{ flexShrink: 0, cursor: editSalvando ? 'not-allowed' : 'pointer' }}
                        />
                        <Building2 size={13} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--ws-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {acesso.workspace_nome}
                        </span>
                        {acesso.checked && (
                          <select
                            value={acesso.role}
                            disabled={editSalvando}
                            onChange={(event) =>
                              setAcessosWs((prev) => prev.map((item) => (
                                item.workspace_id === acesso.workspace_id
                                  ? { ...item, role: event.target.value }
                                  : item
                              )))
                            }
                            style={{
                              padding: '3px 6px',
                              borderRadius: 5,
                              border: `1px solid ${wsSheetCreamTokens.border}`,
                              background: 'var(--ws-glass-bg)',
                              color: 'var(--ws-text-2)',
                              fontSize: 11,
                              cursor: editSalvando ? 'not-allowed' : 'pointer',
                            }}
                          >
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                        {acesso.checked && acesso.padrao && (
                          <span style={{
                            fontSize: 9, fontWeight: 700,
                            padding: '2px 6px', borderRadius: 4,
                            background: 'rgba(201,168,76,0.20)', color: '#c9a84c',
                            whiteSpace: 'nowrap',
                          }}>
                            Padrão
                          </span>
                        )}
                        {acesso.checked && !acesso.padrao && (
                          <button
                            type="button"
                            title="Definir como padrão"
                            onClick={() => definirPadraoLocal(acesso.workspace_id)}
                            disabled={editSalvando}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: editSalvando ? 'not-allowed' : 'pointer',
                              padding: 2,
                              color: 'var(--ws-blue)',
                              display: 'flex',
                              alignItems: 'center',
                              opacity: editSalvando ? 0.45 : 1,
                            }}
                          >
                            <Star size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div style={{
            padding: '20px 28px',
            borderTop: `1px solid ${wsSheetCreamTokens.border}`,
            display: 'flex',
            gap: 12,
          }}>
            <button
              onClick={fecharEdicao}
              style={{
                flex: 1,
                height: 42,
                borderRadius: 10,
                border: `1px solid ${wsSheetCreamTokens.border}`,
                background: 'transparent',
                color: 'var(--ws-text-2)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={salvarEdicao}
              disabled={editSalvando}
              style={{
                flex: 2,
                height: 42,
                borderRadius: 10,
                border: 'none',
                background: editSalvando ? 'rgba(62,91,255,0.50)' : 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                cursor: editSalvando ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: editSalvando ? 'none' : '0 4px 12px rgba(62,91,255,0.30)',
              }}
            >
              {editSalvando ? <Loader2 size={16} className="animate-spin" /> : <Edit3 size={16} />}
              {editSalvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
