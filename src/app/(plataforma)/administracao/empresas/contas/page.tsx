'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2,
  Check,
  ChevronRight,
  CreditCard,
  Loader2,
  Pencil,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { wsSheetCreamCloseButtonStyle, wsSheetCreamInputStyle, wsSheetCreamStyle, wsSheetCreamTokens } from '@/components/ui/ws-sheet'
import { WSTable, WSTableActions, WSTableShell } from '@/components/ui/ws-table'
import { useAuth } from '@/hooks/use-auth'
import api from '@/lib/api-client'

interface Workspace {
  id: string
  nome: string
  razao_social: string | null
  cnpj: string | null
  endereco: Record<string, string>
  ativo: boolean
  modulos: string[]
}

interface ReceitaWS {
  status: string
  nome: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  municipio: string
  uf: string
  cep: string
}

const MODULOS = [
  { id: 'marketing', label: 'Marketing' },
  { id: 'crm', label: 'CRM' },
  { id: 'gestao', label: 'Gestão' },
  { id: 'performance', label: 'Performance' },
]

function formatCNPJ(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

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
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--ws-text-2)',
  display: 'block',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

function emptyForm() {
  return {
    nome: '',
    razao_social: '',
    cnpj: '',
    endereco: { logradouro: '', numero: '', complemento: '', bairro: '', municipio: '', uf: '', cep: '' },
    modulos: [] as string[],
    ativo: true,
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

export default function ClientesPage() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()

  const [clientes, setClientes] = useState<Workspace[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [buscandoCNPJ, setBuscandoCNPJ] = useState(false)
  const [clienteSalvo, setClienteSalvo] = useState<Workspace | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())

  useEffect(() => {
    if (!authLoading && user && user.role !== 'platform_admin') router.push('/')
  }, [authLoading, user, router])

  const refreshClientes = useCallback(async () => {
    const data = await api.get<Workspace[]>('/workspaces')
    setClientes(data)
    return data
  }, [])

  useEffect(() => {
    if (user?.role !== 'platform_admin') return

    let ativo = true

    const carregar = async () => {
      setCarregando(true)
      try {
        await refreshClientes()
      } catch (err: unknown) {
        if (ativo) {
          toast.error(getErrorMessage(err, 'Erro ao carregar clientes'))
        }
      } finally {
        if (ativo) {
          setCarregando(false)
        }
      }
    }

    void carregar()

    return () => {
      ativo = false
    }
  }, [user, refreshClientes])

  async function buscarCNPJ(cnpj: string) {
    const digits = cnpj.replace(/\D/g, '')
    if (digits.length !== 14) return
    setBuscandoCNPJ(true)
    try {
      const res = await fetch(`/api/cnpj/${digits}`)
      const data: ReceitaWS = await res.json()
      if (data.status !== 'OK') throw new Error('CNPJ inválido ou não encontrado')
      setForm(prev => ({
        ...prev,
        razao_social: data.nome || prev.razao_social,
        endereco: {
          logradouro: data.logradouro || '',
          numero: data.numero || '',
          complemento: data.complemento || '',
          bairro: data.bairro || '',
          municipio: data.municipio || '',
          uf: data.uf || '',
          cep: data.cep || '',
        },
      }))
      toast.success('Dados preenchidos via Receita Federal')
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Erro ao buscar CNPJ'))
    } finally {
      setBuscandoCNPJ(false)
    }
  }

  async function salvar() {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    setSalvando(true)
    const payload = {
      nome: form.nome.trim(),
      razao_social: form.razao_social.trim() || null,
      cnpj: form.cnpj || null,
      endereco: form.endereco,
      modulos: form.modulos,
    }
    try {
      if (editandoId) {
        const atualizado = await api.put<Workspace>(`/workspaces/${editandoId}`, payload)
        const workspaceFinal = form.ativo === atualizado.ativo
          ? atualizado
          : await api.patch<Workspace>(`/workspaces/${editandoId}/status`, { ativo: form.ativo })
        setClientes(prev => prev.map(c => c.id === editandoId ? workspaceFinal : c))
        void refreshClientes().catch(() => {})
        fecharDrawer()
        toast.success('Cliente atualizado com sucesso!')
      } else {
        const criado = await api.post<Workspace>('/workspaces', payload)
        const workspaceFinal = form.ativo === criado.ativo
          ? criado
          : await api.patch<Workspace>(`/workspaces/${criado.id}/status`, { ativo: form.ativo })
        setClienteSalvo(workspaceFinal)
        setClientes(prev => [workspaceFinal, ...prev.filter(c => c.id !== workspaceFinal.id)])
        void refreshClientes().catch(() => {})
        setForm(emptyForm())
        toast.success('Cliente criado com sucesso!')
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, editandoId ? 'Erro ao atualizar cliente' : 'Erro ao criar cliente'))
    } finally {
      setSalvando(false)
    }
  }

  function abrirEditar(c: Workspace) {
    setEditandoId(c.id)
    setForm({
      nome: c.nome,
      razao_social: c.razao_social || '',
      cnpj: c.cnpj || '',
      endereco: {
        logradouro: c.endereco?.logradouro || '',
        numero: c.endereco?.numero || '',
        complemento: c.endereco?.complemento || '',
        bairro: c.endereco?.bairro || '',
        municipio: c.endereco?.municipio || '',
        uf: c.endereco?.uf || '',
        cep: c.endereco?.cep || '',
      },
      modulos: c.modulos || [],
      ativo: c.ativo,
    })
    setDrawerAberto(true)
  }

  function fecharDrawer() {
    setDrawerAberto(false)
    setClienteSalvo(null)
    setEditandoId(null)
    setForm(emptyForm())
  }

  function toggleModulo(id: string) {
    setForm(prev => ({
      ...prev,
      modulos: prev.modulos.includes(id)
        ? prev.modulos.filter(m => m !== id)
        : [...prev.modulos, id],
    }))
  }

  function setEndereco(field: string, value: string) {
    setForm(prev => ({ ...prev, endereco: { ...prev.endereco, [field]: value } }))
  }

  const filtrados = clientes.filter(c => {
    const t = busca.toLowerCase()
    return (
      c.nome.toLowerCase().includes(t) ||
      (c.cnpj || '').includes(t) ||
      (c.razao_social?.toLowerCase() || '').includes(t)
    )
  })

  if (authLoading || !user || user.role !== 'platform_admin') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)', letterSpacing: '-0.02em' }}>
            Clientes
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
            Gerencie os workspaces e suas configurações
          </p>
        </div>
        <button
          onClick={() => setDrawerAberto(true)}
          style={{
            background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
            border: 'none', padding: '0 20px', height: 42, borderRadius: 10,
            fontSize: 13, fontWeight: 600, color: 'white', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 12px rgba(62,91,255,0.30)',
          }}
        >
          <Plus size={16} />
          Novo Cliente
        </button>
      </div>

      {/* Busca */}
      <div style={{
        background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
        borderRadius: 12, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 24, backdropFilter: 'blur(10px)',
      }}>
        <Search size={16} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Buscar por nome, CNPJ ou razão social..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 14, color: 'var(--ws-text-1)', outline: 'none' }}
        />
        <span style={{ fontSize: 12, color: 'var(--ws-text-3)', flexShrink: 0 }}>
          {filtrados.length} cliente{filtrados.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tabela */}
      <WSTableShell>
        {carregando ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
            <p style={{ fontSize: 13, color: 'var(--ws-text-2)', marginTop: 12 }}>Carregando clientes...</p>
          </div>
        ) : filtrados.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Building2 size={32} style={{ color: 'var(--ws-text-3)', marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: 'var(--ws-text-2)' }}>
              {busca ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
            </p>
            {!busca && (
              <p style={{ fontSize: 12, color: 'var(--ws-text-3)', marginTop: 4 }}>
                Clique em &ldquo;Novo Cliente&rdquo; para começar
              </p>
            )}
          </div>
        ) : (
          <WSTable minWidth={720}>
            <thead>
              <tr>
                {['Nome', 'CNPJ', 'Módulos ativos', 'Status', 'Ações'].map(h => (
                  <th key={h} style={{
                    padding: '8px 14px', fontSize: 10, fontWeight: 600,
                    color: 'var(--ws-text-3)', textAlign: 'left',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    whiteSpace: 'nowrap', background: 'rgba(62,91,255,0.04)',
                    borderBottom: '1px solid var(--ws-divider)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(c => (
                <tr
                  key={c.id}
                  style={{ borderBottom: '1px solid var(--ws-divider)', transition: 'var(--ws-transition)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(62,91,255,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '9px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: 'rgba(62,91,255,0.12)', border: '1px solid rgba(62,91,255,0.22)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, fontWeight: 600, color: 'var(--ws-blue)',
                      }}>
                        {c.nome[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ws-text-1)' }}>{c.nome}</div>
                        {c.razao_social && (
                          <div style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>{c.razao_social}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--ws-text-2)', whiteSpace: 'nowrap' }}>
                    {c.cnpj || '—'}
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(c.modulos || []).length === 0 ? (
                        <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>—</span>
                      ) : (c.modulos || []).map(m => (
                        <span key={m} style={{
                          padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                          background: 'rgba(62,91,255,0.12)', color: 'var(--ws-blue)',
                        }}>
                          {MODULOS.find(x => x.id === m)?.label || m}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      background: c.ativo ? 'rgba(15,168,86,0.15)' : 'rgba(239,68,68,0.15)',
                      color: c.ativo ? '#0fa856' : '#ef4444',
                    }}>
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                    <WSTableActions>
                      <button
                        onClick={() => abrirEditar(c)}
                        style={{
                          padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 500,
                          background: 'rgba(255,255,255,0.06)', color: 'var(--ws-text-2)',
                          border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <Pencil size={12} />
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled
                        title="Em breve"
                        style={{
                          padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 500,
                          background: 'rgba(62,91,255,0.10)', color: 'var(--ws-blue)',
                          border: '1px solid rgba(62,91,255,0.20)', cursor: 'not-allowed',
                          opacity: 0.72,
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <CreditCard size={12} />
                        Conta Ads
                        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.85 }}>
                          Em breve
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled
                        title="Em breve"
                        style={{
                          padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 500,
                          background: 'rgba(122,90,248,0.10)', color: 'var(--ws-purple)',
                          border: '1px solid rgba(122,90,248,0.20)', cursor: 'not-allowed',
                          opacity: 0.72,
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <Users size={12} />
                        Usuário
                        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.04em', opacity: 0.85 }}>
                          Em breve
                        </span>
                      </button>
                    </WSTableActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </WSTable>
        )}
      </WSTableShell>

      {/* Drawer */}
      <Sheet open={drawerAberto} onOpenChange={open => { if (!open) fecharDrawer() }}>
        <SheetContent
          side="right"
          style={{
            width: '100%', maxWidth: 520,
            ...wsSheetCreamStyle,
            padding: 0, overflowY: 'auto',
          }}
        >
          {clienteSalvo ? (
            /* Success state */
            <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'rgba(15,168,86,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Check size={22} style={{ color: '#0fa856' }} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--ws-text-1)' }}>
                    Cliente criado!
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ws-text-2)' }}>
                    {clienteSalvo.nome} foi adicionado com sucesso
                  </p>
                </div>
              </div>

              <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: 0 }}>Próximos passos:</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {([
                  { icon: <CreditCard size={18} style={{ color: 'var(--ws-blue)' }} />, titulo: 'Adicionar Conta Ads', sub: 'Meta, Google, LinkedIn, TikTok', href: '/administracao/contas-ads' },
                  { icon: <Users size={18} style={{ color: 'var(--ws-purple)' }} />, titulo: 'Adicionar Usuário', sub: 'Vincular usuário ao workspace', href: null },
                ] as const).map(item => {
                  const desabilitado = item.href == null
                  return (
                    <button
                      key={item.titulo}
                      type="button"
                      disabled={desabilitado}
                      title={desabilitado ? 'Em breve' : undefined}
                      onClick={() => { if (item.href) { fecharDrawer(); router.push(item.href) } }}
                      style={{
                        padding: '14px 16px', borderRadius: 12,
                        background: wsSheetCreamTokens.surface,
                        border: `1px solid ${wsSheetCreamTokens.border}`,
                        color: 'var(--ws-text-1)',
                        cursor: desabilitado ? 'not-allowed' : 'pointer',
                        opacity: desabilitado ? 0.72 : 1,
                        display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                      }}
                    >
                      {item.icon}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{item.titulo}</div>
                          {desabilitado && (
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              color: 'var(--ws-text-3)',
                              background: 'rgba(255,255,255,0.05)',
                              border: '1px solid rgba(255,255,255,0.10)',
                              padding: '2px 6px',
                              borderRadius: 999,
                            }}>
                              Em breve
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 2 }}>{item.sub}</div>
                      </div>
                      <ChevronRight size={16} style={{ color: 'var(--ws-text-3)' }} />
                    </button>
                  )
                })}
              </div>

              <button
                onClick={fecharDrawer}
                style={{
                  padding: '11px', borderRadius: 10, fontSize: 13,
                  background: 'transparent', border: `1px solid ${wsSheetCreamTokens.border}`,
                  color: 'var(--ws-text-2)', cursor: 'pointer', marginTop: 4,
                }}
              >
                Fechar
              </button>
            </div>
          ) : (
            /* Form */
            <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--ws-text-1)' }}>
                    {editandoId ? 'Editar Cliente' : 'Novo Cliente'}
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ws-text-2)' }}>
                    {editandoId ? 'Atualize os dados do workspace' : 'Configure o workspace do cliente'}
                  </p>
                </div>
                <button
                  onClick={fecharDrawer}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    ...wsSheetCreamCloseButtonStyle,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: 'var(--ws-text-2)', flexShrink: 0,
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Nome */}
              <div>
                <label style={labelStyle}>Nome *</label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                  placeholder="Nome comercial do cliente"
                  style={inputStyle}
                />
              </div>

              {/* CNPJ */}
              <div>
                <label style={labelStyle}>CNPJ</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={form.cnpj}
                    onChange={e => setForm(p => ({ ...p, cnpj: formatCNPJ(e.target.value) }))}
                    onBlur={e => buscarCNPJ(e.target.value)}
                    placeholder="00.000.000/0000-00"
                    maxLength={18}
                    style={{ ...inputStyle, paddingRight: buscandoCNPJ ? 44 : 14 }}
                  />
                  {buscandoCNPJ && (
                    <Loader2 size={16} className="animate-spin" style={{
                      position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                      color: 'var(--ws-blue)',
                    }} />
                  )}
                </div>
                <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 4 }}>
                  Ao sair do campo, buscamos os dados da Receita Federal automaticamente
                </p>
              </div>

              {/* Razão Social */}
              <div>
                <label style={labelStyle}>Razão Social</label>
                <input
                  type="text"
                  value={form.razao_social}
                  onChange={e => setForm(p => ({ ...p, razao_social: e.target.value }))}
                  placeholder="Preenchida automaticamente via CNPJ"
                  style={inputStyle}
                />
              </div>

              {/* Endereço */}
              <div>
                <label style={labelStyle}>Endereço</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px', gap: 10 }}>
                    <input
                      type="text"
                      value={form.endereco.logradouro}
                      onChange={e => setEndereco('logradouro', e.target.value)}
                      placeholder="Logradouro"
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={form.endereco.numero}
                      onChange={e => setEndereco('numero', e.target.value)}
                      placeholder="Nº"
                      style={inputStyle}
                    />
                  </div>
                  <input
                    type="text"
                    value={form.endereco.complemento}
                    onChange={e => setEndereco('complemento', e.target.value)}
                    placeholder="Complemento"
                    style={inputStyle}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input
                      type="text"
                      value={form.endereco.bairro}
                      onChange={e => setEndereco('bairro', e.target.value)}
                      placeholder="Bairro"
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={form.endereco.municipio}
                      onChange={e => setEndereco('municipio', e.target.value)}
                      placeholder="Cidade"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 10 }}>
                    <input
                      type="text"
                      value={form.endereco.uf}
                      onChange={e => setEndereco('uf', e.target.value.toUpperCase().slice(0, 2))}
                      placeholder="UF"
                      maxLength={2}
                      style={inputStyle}
                    />
                    <input
                      type="text"
                      value={form.endereco.cep}
                      onChange={e => setEndereco('cep', e.target.value)}
                      placeholder="CEP"
                      style={inputStyle}
                    />
                  </div>
                </div>
              </div>

              {/* Status */}
              <div>
                <label style={labelStyle}>Status</label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: wsSheetCreamTokens.surface,
                  border: `1px solid ${wsSheetCreamTokens.border}`,
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ws-text-1)' }}>
                      {form.ativo ? 'Ativo' : 'Inativo'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 2 }}>
                      Define se o cliente aparece como ativo na plataforma
                    </div>
                  </div>
                  <Switch
                    checked={form.ativo}
                    onCheckedChange={(checked) => setForm(prev => ({ ...prev, ativo: checked }))}
                  />
                </div>
              </div>

              {/* Módulos */}
              <div>
                <label style={labelStyle}>Módulos</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {MODULOS.map(m => {
                    const ativo = form.modulos.includes(m.id)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleModulo(m.id)}
                        style={{
                          padding: '10px 14px', borderRadius: 10,
                          background: ativo ? 'rgba(62,91,255,0.14)' : wsSheetCreamTokens.surface,
                          border: `1px solid ${ativo ? 'rgba(62,91,255,0.40)' : wsSheetCreamTokens.border}`,
                          color: ativo ? 'var(--ws-blue)' : 'var(--ws-text-2)',
                          fontSize: 13, fontWeight: ativo ? 600 : 400,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                          transition: 'all 150ms ease',
                        }}
                      >
                        <div style={{
                          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                          background: ativo ? 'var(--ws-blue)' : wsSheetCreamTokens.checkboxUncheckedBg,
                          border: `1.5px solid ${ativo ? 'var(--ws-blue)' : wsSheetCreamTokens.checkboxUncheckedBorder}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 150ms ease',
                        }}>
                          {ativo && <Check size={10} style={{ color: '#fff' }} />}
                        </div>
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Salvar */}
              <button
                onClick={salvar}
                disabled={salvando}
                style={{
                  padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                  background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
                  border: 'none', color: 'white',
                  cursor: salvando ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: salvando ? 0.75 : 1,
                  boxShadow: '0 4px 12px rgba(62,91,255,0.30)',
                  marginTop: 4,
                }}
              >
                {salvando && <Loader2 size={16} className="animate-spin" />}
                {salvando ? 'Salvando...' : editandoId ? 'Salvar Alterações' : 'Salvar Cliente'}
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
