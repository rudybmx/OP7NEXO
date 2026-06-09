'use client'

import React from 'react'
import Image from 'next/image'
import { Check, Loader2, Power, PowerOff, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { wsSheetCreamCloseButtonStyle, wsSheetCreamStyle, wsSheetCreamTokens } from '@/components/ui/ws-sheet'
import { inputStyle, labelStyle, type Canal } from './canal-shared'
import {
  getWebhookHelenaConfig,
  getWebhookProvider,
  hasWebhookHelenaField,
  setWebhookHelenaField,
  setWebhookProvider,
  type CanalConfig,
  type WebhookProvider,
} from './webhook-config'

export interface EditCanalForm {
  nome: string
  mensagem_boas_vindas: string
  status: string
  config: CanalConfig
}

interface EditarCanalDialogProps {
  open: boolean
  onClose: () => void
  canal: Canal | null
  form: EditCanalForm
  setForm: React.Dispatch<React.SetStateAction<EditCanalForm>>
  salvar: () => void
  salvando: boolean
  qrCode: string | null
  pairingCode: string | null
  conectando: boolean
  onConectar: () => void
  onDesconectar: () => void
}

const STATUS_OPTIONS = [
  { value: 'ativo', label: 'Ativo' },
  { value: 'inativo', label: 'Inativo' },
  { value: 'erro', label: 'Erro' },
]

const CONN_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  connected: { label: 'Conectado', bg: 'rgba(15,168,86,0.15)', color: 'var(--ws-green)' },
  connecting: { label: 'Conectando', bg: 'rgba(245,158,11,0.15)', color: '#F59E0B' },
  disconnected: { label: 'Desconectado', bg: 'rgba(163,45,45,0.15)', color: '#a32d2d' },
  failed: { label: 'Falha / Conflito', bg: 'rgba(163,45,45,0.18)', color: '#a32d2d' },
}

const WEBHOOK_PROVIDER_OPTIONS: { value: WebhookProvider; label: string }[] = [
  { value: 'generic', label: 'Webhook Genérico' },
  { value: 'helena', label: 'Helena' },
  { value: 'crm_externo_zapi', label: 'Qozt Enterprise' },
]

function isWebhookChannel(canal: Canal | null): boolean {
  return canal?.tipo === 'webhook'
}

export function EditarCanalDialog({
  open,
  onClose,
  canal,
  form,
  setForm,
  salvar,
  salvando,
  qrCode,
  pairingCode,
  conectando,
  onConectar,
  onDesconectar,
}: EditarCanalDialogProps) {
  const provider = getWebhookProvider(form.config)
  const helenaCfg = getWebhookHelenaConfig(form.config)
  const showFromPhone =
    provider === 'crm_externo_zapi' ||
    (provider === 'helena' && hasWebhookHelenaField(form.config, 'from_phone'))

  const atualizarProvider = (nextProvider: WebhookProvider) => {
    setForm((prev) => ({
      ...prev,
      config: setWebhookProvider(prev.config, nextProvider),
    }))
  }

  const atualizarHelenaField = (
    key: 'api_token_ref' | 'from_phone',
    value: string,
  ) => {
    setForm((prev) => ({
      ...prev,
      config: setWebhookHelenaField(prev.config, key, value),
    }))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        style={{
          width: 'min(560px, calc(100vw - 32px))',
          maxHeight: 'calc(100vh - 32px)',
          borderRadius: 18,
          ...wsSheetCreamStyle,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <DialogTitle className="sr-only">Editar Canal</DialogTitle>
        <DialogDescription className="sr-only">
          Atualize nome, mensagem de boas-vindas e status do canal
        </DialogDescription>

        <div
          style={{
            padding: '24px 28px 20px',
            borderBottom: `1px solid ${wsSheetCreamTokens.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)' }}>
              Editar Canal
            </h2>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-1)', margin: '4px 0 0' }}>
              {canal?.nome}
            </p>
          </div>
          <button
            onClick={onClose}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={labelStyle}>Nome do Canal *</label>
              <input
                type="text"
                value={form.nome}
                onChange={(event) => setForm((prev) => ({ ...prev, nome: event.target.value }))}
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Mensagem de Boas-Vindas</label>
              <textarea
                value={form.mensagem_boas_vindas}
                onChange={(event) => setForm((prev) => ({ ...prev, mensagem_boas_vindas: event.target.value }))}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 96 }}
              />
            </div>

            <div>
              <label style={labelStyle}>Status *</label>
              <select
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {canal?.tipo === 'webhook' && (
                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--ws-text-3)', lineHeight: 1.5 }}>
                  Controla se o canal deve ficar operacional. Não depende de conexão como WhatsApp Evolution.
                </p>
              )}
              {canal?.tipo === 'whatsapp_evolution' && (
                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--ws-text-3)', lineHeight: 1.5 }}>
                  Em Evolution, a conexão é mostrada acima via connection_status; este status segue como flag
                  administrativa.
                </p>
              )}
            </div>

            {isWebhookChannel(canal) && (
              <>
                <div>
                  <label style={labelStyle}>Provider *</label>
                  <select
                    value={provider}
                    onChange={(event) => atualizarProvider(event.target.value as WebhookProvider)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    {WEBHOOK_PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {provider === 'generic' && (
                  <div
                    style={{
                      background: 'rgba(37,211,102,0.06)',
                      border: '1px solid rgba(37,211,102,0.20)',
                      borderRadius: 10,
                      padding: '14px 16px',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--ws-text-2)', lineHeight: 1.5 }}>
                      Webhook genérico com assinatura HMAC. O segredo fica preservado no backend e não aparece na UI.
                    </p>
                  </div>
                )}

                {provider === 'helena' && (
                  <div
                    style={{
                      background: 'rgba(62,91,255,0.08)',
                      border: '1px solid rgba(62,91,255,0.25)',
                      borderRadius: 10,
                      padding: '14px 16px',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--ws-blue)', lineHeight: 1.5 }}>
                      Helena é inbound-only nesta etapa. Nenhum token real é solicitado aqui.
                    </p>
                  </div>
                )}

                {provider === 'crm_externo_zapi' && (
                  <div
                    style={{
                      background: 'rgba(62,91,255,0.08)',
                      border: '1px solid rgba(62,91,255,0.18)',
                      borderRadius: 10,
                      padding: '14px 16px',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--ws-blue)', lineHeight: 1.5 }}>
                      Informe apenas o nome da variável de ambiente e os campos operacionais existentes. Tokens reais
                      nunca devem ser digitados aqui.
                    </p>
                  </div>
                )}

                {provider === 'crm_externo_zapi' && (
                  <div>
                    <label style={labelStyle}>Referência do token (env var) *</label>
                    <input
                      type="text"
                      value={helenaCfg.api_token_ref ?? ''}
                      onChange={(event) => atualizarHelenaField('api_token_ref', event.target.value)}
                      placeholder="ex: HELENA_CHAT_TOKEN_QOZT"
                      style={inputStyle}
                    />
                    <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--ws-text-3)', lineHeight: 1.4 }}>
                      Apenas o nome da variável de ambiente. O token real é resolvido no servidor.
                    </p>
                  </div>
                )}

                {showFromPhone && (
                  <div>
                    <label style={labelStyle}>Número de origem (from_phone)</label>
                    <input
                      type="text"
                      value={helenaCfg.from_phone ?? ''}
                      onChange={(event) => atualizarHelenaField('from_phone', event.target.value)}
                      placeholder="ex: 5547999999999"
                      style={inputStyle}
                    />
                  </div>
                )}
              </>
            )}

            {(canal?.tipo === 'whatsapp_evolution' || canal?.tipo === 'whatsapp_waha') && (
              <div
                style={{
                  background: canal?.tipo === 'whatsapp_waha' ? 'rgba(122,90,248,0.06)' : 'rgba(37,211,102,0.06)',
                  border: canal?.tipo === 'whatsapp_waha' ? '1px solid rgba(122,90,248,0.20)' : '1px solid rgba(37,211,102,0.20)',
                  borderRadius: 12,
                  padding: '16px 18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 20 }}>{canal?.tipo === 'whatsapp_waha' ? '⚡' : '📱'}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>
                        {canal?.tipo === 'whatsapp_waha' ? 'WhatsApp WAHA' : 'WhatsApp Evolution'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ws-text-3)', marginTop: 2 }}>
                        {canal.numero_telefone ?? 'Nenhum número conectado'}
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '3px 10px',
                      borderRadius: 6,
                      background: CONN_BADGE[canal.connection_status ?? 'disconnected']?.bg,
                      color: CONN_BADGE[canal.connection_status ?? 'disconnected']?.color,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: CONN_BADGE[canal.connection_status ?? 'disconnected']?.color,
                      }}
                    />
                    {CONN_BADGE[canal.connection_status ?? 'disconnected']?.label ?? 'Desconectado'}
                  </span>
                </div>

                {canal.connection_status === 'failed' && (
                  <div style={{
                    marginBottom: 12, padding: '10px 12px', borderRadius: 8,
                    background: 'rgba(163,45,45,0.08)', border: '1px solid rgba(163,45,45,0.25)',
                    fontSize: 12, color: '#a32d2d', lineHeight: 1.5,
                  }}>
                    A sessão caiu após estar conectada. Causa provável: o número está vinculado em
                    outra ferramenta de WhatsApp (conflito) ou foi desconectado no celular. Reconecte
                    pelo QR; se cair de novo, verifique vínculos externos do número.
                  </div>
                )}

                {qrCode && (
                  <div style={{ textAlign: 'center', marginBottom: 12 }}>
                    <Image
                      src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                      alt="QR Code WhatsApp"
                      width={200}
                      height={200}
                      unoptimized
                      style={{ width: 200, height: 200, borderRadius: 8, border: '1px solid var(--ws-glass-border)' }}
                    />
                    <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 6 }}>
                      Escaneie com seu WhatsApp
                    </p>
                  </div>
                )}

                {!qrCode && pairingCode && (
                  <div
                    style={{
                      textAlign: 'center',
                      marginBottom: 12,
                      padding: '14px 16px',
                      borderRadius: 10,
                      border: '1px solid rgba(37,211,102,0.22)',
                      background: 'rgba(37,211,102,0.06)',
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginBottom: 8 }}>
                      Código de pareamento
                    </div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        letterSpacing: '0.16em',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        color: 'var(--ws-text-1)',
                        wordBreak: 'break-word',
                      }}
                    >
                      {pairingCode}
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 8 }}>
                      Digite esse código no WhatsApp para concluir a conexão
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                  {canal.connection_status === 'connected' ? (
                    <button
                      onClick={onDesconectar}
                      style={{
                        flex: 1,
                        height: 38,
                        borderRadius: 8,
                        background: 'rgba(163,45,45,0.12)',
                        border: '1px solid rgba(163,45,45,0.30)',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#a32d2d',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      <PowerOff size={14} />
                      Desconectar
                    </button>
                  ) : (
                    <button
                      onClick={onConectar}
                      disabled={conectando}
                      style={{
                        flex: 1,
                        height: 38,
                        borderRadius: 8,
                        background: canal?.tipo === 'whatsapp_waha'
                          ? (conectando ? 'rgba(122,90,248,0.30)' : 'rgba(122,90,248,0.15)')
                          : (conectando ? 'rgba(37,211,102,0.30)' : 'rgba(37,211,102,0.15)'),
                        border: canal?.tipo === 'whatsapp_waha' ? '1px solid rgba(122,90,248,0.40)' : '1px solid rgba(37,211,102,0.40)',
                        fontSize: 13,
                        fontWeight: 600,
                        color: canal?.tipo === 'whatsapp_waha' ? '#7A5AF8' : '#25D366',
                        cursor: conectando ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }}
                    >
                      {conectando ? <Loader2 size={14} className="animate-spin" /> : <Power size={14} />}
                      {conectando ? 'Conectando...' : 'Conectar'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {canal?.tipo !== 'whatsapp_evolution' && canal?.tipo !== 'whatsapp_waha' && canal?.tipo !== 'webhook' && (
              <div
                style={{
                  background: 'rgba(15,23,42,0.04)',
                  border: '1px solid rgba(15,23,42,0.08)',
                  borderRadius: 12,
                  padding: '16px 18px',
                }}
              >
                <p style={{ margin: 0, fontSize: 12, color: 'var(--ws-text-2)', lineHeight: 1.5 }}>
                  A configuração deste tipo permanece preservada automaticamente.
                </p>
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            padding: '20px 28px',
            borderTop: `1px solid ${wsSheetCreamTokens.border}`,
            display: 'flex',
            gap: 12,
          }}
        >
          <button
            onClick={onClose}
            style={{
              flex: 1,
              height: 42,
              borderRadius: 10,
              background: 'transparent',
              border: `1px solid ${wsSheetCreamTokens.border}`,
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--ws-text-2)',
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            style={{
              flex: 2,
              height: 42,
              borderRadius: 10,
              background: salvando ? 'rgba(62,91,255,0.5)' : 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              color: 'white',
              cursor: salvando ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: salvando ? 'none' : '0 4px 12px rgba(62,91,255,0.30)',
            }}
          >
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
