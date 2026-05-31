'use client'

import React from 'react'
import Image from 'next/image'
import { Check, Loader2, Power, PowerOff, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { wsSheetCreamCloseButtonStyle, wsSheetCreamStyle, wsSheetCreamTokens } from '@/components/ui/ws-sheet'
import { inputStyle, labelStyle, type Canal } from './canal-shared'

export interface EditCanalForm {
  nome: string
  mensagem_boas_vindas: string
  status: string
  config: Record<string, string>
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
            </div>

            {canal?.tipo === 'whatsapp_evolution' && (
              <div
                style={{
                  background: 'rgba(37,211,102,0.06)',
                  border: '1px solid rgba(37,211,102,0.20)',
                  borderRadius: 12,
                  padding: '16px 18px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 20 }}>📱</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>
                        WhatsApp Evolution
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
                        background: conectando ? 'rgba(37,211,102,0.30)' : 'rgba(37,211,102,0.15)',
                        border: '1px solid rgba(37,211,102,0.40)',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#25D366',
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
