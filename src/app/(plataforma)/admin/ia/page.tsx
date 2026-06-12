'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Cpu, Pencil, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { WSTable, WSTableShell } from '@/components/ui/ws-table'
import { wsSheetCreamInputStyle, wsSheetCreamStyle } from '@/components/ui/ws-sheet'
import { useAuth } from '@/hooks/use-auth'
import { useAiSettings, type AiSetting, type AiSettingUpdate } from '@/hooks/use-ai-settings'
import { InsightsIaTabela } from '@/components/admin/InsightsIaTabela'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  ...wsSheetCreamInputStyle, fontSize: 13, outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--ws-text-2)', display: 'block',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
}

const TH: React.CSSProperties = {
  padding: '8px 14px', fontSize: 10, fontWeight: 600, color: 'var(--ws-text-3)',
  textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em',
  whiteSpace: 'nowrap', background: 'rgba(62,91,255,0.04)', borderBottom: '1px solid var(--ws-divider)',
}
const TD: React.CSSProperties = { padding: '9px 14px', fontSize: 13, color: 'var(--ws-text-1)' }

function sourceBadge(source: 'db' | 'env') {
  const db = source === 'db'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 6,
      background: db ? 'rgba(122,90,248,0.12)' : 'rgba(15,39,68,0.06)',
      color: db ? 'var(--ws-purple)' : 'var(--ws-text-3)', fontSize: 11, fontWeight: 600,
    }}>
      {db ? 'Painel' : '.env'}
    </span>
  )
}

export default function PainelIaPage() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()

  const [aba, setAba] = useState<'modelos' | 'insights'>('modelos')
  const { settings, isLoading, atualizar } = useAiSettings()

  const [drawer, setDrawer] = useState(false)
  const [editando, setEditando] = useState<AiSetting | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState<{ provider: string; model: string; base_url: string; api_key: string; ativo: boolean }>(
    { provider: '', model: '', base_url: '', api_key: '', ativo: true }
  )

  React.useEffect(() => {
    if (!authLoading && user && user.role !== 'platform_admin') router.push('/')
  }, [authLoading, user, router])

  function abrirEditar(s: AiSetting) {
    if (s.feature === 'agent') return
    setEditando(s)
    setForm({ provider: s.provider ?? '', model: s.model ?? '', base_url: s.base_url ?? '', api_key: '', ativo: s.ativo })
    setDrawer(true)
  }

  async function salvar() {
    if (!editando) return
    setSalvando(true)
    try {
      const payload: AiSettingUpdate = {
        provider: form.provider.trim() || null,
        model: form.model.trim() || null,
        base_url: form.base_url.trim() || null,
        ativo: form.ativo,
      }
      // chave só vai se o admin digitou algo (ausente = mantém a atual)
      if (form.api_key.trim()) payload.api_key = form.api_key.trim()
      await atualizar(editando.feature, payload)
      toast.success('Configuração de IA atualizada')
      setDrawer(false)
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar')
    } finally {
      setSalvando(false)
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
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Cpu size={22} style={{ color: 'var(--ws-blue)' }} /> Central de IA
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
          Modelos e chaves de IA (troca sem redeploy) e insights de campanha centralizados
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--ws-glass-border)' }}>
        {([['modelos', 'Modelos & Chaves'], ['insights', 'Insights de IA']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setAba(id)}
            style={{
              padding: '8px 4px', marginBottom: -1, background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: aba === id ? 700 : 500,
              color: aba === id ? 'var(--ws-blue)' : 'var(--ws-text-2)',
              borderBottom: aba === id ? '2px solid var(--ws-blue)' : '2px solid transparent',
            }}>
            {label}
          </button>
        ))}
      </div>

      {aba === 'modelos' && (
        <WSTableShell>
          {isLoading ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
            </div>
          ) : (
            <WSTable minWidth={760}>
              <thead>
                <tr>{['Feature', 'Modelo', 'Provider', 'Base URL', 'Chave', 'Origem', ''].map(h => <th key={h} style={TH}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {settings.map(s => {
                  const disabled = s.feature === 'agent'
                  return (
                    <tr key={s.feature} style={{ borderBottom: '1px solid var(--ws-divider)', opacity: disabled ? 0.55 : 1 }}>
                      <td style={{ ...TD, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {s.label}{disabled && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--ws-text-3)' }}>(em breve)</span>}
                      </td>
                      <td style={{ ...TD, whiteSpace: 'nowrap' }}><code style={{ fontSize: 12, fontFamily: 'monospace' }}>{s.model || '—'}</code></td>
                      <td style={{ ...TD, color: 'var(--ws-text-2)' }}>{s.provider || '—'}</td>
                      <td style={{ ...TD, color: 'var(--ws-text-3)', fontSize: 11, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.base_url || '—'}</td>
                      <td style={{ ...TD }}><code style={{ fontSize: 11, color: 'var(--ws-text-3)', fontFamily: 'monospace' }}>{s.api_key_mask || '—'}</code></td>
                      <td style={{ ...TD }}>{sourceBadge(s.source)}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>
                        <button onClick={() => abrirEditar(s)} disabled={disabled}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
                            border: '1px solid var(--ws-glass-border)', background: 'var(--ws-glass-bg)',
                            color: 'var(--ws-text-2)', fontSize: 12, fontWeight: 600,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                          }}>
                          {disabled ? <Lock size={13} /> : <Pencil size={13} />} Editar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </WSTable>
          )}
        </WSTableShell>
      )}

      {aba === 'insights' && <InsightsIaTabela limit={50} />}

      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="right" style={{ ...wsSheetCreamStyle, width: 440, maxWidth: '95vw', padding: 24, overflowY: 'auto' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', color: 'var(--ws-text-1)' }}>
            {editando?.label}
          </h2>
          <p style={{ fontSize: 12, color: 'var(--ws-text-2)', margin: '0 0 20px' }}>
            Deixe um campo vazio para usar o valor do <code>.env</code>.
          </p>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Modelo</label>
            <input style={inputStyle} value={form.model} placeholder="ex: gpt-4o-mini"
              onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Provider</label>
            <input style={inputStyle} value={form.provider} placeholder="ex: openai"
              onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Base URL</label>
            <input style={inputStyle} value={form.base_url} placeholder="https://api.openai.com/v1"
              onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Chave de API</label>
            <input style={inputStyle} type="password" value={form.api_key}
              placeholder={editando?.api_key_mask ? `Atual: ${editando.api_key_mask} — deixe vazio para manter` : 'Cole a chave (opcional)'}
              onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ws-text-1)', marginBottom: 24, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.ativo} onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))} />
            Override ativo (desmarque para forçar o <code>.env</code>)
          </label>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setDrawer(false)} style={{
              flex: 1, height: 42, borderRadius: 10, border: '1px solid var(--ws-glass-border)',
              background: 'transparent', color: 'var(--ws-text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>Cancelar</button>
            <button onClick={salvar} disabled={salvando} style={{
              flex: 1, height: 42, borderRadius: 10, border: 'none', cursor: salvando ? 'wait' : 'pointer',
              background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)', color: 'white', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {salvando && <Loader2 size={15} className="animate-spin" />} Salvar
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
