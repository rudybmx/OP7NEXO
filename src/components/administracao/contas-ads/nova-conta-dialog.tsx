'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Loader2, Plus, X, Check, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { wsSheetCreamCloseButtonStyle, wsSheetCreamInputStyle, wsSheetCreamStyle, wsSheetCreamTokens } from '@/components/ui/ws-sheet'
import api from '@/lib/api-client'

interface Workspace {
  id: string
  nome: string
}

interface MetaToken {
  id: string
  nome: string
  token: string
  valido_ate: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

interface MetaContaAPI {
  account_id: string
  account_name: string
  account_status: number
  currency: string
}

const PLATFORM_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  meta: { label: 'Meta', bg: 'rgba(0,129,251,0.15)', color: '#0081FB' },
  google: { label: 'Google', bg: 'rgba(234,67,53,0.15)', color: '#EA4335' },
  linkedin: { label: 'LinkedIn', bg: 'rgba(10,102,194,0.15)', color: '#0A66C2' },
  tiktok: { label: 'TikTok', bg: 'rgba(105,201,208,0.15)', color: '#69C9D0' },
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
    workspace_id: '',
    plataforma: 'meta' as 'meta' | 'google' | 'linkedin' | 'tiktok',
    account_id: '',
    nome: '',
    bm_id: '',
    token: '',
    agrupamento: '',
  }
}

interface NovaContaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaces: Workspace[]
  onSaved: () => Promise<void> | void
}

export function NovaContaDialog({ open, onOpenChange, workspaces, onSaved }: NovaContaDialogProps) {
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

  // Meta tokens
  const [metaTokens, setMetaTokens] = useState<MetaToken[]>([])
  const [carregandoTokens, setCarregandoTokens] = useState(false)
  const [tokenSelecionadoId, setTokenSelecionadoId] = useState('')

  // Google flow
  const [googleStep, setGoogleStep] = useState<1 | 2>(1)
  const [googleCredentials, setGoogleCredentials] = useState<Array<{ id: string; nome: string; manager_customer_id: string | null }>>([])
  const [googleCredentialId, setGoogleCredentialId] = useState('')
  const [googleContas, setGoogleContas] = useState<Array<{ customer_id: string; nome: string; currency: string; timezone: string; ja_cadastrada: boolean }>>([])
  const [googleSelecionadas, setGoogleSelecionadas] = useState<string[]>([])
  const [googleErro, setGoogleErro] = useState('')
  const [buscandoGoogle, setBuscandoGoogle] = useState(false)
  const [googleFiltro, setGoogleFiltro] = useState('')
  const [carregandoGoogleCreds, setCarregandoGoogleCreds] = useState(false)
  const [googleCredsLoaded, setGoogleCredsLoaded] = useState(false)

  const isMeta = form.plataforma === 'meta'
  const isGoogle = form.plataforma === 'google'
  const selectedToken = metaTokens.find(x => x.token === tokenSelecionadoId) ?? null

  function handleClose() {
    onOpenChange(false)
    setForm(emptyForm())
    setMetaStep(1)
    setMetaBmToken('')
    setMetaTokenExpira('')
    setMetaContas([])
    setMetaSelecionadas([])
    setMetaPeriodo('mes_atual')
    setMetaErro('')
    setMetaFiltro('')
    setMetaTokens([])
    setTokenSelecionadoId('')
    setGoogleStep(1)
    setGoogleCredentialId('')
    setGoogleContas([])
    setGoogleSelecionadas([])
    setGoogleErro('')
    setGoogleFiltro('')
    setGoogleCredsLoaded(false)
  }

  const loadMetaTokens = useCallback(async () => {
    setCarregandoTokens(true)
    try {
      const data = await api.get<MetaToken[]>('/meta/tokens')
      setMetaTokens(data)
    } catch {
      setMetaTokens([])
    } finally {
      setCarregandoTokens(false)
    }
  }, [])

  useEffect(() => {
    if (open && metaTokens.length === 0 && !carregandoTokens) {
      loadMetaTokens()
    }
  }, [open, metaTokens.length, carregandoTokens, loadMetaTokens])

  const loadGoogleCredentials = useCallback(async () => {
    setCarregandoGoogleCreds(true)
    try {
      const data = await api.get<Array<{ id: string; nome: string; manager_customer_id: string | null }>>('/google-ads/credentials')
      setGoogleCredentials(data)
    } catch {
      setGoogleCredentials([])
    } finally {
      setCarregandoGoogleCreds(false)
      setGoogleCredsLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (open && form.plataforma === 'google' && !googleCredsLoaded && !carregandoGoogleCreds) {
      loadGoogleCredentials()
    }
  }, [open, form.plataforma, googleCredsLoaded, carregandoGoogleCreds, loadGoogleCredentials])

  async function buscarContasMeta() {
    if (!form.workspace_id) { setMetaErro('Selecione um cliente primeiro'); return }
    if (!metaBmToken.trim()) { setMetaErro('Selecione um token de acesso'); return }
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
    if (!form.workspace_id) { toast.error('Selecione um cliente'); return }
    if (metaSelecionadas.length === 0) { toast.error('Selecione ao menos uma conta'); return }
    setSalvando(true)
    try {
      const contasPayload = metaSelecionadas.map(id => {
        const c = metaContas.find(x => x.account_id === id)
        return { account_id: id, nome: c?.account_name || '' }
      })
      const result = await api.post<{
        criadas: number
        atualizadas: number
        jobs_iniciados?: number
        jobs_reutilizados?: number
      }>('/meta/importar-contas', {
        workspace_id: form.workspace_id,
        token: metaBmToken,
        token_expira_em: metaTokenExpira
          ? new Date(metaTokenExpira + 'T23:00:00Z').toISOString()
          : null,
        periodo_sync: metaPeriodo,
        contas: contasPayload,
        agrupamento: form.agrupamento || null,
      })
      handleClose()
      await onSaved()
      const total = result.criadas + result.atualizadas
      const jobsIniciados = result.jobs_iniciados ?? 0
      const jobsReutilizados = result.jobs_reutilizados ?? 0
      if (jobsIniciados > 0) {
        toast.success(`${total} conta${total !== 1 ? 's' : ''} importada${total !== 1 ? 's' : ''} e sincronização iniciada`)
      } else if (jobsReutilizados > 0) {
        toast.success(`${total} conta${total !== 1 ? 's' : ''} importada${total !== 1 ? 's' : ''}. Sincronização já estava em andamento`)
      } else {
        toast.success(`${total} conta${total !== 1 ? 's' : ''} importada${total !== 1 ? 's' : ''} com sucesso`)
      }
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
      await api.post(`/workspaces/${form.workspace_id}/ads-accounts`, {
        plataforma: form.plataforma,
        account_id: form.account_id.trim(),
        nome: form.nome.trim(),
        bm_id: form.bm_id.trim() || null,
        token: form.token.trim() || null,
        agrupamento: form.agrupamento || null,
      })
      handleClose()
      await onSaved()
      toast.success('Conta criada com sucesso!')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar conta')
    } finally {
      setSalvando(false)
    }
  }

  async function buscarContasGoogle() {
    if (!googleCredentialId) { setGoogleErro('Selecione uma credencial primeiro'); return }
    setGoogleErro('')
    setBuscandoGoogle(true)
    try {
      const data = await api.get<Array<{ customer_id: string; nome: string; currency: string; timezone: string; ja_cadastrada: boolean }>>(`/google-ads/descobrir-contas?credential_id=${googleCredentialId}`)
      setGoogleContas(data)
      setGoogleSelecionadas([])
      setGoogleStep(2)
    } catch (err: any) {
      setGoogleErro(err.message || 'Erro ao buscar contas Google Ads')
    } finally {
      setBuscandoGoogle(false)
    }
  }

  async function importarContasGoogle() {
    if (!form.workspace_id) { toast.error('Selecione um cliente'); return }
    if (googleSelecionadas.length === 0) { toast.error('Selecione ao menos uma conta'); return }
    setSalvando(true)
    try {
      for (const customerId of googleSelecionadas) {
        const conta = googleContas.find(c => c.customer_id === customerId)
        if (!conta) continue
        try {
          await api.post('/google-ads/vincular-conta', {
            credential_id: googleCredentialId,
            customer_id: customerId,
            customer_name: conta.nome,
            workspace_id: form.workspace_id,
            currency: conta.currency,
            timezone: conta.timezone,
          })
        } catch (err: any) {
          if (!err.message?.includes('409')) toast.error(`${conta.nome}: ${err.message || 'Erro'}`)
        }
      }
      toast.success(`${googleSelecionadas.length} conta(s) Google Ads importada(s)!`)
      handleClose()
      await onSaved()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao importar contas Google')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={open => !open && handleClose()}>
      <DialogTitle className="sr-only">Nova Conta Ads</DialogTitle>
      <DialogDescription className="sr-only">
        {isMeta ? `Importar via Meta — passo ${metaStep} de 3` : isGoogle ? `Importar via Google Ads — passo ${googleStep} de 2` : 'Vincule uma conta de anúncios a um cliente'}
      </DialogDescription>
      <DialogContent
        showCloseButton={false}
        style={{
          maxWidth: 560,
          width: '95vw',
          maxHeight: '90vh',
          ...wsSheetCreamStyle,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
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
              {isMeta ? `Importar via Meta — passo ${metaStep} de 3` : isGoogle ? `Importar via Google Ads — passo ${googleStep} de 2` : 'Vincule uma conta de anúncios a um cliente'}
            </p>
          </div>
          <button
            onClick={handleClose}
            style={{
              ...wsSheetCreamCloseButtonStyle,
              borderRadius: 8, width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--ws-text-2)',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
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
                        setGoogleStep(1)
                        setGoogleContas([])
                        setGoogleSelecionadas([])
                        setGoogleErro('')
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
                        background: metaStep > s ? 'var(--ws-green)' : metaStep === s ? 'var(--ws-blue)' : wsSheetCreamTokens.surfaceHover,
                        color: metaStep >= s ? 'white' : 'var(--ws-text-3)',
                        border: metaStep === s ? '2px solid rgba(62,91,255,0.4)' : `1px solid ${wsSheetCreamTokens.border}`,
                        flexShrink: 0,
                      }}>
                        {metaStep > s ? <Check size={12} /> : s}
                      </div>
                      {s < 3 && (
                        <div style={{
                          flex: 1, height: 1,
                          background: metaStep > s ? 'var(--ws-green)' : wsSheetCreamTokens.borderStrong,
                        }} />
                      )}
                    </React.Fragment>
                  ))}
                </div>

                {/* Step 1: Cliente + Token */}
                {metaStep === 1 && (
                  <>
                    <div>
                      <label style={labelStyle}>Cliente *</label>
                      <select
                        value={form.workspace_id}
                        onChange={e => {
                          const wsId = e.target.value
                          setForm(prev => ({ ...prev, workspace_id: wsId }))
                          setTokenSelecionadoId('')
                          setMetaBmToken('')
                          setMetaTokenExpira('')
                        }}
                        style={{ ...inputStyle, cursor: 'pointer' }}
                      >
                        <option value="">Selecione um cliente...</option>
                        {workspaces.map(w => (
                          <option key={w.id} value={w.id}>{w.nome}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={labelStyle}>Token de Acesso Meta *</label>
                      {carregandoTokens ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' }}>
                          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
                          <span style={{ fontSize: 13, color: 'var(--ws-text-2)' }}>Carregando tokens...</span>
                        </div>
                      ) : metaTokens.length === 0 ? (
                        <p style={{ fontSize: 12, color: 'var(--ws-text-3)', padding: '8px 0' }}>
                          Nenhum token cadastrado.{' '}
                          <a href="/admin/tokens" target="_blank" style={{ color: 'var(--ws-blue)', textDecoration: 'underline' }}>
                            Cadastrar token
                          </a>
                        </p>
                      ) : (
                        <Select
                          value={tokenSelecionadoId}
                          onValueChange={v => {
                            setTokenSelecionadoId(v)
                            const t = metaTokens.find(x => x.token === v)
                            if (t) {
                              setMetaBmToken(t.token)
                              setMetaTokenExpira(t.valido_ate ?? '')
                              setMetaErro('')
                            }
                          }}
                        >
                          <SelectTrigger
                            className="w-full h-10 text-sm border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)] backdrop-blur-md"
                          >
                            <SelectValue placeholder="Selecione um token..." />
                          </SelectTrigger>
                          <SelectContent position="popper" className="z-[200]">
                            {metaTokens.map(t => (
                              <SelectItem key={t.id} value={t.token} className="text-sm">
                                {t.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {metaErro && (
                        <p style={{ fontSize: 12, color: 'var(--ws-coral)', marginTop: 6 }}>{metaErro}</p>
                      )}
                      {tokenSelecionadoId && selectedToken && (
                        <div style={{ marginTop: 10 }}>
                          <label style={labelStyle}>Válido até</label>
                          <input
                            type="date"
                            value={selectedToken.valido_ate ?? ''}
                            readOnly
                            style={{
                              ...inputStyle,
                              cursor: 'not-allowed',
                              background: wsSheetCreamTokens.surface,
                              opacity: 0.9,
                            }}
                          />
                          <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 6 }}>
                            {selectedToken.valido_ate
                              ? `Validade do token selecionado: ${new Date(selectedToken.valido_ate + 'T00:00:00').toLocaleDateString('pt-BR')}`
                              : 'Token sem data de validade definida'}
                          </p>
                        </div>
                      )}
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
                                background: selected ? 'rgba(0,129,251,0.08)' : wsSheetCreamTokens.surface,
                                border: selected ? '1px solid rgba(0,129,251,0.35)' : `1px solid ${wsSheetCreamTokens.border}`,
                                cursor: 'pointer', textAlign: 'left', width: '100%',
                                transition: 'all 0.15s', flexShrink: 0,
                              }}
                            >
                              <div style={{
                                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                                background: selected ? '#0081FB' : wsSheetCreamTokens.checkboxUncheckedBg,
                                border: selected ? '1px solid #0081FB' : `1px solid ${wsSheetCreamTokens.checkboxUncheckedBorder}`,
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

                    <div>
                      <label style={labelStyle}>Agrupamento <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
                      <input
                        type="text"
                        placeholder="ex: Franquias SP, Zona Sul"
                        value={form.agrupamento}
                        onChange={e => setForm(prev => ({ ...prev, agrupamento: e.target.value }))}
                        style={inputStyle}
                      />
                    </div>

                    {form.workspace_id && (
                      <div style={{
                        padding: '12px 14px', borderRadius: 10,
                        background: wsSheetCreamTokens.surface,
                        border: `1px solid ${wsSheetCreamTokens.border}`,
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
            ) : isGoogle ? (
              <>
                {/* Google step indicator */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {[1, 2].map(s => (
                    <React.Fragment key={s}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700,
                        background: googleStep > s ? 'var(--ws-green)' : googleStep === s ? '#EA4335' : wsSheetCreamTokens.surfaceHover,
                        color: googleStep >= s ? 'white' : 'var(--ws-text-3)',
                        border: googleStep === s ? '2px solid rgba(234,67,53,0.4)' : `1px solid ${wsSheetCreamTokens.border}`,
                        flexShrink: 0,
                      }}>
                        {googleStep > s ? <Check size={12} /> : s}
                      </div>
                      {s < 2 && (
                        <div style={{ flex: 1, height: 1, background: googleStep > s ? 'var(--ws-green)' : wsSheetCreamTokens.borderStrong }} />
                      )}
                    </React.Fragment>
                  ))}
                </div>

                {googleStep === 1 && (
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
                      <label style={labelStyle}>Credencial Google Ads *</label>
                      {carregandoGoogleCreds ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' }}>
                          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
                          <span style={{ fontSize: 13, color: 'var(--ws-text-2)' }}>Carregando credenciais...</span>
                        </div>
                      ) : googleCredentials.length === 0 ? (
                        <p style={{ fontSize: 12, color: 'var(--ws-text-3)', padding: '8px 0' }}>
                          Nenhuma credencial cadastrada.{' '}
                          <a href="/admin/tokens" target="_blank" style={{ color: 'var(--ws-blue)', textDecoration: 'underline' }}>
                            Cadastrar credencial
                          </a>
                        </p>
                      ) : (
                        <Select
                          value={googleCredentialId}
                          onValueChange={v => { setGoogleCredentialId(v); setGoogleErro('') }}
                        >
                          <SelectTrigger className="w-full h-10 text-sm border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)] backdrop-blur-md">
                            <SelectValue placeholder="Selecione uma credencial..." />
                          </SelectTrigger>
                          <SelectContent position="popper" className="z-[200]">
                            {googleCredentials.map(c => (
                              <SelectItem key={c.id} value={c.id} className="text-sm">
                                {c.nome}{c.manager_customer_id ? ` (MCC ${c.manager_customer_id})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {googleErro && (
                        <p style={{ fontSize: 12, color: 'var(--ws-coral)', marginTop: 6 }}>{googleErro}</p>
                      )}
                    </div>
                  </>
                )}

                {googleStep === 2 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <label style={{ ...labelStyle, marginBottom: 0 }}>
                        Contas encontradas ({googleContas.length})
                      </label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setGoogleSelecionadas(googleContas.filter(c => !c.ja_cadastrada).map(c => c.customer_id))} style={{ background: 'transparent', border: 'none', fontSize: 11, color: 'var(--ws-blue)', cursor: 'pointer', fontWeight: 600 }}>
                          Selecionar novas
                        </button>
                        <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>·</span>
                        <button onClick={() => setGoogleSelecionadas([])} style={{ background: 'transparent', border: 'none', fontSize: 11, color: 'var(--ws-text-3)', cursor: 'pointer', fontWeight: 600 }}>
                          Limpar
                        </button>
                      </div>
                    </div>
                    <input type="text" placeholder="Filtrar contas..." value={googleFiltro} onChange={e => setGoogleFiltro(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                      {[...googleContas]
                        .sort((a, b) => a.nome.localeCompare(b.nome))
                        .filter(c => !googleFiltro.trim() || c.nome.toLowerCase().includes(googleFiltro.toLowerCase()) || c.customer_id.includes(googleFiltro))
                        .map(conta => {
                          const selected = googleSelecionadas.includes(conta.customer_id)
                          return (
                            <button
                              key={conta.customer_id}
                              onClick={() => !conta.ja_cadastrada && setGoogleSelecionadas(prev => prev.includes(conta.customer_id) ? prev.filter(x => x !== conta.customer_id) : [...prev, conta.customer_id])}
                              disabled={conta.ja_cadastrada}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '12px 14px', borderRadius: 10,
                                background: conta.ja_cadastrada ? wsSheetCreamTokens.surfaceHover : selected ? 'rgba(234,67,53,0.08)' : wsSheetCreamTokens.surface,
                                border: selected ? '1px solid rgba(234,67,53,0.35)' : `1px solid ${wsSheetCreamTokens.border}`,
                                cursor: conta.ja_cadastrada ? 'default' : 'pointer',
                                textAlign: 'left', width: '100%', transition: 'all 0.15s', flexShrink: 0,
                                opacity: conta.ja_cadastrada ? 0.6 : 1,
                              }}
                            >
                              <div style={{
                                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                                background: conta.ja_cadastrada ? wsSheetCreamTokens.surfaceHover : selected ? '#EA4335' : wsSheetCreamTokens.checkboxUncheckedBg,
                                border: selected ? '1px solid #EA4335' : `1px solid ${wsSheetCreamTokens.checkboxUncheckedBorder}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {(selected || conta.ja_cadastrada) && <Check size={11} color="white" />}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)', marginBottom: 2 }}>
                                  {conta.nome}
                                  {conta.ja_cadastrada && <span style={{ fontSize: 10, color: 'var(--ws-text-3)', marginLeft: 8, fontWeight: 400 }}>já cadastrada</span>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <code style={{ fontSize: 11, color: 'var(--ws-text-3)', fontFamily: 'monospace' }}>{conta.customer_id}</code>
                                  <span style={{ fontSize: 10, color: 'var(--ws-text-3)' }}>·</span>
                                  <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>{conta.currency}</span>
                                  <span style={{ fontSize: 10, color: 'var(--ws-text-3)' }}>·</span>
                                  <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>{conta.timezone}</span>
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      {googleContas.length === 0 && (
                        <p style={{ fontSize: 13, color: 'var(--ws-text-2)', textAlign: 'center', padding: '32px 0' }}>Nenhuma conta encontrada</p>
                      )}
                    </div>
                    {googleSelecionadas.length > 0 && (
                      <div style={{ marginTop: 12, padding: '8px 14px', borderRadius: 8, background: 'rgba(234,67,53,0.08)', border: '1px solid rgba(234,67,53,0.2)', fontSize: 12, color: '#EA4335', fontWeight: 600 }}>
                        {googleSelecionadas.length} conta{googleSelecionadas.length !== 1 ? 's' : ''} selecionada{googleSelecionadas.length !== 1 ? 's' : ''} — cliente: <strong>{workspaces.find(w => w.id === form.workspace_id)?.nome ?? '—'}</strong>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* Manual form for LinkedIn/TikTok */
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
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Agrupamento <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
                  <input
                    type="text"
                    placeholder="ex: Franquias SP, Zona Sul"
                    value={form.agrupamento}
                    onChange={e => setForm(prev => ({ ...prev, agrupamento: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '20px 28px',
          borderTop: '1px solid var(--ws-glass-border)',
          display: 'flex', gap: 12,
        }}>
          {(isMeta && metaStep > 1) || (isGoogle && googleStep > 1) ? (
            <button
              onClick={() => {
                if (isMeta) setMetaStep(prev => (prev - 1) as 1 | 2 | 3)
                else setGoogleStep(1)
              }}
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
              onClick={handleClose}
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
          ) : isGoogle ? (
            googleStep === 1 ? (
              <button
                onClick={buscarContasGoogle}
                disabled={buscandoGoogle}
                style={{
                  flex: 2, height: 42, borderRadius: 10,
                  background: buscandoGoogle ? 'rgba(234,67,53,0.4)' : 'linear-gradient(135deg, #EA4335, #c0392b)',
                  border: 'none', fontSize: 14, fontWeight: 600,
                  color: 'white', cursor: buscandoGoogle ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: buscandoGoogle ? 'none' : '0 4px 12px rgba(234,67,53,0.30)',
                }}
              >
                {buscandoGoogle ? <Loader2 size={16} className="animate-spin" /> : null}
                {buscandoGoogle ? 'Buscando contas...' : 'Descobrir Contas →'}
              </button>
            ) : (
              <button
                onClick={importarContasGoogle}
                disabled={salvando || googleSelecionadas.length === 0}
                style={{
                  flex: 2, height: 42, borderRadius: 10,
                  background: salvando ? 'rgba(234,67,53,0.4)' : googleSelecionadas.length === 0 ? 'rgba(234,67,53,0.3)' : 'linear-gradient(135deg, #EA4335, #c0392b)',
                  border: 'none', fontSize: 14, fontWeight: 600,
                  color: 'white', cursor: (salvando || googleSelecionadas.length === 0) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: (salvando || googleSelecionadas.length === 0) ? 'none' : '0 4px 12px rgba(234,67,53,0.30)',
                }}
              >
                {salvando ? <Loader2 size={16} className="animate-spin" /> : null}
                {salvando ? 'Importando...' : `Importar ${googleSelecionadas.length > 0 ? `(${googleSelecionadas.length})` : ''} Contas`}
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
      </DialogContent>
    </Dialog>
  )
}
