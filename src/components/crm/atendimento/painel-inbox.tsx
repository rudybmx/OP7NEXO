'use client'

import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { Search, RefreshCw, MessageCircle, AtSign, Paperclip, Loader2, UserCheck, UserX, X, Star, Pin, BellOff, Tag, CheckCircle, MoreVertical, Check } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { ConversaApi } from '@/hooks/use-conversas'
import type { WhatsappCanal } from '@/hooks/use-whatsapp-canais'
import type { Etiqueta } from '@/hooks/use-etiquetas'
import { getCanalBadgeLabel, getCanalProviderLabel } from '@/lib/whatsapp-canal'
import { formatarTelefoneBR } from '@/lib/formatar'
import { useBuscarContatoPorNumero } from '@/hooks/use-buscar-contato'

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
  novaConversaAberta?: boolean
  isCriandoConversa?: boolean
  erroIniciarConversa?: string | null
  etiquetasWorkspace?: Etiqueta[]
  onSelectConversa: (id: string) => void
  onFiltroChange: (filtro: string) => void
  onCanalChange?: (canalId: string) => void
  onBuscaChange: (busca: string) => void
  onRefetch: () => void
  onIniciarConversa?: () => void
  onToggleNovaConversa?: () => void
  onCriarConversa?: (numero: string) => Promise<void>
  onClicarAreaVazia?: () => void
  onMarcarNaoLido?: (conversaId: string) => void
  onToggleFavorita?: (conversaId: string) => void
  onToggleFixada?: (conversaId: string) => void
  onAplicarEtiqueta?: (conversaId: string, etiquetaId: string) => void
  onRemoverEtiqueta?: (conversaId: string, etiquetaId: string) => void
  onResolverConversa?: (conversaId: string) => void
}

function MenuContextoConversa({
  conversa,
  x,
  y,
  etiquetasWorkspace,
  onFechar,
  onMarcarNaoLido,
  onToggleFavorita,
  onToggleFixada,
  onAplicarEtiqueta,
  onRemoverEtiqueta,
  onResolverConversa,
}: {
  conversa: ConversaApi
  x: number
  y: number
  etiquetasWorkspace: Etiqueta[]
  onFechar: () => void
  onMarcarNaoLido?: (id: string) => void
  onToggleFavorita?: (id: string) => void
  onToggleFixada?: (id: string) => void
  onAplicarEtiqueta?: (conversaId: string, etiquetaId: string) => void
  onRemoverEtiqueta?: (conversaId: string, etiquetaId: string) => void
  onResolverConversa?: (id: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [mostrarEtiquetas, setMostrarEtiquetas] = useState(false)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onFechar()
      }
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onFechar])

  // Ajuste de posição para não sair da tela
  const maxX = typeof window !== 'undefined' ? window.innerWidth - 220 : x
  const maxY = typeof window !== 'undefined' ? window.innerHeight - 320 : y
  const posX = Math.min(x, maxX)
  const posY = Math.min(y, maxY)

  const itemStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 14px',
    fontSize: 13,
    color: 'var(--ws-text-1)',
    cursor: 'pointer',
    borderRadius: 6,
    transition: 'background 0.12s',
  }

  const etiquetasConversa = conversa.etiquetas ?? []
  const etiquetaIds = new Set(etiquetasConversa.map(e => e.id))

  const handleItem = (fn: () => void) => {
    fn()
    onFechar()
  }

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: posX,
        top: posY,
        zIndex: 9999,
        minWidth: 210,
        background: 'rgba(255, 255, 255, 0.97)',
        border: '1px solid rgba(15, 23, 42, 0.10)',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(15, 23, 42, 0.16)',
        backdropFilter: 'blur(16px)',
        padding: '4px 0',
        overflow: 'hidden',
      }}
    >
      {onToggleFavorita && (
        <div
          style={{ ...itemStyle, color: conversa.favorita ? '#c9a84c' : 'var(--ws-text-1)' }}
          onClick={() => handleItem(() => onToggleFavorita(conversa.id))}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(15,23,42,0.05)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
        >
          <Star size={14} fill={conversa.favorita ? '#c9a84c' : 'none'} />
          {conversa.favorita ? 'Remover favorito' : 'Marcar como favorita'}
        </div>
      )}

      {onToggleFixada && (
        <div
          style={{ ...itemStyle, color: conversa.fixada ? '#3E5BFF' : 'var(--ws-text-1)' }}
          onClick={() => handleItem(() => onToggleFixada(conversa.id))}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(15,23,42,0.05)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
        >
          <Pin size={14} />
          {conversa.fixada ? 'Desafixar conversa' : 'Fixar conversa'}
        </div>
      )}

      {onMarcarNaoLido && (
        <div
          style={itemStyle}
          onClick={() => handleItem(() => onMarcarNaoLido(conversa.id))}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(15,23,42,0.05)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
        >
          <BellOff size={14} />
          Marcar como não lido
        </div>
      )}

      {(onAplicarEtiqueta || onRemoverEtiqueta) && etiquetasWorkspace.length > 0 && (
        <div>
          <div
            style={{ ...itemStyle, justifyContent: 'space-between' }}
            onClick={() => setMostrarEtiquetas(v => !v)}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(15,23,42,0.05)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Tag size={14} />
              Etiquetas
            </div>
            <span style={{ fontSize: 10, color: 'var(--ws-text-3)' }}>{mostrarEtiquetas ? '▲' : '▼'}</span>
          </div>
          {mostrarEtiquetas && (
            <div style={{ padding: '4px 8px', borderTop: '1px solid rgba(15,23,42,0.06)' }}>
              {etiquetasWorkspace.map(et => {
                const aplicada = etiquetaIds.has(et.id)
                return (
                  <div
                    key={et.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                    onClick={() => {
                      if (aplicada) onRemoverEtiqueta?.(conversa.id, et.id)
                      else onAplicarEtiqueta?.(conversa.id, et.id)
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(15,23,42,0.05)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
                  >
                    <span style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: et.cor,
                      flexShrink: 0,
                    }} />
                    <span style={{ flex: 1, color: 'var(--ws-text-1)' }}>{et.nome}</span>
                    {aplicada && <Check size={12} color="#1D9E75" />}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {onResolverConversa && conversa.status !== 'resolvido' && (
        <>
          <div style={{ height: 1, background: 'rgba(15,23,42,0.07)', margin: '3px 0' }} />
          <div
            style={{ ...itemStyle, color: '#1D9E75' }}
            onClick={() => handleItem(() => onResolverConversa(conversa.id))}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(37,211,102,0.07)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
          >
            <CheckCircle size={14} />
            Resolver conversa
          </div>
        </>
      )}
    </div>
  )
}

function PainelNovaConversaInline({
  onCriarConversa,
  onCancelar,
  isCriando,
  erro,
}: {
  onCriarConversa: (numero: string) => Promise<void>
  onCancelar: () => void
  isCriando?: boolean
  erro?: string | null
}) {
  const [numero, setNumero] = useState('')
  const { contato, isLoading: isBuscando, notFound } = useBuscarContatoPorNumero(numero)
  const digits = numero.replace(/\D/g, '')
  const podeAbrir = digits.length >= 10

  const handleSubmit = useCallback(() => {
    if (!podeAbrir || isCriando) return
    onCriarConversa(digits)
  }, [digits, podeAbrir, isCriando, onCriarConversa])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
    if (e.key === 'Escape') onCancelar()
  }, [handleSubmit, onCancelar])

  return (
    <div style={{
      marginTop: 12,
      padding: 12,
      borderRadius: 12,
      border: '1px solid rgba(37, 211, 102, 0.28)',
      background: 'rgba(37, 211, 102, 0.06)',
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{ position: 'relative', marginBottom: digits.length >= 10 ? 8 : 10 }}>
        <span style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--ws-text-3)',
          fontSize: 14,
          fontWeight: 600,
          userSelect: 'none',
        }}>+</span>
        <input
          autoFocus
          type="tel"
          value={numero}
          onChange={e => setNumero(e.target.value.replace(/\D/g, ''))}
          onKeyDown={handleKeyDown}
          placeholder="55 11 99999 9999"
          disabled={isCriando}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '9px 12px 9px 28px',
            borderRadius: 8,
            background: 'rgba(255, 255, 255, 0.92)',
            border: erro ? '1px solid #ef4444' : '1px solid rgba(15, 23, 42, 0.10)',
            color: 'var(--ws-text-1)',
            fontSize: 14,
            fontVariantNumeric: 'tabular-nums',
            outline: 'none',
          }}
        />
      </div>

      {digits.length >= 10 && (
        <div style={{
          marginBottom: 10,
          padding: '7px 10px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.72)',
          border: '1px solid rgba(15,23,42,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 34,
        }}>
          {isBuscando ? (
            <>
              <Loader2 size={14} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--ws-text-3)' }}>Buscando contato...</span>
            </>
          ) : contato ? (
            <>
              <UserCheck size={14} style={{ color: '#1D9E75', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--ws-text-1)', fontWeight: 600 }}>
                {contato.nome || contato.telefone || digits}
              </span>
              {contato.nome && contato.telefone && (
                <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>· {contato.telefone}</span>
              )}
            </>
          ) : notFound ? (
            <>
              <UserX size={14} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--ws-text-3)' }}>Novo contato</span>
            </>
          ) : null}
        </div>
      )}

      {erro && (
        <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8 }}>⚠ {erro}</div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancelar}
          disabled={isCriando}
          style={{
            padding: '6px 12px',
            borderRadius: 7,
            border: '1px solid rgba(15,23,42,0.10)',
            background: 'transparent',
            color: 'var(--ws-text-2)',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!podeAbrir || isCriando}
          style={{
            padding: '6px 14px',
            borderRadius: 7,
            border: 'none',
            background: '#25D366',
            color: 'white',
            cursor: (!podeAbrir || isCriando) ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
            opacity: (!podeAbrir || isCriando) ? 0.5 : 1,
          }}
        >
          {isCriando ? 'Abrindo...' : 'Abrir conversa'}
        </button>
      </div>
    </div>
  )
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
  if (conversa.isGroup) return conversa.groupName?.trim() || 'Grupo WhatsApp'
  const contactName = conversa.contato.nome?.trim()
  const phone = formatarTelefoneBR(conversa.contato.telefone || conversa.remoteJid)
  return contactName || phone || 'Contato'
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
  novaConversaAberta = false,
  isCriandoConversa = false,
  erroIniciarConversa,
  etiquetasWorkspace = [],
  onSelectConversa,
  onFiltroChange,
  onCanalChange,
  onBuscaChange,
  onRefetch,
  onIniciarConversa,
  onToggleNovaConversa,
  onCriarConversa,
  onClicarAreaVazia,
  onMarcarNaoLido,
  onToggleFavorita,
  onToggleFixada,
  onAplicarEtiqueta,
  onRemoverEtiqueta,
  onResolverConversa,
}: PainelInboxProps) {
  const [menuContexto, setMenuContexto] = useState<{
    conversa: ConversaApi
    x: number
    y: number
  } | null>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent, conversa: ConversaApi) => {
    e.preventDefault()
    e.stopPropagation()
    setMenuContexto({ conversa, x: e.clientX, y: e.clientY })
  }, [])

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
  const containerStyle: CSSProperties = {
    display: 'grid',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    height: '100%',
    width: '100%',
    minWidth: 0,
    minHeight: 0,
    boxSizing: 'border-box',
    overflow: 'hidden',
  }

  const headerStyle: CSSProperties = {
    padding: 16,
    borderBottom: '1px solid var(--ws-divider)',
  }

  const actionButtonStyle: CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: 10,
    border: '1px solid var(--ws-glass-border)',
    background: 'var(--ws-glass-bg)',
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
    background: 'var(--ws-glass-bg)',
    border: '1px solid var(--ws-glass-border)',
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
    background: 'var(--ws-glass-bg)',
    border: '1px solid var(--ws-glass-border)',
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
    padding: '2px 7px',
    fontSize: 10,
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
  }

  return (
    <div style={containerStyle} className="atd-col-bg">
      <div style={headerStyle} className="atd-header-bg">
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
            {(onToggleNovaConversa || onIniciarConversa) && (
              <button
                type="button"
                onClick={onToggleNovaConversa ?? onIniciarConversa}
                title="Iniciar nova conversa"
                aria-label="Iniciar nova conversa"
                style={{
                  ...newConversationButtonStyle,
                  ...(novaConversaAberta ? {
                    background: 'rgba(37, 211, 102, 0.22)',
                    border: '1px solid rgba(29, 158, 117, 0.36)',
                    boxShadow: '0 0 0 2px rgba(37, 211, 102, 0.18)',
                    color: '#1D9E75',
                  } : {}),
                }}
              >
                {novaConversaAberta ? <X size={16} /> : <MessageCircle size={16} />}
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

        {novaConversaAberta && onCriarConversa && onToggleNovaConversa && (
          <PainelNovaConversaInline
            onCriarConversa={onCriarConversa}
            onCancelar={onToggleNovaConversa}
            isCriando={isCriandoConversa}
            erro={erroIniciarConversa}
          />
        )}
      </div>

      <div style={listStyle} className="atd-list-bg" onClick={onClicarAreaVazia ? (e) => {
        if (e.target === e.currentTarget) onClicarAreaVazia()
      } : undefined}>
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
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--ws-text-3)', fontSize: 12 }}
            onClick={onClicarAreaVazia}>
            Nenhuma conversa encontrada
          </div>
        )}

        {conversas.map(conversa => {
          const canal = conversa.canalId ? canaisPorId.get(conversa.canalId) : null
          const titulo = formatConversationTitle(conversa)
          const preview = formatConversationPreview(conversa)
          const horario = formatConversationTime(conversa.ultimaMensagemAt)
          const providerLabel = canal ? getCanalProviderLabel(canal) : getCanalBadgeLabel(conversa.canalTipo)
          const channelLabel = formatChannelLabel(canal, conversa)
          const avatarSrc = conversa.isGroup ? (conversa.groupAvatarUrl || conversa.contato.avatarUrl) : conversa.contato.avatarUrl
          const avatarFallback = getAvatarFallback(titulo)
          const unreadCount = conversa.naoLidas > 99 ? '99+' : String(conversa.naoLidas)
          const showStatus = conversa.status !== 'em_atendimento'

          const etiquetasConversa = conversa.etiquetas ?? []

          return (
            <div
              key={conversa.id}
              onClick={() => onSelectConversa(conversa.id)}
              onContextMenu={e => handleContextMenu(e, conversa)}
              style={{
                cursor: 'pointer',
                position: 'relative',
                background: conversaAtivaId === conversa.id
                  ? 'linear-gradient(90deg, rgba(62, 91, 255, 0.16) 0%, rgba(37, 211, 102, 0.08) 100%)'
                  : 'linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(243, 247, 255, 0.95) 100%)',
                boxShadow: conversaAtivaId === conversa.id
                  ? 'inset 3px 0 0 #25D366'
                  : conversa.fixada
                    ? 'inset 3px 0 0 #3E5BFF'
                    : 'inset 3px 0 0 transparent',
                borderBottom: '1px solid rgba(62, 91, 255, 0.06)',
                transition: 'background 0.2s ease, box-shadow 0.2s ease',
                padding: '12px 14px',
              }}
            >
              {/* Indicadores de fixada e favorita */}
              <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }}>
                {conversa.fixada && <Pin size={11} color="#3E5BFF" style={{ opacity: 0.7 }} />}
                {conversa.favorita && <Star size={11} color="#c9a84c" fill="#c9a84c" style={{ opacity: 0.85 }} />}
              </div>
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
                  position: 'relative',
                }}>
                  <span aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {avatarFallback}
                  </span>
                  {avatarSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarSrc}
                      alt={titulo}
                      onError={event => { event.currentTarget.style.display = 'none' }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'relative', zIndex: 1 }}
                    />
                  ) : null}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 13,
                        fontWeight: 600,
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
                        fontSize: 11,
                        color: 'var(--ws-text-3)',
                        whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {horario}
                      </span>
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
                    {/* Canal: channelLabel se disponível, senão providerLabel */}
                    <span
                      title={channelLabel || providerLabel}
                      style={{
                        ...chipBaseStyle,
                        ...(channelLabel ? getSoftChipStyle() : getProviderTone(canal?.tipo || conversa.canalTipo)),
                      }}
                    >
                      {channelLabel || providerLabel}
                    </span>
                    {/* Follow-up vencido tem prioridade sobre status */}
                    {conversa.badges?.overdueFollowup ? (
                      <span style={{
                        ...chipBaseStyle,
                        background: 'rgba(245, 158, 11, 0.12)',
                        color: '#B45309',
                        border: '1px solid rgba(245, 158, 11, 0.20)',
                      }}>
                        Follow-up
                      </span>
                    ) : showStatus && (
                      <span style={{
                        ...chipBaseStyle,
                        ...getStatusChipStyle(conversa.status),
                      }}>
                        {formatStatusLabel(conversa.status)}
                      </span>
                    )}
                    {/* Chips de etiquetas */}
                    {etiquetasConversa.map(et => (
                      <span key={et.id} style={{
                        ...chipBaseStyle,
                        background: `${et.cor}22`,
                        color: et.cor,
                        border: `1px solid ${et.cor}44`,
                      }}>
                        {et.nome}
                      </span>
                    ))}
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

      {menuContexto && (
        <MenuContextoConversa
          conversa={menuContexto.conversa}
          x={menuContexto.x}
          y={menuContexto.y}
          etiquetasWorkspace={etiquetasWorkspace}
          onFechar={() => setMenuContexto(null)}
          onMarcarNaoLido={onMarcarNaoLido}
          onToggleFavorita={onToggleFavorita}
          onToggleFixada={onToggleFixada}
          onAplicarEtiqueta={onAplicarEtiqueta}
          onRemoverEtiqueta={onRemoverEtiqueta}
          onResolverConversa={onResolverConversa}
        />
      )}
    </div>
  )
}
