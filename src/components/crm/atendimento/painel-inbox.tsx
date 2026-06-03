'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, RefreshCw, MessageCircle, AtSign, Paperclip } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { ConversaApi } from '@/hooks/use-conversas'
import type { WhatsappCanal } from '@/hooks/use-whatsapp-canais'
import { getCanalBadgeLabel, getCanalProviderLabel } from '@/lib/whatsapp-canal'

interface PainelInboxProps {
  conversas: ConversaApi[]
  conversaAtivaId: string | null
  filtroAtivo: string
  busca: string
  isLoading: boolean
  error: string | null
  aoVivo?: boolean
  canais?: WhatsappCanal[]
  canalSelecionadoId?: string
  onSelectConversa: (id: string) => void
  onFiltroChange: (filtro: string) => void
  onCanalChange?: (canalId: string) => void
  onBuscaChange: (busca: string) => void
  onRefetch: () => void
  onIniciarConversa?: () => void
}

function onlyDigits(value?: string | null) {
  return value ? value.replace(/\D/g, '') : ''
}

function formatConversationTime(value?: string | null) {
  if (!value) return ''
  const data = new Date(value)
  if (Number.isNaN(data.getTime())) return ''
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatConversationRelativeTime(value?: string | null, now = Date.now()) {
  if (!value) return ''
  const data = new Date(value)
  if (Number.isNaN(data.getTime())) return ''

  const diffMs = Math.max(0, now - data.getTime())
  const diffMinutes = Math.floor(diffMs / 60_000)

  if (diffMinutes < 1) return 'AGORA'
  if (diffMinutes < 60) return `${diffMinutes} MINUTO${diffMinutes === 1 ? '' : 'S'}`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} HORA${diffHours === 1 ? '' : 'S'}`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} DIA${diffDays === 1 ? '' : 'S'}`
}

function formatConversationTitle(conversa: ConversaApi) {
  if (conversa.isGroup) return conversa.groupName?.trim() || conversa.contato.nome?.trim() || 'Grupo WhatsApp'
  const contactName = conversa.contato.nome?.trim()
  const phone = conversa.contato.telefone?.trim()
  return contactName || phone || 'Contato WhatsApp'
}

function formatConversationPreview(conversa: ConversaApi) {
  const message = conversa.ultimaMensagem?.trim()
  if (message) return message
  if (conversa.badges?.hasMedia) return 'Mídia'
  return conversa.status === 'resolvido' ? 'Conversa resolvida' : 'Sem mensagens'
}

function getAvatarFallback(label: string) {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.match(/[A-Za-zÀ-ÿ0-9]/)?.[0] || '')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.toUpperCase())
    .join('')

  if (initials) return initials

  const digits = onlyDigits(label)
  if (digits) return digits.slice(-2)

  return 'OP'
}

function formatChannelLabel(canal?: WhatsappCanal | null, conversa?: ConversaApi) {
  const label = canal
    ? [canal.nome, canal.numero_telefone].filter(Boolean).join(' · ')
    : [conversa?.canalNome, conversa?.canalNumero].filter(Boolean).join(' · ')
  return label || null
}

function getProviderTone(tipo?: string | null): CSSProperties {
  if (tipo === 'webhook') {
    return {
      background: 'rgba(245, 158, 11, 0.12)',
      color: '#B45309',
      border: '1px solid rgba(245, 158, 11, 0.24)',
    }
  }
  if (tipo === 'whatsapp_oficial') {
    return {
      background: 'rgba(24, 95, 165, 0.12)',
      color: '#185FA5',
      border: '1px solid rgba(24, 95, 165, 0.22)',
    }
  }
  if (tipo === 'whatsapp_waha') {
    return {
      background: 'rgba(122, 90, 248, 0.12)',
      color: '#7A5AF8',
      border: '1px solid rgba(122, 90, 248, 0.22)',
    }
  }
  return {
    background: 'rgba(37, 211, 102, 0.12)',
    color: '#1D9E75',
    border: '1px solid rgba(29, 158, 117, 0.20)',
  }
}

function getSoftChipStyle(): CSSProperties {
  return {
    background: 'rgba(15, 23, 42, 0.04)',
    color: 'var(--ws-text-2)',
    border: '1px solid rgba(15, 23, 42, 0.08)',
  }
}

function getStatusChipStyle(status?: string | null): CSSProperties {
  if (status === 'resolvido') {
    return {
      background: 'rgba(100, 116, 139, 0.10)',
      color: 'var(--ws-text-2)',
      border: '1px solid rgba(100, 116, 139, 0.16)',
    }
  }
  if (status === 'resgate') {
    return {
      background: 'rgba(245, 158, 11, 0.12)',
      color: '#B45309',
      border: '1px solid rgba(245, 158, 11, 0.20)',
    }
  }
  if (status === 'nova') {
    return {
      background: 'rgba(62, 91, 255, 0.10)',
      color: 'var(--ws-blue)',
      border: '1px solid rgba(62, 91, 255, 0.18)',
    }
  }
  if (status === 'aguardando' || status === 'processando') {
    return {
      background: 'rgba(15, 23, 42, 0.05)',
      color: 'var(--ws-text-2)',
      border: '1px solid rgba(15, 23, 42, 0.10)',
    }
  }
  return {
    background: 'rgba(37, 211, 102, 0.10)',
    color: '#1D9E75',
    border: '1px solid rgba(29, 158, 117, 0.18)',
  }
}

function formatStatusLabel(status: string) {
  return status.replaceAll('_', ' ')
}

export function PainelInbox({
  conversas,
  conversaAtivaId,
  filtroAtivo,
  busca,
  isLoading,
  error,
  aoVivo,
  canais = [],
  canalSelecionadoId = 'todos',
  onSelectConversa,
  onFiltroChange,
  onCanalChange,
  onBuscaChange,
  onRefetch,
  onIniciarConversa,
}: PainelInboxProps) {
  const filtros = [
    { id: 'todas', label: 'Todas' },
    { id: 'novas', label: 'Novas' },
    { id: 'minhas', label: 'Minhas' },
    { id: 'equipe', label: 'Equipe' },
    { id: 'grupos', label: 'Grupos' },
    { id: 'resgate', label: 'Resgate' },
    { id: 'resolvidos', label: 'Resolvidos' },
  ]

  const canaisPorId = useMemo(
    () => new Map<string, WhatsappCanal>(canais.map(canal => [canal.id, canal] as const)),
    [canais],
  )
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    const interval = window.setInterval(() => {
      setAgora(Date.now())
    }, 60_000)

    return () => window.clearInterval(interval)
  }, [])

  const containerStyle: CSSProperties = {
    display: 'grid',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    height: '100%',
    width: '100%',
    minWidth: 0,
    minHeight: 0,
    boxSizing: 'border-box',
    overflow: 'hidden',
    background: 'rgba(255, 255, 255, 0.72)',
    backdropFilter: 'blur(12px)',
  }

  const headerStyle: CSSProperties = {
    padding: 16,
    borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.92) 100%)',
  }

  const actionButtonStyle: CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: 10,
    border: '1px solid rgba(15, 23, 42, 0.08)',
    background: 'rgba(255, 255, 255, 0.88)',
    color: 'var(--ws-text-2)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
  }

  const newConversationButtonStyle: CSSProperties = {
    ...actionButtonStyle,
    background: 'rgba(37, 211, 102, 0.14)',
    color: '#1D9E75',
    border: '1px solid rgba(29, 158, 117, 0.18)',
  }

  const searchShellStyle: CSSProperties = {
    position: 'relative',
    marginTop: 12,
  }

  const searchInputStyle: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 14px 10px 40px',
    borderRadius: 999,
    background: 'rgba(255, 255, 255, 0.92)',
    border: '1px solid rgba(15, 23, 42, 0.08)',
    color: 'var(--ws-text-1)',
    fontSize: 13,
    outline: 'none',
    boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.04)',
  }

  const selectStyle: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 14px',
    borderRadius: 14,
    background: 'rgba(255, 255, 255, 0.92)',
    border: '1px solid rgba(15, 23, 42, 0.08)',
    color: 'var(--ws-text-1)',
    fontSize: 12,
    outline: 'none',
    boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.04)',
  }

  const chipBaseStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    padding: '2px 8px',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    maxWidth: '100%',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }

  const listStyle: CSSProperties = {
    minHeight: 0,
    overflowY: 'auto',
    scrollbarGutter: 'stable',
    scrollbarWidth: 'thin',
    WebkitOverflowScrolling: 'touch',
    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.70) 0%, rgba(242, 246, 255, 0.96) 100%)',
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ws-text-1)', margin: 0 }}>Conversas</h2>
            {aoVivo && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10,
                color: '#1D9E75',
                background: 'rgba(29, 158, 117, 0.12)',
                padding: '2px 8px',
                borderRadius: 999,
                fontWeight: 700,
                border: '1px solid rgba(29, 158, 117, 0.16)',
              }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#1D9E75',
                  display: 'inline-block',
                  animation: 'pulse 2s infinite',
                }} />
                ao vivo
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {onIniciarConversa && (
              <button
                type="button"
                onClick={onIniciarConversa}
                style={newConversationButtonStyle}
                title="Iniciar nova conversa"
                aria-label="Iniciar nova conversa"
              >
                <MessageCircle size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={onRefetch}
              style={actionButtonStyle}
              title="Atualizar"
              aria-label="Atualizar lista"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div style={searchShellStyle}>
          <Search size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ws-text-3)' }} />
          <input
            value={busca}
            onChange={e => onBuscaChange(e.target.value)}
            placeholder="Buscar conversa"
            style={searchInputStyle}
          />
        </div>

        {onCanalChange && canais.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <select
              value={canalSelecionadoId}
              onChange={e => onCanalChange(e.target.value)}
              style={selectStyle}
            >
              <option value="todos">Todos os números</option>
              {canais.map(canal => (
                <option key={canal.id} value={canal.id}>
                  {canal.tipo === 'webhook'
                    ? `${getCanalProviderLabel(canal)} · ${canal.nome}`
                    : `${canal.nome}${canal.numero_telefone ? ` · ${canal.numero_telefone}` : ''}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          {filtros.map(filtro => {
            const ativo = filtroAtivo === filtro.id
            return (
              <button
                key={filtro.id}
                type="button"
                onClick={() => onFiltroChange(filtro.id)}
                style={{
                  padding: '6px 11px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: ativo ? '1px solid rgba(29, 158, 117, 0.24)' : '1px solid rgba(15, 23, 42, 0.08)',
                  background: ativo ? 'rgba(37, 211, 102, 0.16)' : 'rgba(255, 255, 255, 0.88)',
                  color: ativo ? '#1D9E75' : 'var(--ws-text-2)',
                  boxShadow: ativo ? '0 4px 10px rgba(29, 158, 117, 0.10)' : 'none',
                }}
              >
                {filtro.label}
              </button>
            )
          })}
        </div>
      </div>

      <div style={listStyle}>
        {isLoading && conversas.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--ws-text-3)', fontSize: 12 }}>
            Carregando conversas...
          </div>
        )}
        {error && (
          <div style={{ padding: 24, textAlign: 'center', color: '#a32d2d', fontSize: 12 }}>
            {error}
          </div>
        )}
        {!isLoading && conversas.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--ws-text-3)', fontSize: 12 }}>
            Nenhuma conversa encontrada
          </div>
        )}

        {conversas.map(conversa => {
          const canal = conversa.canalId ? canaisPorId.get(conversa.canalId) : null
          const titulo = formatConversationTitle(conversa)
          const preview = formatConversationPreview(conversa)
          const horario = formatConversationTime(conversa.ultimaMensagemAt)
          const tempoRelativo = formatConversationRelativeTime(conversa.ultimaMensagemAt, agora)
          const providerLabel = canal ? getCanalProviderLabel(canal) : getCanalBadgeLabel(conversa.canalTipo)
          const channelLabel = formatChannelLabel(canal, conversa)
          const avatarSrc = conversa.isGroup ? conversa.groupAvatarUrl : conversa.contato.avatarUrl
          const avatarFallback = getAvatarFallback(titulo)
          const unreadCount = conversa.naoLidas > 99 ? '99+' : String(conversa.naoLidas)
          const showStatus = conversa.status !== 'em_atendimento'

          return (
            <div
              key={conversa.id}
              onClick={() => onSelectConversa(conversa.id)}
              style={{
                cursor: 'pointer',
                background: conversaAtivaId === conversa.id
                  ? 'linear-gradient(90deg, rgba(62, 91, 255, 0.16) 0%, rgba(37, 211, 102, 0.08) 100%)'
                  : 'linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(243, 247, 255, 0.95) 100%)',
                boxShadow: conversaAtivaId === conversa.id
                  ? 'inset 3px 0 0 #25D366'
                  : 'inset 3px 0 0 transparent',
                borderBottom: '1px solid rgba(62, 91, 255, 0.06)',
                transition: 'background 0.2s ease, box-shadow 0.2s ease',
                padding: '16px 14px',
                minHeight: 92,
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr) auto', gap: 12, alignItems: 'start' }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: avatarSrc
                    ? 'linear-gradient(135deg, rgba(37, 211, 102, 0.16), rgba(15, 23, 42, 0.08))'
                    : 'linear-gradient(135deg, #25D366 0%, #1D9E75 100%)',
                  boxShadow: '0 6px 16px rgba(15, 23, 42, 0.10)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 800,
                  flexShrink: 0,
                }}>
                  {avatarSrc ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={avatarSrc}
                        alt={titulo}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    </>
                  ) : (
                    avatarFallback
                  )}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--ws-text-1)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: '100%',
                      }}>
                        {titulo}
                      </span>
                      {conversa.isGroup && (
                        <span style={{
                          ...chipBaseStyle,
                          ...getSoftChipStyle(),
                        }}>
                          Grupo
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'grid', justifyItems: 'end', gap: 2, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 10.5,
                        color: 'var(--ws-text-3)',
                        whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {horario}
                      </span>
                      {tempoRelativo && (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          color: 'var(--ws-text-3)',
                          whiteSpace: 'nowrap',
                        }}>
                          {tempoRelativo}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{
                    marginTop: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    minWidth: 0,
                    color: conversa.naoLidas > 0 ? 'var(--ws-text-1)' : 'var(--ws-text-3)',
                    fontSize: 12,
                    fontWeight: conversa.naoLidas > 0 ? 600 : 400,
                  }}>
                    {conversa.badges?.mentioned && <AtSign size={11} style={{ flexShrink: 0, color: '#c9a84c' }} />}
                    {conversa.badges?.hasMedia && <Paperclip size={11} style={{ flexShrink: 0 }} />}
                    <span style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                    }}>
                      {preview}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    <span
                      title={providerLabel}
                      style={{
                        ...chipBaseStyle,
                        ...getProviderTone(canal?.tipo || conversa.canalTipo),
                      }}
                    >
                      {providerLabel}
                    </span>
                    {channelLabel && (
                      <span
                        title={channelLabel}
                        style={{
                          ...chipBaseStyle,
                          ...getSoftChipStyle(),
                        }}
                      >
                        {channelLabel}
                      </span>
                    )}
                    {conversa.badges?.overdueFollowup && (
                      <span style={{
                        ...chipBaseStyle,
                        background: 'rgba(245, 158, 11, 0.12)',
                        color: '#B45309',
                        border: '1px solid rgba(245, 158, 11, 0.20)',
                      }}>
                        Follow-up vencido
                      </span>
                    )}
                    {showStatus && (
                      <span style={{
                        ...chipBaseStyle,
                        ...getStatusChipStyle(conversa.status),
                      }}>
                        {formatStatusLabel(conversa.status)}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ minWidth: 34, display: 'flex', justifyContent: 'flex-end' }}>
                  {conversa.naoLidas > 0 && (
                    <span style={{
                      minWidth: 22,
                      height: 22,
                      borderRadius: 999,
                      background: '#25D366',
                      color: 'white',
                      fontSize: 10,
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 6px',
                      boxShadow: '0 4px 12px rgba(37, 211, 102, 0.25)',
                    }}>
                      {unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
