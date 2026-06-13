'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Edit3, Loader2, Mail, Plus, Search, Shield, Trash2, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import useSWR from 'swr'
import { WSTable, WSTableShell } from '@/components/ui/ws-table'
import { wsSheetCreamInputStyle } from '@/components/ui/ws-sheet'
import { UsuarioWorkspacesSummary } from '@/components/administracao/usuarios/usuario-workspaces-summary'
import { useAuth } from '@/hooks/use-auth'
import api from '@/lib/api-client'

import type { AdminUserRole, WorkspaceAccessApiRow, WorkspaceOption } from '@/lib/admin-users-edit'

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

export default function UsuariosAdministracaoPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, isLoading: authLoading } = useAuth()

  const [busca, setBusca] = useState('')
  const [filtroRole, setFiltroRole] = useState<RoleUsuario | 'todas'>('todas')
  const [filtroStatus, setFiltroStatus] = useState<StatusFiltro>('ativo')
  const [filtroWorkspace, setFiltroWorkspace] = useState<string>('todos')

  const [alterandoStatusId, setAlterandoStatusId] = useState<string | null>(null)
  const [workspacesPorUsuario, setWorkspacesPorUsuario] = useState<Record<string, WorkspaceAcesso[]>>({})
  const filtroWorkspaceInicializado = useRef(false)
  const filtroWorkspaceRef = useRef(filtroWorkspace)
  const isPlatformAdmin = user?.role === 'platform_admin'
  const workspaceIdQuery = searchParams.get('workspace_id') ?? ''

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
    if (filtroWorkspaceInicializado.current) return

    // Se há workspace_id na URL, aguardar workspaces carregarem para validar o ID
    if (workspaceIdQuery && workspacesOrdenados.length === 0) return

    filtroWorkspaceInicializado.current = true

    if (!workspaceIdQuery) return  // 'todos' já é o default

    const existe = workspacesOrdenados.some((w) => w.id === workspaceIdQuery)
    if (!existe) {
      console.warn('[usuarios-admin] workspace_id da URL não encontrado na lista, usando Todos')
      return
    }
    if (workspaceIdQuery !== filtroWorkspaceRef.current) {
      setFiltroWorkspace(workspaceIdQuery)
    }
  }, [workspaceIdQuery, workspacesOrdenados])

  useEffect(() => {
    if (usuariosError) toast.error(getErrorMessage(usuariosError, 'Erro ao carregar usuários'))
  }, [usuariosError])

  useEffect(() => {
    if (!isPlatformAdmin || usuarios.length === 0) return
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        usuarios.map(async (usuario) => {
          try {
            const acessos = await api.get<WorkspaceAcesso[]>(`/users/${usuario.id}/workspaces`)
            return [usuario.id, acessos.filter((a) => a.ativo)] as const
          } catch {
            return [usuario.id, [] as WorkspaceAcesso[]] as const
          }
        }),
      )
      if (cancelled) return
      setWorkspacesPorUsuario(Object.fromEntries(entries))
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

  function atualizarFiltroWorkspace(workspaceId: string) {
    setFiltroWorkspace(workspaceId)

    const params = new URLSearchParams(searchParams.toString())
    if (workspaceId === 'todos') {
      params.delete('workspace_id')
    } else {
      params.set('workspace_id', workspaceId)
    }

    const nextPath = params.toString() ? `${pathname}?${params.toString()}` : pathname
    router.replace(nextPath, { scroll: false })
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
          onClick={() => router.push('/administracao/usuarios/novo')}
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
          onChange={(event) => atualizarFiltroWorkspace(event.target.value)}
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
                          onClick={() => router.push(`/administracao/usuarios/${usuario.id}/editar`)}
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


    </div>
  )
}
