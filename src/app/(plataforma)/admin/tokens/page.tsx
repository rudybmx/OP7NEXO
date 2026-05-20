'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, KeyRound, X } from 'lucide-react'
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

export default function GestaoTokensPage() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()

  const [mostrarInativos, setMostrarInativos] = useState(false)
  const { tokens, carregando, carregar, criar, atualizar, desativar, reativar } = useMetaTokens()

  const [drawerAberto, setDrawerAberto] = useState(false)
  const [editando, setEditando] = useState<MetaToken | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState(emptyForm())

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
    </div>
  )
}
