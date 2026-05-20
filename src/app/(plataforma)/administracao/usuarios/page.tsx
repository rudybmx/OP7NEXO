'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, Edit3, Loader2, Mail, Plus, Search, Shield, Star, Trash2, UserPlus, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import useSWR from 'swr'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { WSTable, WSTableShell } from '@/components/ui/ws-table'
import { wsSheetCreamCloseButtonStyle, wsSheetCreamInputStyle, wsSheetCreamStyle, wsSheetCreamTokens } from '@/components/ui/ws-sheet'
import { useAuth } from '@/hooks/use-auth'
import api from '@/lib/api-client'

type RoleUsuario =
  | 'platform_admin'
  | 'network_admin'
  | 'network_viewer'
  | 'company_admin'
  | 'company_agent'

interface UsuarioRow {
  id: string
  nome: string
  email: string
  role: RoleUsuario
  workspace_id: string | null
  workspace_nome: string | null
  ativo: boolean
}

interface WorkspaceRow {
  id: string
  nome: string
}

interface WorkspaceAcesso {
  workspace_id: string
  workspace_nome: string | null
  role: string
  ativo: boolean
  padrao: boolean
}

interface AcessoWsLocal {
  workspace_id: string
  workspace_nome: string
  checked: boolean
  role: string
  padrao: boolean
}

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

interface EditUsuarioForm {
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
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [acessosWs, setAcessosWs] = useState<AcessoWsLocal[]>([])
  const [acessosWsOriginais, setAcessosWsOriginais] = useState<AcessoWsLocal[]>([])
  const [acessosWsCarregando, setAcessosWsCarregando] = useState(false)
  const [acessosWsSalvando, setAcessosWsSalvando] = useState(false)
  const [workspacesPorUsuario, setWorkspacesPorUsuario] = useState<Record<string, WorkspaceAcesso[]>>({})
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

  const acessosWsMap = useMemo(
    () => new Map(acessosWs.map((acesso) => [acesso.workspace_id, acesso] as const)),
    [acessosWs],
  )

  const acessosWsOriginaisMap = useMemo(
    () => new Map(acessosWsOriginais.map((acesso) => [acesso.workspace_id, acesso] as const)),
    [acessosWsOriginais],
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

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return usuarios.filter((usuario) => {
      const matchBusca =
        !termo ||
        usuario.nome.toLowerCase().includes(termo) ||
        usuario.email.toLowerCase().includes(termo)
      const matchRole = filtroRole === 'todas' || usuario.role === filtroRole
      return matchBusca && matchRole
    })
  }, [usuarios, busca, filtroRole])

  function fecharDrawer() {
    setDrawerAberto(false)
    setForm(emptyForm())
  }

  const carregarAcessosWs = useCallback(async (usuario: UsuarioRow) => {
    setAcessosWsCarregando(true)
    setAcessosWs([])
    setAcessosWsOriginais([])
    try {
      const acessos = await api.get<WorkspaceAcesso[]>(`/users/${usuario.id}/workspaces`)
      const acessoMap = new Map(acessos.map((a) => [a.workspace_id, a]))
      const lista = workspaces.map((ws) => {
        const acesso = acessoMap.get(ws.id)
        return {
          workspace_id: ws.id,
          workspace_nome: ws.nome,
          checked: !!acesso,
          role: acesso?.role ?? 'viewer',
          padrao: acesso?.padrao ?? false,
        }
      })
      setAcessosWs(lista)
      setAcessosWsOriginais(lista)
    } catch {
      toast.error('Erro ao carregar acessos de workspace')
    } finally {
      setAcessosWsCarregando(false)
    }
  }, [workspaces])

  function abrirEdicao(usuario: UsuarioRow) {
    setUsuarioEditando(usuario)
    setEditForm({
      nome: usuario.nome,
      email: usuario.email,
      senha: '',
      role: usuario.role,
      ativo: usuario.ativo,
    })
    setEditDrawerAberto(true)
    carregarAcessosWs(usuario)
  }

  function fecharEdicao() {
    setEditDrawerAberto(false)
    setUsuarioEditando(null)
    setAcessosWs([])
    setAcessosWsOriginais([])
  }

  async function salvarAcessosWs() {
    if (!usuarioEditando) return
    setAcessosWsSalvando(true)
    try {
      const acessosAtuais = acessosWs.map((acesso) => ({ ...acesso }))
      const originalMap = acessosWsOriginaisMap

      for (const acesso of acessosAtuais) {
        const tinha = originalMap.has(acesso.workspace_id)
        if (acesso.checked && !tinha) {
          await api.post(`/users/${usuarioEditando.id}/workspaces`, {
            workspace_id: acesso.workspace_id,
            role: acesso.role,
          })
        } else if (acesso.checked && tinha) {
          const ant = originalMap.get(acesso.workspace_id)!
          if (ant.role !== acesso.role) {
            await api.patch(`/users/${usuarioEditando.id}/workspaces/${acesso.workspace_id}`, { role: acesso.role })
          }
        } else if (!acesso.checked && tinha) {
          await api.delete(`/users/${usuarioEditando.id}/workspaces/${acesso.workspace_id}`)
        }
      }
      setAcessosWsOriginais(acessosAtuais)
      toast.success('Acessos atualizados')
      await mutateUsuarios()
    } catch {
      toast.error('Erro ao salvar acessos')
    } finally {
      setAcessosWsSalvando(false)
    }
  }

  const podeDefinirPadrao = useCallback((workspace_id: string) => {
    const atual = acessosWsMap.get(workspace_id)
    const original = acessosWsOriginaisMap.get(workspace_id)

    if (!atual || !original || !atual.checked) {
      return false
    }

    return atual.checked === original.checked && atual.role === original.role
  }, [acessosWsMap, acessosWsOriginaisMap])

  async function definirPadrao(workspace_id: string) {
    if (!usuarioEditando) return
    if (!podeDefinirPadrao(workspace_id)) {
      toast.error('Salve este acesso antes de definir o workspace padrão')
      return
    }
    try {
      await api.patch(`/users/${usuarioEditando.id}/workspace-padrao/${workspace_id}`, {})
      setAcessosWs((prev) => prev.map((a) => ({ ...a, padrao: a.workspace_id === workspace_id })))
      await mutateUsuarios()
      toast.success('Workspace padrão definido')
    } catch {
      toast.error('Erro ao definir workspace padrão')
    }
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

    const payload: Record<string, unknown> = {
      nome,
      email,
      role: editForm.role,
      ativo: editForm.ativo,
    }
    if (editForm.senha.trim()) {
      payload.senha = editForm.senha.trim()
    }

    setEditSalvando(true)
    try {
      const atualizado = await api.put<UsuarioRow>(`/users/${usuarioEditando.id}`, payload)
      await mutateUsuarios(
        (atuais = []) => atuais.map((u) => (u.id === atualizado.id ? atualizado : u)),
        { revalidate: false },
      )
      fecharEdicao()
      toast.success('Usuário atualizado com sucesso')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao atualizar usuário'))
    } finally {
      setEditSalvando(false)
    }
  }

  async function excluirUsuario(usuario: UsuarioRow) {
    const confirmar = window.confirm(`Tem certeza que deseja excluir o usuário "${usuario.nome}"? Esta ação não pode ser desfeita.`)
    if (!confirmar) return

    setExcluindoId(usuario.id)
    try {
      await api.delete(`/users/${usuario.id}`)
      await mutateUsuarios((atuais = []) => atuais.filter((u) => u.id !== usuario.id), { revalidate: false })
      toast.success('Usuário excluído com sucesso')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao excluir usuário'))
    } finally {
      setExcluindoId(null)
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
            type="text"
            placeholder="Buscar por nome ou email..."
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', fontSize: 14, color: 'var(--ws-text-1)', outline: 'none' }}
          />
          <span style={{ fontSize: 12, color: 'var(--ws-text-3)', flexShrink: 0 }}>
            {filtrados.length} usuário{filtrados.length !== 1 ? 's' : ''}
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
      </div>

      <WSTableShell>
        {carregando ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
            <p style={{ fontSize: 13, color: 'var(--ws-text-2)', marginTop: 12 }}>Carregando usuários...</p>
          </div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Users size={32} style={{ color: 'var(--ws-text-3)', marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: 'var(--ws-text-2)' }}>
              {busca || filtroRole !== 'todas' ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}
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
              {filtrados.map((usuario) => {
                const roleStyle = ROLE_STYLES[usuario.role] || ROLE_STYLES.company_agent
                return (
                  <tr
                    key={usuario.id}
                    style={{ borderBottom: '1px solid var(--ws-divider)', transition: 'var(--ws-transition)' }}
                    onMouseEnter={(event) => (event.currentTarget.style.background = 'rgba(62,91,255,0.03)')}
                    onMouseLeave={(event) => (event.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '9px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          background: 'linear-gradient(135deg, rgba(62,91,255,0.85), rgba(122,90,248,0.85))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          fontSize: 13,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}>
                          {usuario.nome.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>
                          {usuario.nome}
                        </span>
                      </div>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Building2 size={13} style={{ color: 'var(--ws-text-3)' }} />
                        {(workspacesPorUsuarioVisivel[usuario.id]?.length ?? 0) > 0 ? (
                          workspacesPorUsuarioVisivel[usuario.id].map((ws) => (
                            <span
                              key={`${usuario.id}-${ws.workspace_id}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '3px 8px',
                                borderRadius: 999,
                                background: 'rgba(62,91,255,0.10)',
                                border: '1px solid rgba(62,91,255,0.18)',
                                color: 'var(--ws-blue)',
                                fontSize: 11,
                                fontWeight: 600,
                                lineHeight: 1.2,
                              }}
                            >
                              {ws.workspace_nome ?? ws.workspace_id}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: 13, color: 'var(--ws-text-2)' }}>Sem workspace</span>
                        )}
                      </div>
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
                          onClick={() => excluirUsuario(usuario)}
                          disabled={excluindoId === usuario.id}
                          style={{
                            height: 30,
                            padding: '0 10px',
                            borderRadius: 6,
                            border: '1px solid rgba(163,45,45,0.35)',
                            background: 'transparent',
                            color: '#a32d2d',
                            fontSize: 12,
                            cursor: excluindoId === usuario.id ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            opacity: excluindoId === usuario.id ? 0.6 : 1,
                          }}
                        >
                          {excluindoId === usuario.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          Excluir
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

      <Sheet open={editDrawerAberto} onOpenChange={(open) => (open ? setEditDrawerAberto(true) : fecharEdicao())}>
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
          <SheetTitle className="sr-only">Editar Usuário</SheetTitle>
          <SheetDescription className="sr-only">
            Atualize os dados do usuário, status e acessos de workspace
          </SheetDescription>
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
              <p style={{ fontSize: 12, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
                {usuarioEditando?.nome}
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
                  value={editForm.senha}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, senha: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                  style={inputStyle}
                />
              </div>

              {/* Workspace Access Section */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <label style={labelStyle}>Acesso a Workspaces</label>
                  <button
                    type="button"
                    onClick={salvarAcessosWs}
                    disabled={acessosWsSalvando}
                    style={{
                      height: 28,
                      padding: '0 12px',
                      borderRadius: 6,
                      border: 'none',
                      background: acessosWsSalvando ? 'rgba(62,91,255,0.40)' : 'rgba(62,91,255,0.85)',
                      color: '#ffffff',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: acessosWsSalvando ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    {acessosWsSalvando ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    Salvar acessos
                  </button>
                </div>
                {acessosWsCarregando ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                    <Loader2 size={18} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {acessosWs.map((acesso) => (
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
                          disabled={acessosWsSalvando}
                          onChange={(e) =>
                            setAcessosWs((prev) =>
                              prev.map((a) =>
                                a.workspace_id === acesso.workspace_id
                                  ? { ...a, checked: e.target.checked }
                                  : a,
                              ),
                            )
                          }
                          style={{ flexShrink: 0, cursor: acessosWsSalvando ? 'not-allowed' : 'pointer' }}
                        />
                        <Building2 size={13} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--ws-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {acesso.workspace_nome}
                        </span>
                        {acesso.padrao && (
                          <span style={{
                            fontSize: 9, fontWeight: 700,
                            padding: '2px 6px', borderRadius: 4,
                            background: 'rgba(201,168,76,0.20)', color: '#c9a84c',
                            whiteSpace: 'nowrap',
                          }}>
                            Padrão
                          </span>
                        )}
                        {acesso.checked && (
                          <>
                            <select
                              value={acesso.role}
                              disabled={acessosWsSalvando}
                              onChange={(e) =>
                                setAcessosWs((prev) =>
                                  prev.map((a) =>
                                    a.workspace_id === acesso.workspace_id
                                      ? { ...a, role: e.target.value }
                                      : a,
                                  ),
                                )
                              }
                              style={{
                                padding: '3px 6px',
                                borderRadius: 5,
                                border: `1px solid ${wsSheetCreamTokens.border}`,
                                background: 'var(--ws-glass-bg)',
                                color: 'var(--ws-text-2)',
                                fontSize: 11,
                                cursor: acessosWsSalvando ? 'not-allowed' : 'pointer',
                              }}
                            >
                              <option value="viewer">Viewer</option>
                              <option value="editor">Editor</option>
                              <option value="admin">Admin</option>
                            </select>
                            {!acesso.padrao && (
                              <button
                                type="button"
                                title="Definir como padrão"
                                onClick={() => definirPadrao(acesso.workspace_id)}
                                disabled={!podeDefinirPadrao(acesso.workspace_id) || acessosWsSalvando}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: !podeDefinirPadrao(acesso.workspace_id) || acessosWsSalvando ? 'not-allowed' : 'pointer',
                                  padding: 2,
                                  color: !podeDefinirPadrao(acesso.workspace_id) || acessosWsSalvando ? 'var(--ws-text-3)' : 'var(--ws-blue)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  opacity: !podeDefinirPadrao(acesso.workspace_id) || acessosWsSalvando ? 0.45 : 1,
                                }}
                              >
                                <Star size={13} />
                              </button>
                            )}
                          </>
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
        </SheetContent>
      </Sheet>
    </div>
  )
}
