'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, KeyRound, X, HelpCircle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { WSTable, WSTableActions, WSTableShell } from '@/components/ui/ws-table'
import {
  wsSheetCreamCloseButtonStyle,
  wsSheetCreamInputStyle,
  wsSheetCreamStyle,
  wsSheetCreamTokens,
} from '@/components/ui/ws-sheet'
import { useAuth } from '@/hooks/use-auth'
import { useMetaTokens, type MetaToken } from '@/hooks/use-meta-tokens'
import { useGoogleAdsCredentials, type GoogleAdsCredential, type GoogleAdsCredentialIn } from '@/hooks/use-google-ads-credentials'

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

function mascarar(token: string): string {
  if (token.length <= 12) return token.slice(0, 4) + '••••'
  return token.slice(0, 8) + '••••••••' + token.slice(-4)
}

function statusToken(t: MetaToken): { label: string; bg: string; color: string } {
  if (!t.ativo) return { label: 'Inativo', bg: 'rgba(255,92,141,0.12)', color: 'var(--ws-coral)' }
  if (t.valido_ate) {
    const dias = Math.ceil((new Date(t.valido_ate).getTime() - Date.now()) / 86_400_000)
    if (dias <= 30) return { label: 'Expirando', bg: 'rgba(201,168,76,0.15)', color: '#c9a84c' }
  }
  return { label: 'Ativo', bg: 'rgba(15,168,86,0.12)', color: 'var(--ws-green)' }
}

function emptyForm() {
  return { nome: '', token: '', valido_ate: '' }
}

function emptyGoogleForm(): GoogleAdsCredentialIn & { id?: string } {
  return { nome: '', developer_token: '', client_id: '', client_secret: '', refresh_token: '', manager_customer_id: '' }
}

export default function GestaoTokensPage() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()

  const [mostrarInativos, setMostrarInativos] = useState(false)
  const { tokens, carregando, carregar, criar, atualizar, desativar, reativar } = useMetaTokens()

  const [drawerAberto, setDrawerAberto] = useState(false)
  const [editando, setEditando] = useState<MetaToken | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState(emptyForm())

  // Google Ads Credentials
  const { credentials: googleCreds, isLoading: googleLoading, criar: criarGoogle, atualizar: atualizarGoogle, deletar: deletarGoogle, testar: testarGoogle, refetch: refetchGoogle } = useGoogleAdsCredentials()
  const [googleDrawer, setGoogleDrawer] = useState(false)
  const [googleEditando, setGoogleEditando] = useState<GoogleAdsCredential | null>(null)
  const [googleSalvando, setGoogleSalvando] = useState(false)
  const [googleForm, setGoogleForm] = useState(emptyGoogleForm())
  const [testeStatus, setTesteStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [testando, setTestando] = useState(false)
  const [ajudaAberta, setAjudaAberta] = useState(false)
  const ajudaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!authLoading && user && user.role !== 'platform_admin') router.push('/')
  }, [authLoading, user, router])

  useEffect(() => {
    if (user?.role === 'platform_admin') carregar(mostrarInativos)
  }, [user, mostrarInativos, carregar])

  function abrirNovo() {
    setEditando(null)
    setForm(emptyForm())
    setDrawerAberto(true)
  }

  function abrirEditar(t: MetaToken) {
    setEditando(t)
    setForm({ nome: t.nome, token: t.token, valido_ate: t.valido_ate ?? '' })
    setDrawerAberto(true)
  }

  function fecharDrawer() {
    setDrawerAberto(false)
    setEditando(null)
    setForm(emptyForm())
  }

  async function salvar() {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    if (!form.token.trim()) { toast.error('Token é obrigatório'); return }
    setSalvando(true)
    try {
      const payload = {
        nome: form.nome.trim(),
        token: form.token.trim(),
        valido_ate: form.valido_ate || null,
      }
      if (editando) {
        await atualizar(editando.id, payload)
        toast.success('Token atualizado!')
      } else {
        await criar(payload)
        toast.success('Token criado!')
      }
      fecharDrawer()
      carregar(mostrarInativos)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  async function toggleAtivo(t: MetaToken) {
    try {
      if (t.ativo) {
        await desativar(t.id)
        toast.success('Token desativado')
      } else {
        await reativar(t.id)
        toast.success('Token reativado')
      }
      carregar(mostrarInativos)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar token')
    }
  }

  // ── Google handlers ──────────────────────────────────────────────────────

  function abrirNovoGoogle() {
    setGoogleEditando(null)
    setGoogleForm(emptyGoogleForm())
    setGoogleDrawer(true)
  }

  function abrirEditarGoogle(c: GoogleAdsCredential) {
    setGoogleEditando(c)
    setGoogleForm({ nome: c.nome, developer_token: c.developer_token, client_id: c.client_id, client_secret: '', refresh_token: '', manager_customer_id: c.manager_customer_id ?? '' })
    setGoogleDrawer(true)
  }

  function fecharGoogleDrawer() {
    setGoogleDrawer(false)
    setGoogleEditando(null)
    setGoogleForm(emptyGoogleForm())
    setTesteStatus(null)
    setAjudaAberta(false)
  }

  async function testarConexao() {
    if (!googleEditando) return
    setTestando(true)
    setTesteStatus(null)
    try {
      const result = await testarGoogle(googleEditando.id)
      setTesteStatus({ ok: result.ok, message: result.message })
    } catch (err: any) {
      setTesteStatus({ ok: false, message: err.message || 'Erro ao testar conexão' })
    } finally {
      setTestando(false)
    }
  }

  async function salvarGoogle() {
    if (!googleForm.nome.trim()) { toast.error('Nome é obrigatório'); return }
    if (!googleEditando && !googleForm.developer_token.trim()) { toast.error('Developer Token é obrigatório'); return }
    if (!googleEditando && !googleForm.client_id.trim()) { toast.error('Client ID é obrigatório'); return }
    if (!googleEditando && !googleForm.client_secret.trim()) { toast.error('Client Secret é obrigatório'); return }
    if (!googleEditando && !googleForm.refresh_token.trim()) { toast.error('Refresh Token é obrigatório'); return }
    setGoogleSalvando(true)
    try {
      const payload: Partial<GoogleAdsCredentialIn> = { nome: googleForm.nome.trim() }
      if (googleForm.developer_token.trim()) payload.developer_token = googleForm.developer_token.trim()
      if (googleForm.client_id.trim()) payload.client_id = googleForm.client_id.trim()
      if (googleForm.client_secret.trim()) payload.client_secret = googleForm.client_secret.trim()
      if (googleForm.refresh_token.trim()) payload.refresh_token = googleForm.refresh_token.trim()
      if (googleForm.manager_customer_id?.trim()) payload.manager_customer_id = googleForm.manager_customer_id.trim()
      if (googleEditando) {
        await atualizarGoogle(googleEditando.id, payload)
        toast.success('Credencial atualizada!')
      } else {
        await criarGoogle(payload as GoogleAdsCredentialIn)
        toast.success('Credencial criada!')
      }
      fecharGoogleDrawer()
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar credencial')
    } finally {
      setGoogleSalvando(false)
    }
  }

  async function deletarGoogleCred(id: string) {
    try {
      await deletarGoogle(id)
      toast.success('Credencial removida')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover credencial')
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
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)', letterSpacing: '-0.02em' }}>
            Gestão de Tokens
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
            Tokens globais de acesso às plataformas de anúncios
          </p>
        </div>
        <button
          onClick={abrirNovo}
          style={{
            background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
            border: 'none', padding: '0 20px', height: 42, borderRadius: 10,
            fontSize: 13, fontWeight: 600, color: 'white', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 12px rgba(62,91,255,0.30)',
          }}
        >
          <Plus size={16} />
          + Novo Token
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => setMostrarInativos(v => !v)}
          style={{
            padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 500,
            cursor: 'pointer', transition: 'all 0.15s',
            border: mostrarInativos ? '0.5px solid var(--ws-blue)' : '1px solid var(--ws-glass-border)',
            background: mostrarInativos ? 'rgba(62,91,255,0.12)' : 'var(--ws-glass-bg)',
            color: mostrarInativos ? 'var(--ws-blue)' : 'var(--ws-text-2)',
          }}
        >
          {mostrarInativos ? 'Mostrando todos' : 'Mostrar inativos'}
        </button>
      </div>

      {/* Tabela */}
      <WSTableShell>
        {carregando ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
            <p style={{ fontSize: 13, color: 'var(--ws-text-2)', marginTop: 12 }}>Carregando tokens...</p>
          </div>
        ) : tokens.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <KeyRound size={32} style={{ color: 'var(--ws-text-3)', marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: 'var(--ws-text-2)' }}>Nenhum token cadastrado</p>
            <p style={{ fontSize: 12, color: 'var(--ws-text-3)', marginTop: 4 }}>
              Clique em &ldquo;Novo Token&rdquo; para começar
            </p>
          </div>
        ) : (
          <WSTable minWidth={650}>
            <thead>
              <tr>
                {['Nome', 'Token', 'Validade', 'Status', 'Ações'].map(h => (
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
              {tokens.map(t => {
                const status = statusToken(t)
                return (
                  <tr
                    key={t.id}
                    style={{ borderBottom: '1px solid var(--ws-divider)', transition: 'var(--ws-transition)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(62,91,255,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)', whiteSpace: 'nowrap' }}>
                      {t.nome}
                    </td>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                      <code style={{ fontSize: 11, color: 'var(--ws-text-3)', fontFamily: 'monospace', letterSpacing: '0.02em' }}>
                        {mascarar(t.token)}
                      </code>
                    </td>
                    <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--ws-text-2)', whiteSpace: 'nowrap' }}>
                      {t.valido_ate
                        ? new Date(t.valido_ate + 'T00:00:00').toLocaleDateString('pt-BR')
                        : <span style={{ color: 'var(--ws-text-3)' }}>—</span>}
                    </td>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '3px 10px', borderRadius: 6,
                        background: status.bg, color: status.color,
                        fontSize: 12, fontWeight: 600,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: status.color, flexShrink: 0 }} />
                        {status.label}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                      <WSTableActions>
                        <button
                          onClick={() => abrirEditar(t)}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--ws-glass-border)',
                            borderRadius: 6, padding: '4px 12px',
                            fontSize: 12, color: 'var(--ws-text-2)',
                            cursor: 'pointer',
                          }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => toggleAtivo(t)}
                          style={{
                            background: 'transparent',
                            border: `1px solid ${t.ativo ? 'rgba(255,92,141,0.35)' : 'rgba(15,168,86,0.35)'}`,
                            borderRadius: 6, padding: '4px 12px',
                            fontSize: 12, color: t.ativo ? 'var(--ws-coral)' : 'var(--ws-green)',
                            cursor: 'pointer',
                          }}
                        >
                          {t.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                      </WSTableActions>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </WSTable>
        )}
      </WSTableShell>

      {/* Drawer Criar / Editar */}
      <Sheet open={drawerAberto} onOpenChange={open => !open && fecharDrawer()}>
        <SheetContent
          side="right"
          style={{ width: 440, ...wsSheetCreamStyle, padding: 0, display: 'flex', flexDirection: 'column' }}
        >
          <div style={{
            padding: '24px 28px 20px',
            borderBottom: `1px solid ${wsSheetCreamTokens.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)' }}>
                {editando ? 'Editar Token' : 'Novo Token'}
              </h2>
              <p style={{ fontSize: 12, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
                {editando ? editando.nome : 'Token global — disponível para todos os clientes'}
              </p>
            </div>
            <button
              onClick={fecharDrawer}
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

          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={labelStyle}>Nome *</label>
                <input
                  type="text"
                  placeholder="ex: Token Principal, Token BM Franquias"
                  value={form.nome}
                  onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Token de Acesso *</label>
                <textarea
                  placeholder="Cole o token aqui..."
                  value={form.token}
                  onChange={e => setForm(p => ({ ...p, token: e.target.value }))}
                  rows={5}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5 }}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  Válido até{' '}
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span>
                </label>
                <input
                  type="date"
                  value={form.valido_ate}
                  onChange={e => setForm(p => ({ ...p, valido_ate: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          <div style={{ padding: '20px 28px', borderTop: `1px solid ${wsSheetCreamTokens.border}`, display: 'flex', gap: 12 }}>
            <button
              onClick={fecharDrawer}
              style={{
                flex: 1, height: 42, borderRadius: 10,
                background: 'transparent', border: `1px solid ${wsSheetCreamTokens.border}`,
                fontSize: 14, fontWeight: 500, color: 'var(--ws-text-2)', cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={salvar}
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
              {salvando && <Loader2 size={16} className="animate-spin" />}
              {salvando ? 'Salvando...' : editando ? 'Salvar Alterações' : 'Criar Token'}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Google Ads Credentials Section ────────────────────────── */}
      <div style={{ marginTop: 48 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'inline-flex', width: 28, height: 28, borderRadius: 6, background: 'rgba(234,67,53,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </span>
              Google Ads — Credenciais OAuth
            </h2>
            <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
              Credenciais de API para acesso às contas Google Ads via MCC
            </p>
          </div>
          <button
            onClick={abrirNovoGoogle}
            style={{
              background: 'linear-gradient(135deg, #EA4335, #c0392b)',
              border: 'none', padding: '0 20px', height: 42, borderRadius: 10,
              fontSize: 13, fontWeight: 600, color: 'white', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 12px rgba(234,67,53,0.30)',
            }}
          >
            <Plus size={16} />
            + Nova Credencial
          </button>
        </div>

        <WSTableShell>
          {googleLoading ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
            </div>
          ) : googleCreds.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <KeyRound size={32} style={{ color: 'var(--ws-text-3)', marginBottom: 12 }} />
              <p style={{ fontSize: 14, color: 'var(--ws-text-2)' }}>Nenhuma credencial Google Ads cadastrada</p>
              <p style={{ fontSize: 12, color: 'var(--ws-text-3)', marginTop: 4 }}>
                Você precisará de um developer_token, client_id, client_secret e refresh_token do Google Cloud Console
              </p>
            </div>
          ) : (
            <WSTable minWidth={700}>
              <thead>
                <tr>
                  {['Nome', 'Developer Token', 'Client ID', 'MCC Customer ID', 'Status', 'Ações'].map(h => (
                    <th key={h} style={{
                      padding: '8px 14px', fontSize: 10, fontWeight: 600,
                      color: 'var(--ws-text-3)', textAlign: 'left',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      whiteSpace: 'nowrap', background: 'rgba(234,67,53,0.04)',
                      borderBottom: '1px solid var(--ws-divider)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {googleCreds.map(c => (
                  <tr
                    key={c.id}
                    style={{ borderBottom: '1px solid var(--ws-divider)', transition: 'var(--ws-transition)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(234,67,53,0.03)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)', whiteSpace: 'nowrap' }}>{c.nome}</td>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                      <code style={{ fontSize: 11, color: 'var(--ws-text-3)', fontFamily: 'monospace' }}>{mascarar(c.developer_token)}</code>
                    </td>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                      <code style={{ fontSize: 11, color: 'var(--ws-text-3)', fontFamily: 'monospace' }}>{mascarar(c.client_id)}</code>
                    </td>
                    <td style={{ padding: '9px 14px', fontSize: 13, color: 'var(--ws-text-2)', whiteSpace: 'nowrap' }}>
                      {c.manager_customer_id
                        ? <code style={{ fontSize: 11, fontFamily: 'monospace' }}>{c.manager_customer_id}</code>
                        : <span style={{ color: 'var(--ws-text-3)' }}>—</span>}
                    </td>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '3px 10px', borderRadius: 6,
                        background: c.ativo ? 'rgba(15,168,86,0.12)' : 'rgba(255,92,141,0.12)',
                        color: c.ativo ? 'var(--ws-green)' : 'var(--ws-coral)',
                        fontSize: 12, fontWeight: 600,
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.ativo ? 'var(--ws-green)' : 'var(--ws-coral)', flexShrink: 0 }} />
                        {c.ativo ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                      <WSTableActions>
                        <button
                          onClick={() => abrirEditarGoogle(c)}
                          style={{ background: 'transparent', border: '1px solid var(--ws-glass-border)', borderRadius: 6, padding: '4px 12px', fontSize: 12, color: 'var(--ws-text-2)', cursor: 'pointer' }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => deletarGoogleCred(c.id)}
                          style={{ background: 'transparent', border: '1px solid rgba(255,92,141,0.35)', borderRadius: 6, padding: '4px 12px', fontSize: 12, color: 'var(--ws-coral)', cursor: 'pointer' }}
                        >
                          Remover
                        </button>
                      </WSTableActions>
                    </td>
                  </tr>
                ))}
              </tbody>
            </WSTable>
          )}
        </WSTableShell>
      </div>

      {/* Google Dialog — centralizado */}
      {googleDrawer && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) fecharGoogleDrawer() }}
        >
          <div
            style={{
              width: '100%', maxWidth: 560,
              margin: '0 16px',
              ...wsSheetCreamStyle,
              padding: 0,
              display: 'flex', flexDirection: 'column',
              borderRadius: 16,
              maxHeight: '90vh',
              boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '22px 28px 18px',
              borderBottom: `1px solid ${wsSheetCreamTokens.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'inline-flex', width: 32, height: 32, borderRadius: 8, background: 'rgba(234,67,53,0.12)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                </span>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)' }}>
                    {googleEditando ? 'Editar Credencial Google Ads' : 'Nova Credencial Google Ads'}
                  </h2>
                  <p style={{ fontSize: 12, color: 'var(--ws-text-2)', margin: '3px 0 0' }}>
                    {googleEditando ? googleEditando.nome : 'Credencial global — acessa contas via MCC'}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Ícone de ajuda */}
                <div ref={ajudaRef} style={{ position: 'relative' }}>
                  <button
                    onClick={() => setAjudaAberta(v => !v)}
                    title="Como conectar"
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--ws-glass-border)',
                      borderRadius: 8, width: 32, height: 32,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: 'var(--ws-text-2)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <HelpCircle size={16} />
                  </button>
                  {ajudaAberta && (
                    <div style={{
                      position: 'absolute', right: 0, top: 40, zIndex: 100,
                      background: 'var(--ws-card, #fff)',
                      border: '1px solid var(--ws-glass-border)',
                      borderRadius: 12,
                      boxShadow: '0 12px 48px rgba(0,0,0,0.22)',
                      padding: 8,
                      width: 420,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '0 4px' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-1)' }}>Como obter as credenciais</span>
                        <button onClick={() => setAjudaAberta(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ws-text-2)', display: 'flex', alignItems: 'center' }}>
                          <X size={14} />
                        </button>
                      </div>
                      <img
                        src="https://pub-db8ed4fb33634589a6ce5fb07e85cb46.r2.dev/logo/op7_dash_odc/ajuda_token_google.png"
                        alt="Guia de como conectar Google Ads"
                        style={{ width: '100%', borderRadius: 8, display: 'block' }}
                      />
                    </div>
                  )}
                </div>
                <button onClick={fecharGoogleDrawer} style={{ ...wsSheetCreamCloseButtonStyle, borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ws-text-2)' }}>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '22px 28px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <label style={labelStyle}>Nome *</label>
                  <input type="text" placeholder="ex: MCC Op7 Franquias" value={googleForm.nome} onChange={e => setGoogleForm(p => ({ ...p, nome: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Developer Token *{googleEditando && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> (deixe vazio para manter)</span>}</label>
                  <input type="password" placeholder="Tst-XXXXXXXXXXXXXXXXX" value={googleForm.developer_token} onChange={e => setGoogleForm(p => ({ ...p, developer_token: e.target.value }))} style={{ ...inputStyle, fontFamily: 'monospace' }} />
                </div>
                <div>
                  <label style={labelStyle}>Client ID (OAuth2) *{googleEditando && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> (deixe vazio para manter)</span>}</label>
                  <input type="text" placeholder="XXXXXXXXXXXX-XXXXXXXX.apps.googleusercontent.com" value={googleForm.client_id} onChange={e => setGoogleForm(p => ({ ...p, client_id: e.target.value }))} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }} />
                </div>
                <div>
                  <label style={labelStyle}>Client Secret *{googleEditando && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> (deixe vazio para manter)</span>}</label>
                  <input type="password" placeholder="GOCSPX-XXXXXXXXXXXX" value={googleForm.client_secret} onChange={e => setGoogleForm(p => ({ ...p, client_secret: e.target.value }))} style={{ ...inputStyle, fontFamily: 'monospace' }} />
                </div>
                <div>
                  <label style={labelStyle}>Refresh Token *{googleEditando && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> (deixe vazio para manter)</span>}</label>
                  <textarea placeholder="1//XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" value={googleForm.refresh_token} onChange={e => setGoogleForm(p => ({ ...p, refresh_token: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5 }} />
                </div>
                <div>
                  <label style={labelStyle}>MCC Customer ID <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(sem hífens — obrigatório para contas filho)</span></label>
                  <input type="text" placeholder="1234567890" value={googleForm.manager_customer_id ?? ''} onChange={e => setGoogleForm(p => ({ ...p, manager_customer_id: e.target.value }))} style={{ ...inputStyle, fontFamily: 'monospace' }} />
                </div>

                {/* Verificar conexão — só aparece quando editando */}
                {googleEditando && (
                  <div style={{
                    borderTop: `1px solid ${wsSheetCreamTokens.border}`,
                    paddingTop: 18,
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Status da Conexão
                      </span>
                      <button
                        onClick={testarConexao}
                        disabled={testando}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 14px', borderRadius: 8,
                          background: 'transparent',
                          border: '1px solid var(--ws-glass-border)',
                          fontSize: 12, fontWeight: 500, color: 'var(--ws-text-2)',
                          cursor: testando ? 'not-allowed' : 'pointer',
                          opacity: testando ? 0.6 : 1,
                        }}
                      >
                        {testando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                        {testando ? 'Testando...' : 'Testar Conexão'}
                      </button>
                    </div>
                    {testeStatus && (
                      <div style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        padding: '10px 14px', borderRadius: 8,
                        background: testeStatus.ok ? 'rgba(15,168,86,0.09)' : 'rgba(255,92,141,0.09)',
                        border: `1px solid ${testeStatus.ok ? 'rgba(15,168,86,0.25)' : 'rgba(255,92,141,0.25)'}`,
                      }}>
                        {testeStatus.ok
                          ? <CheckCircle2 size={16} style={{ color: 'var(--ws-green)', flexShrink: 0, marginTop: 1 }} />
                          : <XCircle size={16} style={{ color: 'var(--ws-coral)', flexShrink: 0, marginTop: 1 }} />}
                        <span style={{ fontSize: 12, color: testeStatus.ok ? 'var(--ws-green)' : 'var(--ws-coral)', lineHeight: 1.5 }}>
                          {testeStatus.message}
                        </span>
                      </div>
                    )}
                    {!testeStatus && (
                      <p style={{ fontSize: 12, color: 'var(--ws-text-3)', margin: 0 }}>
                        Clique em &ldquo;Testar Conexão&rdquo; para verificar se as credenciais estão funcionando.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '18px 28px', borderTop: `1px solid ${wsSheetCreamTokens.border}`, display: 'flex', gap: 12, flexShrink: 0 }}>
              <button onClick={fecharGoogleDrawer} style={{ flex: 1, height: 42, borderRadius: 10, background: 'transparent', border: `1px solid ${wsSheetCreamTokens.border}`, fontSize: 14, fontWeight: 500, color: 'var(--ws-text-2)', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={salvarGoogle}
                disabled={googleSalvando}
                style={{ flex: 2, height: 42, borderRadius: 10, background: googleSalvando ? 'rgba(234,67,53,0.5)' : 'linear-gradient(135deg, #EA4335, #c0392b)', border: 'none', fontSize: 14, fontWeight: 600, color: 'white', cursor: googleSalvando ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: googleSalvando ? 'none' : '0 4px 12px rgba(234,67,53,0.30)' }}
              >
                {googleSalvando && <Loader2 size={16} className="animate-spin" />}
                {googleSalvando ? 'Salvando...' : googleEditando ? 'Salvar Alterações' : 'Criar Credencial'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
