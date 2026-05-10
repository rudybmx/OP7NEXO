'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Search, X, CreditCard, Check, ChevronLeft, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useAuth } from '@/hooks/use-auth'
import api from '@/lib/api-client'

interface Workspace {
  id: string
  nome: string
}

interface AdsAccount {
  id: string
  workspace_id: string
  workspace_nome: string
  plataforma: 'meta' | 'google' | 'linkedin' | 'tiktok'
  account_id: string
  nome: string
  bm_id?: string | null
  token?: string | null
  status: 'ativo' | 'expirado' | 'erro'
  sincronizado_em?: string | null
}

interface MetaContaAPI {
  account_id: string
  account_name: string
  account_status: number
  currency: string
}

type Plataforma = 'todas' | 'meta' | 'google' | 'linkedin' | 'tiktok'

const PLATAFORMAS: { id: Plataforma; label: string; cor: string }[] = [
  { id: 'todas', label: 'Todas', cor: 'var(--ws-blue)' },
  { id: 'meta', label: 'Meta', cor: '#0081FB' },
  { id: 'google', label: 'Google', cor: '#EA4335' },
  { id: 'linkedin', label: 'LinkedIn', cor: '#0A66C2' },
  { id: 'tiktok', label: 'TikTok', cor: '#69C9D0' },
]

const PLATFORM_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  meta: { label: 'Meta', bg: 'rgba(0,129,251,0.15)', color: '#0081FB' },
  google: { label: 'Google', bg: 'rgba(234,67,53,0.15)', color: '#EA4335' },
  linkedin: { label: 'LinkedIn', bg: 'rgba(10,102,194,0.15)', color: '#0A66C2' },
  tiktok: { label: 'TikTok', bg: 'rgba(105,201,208,0.15)', color: '#69C9D0' },
}

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  ativo: { label: 'Ativo', bg: 'rgba(15,168,86,0.15)', color: 'var(--ws-green)' },
  expirado: { label: 'Expirado', bg: 'rgba(201,168,76,0.15)', color: '#c9a84c' },
  erro: { label: 'Erro', bg: 'rgba(255,92,141,0.15)', color: 'var(--ws-coral)' },
}

const META_ACCOUNT_STATUS: Record<number, { label: string; color: string }> = {
  1: { label: 'Ativa', color: 'var(--ws-green)' },
  2: { label: 'Desativada', color: 'var(--ws-text-3)' },
  3: { label: 'Suspenso', color: 'var(--ws-coral)' },
}

const PERIODOS = [
  { id: 'mes_atual', label: 'Mês atual' },
  { id: '1_mes', label: '1 mês atrás' },
  { id: '2_meses', label: '2 meses atrás' },
  { id: '3_meses', label: '3 meses atrás' },
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  fontSize: 13,
  color: 'var(--ws-text-1)',
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
    workspace_id: '',
    plataforma: 'meta' as 'meta' | 'google' | 'linkedin' | 'tiktok',
    account_id: '',
    nome: '',
    bm_id: '',
    token: '',
  }
}

export default function ContasAdsPage() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()

  const [contas, setContas] = useState<AdsAccount[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroPlataforma, setFiltroPlataforma] = useState<Plataforma>('todas')
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState(emptyForm())

  // Meta flow
  const [metaStep, setMetaStep] = useState<1 | 2 | 3>(1)
  const [metaBmToken, setMetaBmToken] = useState('')
  const [metaTokenExpira, setMetaTokenExpira] = useState('')
  const [metaContas, setMetaContas] = useState<MetaContaAPI[]>([])
  const [metaSelecionadas, setMetaSelecionadas] = useState<string[]>([])
  const [metaPeriodo, setMetaPeriodo] = useState('mes_atual')
  const [metaErro, setMetaErro] = useState('')
  const [buscandoMeta, setBuscandoMeta] = useState(false)
  const [metaFiltro, setMetaFiltro] = useState('')

  useEffect(() => {
    if (!authLoading && user && user.role !== 'platform_admin') router.push('/')
  }, [authLoading, user, router])

  const loadContas = useCallback(async () => {
    setCarregando(true)
    try {
      const data = await api.get<AdsAccount[]>('/ads-accounts')
      setContas(data)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar contas')
    } finally {
      setCarregando(false)
    }
  }, [])

  const loadWorkspaces = useCallback(async () => {
    try {
      const data = await api.get<Workspace[]>('/workspaces')
      setWorkspaces(data)
    } catch {
      // non-blocking
    }
  }, [])

  useEffect(() => {
    if (user?.role === 'platform_admin') {
      loadContas()
      loadWorkspaces()
    }
  }, [user, loadContas, loadWorkspaces])

  async function buscarContasMeta() {
    if (!metaBmToken.trim()) { setMetaErro('Informe o token de acesso Meta'); return }
    setMetaErro('')
    setBuscandoMeta(true)
    try {
      const data = await api.get<MetaContaAPI[]>(`/meta/contas?token=${encodeURIComponent(metaBmToken.trim())}`)
      setMetaContas(data)
      setMetaSelecionadas([])
      setMetaStep(2)
    } catch (err: any) {
      setMetaErro(err.message || 'Erro ao buscar contas Meta')
    } finally {
      setBuscandoMeta(false)
    }
  }

  function toggleMetaConta(accountId: string) {
    setMetaSelecionadas(prev =>
      prev.includes(accountId) ? prev.filter(id => id !== accountId) : [...prev, accountId]
    )
  }

  async function importarContas() {
    console.log('importar:', { workspace_id: form.workspace_id, contas: metaSelecionadas.length, periodo: metaPeriodo })
    if (!form.workspace_id) { toast.error('Selecione um cliente'); return }
    if (metaSelecionadas.length === 0) { toast.error('Selecione ao menos uma conta'); return }
    setSalvando(true)
    try {
      const contasPayload = metaSelecionadas.map(id => {
        const c = metaContas.find(x => x.account_id === id)
        return { account_id: id, nome: c?.account_name || '' }
      })
      const result = await api.post<{ criadas: number; atualizadas: number }>('/meta/importar-contas', {
        workspace_id: form.workspace_id,
        token: metaBmToken,
        token_expira_em: metaTokenExpira
          ? new Date(metaTokenExpira + 'T23:00:00Z').toISOString()
          : null,
        periodo_sync: metaPeriodo,
        contas: contasPayload,
      })
      fecharDrawer()
      await loadContas()
      const total = result.criadas + result.atualizadas
      toast.success(`${total} conta${total !== 1 ? 's' : ''} importada${total !== 1 ? 's' : ''} com sucesso`)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao importar contas')
    } finally {
      setSalvando(false)
    }
  }

  async function salvarManual() {
    if (!form.workspace_id) { toast.error('Selecione um cliente'); return }
    if (!form.account_id.trim()) { toast.error('Account ID é obrigatório'); return }
    if (!form.nome.trim()) { toast.error('Nome da conta é obrigatório'); return }
    setSalvando(true)
    try {
      const criada = await api.post<AdsAccount>(`/workspaces/${form.workspace_id}/ads-accounts`, {
        plataforma: form.plataforma,
        account_id: form.account_id.trim(),
        nome: form.nome.trim(),
        bm_id: form.bm_id.trim() || null,
        token: form.token.trim() || null,
      })
      setContas(prev => [criada, ...prev])
      fecharDrawer()
      toast.success('Conta criada com sucesso!')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar conta')
    } finally {
      setSalvando(false)
    }
  }

  function fecharDrawer() {
    setDrawerAberto(false)
    setForm(emptyForm())
    setMetaStep(1)
    setMetaBmToken('')
    setMetaTokenExpira('')
    setMetaContas([])
    setMetaSelecionadas([])
    setMetaPeriodo('mes_atual')
    setMetaErro('')
    setMetaFiltro('')
  }

  const filtradas = contas.filter(c => {
    const t = busca.toLowerCase()
    const matchBusca =
      c.nome.toLowerCase().includes(t) ||
      c.account_id.toLowerCase().includes(t) ||
      (c.workspace_nome?.toLowerCase() || '').includes(t)
    const matchPlat = filtroPlataforma === 'todas' || c.plataforma === filtroPlataforma
    return matchBusca && matchPlat
  })

  if (authLoading || !user || user.role !== 'platform_admin') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
      </div>
    )
  }

  const isMeta = form.plataforma === 'meta'

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)', letterSpacing: '-0.02em' }}>
            Contas Ads
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
            Gerencie as contas de anúncios vinculadas aos clientes
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
          Nova Conta
        </button>
      </div>

      {/* Filtro plataforma */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {PLATAFORMAS.map(p => (
          <button
            key={p.id}
            onClick={() => setFiltroPlataforma(p.id)}
            style={{
              padding: '6px 16px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
              border: filtroPlataforma === p.id ? `0.5px solid ${p.cor}` : '1px solid var(--ws-glass-border)',
              background: filtroPlataforma === p.id ? `rgba(${hexToRgb(p.cor)},0.12)` : 'var(--ws-glass-bg)',
              color: filtroPlataforma === p.id ? p.cor : 'var(--ws-text-2)',
            }}
          >
            {p.label}
          </button>
        ))}
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
          placeholder="Buscar por nome, account ID ou cliente..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 14, color: 'var(--ws-text-1)', outline: 'none' }}
        />
        <span style={{ fontSize: 12, color: 'var(--ws-text-3)', flexShrink: 0 }}>
          {filtradas.length} conta{filtradas.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tabela */}
      <div style={{
        background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
        borderRadius: 14, overflow: 'hidden', backdropFilter: 'blur(16px)',
      }}>
        {carregando ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
            <p style={{ fontSize: 13, color: 'var(--ws-text-2)', marginTop: 12 }}>Carregando contas...</p>
          </div>
        ) : filtradas.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <CreditCard size={32} style={{ color: 'var(--ws-text-3)', marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: 'var(--ws-text-2)' }}>
              {busca || filtroPlataforma !== 'todas' ? 'Nenhuma conta encontrada' : 'Nenhuma conta cadastrada'}
            </p>
            {!busca && filtroPlataforma === 'todas' && (
              <p style={{ fontSize: 12, color: 'var(--ws-text-3)', marginTop: 4 }}>
                Clique em "Nova Conta" para começar
              </p>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--ws-glass-border)' }}>
                {['Plataforma', 'Account ID', 'Nome', 'Cliente', 'Status', 'Ações'].map(h => (
                  <th key={h} style={{
                    padding: '14px 18px', fontSize: 11, fontWeight: 600,
                    color: 'var(--ws-text-2)', textAlign: 'left',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.map(c => {
                const plat = PLATFORM_BADGE[c.plataforma]
                const stat = !c.sincronizado_em
                  ? { label: 'Sincronizando...', bg: 'rgba(201,168,76,0.15)', color: '#c9a84c' }
                  : STATUS_BADGE[c.status] || STATUS_BADGE.erro
                return (
                  <tr
                    key={c.id}
                    style={{ borderBottom: '1px solid var(--ws-glass-border)', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px', borderRadius: 6,
                        background: plat.bg, color: plat.color,
                        fontSize: 12, fontWeight: 600,
                      }}>
                        {plat.label}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <code style={{ fontSize: 12, color: 'var(--ws-text-2)', fontFamily: 'monospace' }}>
                        {c.account_id}
                      </code>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 13, color: 'var(--ws-text-1)', fontWeight: 500 }}>
                      {c.nome}
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 13, color: 'var(--ws-text-2)' }}>
                      {c.workspace_nome || '—'}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px', borderRadius: 6,
                        background: stat.bg, color: stat.color,
                        fontSize: 12, fontWeight: 600,
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: stat.color, flexShrink: 0,
                        }} />
                        {stat.label}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      <button
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--ws-glass-border)',
                          borderRadius: 6, padding: '4px 12px',
                          fontSize: 12, color: 'var(--ws-text-2)',
                          cursor: 'pointer',
                        }}
                        onClick={() => toast.info('Edição em breve')}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Drawer Nova Conta */}
      <Sheet open={drawerAberto} onOpenChange={open => !open && fecharDrawer()}>
        <SheetContent
          side="right"
          style={{
            width: isMeta ? 520 : 480,
            background: 'var(--ws-glass-bg)',
            borderLeft: '1px solid var(--ws-glass-border)',
            backdropFilter: 'blur(24px)',
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Drawer header */}
          <div style={{
            padding: '24px 28px 20px',
            borderBottom: '1px solid var(--ws-glass-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)' }}>
                Nova Conta Ads
              </h2>
              <p style={{ fontSize: 12, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
                {isMeta
                  ? `Importar via Meta — passo ${metaStep} de 3`
                  : 'Vincule uma conta de anúncios a um cliente'}
              </p>
            </div>
            <button
              onClick={fecharDrawer}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--ws-glass-border)',
                borderRadius: 8, width: 32, height: 32,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--ws-text-2)',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Drawer body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Plataforma selector */}
              <div>
                <label style={labelStyle}>Plataforma *</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(['meta', 'google', 'linkedin', 'tiktok'] as const).map(p => {
                    const badge = PLATFORM_BADGE[p]
                    const selected = form.plataforma === p
                    return (
                      <button
                        key={p}
                        onClick={() => {
                          setForm(prev => ({ ...prev, plataforma: p }))
                          setMetaStep(1)
                        }}
                        style={{
                          padding: '8px 16px',
                          borderRadius: 8, fontSize: 13, fontWeight: 500,
                          cursor: 'pointer', transition: 'all 0.15s',
                          border: selected ? `1px solid ${badge.color}` : '1px solid var(--ws-glass-border)',
                          background: selected ? badge.bg : 'transparent',
                          color: selected ? badge.color : 'var(--ws-text-2)',
                        }}
                      >
                        {badge.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {isMeta ? (
                <>
                  {/* Step indicator */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {[1, 2, 3].map(s => (
                      <React.Fragment key={s}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700,
                          background: metaStep > s ? 'var(--ws-green)' : metaStep === s ? 'var(--ws-blue)' : 'rgba(255,255,255,0.06)',
                          color: metaStep >= s ? 'white' : 'var(--ws-text-3)',
                          border: metaStep === s ? '2px solid rgba(62,91,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
                          flexShrink: 0,
                        }}>
                          {metaStep > s ? <Check size={12} /> : s}
                        </div>
                        {s < 3 && (
                          <div style={{
                            flex: 1, height: 1,
                            background: metaStep > s ? 'var(--ws-green)' : 'rgba(255,255,255,0.1)',
                          }} />
                        )}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Step 1: Token */}
                  {metaStep === 1 && (
                    <>
                      <div>
                        <label style={labelStyle}>Token de Acesso Meta *</label>
                        <textarea
                          placeholder="Cole o token de acesso aqui..."
                          value={metaBmToken}
                          onChange={e => { setMetaBmToken(e.target.value); setMetaErro('') }}
                          rows={5}
                          style={{
                            ...inputStyle,
                            resize: 'vertical',
                            fontFamily: 'monospace',
                            fontSize: 11,
                            lineHeight: 1.5,
                          }}
                        />
                        {metaErro && (
                          <p style={{ fontSize: 12, color: 'var(--ws-coral)', marginTop: 6 }}>{metaErro}</p>
                        )}
                      </div>

                      <div>
                        <label style={labelStyle}>
                          Válido até{' '}
                          <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                            (opcional)
                          </span>
                        </label>
                        <input
                          type="date"
                          value={metaTokenExpira}
                          onChange={e => setMetaTokenExpira(e.target.value)}
                          style={inputStyle}
                        />
                      </div>
                    </>
                  )}

                  {/* Step 2: Selecionar contas */}
                  {metaStep === 2 && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <label style={{ ...labelStyle, marginBottom: 0 }}>
                          Contas encontradas ({metaContas.length})
                        </label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => setMetaSelecionadas(metaContas.map(c => c.account_id))}
                            style={{
                              background: 'transparent', border: 'none',
                              fontSize: 11, color: 'var(--ws-blue)',
                              cursor: 'pointer', fontWeight: 600,
                            }}
                          >
                            Selecionar todas
                          </button>
                          <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>·</span>
                          <button
                            onClick={() => setMetaSelecionadas([])}
                            style={{
                              background: 'transparent', border: 'none',
                              fontSize: 11, color: 'var(--ws-text-3)',
                              cursor: 'pointer', fontWeight: 600,
                            }}
                          >
                            Limpar seleção
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder="Filtrar contas..."
                        value={metaFiltro}
                        onChange={e => setMetaFiltro(e.target.value)}
                        style={{ ...inputStyle, marginBottom: 8 }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                        {[...metaContas]
                          .sort((a, b) => (a.account_name || '').localeCompare(b.account_name || ''))
                          .filter(c => !metaFiltro.trim() || (c.account_name || c.account_id).toLowerCase().includes(metaFiltro.toLowerCase()))
                          .map(conta => {
                          const selected = metaSelecionadas.includes(conta.account_id)
                          const statusInfo = META_ACCOUNT_STATUS[conta.account_status] || { label: `Status ${conta.account_status}`, color: 'var(--ws-text-3)' }
                          return (
                            <button
                              key={conta.account_id}
                              onClick={() => toggleMetaConta(conta.account_id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '12px 14px', borderRadius: 10,
                                background: selected ? 'rgba(0,129,251,0.08)' : 'rgba(255,255,255,0.04)',
                                border: selected ? '1px solid rgba(0,129,251,0.35)' : '1px solid rgba(255,255,255,0.08)',
                                cursor: 'pointer', textAlign: 'left', width: '100%',
                                transition: 'all 0.15s', flexShrink: 0,
                              }}
                            >
                              <div style={{
                                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                                background: selected ? '#0081FB' : 'rgba(255,255,255,0.06)',
                                border: selected ? '1px solid #0081FB' : '1px solid rgba(255,255,255,0.15)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {selected && <Check size={11} color="white" />}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)', marginBottom: 2 }}>
                                  {conta.account_name || conta.account_id}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <code style={{ fontSize: 11, color: 'var(--ws-text-3)', fontFamily: 'monospace' }}>
                                    {conta.account_id}
                                  </code>
                                  <span style={{ fontSize: 10, color: 'var(--ws-text-3)' }}>·</span>
                                  <span style={{ fontSize: 11, color: statusInfo.color, fontWeight: 600 }}>
                                    {statusInfo.label}
                                  </span>
                                  <span style={{ fontSize: 10, color: 'var(--ws-text-3)' }}>·</span>
                                  <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>{conta.currency}</span>
                                </div>
                              </div>
                            </button>
                          )
                        })}
                        {metaContas.length === 0 && (
                          <p style={{ fontSize: 13, color: 'var(--ws-text-2)', textAlign: 'center', padding: '32px 0' }}>
                            Nenhuma conta encontrada
                          </p>
                        )}
                      </div>
                      {metaSelecionadas.length > 0 && (
                        <div style={{
                          marginTop: 12, padding: '8px 14px', borderRadius: 8,
                          background: 'rgba(0,129,251,0.08)',
                          border: '1px solid rgba(0,129,251,0.2)',
                          fontSize: 12, color: '#0081FB', fontWeight: 600,
                        }}>
                          {metaSelecionadas.length} selecionada{metaSelecionadas.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 3: Período + Cliente */}
                  {metaStep === 3 && (
                    <>
                      <div>
                        <label style={labelStyle}>Período de sincronização *</label>
                        <p style={{ fontSize: 12, color: 'var(--ws-text-3)', margin: '0 0 10px', lineHeight: 1.5 }}>
                          A partir de quando buscar dados históricos de campanhas
                        </p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {PERIODOS.map(p => (
                            <button
                              key={p.id}
                              onClick={() => setMetaPeriodo(p.id)}
                              style={{
                                padding: '8px 16px', borderRadius: 8,
                                fontSize: 13, fontWeight: 500, cursor: 'pointer',
                                transition: 'all 0.15s',
                                border: metaPeriodo === p.id ? '1px solid #0081FB' : '1px solid var(--ws-glass-border)',
                                background: metaPeriodo === p.id ? 'rgba(0,129,251,0.12)' : 'transparent',
                                color: metaPeriodo === p.id ? '#0081FB' : 'var(--ws-text-2)',
                              }}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label style={labelStyle}>Cliente *</label>
                        <select
                          value={form.workspace_id}
                          onChange={e => setForm(prev => ({ ...prev, workspace_id: e.target.value }))}
                          style={{ ...inputStyle, cursor: 'pointer' }}
                        >
                          <option value="">Selecione um cliente...</option>
                          {workspaces.map(w => (
                            <option key={w.id} value={w.id}>{w.nome}</option>
                          ))}
                        </select>
                      </div>

                      {form.workspace_id && (
                        <div style={{
                          padding: '12px 14px', borderRadius: 10,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          fontSize: 13, color: 'var(--ws-text-2)', lineHeight: 1.6,
                        }}>
                          <strong style={{ color: 'var(--ws-text-1)' }}>{metaSelecionadas.length}</strong> conta{metaSelecionadas.length !== 1 ? 's' : ''} ser{metaSelecionadas.length !== 1 ? 'ão' : 'á'} importada{metaSelecionadas.length !== 1 ? 's' : ''} para{' '}
                          <strong style={{ color: 'var(--ws-text-1)' }}>
                            {workspaces.find(w => w.id === form.workspace_id)?.nome || '—'}
                          </strong>
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                /* Manual form for non-Meta platforms */
                <>
                  <div>
                    <label style={labelStyle}>Cliente *</label>
                    <select
                      value={form.workspace_id}
                      onChange={e => setForm(prev => ({ ...prev, workspace_id: e.target.value }))}
                      style={{ ...inputStyle, cursor: 'pointer' }}
                    >
                      <option value="">Selecione um cliente...</option>
                      {workspaces.map(w => (
                        <option key={w.id} value={w.id}>{w.nome}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Account ID *</label>
                    <input
                      type="text"
                      placeholder="ex: act_123456789"
                      value={form.account_id}
                      onChange={e => setForm(prev => ({ ...prev, account_id: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Nome da Conta *</label>
                    <input
                      type="text"
                      placeholder="Nome identificador da conta"
                      value={form.nome}
                      onChange={e => setForm(prev => ({ ...prev, nome: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Token de Acesso <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
                    <textarea
                      placeholder="Cole o token de acesso da conta..."
                      value={form.token}
                      onChange={e => setForm(prev => ({ ...prev, token: e.target.value }))}
                      rows={4}
                      style={{
                        ...inputStyle,
                        resize: 'vertical',
                        fontFamily: 'monospace',
                        fontSize: 12,
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Drawer footer */}
          <div style={{
            padding: '20px 28px',
            borderTop: '1px solid var(--ws-glass-border)',
            display: 'flex', gap: 12,
          }}>
            {isMeta && metaStep > 1 ? (
              <button
                onClick={() => setMetaStep(prev => (prev - 1) as 1 | 2 | 3)}
                style={{
                  height: 42, borderRadius: 10, paddingInline: 16,
                  background: 'transparent',
                  border: '1px solid var(--ws-glass-border)',
                  fontSize: 14, fontWeight: 500,
                  color: 'var(--ws-text-2)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <ChevronLeft size={16} />
                Voltar
              </button>
            ) : (
              <button
                onClick={fecharDrawer}
                style={{
                  flex: 1, height: 42, borderRadius: 10,
                  background: 'transparent',
                  border: '1px solid var(--ws-glass-border)',
                  fontSize: 14, fontWeight: 500,
                  color: 'var(--ws-text-2)', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            )}

            {isMeta ? (
              metaStep === 1 ? (
                <button
                  onClick={buscarContasMeta}
                  disabled={buscandoMeta}
                  style={{
                    flex: 2, height: 42, borderRadius: 10,
                    background: buscandoMeta ? 'rgba(0,129,251,0.4)' : 'linear-gradient(135deg, #0081FB, #0060C0)',
                    border: 'none', fontSize: 14, fontWeight: 600,
                    color: 'white', cursor: buscandoMeta ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: buscandoMeta ? 'none' : '0 4px 12px rgba(0,129,251,0.30)',
                  }}
                >
                  {buscandoMeta ? <Loader2 size={16} className="animate-spin" /> : null}
                  {buscandoMeta ? 'Buscando suas contas...' : 'Buscar Contas →'}
                </button>
              ) : metaStep === 2 ? (
                <button
                  onClick={() => {
                    if (metaSelecionadas.length === 0) { toast.error('Selecione ao menos uma conta'); return }
                    setMetaStep(3)
                  }}
                  style={{
                    flex: 2, height: 42, borderRadius: 10,
                    background: 'linear-gradient(135deg, #0081FB, #0060C0)',
                    border: 'none', fontSize: 14, fontWeight: 600,
                    color: 'white', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: '0 4px 12px rgba(0,129,251,0.30)',
                    opacity: metaSelecionadas.length === 0 ? 0.5 : 1,
                  }}
                >
                  Próximo ({metaSelecionadas.length})
                </button>
              ) : (
                <button
                  onClick={importarContas}
                  disabled={salvando}
                  style={{
                    flex: 2, height: 42, borderRadius: 10,
                    background: salvando ? 'rgba(0,129,251,0.4)' : 'linear-gradient(135deg, #0081FB, #0060C0)',
                    border: 'none', fontSize: 14, fontWeight: 600,
                    color: 'white', cursor: salvando ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: salvando ? 'none' : '0 4px 12px rgba(0,129,251,0.30)',
                  }}
                >
                  {salvando ? <Loader2 size={16} className="animate-spin" /> : null}
                  {salvando ? 'Importando...' : 'Importar Contas'}
                </button>
              )
            ) : (
              <button
                onClick={salvarManual}
                disabled={salvando}
                style={{
                  flex: 2, height: 42, borderRadius: 10,
                  background: salvando ? 'rgba(62,91,255,0.5)' : 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
                  border: 'none', fontSize: 14, fontWeight: 600,
                  color: 'white', cursor: salvando ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: salvando ? 'none' : '0 4px 12px rgba(62,91,255,0.30)',
                }}
              >
                {salvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {salvando ? 'Salvando...' : 'Salvar Conta'}
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function hexToRgb(hex: string): string {
  const clean = hex.startsWith('var(') ? '' : hex.replace('#', '')
  if (clean.length !== 6) return '62,91,255'
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `${r},${g},${b}`
}
