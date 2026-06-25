'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Building2, Edit3, Loader2, Search, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
  pode_atender_canais: boolean
  pode_acessar_crm: boolean
}

interface EditUsuarioForm {
  nome: string
  email: string
  senha: string
  role: RoleUsuario
  ativo: boolean
  pode_atender_canais: boolean
  pode_acessar_crm: boolean
}

const ROLES: { id: RoleUsuario; label: string }[] = [
  { id: 'platform_admin', label: 'Administrador' },
  { id: 'network_admin', label: 'Gestor de Rede' },
  { id: 'network_viewer', label: 'Supervisor' },
  { id: 'company_admin', label: 'Admin Cliente' },
  { id: 'company_agent', label: 'Atendente' },
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

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

const LISTA_HREF = '/administracao/usuarios'

export function EditarUsuarioForm({ userId }: { userId: string }) {
  const router = useRouter()
  const [usuario, setUsuario] = useState<UsuarioRow | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [editForm, setEditForm] = useState<EditUsuarioForm>({ nome: '', email: '', senha: '', role: 'company_agent', ativo: true, pode_atender_canais: false, pode_acessar_crm: false })
  const [acessosWs, setAcessosWs] = useState<WorkspaceAccessDraft[]>([])
  const [acessosWsOriginais, setAcessosWsOriginais] = useState<WorkspaceAccessDraft[]>([])
  const [buscaWorkspaceAcesso, setBuscaWorkspaceAcesso] = useState('')
  const [salvando, setSalvando] = useState(false)

  const voltar = useCallback(() => router.push(LISTA_HREF), [router])

  useEffect(() => {
    let ativo = true
    void (async () => {
      try {
        const [usuarios, workspaces, acessos] = await Promise.all([
          api.get<UsuarioRow[]>('/usuarios'),
          api.get<WorkspaceOption[]>('/workspaces'),
          api.get<WorkspaceAccessApiRow[]>(`/users/${userId}/workspaces`),
        ])
        if (!ativo) return
        const u = usuarios.find(x => x.id === userId) ?? null
        if (!u) {
          toast.error('Usuário não encontrado')
          router.push(LISTA_HREF)
          return
        }
        setUsuario(u)
        setEditForm({ nome: u.nome, email: u.email, senha: '', role: u.role, ativo: u.ativo, pode_atender_canais: u.pode_atender_canais, pode_acessar_crm: u.pode_acessar_crm })
        const drafts = buildWorkspaceAccessDrafts(workspaces, acessos)
        setAcessosWs(drafts)
        setAcessosWsOriginais(drafts)
      } catch (err: unknown) {
        if (ativo) toast.error(getErrorMessage(err, 'Erro ao carregar usuário'))
      } finally {
        if (ativo) setCarregando(false)
      }
    })()
    return () => { ativo = false }
  }, [userId, router])

  const acessosWsFiltrados = useMemo(() => {
    const termo = buscaWorkspaceAcesso.trim().toLowerCase()
    if (!termo) return acessosWs
    return acessosWs.filter((a) => a.workspace_nome.toLowerCase().includes(termo) || a.workspace_id.toLowerCase().includes(termo))
  }, [acessosWs, buscaWorkspaceAcesso])

  const acessosTemMudancas = useMemo(() => hasWorkspaceAccessChanges(acessosWs), [acessosWs])
  const precisaEscolherPadrao = useMemo(
    () => acessosWs.some((a) => a.checked) && !acessosWs.some((a) => a.checked && a.padrao),
    [acessosWs],
  )

  function alterarAcessoWorkspace(workspaceId: string, checked: boolean) {
    setAcessosWs((prev) => prev.map((a) => a.workspace_id !== workspaceId ? a : { ...a, checked, padrao: checked ? a.padrao : false }))
  }

  function definirPadraoLocal(workspaceId: string) {
    setAcessosWs((prev) => prev.map((a) => ({ ...a, padrao: a.checked && a.workspace_id === workspaceId })))
  }

  async function salvarEdicao() {
    if (!usuario) return
    const nome = editForm.nome.trim()
    const email = editForm.email.trim().toLowerCase()
    if (!nome) { toast.error('Nome é obrigatório'); return }
    if (!email) { toast.error('Email é obrigatório'); return }
    if (editForm.senha.trim() && editForm.senha.trim().length < 6) { toast.error('Senha deve ter no mínimo 6 caracteres'); return }

    const erroAcessos = validateWorkspaceAccessDrafts(acessosWs, editForm.role)
    if (erroAcessos) { toast.error(erroAcessos); return }

    const payload: Record<string, unknown> = {
      nome, email, role: editForm.role, ativo: editForm.ativo,
      pode_atender_canais: editForm.pode_atender_canais,
      pode_acessar_crm: editForm.pode_acessar_crm,
    }
    if (editForm.senha.trim()) payload.senha = editForm.senha.trim()

    const planoAcessos = buildWorkspaceAccessPlan(acessosWs)
    const workspacePadraoOriginal = acessosWsOriginais.find((a) => a.originalPadrao)?.workspace_id ?? null

    setSalvando(true)
    try {
      await api.put<UsuarioRow>(`/users/${usuario.id}`, payload)
      for (const acesso of planoAcessos.toAdd) {
        await api.post(`/users/${usuario.id}/workspaces`, { workspace_id: acesso.workspace_id, role: acesso.role })
      }
      for (const acesso of planoAcessos.toUpdate) {
        await api.patch(`/users/${usuario.id}/workspaces/${acesso.workspace_id}`, { role: acesso.role })
      }
      if (planoAcessos.defaultWorkspaceId && planoAcessos.defaultWorkspaceId !== workspacePadraoOriginal) {
        await api.patch(`/users/${usuario.id}/workspace-padrao/${planoAcessos.defaultWorkspaceId}`, {})
      }
      for (const acesso of planoAcessos.toRemove) {
        await api.delete(`/users/${usuario.id}/workspaces/${acesso.workspace_id}`)
      }
      toast.success('Usuário atualizado com sucesso')
      router.push(LISTA_HREF)
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao atualizar usuário'))
    } finally {
      setSalvando(false)
    }
  }

  if (carregando || !usuario) {
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
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--ws-text-1)', letterSpacing: '-0.02em' }}>
            Editar Usuário
          </h1>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)', margin: '4px 0 0' }}>{usuario.nome}</p>
          <p style={{ fontSize: 12, color: 'var(--ws-text-2)', margin: '2px 0 0' }}>{usuario.email}</p>
        </div>
      </div>

      <Tabs defaultValue="dados">
        <TabsList aria-label="Seções do usuário">
          <TabsTrigger value="dados">Dados Básicos</TabsTrigger>
          <TabsTrigger value="acessos">Acessos</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" style={{ paddingTop: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <label style={labelStyle}>Nome<Req /></label>
          <input value={editForm.nome} onChange={e => setEditForm(p => ({ ...p, nome: e.target.value }))} placeholder="Nome completo" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Email<Req /></label>
          <input type="email" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} placeholder="usuario@empresa.com.br" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Role<Req /></label>
          <select
            value={editForm.role}
            onChange={e => setEditForm(p => ({ ...p, role: e.target.value as RoleUsuario }))}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {ROLES.map(role => <option key={role.id} value={role.id}>{role.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 44 }}>
            <Switch checked={editForm.ativo} onCheckedChange={checked => setEditForm(p => ({ ...p, ativo: checked }))} />
            <span style={{ fontSize: 14, fontWeight: 500, color: editForm.ativo ? 'var(--ws-green)' : '#a32d2d' }}>
              {editForm.ativo ? 'Ativo' : 'Inativo'}
            </span>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Nova Senha <span style={{ fontWeight: 400 }}>(opcional — deixe vazio para manter)</span></label>
          <input type="password" value={editForm.senha} onChange={e => setEditForm(p => ({ ...p, senha: e.target.value }))} placeholder="Mínimo 6 caracteres" style={inputStyle} />
        </div>
          </div>
        </TabsContent>

        <TabsContent value="acessos" style={{ paddingTop: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Perfil de atendimento (derivado do role) */}
            <div>
              <label style={labelStyle}>Perfil de atendimento</label>
              <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(15,23,42,0.12)', background: 'var(--card, #fff)', fontSize: 13, color: 'var(--ws-text-1)' }}>
                <strong>{editForm.role === 'company_agent' ? 'Atendente' : 'Supervisor'}</strong>
                {editForm.role === 'company_agent'
                  ? ' — vê e atende apenas as conversas atribuídas a ele.'
                  : ' — vê todas as conversas do workspace.'}
                <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 4 }}>
                  Definido pelo Cargo na aba “Dados Básicos”.
                </div>
              </div>
            </div>

            {/* Pode atender canais */}
            <div>
              <label style={labelStyle}>Pode atender canais</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}>
                <Switch checked={editForm.pode_atender_canais} onCheckedChange={checked => setEditForm(p => ({ ...p, pode_atender_canais: checked }))} />
                <span style={{ fontSize: 13, color: 'var(--ws-text-2)' }}>
                  Permite receber/atender conversas e ser escolhido como responsável (inclusive em transferências da IA).
                </span>
              </div>
            </div>

            {/* Pode acessar CRM */}
            <div>
              <label style={labelStyle}>Pode acessar o CRM / Atendimento</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}>
                <Switch checked={editForm.pode_acessar_crm} onCheckedChange={checked => setEditForm(p => ({ ...p, pode_acessar_crm: checked }))} />
                <span style={{ fontSize: 13, color: 'var(--ws-text-2)' }}>
                  Libera o acesso à área de Atendimento/CRM.
                </span>
              </div>
            </div>

        {/* Workspace Access */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Acesso a Workspaces</label>
            {acessosTemMudancas && (
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                padding: '3px 8px', borderRadius: 999,
                background: 'rgba(62,91,255,0.12)', border: '1px solid rgba(62,91,255,0.18)', color: 'var(--ws-blue)',
              }}>
                Alterações pendentes
              </span>
            )}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
            padding: '10px 12px', borderRadius: 10,
            background: 'var(--card, #fff)', border: '1px solid rgba(15,23,42,0.12)',
          }}>
            <Search size={14} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
            <input
              type="text" value={buscaWorkspaceAcesso} onChange={e => setBuscaWorkspaceAcesso(e.target.value)}
              placeholder="Buscar workspace..."
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 13, color: 'var(--ws-text-1)', minWidth: 0 }}
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
          {acessosWsFiltrados.length === 0 ? (
            <div style={{ padding: '14px 12px', borderRadius: 10, border: '1px dashed rgba(15,23,42,0.18)', color: 'var(--ws-text-3)', fontSize: 12 }}>
              {buscaWorkspaceAcesso ? 'Nenhum workspace encontrado para este filtro.' : 'Nenhum workspace disponível.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
              {acessosWsFiltrados.map((acesso) => (
                <div
                  key={acesso.workspace_id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8,
                    border: `1px solid ${acesso.checked ? 'rgba(62,91,255,0.25)' : 'rgba(15,23,42,0.12)'}`,
                    background: acesso.checked ? 'rgba(62,91,255,0.06)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox" checked={acesso.checked} disabled={salvando}
                    onChange={e => alterarAcessoWorkspace(acesso.workspace_id, e.target.checked)}
                    style={{ flexShrink: 0, cursor: salvando ? 'not-allowed' : 'pointer' }}
                  />
                  <Building2 size={13} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--ws-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {acesso.workspace_nome}
                  </span>
                  {acesso.checked && (
                    <select
                      value={acesso.role} disabled={salvando}
                      onChange={e => setAcessosWs(prev => prev.map(item => item.workspace_id === acesso.workspace_id ? { ...item, role: e.target.value } : item))}
                      style={smallSelectStyle}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                  )}
                  {acesso.checked && acesso.padrao && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'rgba(201,168,76,0.20)', color: '#c9a84c', whiteSpace: 'nowrap' }}>
                      Padrão
                    </span>
                  )}
                  {acesso.checked && !acesso.padrao && (
                    <button
                      type="button" title="Definir como padrão" onClick={() => definirPadraoLocal(acesso.workspace_id)} disabled={salvando}
                      style={{ background: 'transparent', border: 'none', cursor: salvando ? 'not-allowed' : 'pointer', padding: 2, color: 'var(--ws-blue)', display: 'flex', alignItems: 'center', opacity: salvando ? 0.45 : 1 }}
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
        </TabsContent>
      </Tabs>

      {/* Footer fixo */}
      <div style={{
        position: 'sticky', bottom: 0, left: 0, right: 0, marginTop: 28,
        display: 'flex', justifyContent: 'flex-end', gap: 12,
        padding: '16px 0', background: 'linear-gradient(to top, var(--bg) 70%, transparent)',
      }}>
        <Button variant="ghost" onClick={voltar} disabled={salvando}>Cancelar</Button>
        <Button onClick={salvarEdicao} disabled={salvando}>
          {salvando ? <Loader2 size={14} className="animate-spin" style={{ marginRight: 6 }} /> : <Edit3 size={14} style={{ marginRight: 6 }} />}
          {salvando ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </div>
  )
}
