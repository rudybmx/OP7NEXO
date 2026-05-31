'use client'

import React from 'react'
import { Loader2, Plus, X, Copy, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { wsSheetCreamCloseButtonStyle, wsSheetCreamStyle, wsSheetCreamTokens } from '@/components/ui/ws-sheet'
import {
  TIPOS,
  WEBHOOK_BASE,
  inputStyle,
  labelStyle,
  type Canal,
  type NovoCanalForm,
  type Workspace,
} from './canal-shared'

interface NovoCanalDialogProps {
  open: boolean
  onClose: () => void
  workspaces: Workspace[]
  form: NovoCanalForm
  setForm: React.Dispatch<React.SetStateAction<NovoCanalForm>>
  setConfig: (key: string, value: string) => void
  salvar: () => void
  salvando: boolean
  canalCriado: Canal | null
  copiarWebhook: () => void
  copiado: boolean
}

export function NovoCanalDialog({
  open,
  onClose,
  workspaces,
  form,
  setForm,
  setConfig,
  salvar,
  salvando,
  canalCriado,
  copiarWebhook,
  copiado,
}: NovoCanalDialogProps) {
  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        style={{
          width: 'min(520px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 32px)',
          borderRadius: 18,
          ...wsSheetCreamStyle,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <DialogTitle className="sr-only">{canalCriado ? 'Canal criado' : 'Novo Canal'}</DialogTitle>
        <DialogDescription className="sr-only">
          {canalCriado ? 'URL do webhook do canal criado' : 'Configure um novo canal de entrada'}
        </DialogDescription>

        {/* Header */}
        <div style={{
          padding: '24px 28px 20px',
          borderBottom: '1px solid var(--ws-glass-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)' }}>
              {canalCriado ? 'Canal criado!' : 'Novo Canal'}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
              {canalCriado ? 'Guarde a URL do webhook abaixo' : 'Configure um novo canal de entrada'}
            </p>
          </div>
          <button
            onClick={onClose}
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

          {/* Webhook criado — exibe URL */}
          {canalCriado ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{
                background: 'rgba(37,211,102,0.08)',
                border: '1px solid rgba(37,211,102,0.25)',
                borderRadius: 12, padding: '16px 18px',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ fontSize: 28 }}>✅</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-green)' }}>
                    Canal &ldquo;{canalCriado.nome}&rdquo; criado
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ws-text-2)', marginTop: 2 }}>
                    Tipo: Webhook/API
                  </div>
                </div>
              </div>

              <div>
                <label style={labelStyle}>URL do Webhook</label>
                <div style={{
                  background: wsSheetCreamTokens.surface,
                  border: `1px solid ${wsSheetCreamTokens.border}`,
                  borderRadius: 10, padding: '12px 14px',
                }}>
                  <code style={{ fontSize: 11, color: 'var(--ws-text-1)', wordBreak: 'break-all', lineHeight: 1.6, display: 'block' }}>
                    {WEBHOOK_BASE}/{canalCriado.webhook_token}
                  </code>
                </div>
                <button
                  onClick={copiarWebhook}
                  style={{
                    marginTop: 10, width: '100%', height: 40,
                    borderRadius: 10,
                    background: copiado ? 'rgba(15,168,86,0.15)' : 'rgba(62,91,255,0.12)',
                    border: copiado ? '1px solid var(--ws-green)' : '1px solid rgba(62,91,255,0.3)',
                    fontSize: 13, fontWeight: 600,
                    color: copiado ? 'var(--ws-green)' : 'var(--ws-blue)',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 0.2s',
                  }}
                >
                  {copiado ? <Check size={15} /> : <Copy size={15} />}
                  {copiado ? 'Copiado!' : 'Copiar URL'}
                </button>
              </div>

              <p style={{ fontSize: 12, color: 'var(--ws-text-3)', margin: 0 }}>
                Configure esta URL como destino de webhook no sistema externo. O token é único e não poderá ser recuperado.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Cliente */}
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

              {/* Tipo — seletor visual */}
              <div>
                <label style={labelStyle}>Tipo *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {TIPOS.map(t => {
                    const sel = form.tipo === t.id
                    return (
                      <button
                        key={t.id}
                        onClick={() => setForm(prev => ({ ...prev, tipo: t.id, config: {} }))}
                        style={{
                          padding: '12px 10px',
                          borderRadius: 10,
                          border: sel ? `1px solid ${t.cor}` : '1px solid var(--ws-glass-border)',
                          background: sel ? t.corBg : 'transparent',
                          cursor: 'pointer', transition: 'all 0.15s',
                          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
                        }}
                      >
                        <span style={{ fontSize: 18 }}>{t.emoji}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: sel ? t.cor : 'var(--ws-text-2)', lineHeight: 1.3 }}>
                          {t.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Nome */}
              <div>
                <label style={labelStyle}>Nome do Canal *</label>
                <input
                  type="text"
                  placeholder="Nome identificador do canal"
                  value={form.nome}
                  onChange={e => setForm(prev => ({ ...prev, nome: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              {/* Mensagem de boas-vindas */}
              <div>
                <label style={labelStyle}>Mensagem de Boas-Vindas</label>
                <textarea
                  placeholder="Mensagem enviada automaticamente ao novo contato..."
                  value={form.mensagem_boas_vindas}
                  onChange={e => setForm(prev => ({ ...prev, mensagem_boas_vindas: e.target.value }))}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {/* Config por tipo */}
              {form.tipo === 'whatsapp_evolution' && (
                <div>
                  <label style={labelStyle}>Nome da Instância Evolution</label>
                  <input
                    type="text"
                    placeholder="ex: minha-instancia"
                    value={form.config.instancia ?? ''}
                    onChange={e => setConfig('instancia', e.target.value)}
                    style={inputStyle}
                  />
                </div>
              )}

              {form.tipo === 'whatsapp_oficial' && (
                <>
                  <div>
                    <label style={labelStyle}>Número</label>
                    <input
                      type="text"
                      placeholder="ex: 5511999999999"
                      value={form.config.numero ?? ''}
                      onChange={e => setConfig('numero', e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Token Meta</label>
                    <input
                      type="text"
                      placeholder="Token de acesso Meta"
                      value={form.config.token_meta ?? ''}
                      onChange={e => setConfig('token_meta', e.target.value)}
                      style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12 }}
                    />
                  </div>
                </>
              )}

              {(form.tipo === 'instagram' || form.tipo === 'facebook') && (
                <>
                  <div>
                    <label style={labelStyle}>Page ID</label>
                    <input
                      type="text"
                      placeholder="ID da página"
                      value={form.config.page_id ?? ''}
                      onChange={e => setConfig('page_id', e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Token</label>
                    <input
                      type="text"
                      placeholder="Token de acesso"
                      value={form.config.token ?? ''}
                      onChange={e => setConfig('token', e.target.value)}
                      style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12 }}
                    />
                  </div>
                </>
              )}

              {form.tipo === 'webhook' && (
                <div style={{
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.25)',
                  borderRadius: 10, padding: '14px 16px',
                }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#F59E0B', lineHeight: 1.5 }}>
                    🔗 Um token único será gerado automaticamente ao salvar. Você receberá a URL completa para configurar no sistema externo.
                  </p>
                </div>
              )}

            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '20px 28px',
          borderTop: '1px solid var(--ws-glass-border)',
          display: 'flex', gap: 12,
        }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, height: 42, borderRadius: 10,
              background: 'transparent',
              border: '1px solid var(--ws-glass-border)',
              fontSize: 14, fontWeight: 500,
              color: 'var(--ws-text-2)', cursor: 'pointer',
            }}
          >
            {canalCriado ? 'Fechar' : 'Cancelar'}
          </button>
          {!canalCriado && (
            <button
              onClick={salvar}
              disabled={salvando}
              style={{
                flex: 2, height: 42, borderRadius: 10,
                background: salvando ? 'rgba(62,91,255,0.5)' : 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
                border: 'none',
                fontSize: 14, fontWeight: 600,
                color: 'white', cursor: salvando ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: salvando ? 'none' : '0 4px 12px rgba(62,91,255,0.30)',
              }}
            >
              {salvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {salvando ? 'Salvando...' : 'Salvar Canal'}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
