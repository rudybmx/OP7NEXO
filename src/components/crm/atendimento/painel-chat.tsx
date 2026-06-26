'use client'

import { useEffect, useMemo, useRef, useState, useCallback, Fragment } from 'react'
import type { CSSProperties } from 'react'
import { ArrowLeft, ArrowRightLeft, Check, CheckCheck, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Clock, FileText, PlayCircle, AlertCircle, User, Sparkles, SmilePlus } from 'lucide-react'
import type { ConversaApi, MensagemApi } from '@/hooks/use-conversas'
import { resolveAvatarSrc } from '@/lib/avatar-src'
import { hashColor } from '@/lib/hash-color'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { CardRastreamento } from './card-rastreamento'
import { getCanalBadgeLabel } from '@/lib/whatsapp-canal'
import { formatarTelefoneBR } from '@/lib/formatar'
import { useAuth } from '@/hooks/use-auth'
import { ModalSugerirResposta } from './modal-sugerir-resposta'

const AI_HANDOFF_ENABLED = false

interface PainelChatProps {
  conversa: ConversaApi
  mensagens: MensagemApi[]
  onTogglePainel: () => void
  painelAberto: boolean
  onTransferir: () => void
  onResolver: () => void
  mensagensEndRef: React.RefObject<HTMLDivElement | null>
  /** Nº de não-lidas no momento da abertura — ancora o scroll na 1ª não-lida (estilo WhatsApp). */
  unreadCount?: number
  /** Quando presente (mobile drill-down), exibe a seta "voltar" no header. */
  onVoltar?: () => void
  isMobile?: boolean
  /** P3: responder/citar uma mensagem (abre a barra de resposta no compositor). */
  onReply?: (msg: MensagemApi) => void
  /** Reagir/remover reação com emoji a uma mensagem (espelha no WhatsApp). */
  onReact?: (msg: MensagemApi, emoji: string) => void
}

/** Emojis de reação rápida (mesmos padrões do WhatsApp). */
const EMOJIS_REACAO = ['👍', '❤️', '😂', '😮', '😢', '🙏']

function formatarData(valor?: string | null) {
  if (!valor) return 'Hoje'
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return 'Hoje'
  const hoje = new Date()
  const ontem = new Date()
  ontem.setDate(hoje.getDate() - 1)
  if (data.toDateString() === hoje.toDateString()) return 'Hoje'
  if (data.toDateString() === ontem.toDateString()) return 'Ontem'
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function agruparMensagensPorData(mensagens: MensagemApi[]) {
  return mensagens.reduce<Array<{ data: string; mensagens: MensagemApi[] }>>((grupos, mensagem) => {
    const data = formatarData(mensagem.recebidaEm || mensagem.enviadaEm || mensagem.criadaEm)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo?.data === data) {
      ultimo.mensagens.push(mensagem)
    } else {
      grupos.push({ data, mensagens: [mensagem] })
    }
    return grupos
  }, [])
}

function onlyDigits(value?: string | null) {
  return value ? value.replace(/\D/g, '') : ''
}

function formatHeaderTitle(conversa: ConversaApi) {
  if (conversa.isGroup) return conversa.groupName?.trim() || 'Grupo WhatsApp'
  const name = conversa.contato.nome?.trim()
  return name || formatarTelefoneBR(conversa.contato.telefone) || formatarTelefoneBR(conversa.remoteJid) || 'Contato'
}

function formatStatusLabel(status: string) {
  return status.replaceAll('_', ' ')
}

function formatMessageTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getMessageStatusMeta(status?: string | null) {
  const normalized = (status || '').toLowerCase()
  if (!normalized) return null

  if (normalized === 'failed') {
    return {
      label: 'Falhou',
      icon: <AlertCircle size={11} />,
      style: {
        background: 'rgba(239, 68, 68, 0.10)',
        color: '#B91C1C',
        border: '1px solid rgba(239, 68, 68, 0.18)',
      } satisfies CSSProperties,
    }
  }

  if (normalized === 'read' || normalized === 'played') {
    return {
      label: normalized === 'played' ? 'Visualizada' : 'Lida',
      icon: <CheckCheck size={11} />,
      style: {
        background: 'rgba(0, 110, 255, 0.10)',
        color: 'var(--ws-blue)',
        border: '1px solid rgba(0, 110, 255, 0.16)',
      } satisfies CSSProperties,
    }
  }

  if (normalized === 'delivered') {
    return {
      label: 'Entregue',
      icon: <CheckCheck size={11} />,
      style: {
        background: 'rgba(100, 116, 139, 0.10)',
        color: '#475569',
        border: '1px solid rgba(100, 116, 139, 0.16)',
      } satisfies CSSProperties,
    }
  }

  if (normalized === 'sent' || normalized === 'enviada') {
    return {
      label: 'Enviada',
      icon: <Check size={11} />,
      style: {
        background: 'rgba(100, 116, 139, 0.08)',
        color: '#475569',
        border: '1px solid rgba(100, 116, 139, 0.14)',
      } satisfies CSSProperties,
    }
  }

  if (normalized === 'pending') {
    return {
      label: 'Pendente',
      icon: <Clock size={11} />,
      style: {
        background: 'rgba(245, 158, 11, 0.12)',
        color: '#B45309',
        border: '1px solid rgba(245, 158, 11, 0.20)',
      } satisfies CSSProperties,
    }
  }

  return {
    label: formatStatusLabel(status),
    icon: <Clock size={11} />,
    style: {
      background: 'var(--ws-surface-2)',
      color: 'var(--ws-text-2)',
      border: '1px solid var(--ws-glass-border)',
    } satisfies CSSProperties,
  }
}

function getStatusTone(status?: string | null): CSSProperties {
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
      background: 'rgba(0, 110, 255, 0.10)',
      color: 'var(--ws-blue)',
      border: '1px solid rgba(0, 110, 255, 0.18)',
    }
  }
  return {
    background: 'rgba(37, 211, 102, 0.10)',
    color: '#1D9E75',
    border: '1px solid rgba(29, 158, 117, 0.18)',
  }
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

function MediaImagem({
  url,
  alt,
  onOpen,
}: {
  url: string
  alt: string
  onOpen: (url: string) => void
}) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(url)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onOpen(url) }}
      style={{
        position: 'relative',
        cursor: 'pointer',
        width: 260,
        maxWidth: '100%',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--ws-surface-2)',
        aspectRatio: loaded && !error ? 'auto' : '4/3',
      }}
    >
      {!loaded && !error && (
        <>
          <div
            className="animate-pulse"
            style={{ position: 'absolute', inset: 0, background: 'var(--ws-glass-bg)' }}
          />
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div
              className="animate-spin"
              style={{
                width: 24,
                height: 24,
                border: '2.5px solid rgba(0,110,255,0.20)',
                borderTopColor: 'rgba(0,110,255,0.80)',
                borderRadius: '50%',
              }}
            />
          </div>
        </>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => { setLoaded(true); setError(true) }}
        style={{
          display: 'block',
          width: '100%',
          maxHeight: 260,
          objectFit: 'cover',
          borderRadius: 10,
          opacity: loaded && !error ? 1 : 0,
          transition: 'opacity 0.25s ease',
        }}
      />
      {error && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          color: 'var(--ws-text-2)',
        }}>
          Imagem indisponível
        </div>
      )}
    </div>
  )
}

function renderMidiaPending(kind: string, filename: string | null | undefined, isEntrada: boolean, isIA: boolean, key: string) {
  const mutedColor = isEntrada ? 'var(--ws-text-2)' : (isIA ? 'rgba(255,255,255,0.55)' : 'var(--ws-text-2)')
  const skeletonBg = isEntrada ? 'var(--ws-glass-bg)' : (isIA ? 'rgba(255,255,255,0.10)' : 'var(--ws-glass-bg)')

  if (kind === 'image') {
    return (
      <div key={key} className="animate-pulse" style={{
        width: 260, maxWidth: '100%', aspectRatio: '4/3',
        borderRadius: 10, background: skeletonBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={mutedColor} strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </div>
    )
  }
  if (kind === 'audio') {
    return (
      <div key={key} className="animate-pulse" style={{
        width: 250, maxWidth: '100%', height: 40, borderRadius: 8,
        background: skeletonBg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: 8,
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={mutedColor} strokeWidth="1.5">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: skeletonBg, maxWidth: 160 }} />
      </div>
    )
  }
  if (kind === 'video') {
    return (
      <div key={key} className="animate-pulse" style={{
        width: 260, maxWidth: '100%', aspectRatio: '16/9',
        borderRadius: 10, background: skeletonBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={mutedColor} strokeWidth="1.5">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      </div>
    )
  }
  if (kind === 'document') {
    return (
      <div key={key} style={{
        display: 'flex', alignItems: 'center', gap: 8,
        color: mutedColor, fontSize: 12,
      }}>
        <FileText size={16} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {filename || 'Carregando documento...'}
        </span>
      </div>
    )
  }
  return (
    <div key={key} style={{ fontSize: 12, color: mutedColor }}>
      Carregando mídia...
    </div>
  )
}

function renderMidiaError(kind: string | null | undefined, isEntrada: boolean, isIA: boolean, key: string) {
  const mutedColor = isEntrada ? '#ef4444' : (isIA ? 'rgba(255,100,100,0.80)' : '#dc2626')
  return (
    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: mutedColor }}>
      <AlertCircle size={14} />
      <span>Não foi possível carregar a mídia</span>
    </div>
  )
}

// Destaca @menções no corpo da mensagem em dourado. Em grupos a menção vem como
// @<LID> (número grande); se o backend resolveu o nome do contato (mentionedNames),
// mostra @Nome; senão mantém @<número> (fallback).
function renderConteudoComMencoes(texto: string, mentionedNames?: Record<string, string>) {
  const parts = texto.split(/(@\d{6,})/g)
  if (parts.length === 1) return texto
  return parts.map((parte, i) => {
    const m = /^@(\d{6,})$/.exec(parte)
    if (!m) return parte
    const nome = mentionedNames?.[m[1]]
    return (
      <span key={i} style={{ color: '#c9a84c', fontWeight: 600 }}>
        {nome ? `@${nome}` : parte}
      </span>
    )
  })
}

// Rótulo amigável do tipo da mensagem citada quando não há texto (ex.: foto, áudio)
function quotedTypeLabel(messageType: string | null | undefined): string {
  const t = (messageType || '').toLowerCase()
  if (t.includes('image')) return '📷 Foto'
  if (t.includes('sticker')) return 'Figurinha'
  if (t.includes('audio') || t.includes('ptt')) return '🎤 Áudio'
  if (t.includes('video') || t.includes('ptv')) return '🎬 Vídeo'
  if (t.includes('document')) return '📄 Documento'
  return 'Mensagem'
}

// Preview do conteúdo citado: texto se houver, senão rótulo do tipo
function quotedPreview(msg: MensagemApi): string {
  const txt = (msg.quotedText || '').trim()
  if (txt) return txt
  return quotedTypeLabel(msg.quotedMessageType)
}

// P2: ao clicar numa citação, rola até a mensagem original (casa data-wamid com o
// wa-id citado) e dá um destaque breve. No-op se a original não está na página.
function scrollToQuoted(wamid: string | null | undefined) {
  if (!wamid || typeof document === 'undefined') return
  let el: HTMLElement | null = null
  try {
    el = document.querySelector(`[data-wamid="${CSS.escape(wamid)}"]`)
  } catch {
    el = null
  }
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.style.outline = '2px solid #c9a84c'
  el.style.outlineOffset = '3px'
  window.setTimeout(() => {
    el!.style.outline = ''
    el!.style.outlineOffset = ''
  }, 1600)
}

// Autor da citação: nome (quando resolvido) ou número do JID citado
function quotedAuthorLabel(msg: MensagemApi): string {
  if (msg.quotedAuthor) return msg.quotedAuthor
  const jid = msg.quotedRemoteJid || ''
  const digits = jid.split('@')[0].replace(/\D/g, '')
  if (digits) return `+${digits}`
  return 'Mensagem citada'
}

function renderMidia(msg: MensagemApi, isEntrada: boolean, isIA: boolean, onOpenLightbox: (url: string) => void) {
  const midias = msg.midias?.length
    ? msg.midias
    : msg.mediaUrl ? [{ id: `${msg.id}-media`, tipo: msg.mediaKind || msg.messageType || 'document', url: msg.mediaUrl, caption: msg.mediaCaption, filename: msg.mediaFilename }] : []

  // Quando midias[] vazio mas há media_kind pendente, renderizar skeleton
  const hasPendingOrError = !midias.length && (msg.mediaStatus === 'pending' || msg.mediaStatus === 'error') && msg.mediaKind
  if (hasPendingOrError) {
    if (msg.mediaStatus === 'error') {
      return <div style={{ marginBottom: 4 }}>{renderMidiaError(msg.mediaKind, isEntrada, isIA, `${msg.id}-err`)}</div>
    }
    return <div style={{ marginBottom: 4 }}>{renderMidiaPending(msg.mediaKind!, msg.mediaFilename, isEntrada, isIA, `${msg.id}-pending`)}</div>
  }

  if (midias.length === 0) return null

  const caption = (media: { caption?: string | null }) => media.caption || msg.mediaCaption

  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 0 }}>
      {midias.map(media => {
        const kind = (media.tipo || msg.mediaKind || msg.messageType || '').toLowerCase()
        const url = media.url

        if (!url) {
          if (msg.mediaStatus === 'error') {
            return renderMidiaError(kind, isEntrada, isIA, media.id)
          }
          return renderMidiaPending(kind, (media as { filename?: string | null }).filename || msg.mediaFilename, isEntrada, isIA, media.id)
        }

        const captionText = caption(media)
        const mutedColor = isEntrada ? 'var(--ws-text-2)' : (isIA ? 'rgba(255,255,255,0.78)' : 'var(--ws-text-1)')

        if (kind.includes('image') || kind.includes('imagem')) {
          return (
            <div key={media.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <MediaImagem
                url={url}
                alt={captionText || (media as { filename?: string | null }).filename || 'Imagem da conversa'}
                onOpen={onOpenLightbox}
              />
              {captionText && (
                <span style={{ fontSize: 12, color: mutedColor }}>{captionText}</span>
              )}
            </div>
          )
        }
        if (kind.includes('audio')) {
          return (
            <div key={media.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <audio controls src={url} style={{ width: 250, maxWidth: '100%' }} />
              {captionText && <span style={{ fontSize: 12, color: mutedColor }}>{captionText}</span>}
            </div>
          )
        }
        if (kind.includes('video')) {
          // GIF (videoMessage com gifPlayback): autoplay em loop, mudo, sem controles
          if (msg.mediaGif) {
            return (
              <div key={media.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <video
                  src={url}
                  autoPlay
                  loop
                  muted
                  playsInline
                  style={{ display: 'block', width: 220, maxWidth: '100%', borderRadius: 10 }}
                />
                {captionText && <span style={{ fontSize: 12, color: mutedColor }}>{captionText}</span>}
              </div>
            )
          }
          return (
            <div key={media.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <video controls src={url} style={{ display: 'block', width: 260, maxWidth: '100%', borderRadius: 10 }} />
              {captionText && <span style={{ fontSize: 12, color: mutedColor }}>{captionText}</span>}
            </div>
          )
        }
        // Sticker: renderiza inline como imagem (webp), não como link de download
        if (kind.includes('sticker')) {
          return (
            <div key={media.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <img
                src={url}
                alt={captionText || 'Figurinha'}
                onError={event => { event.currentTarget.style.display = 'none' }}
                style={{ display: 'block', width: 120, height: 120, objectFit: 'contain', cursor: 'pointer' }}
                onClick={() => onOpenLightbox(url)}
              />
              {captionText && <span style={{ fontSize: 12, color: mutedColor }}>{captionText}</span>}
            </div>
          )
        }
        return (
          <div key={media.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                color: isEntrada ? '#006EFF' : (isIA ? '#ffffff' : 'var(--ws-text-1)'),
                textDecoration: 'none', fontSize: 12, fontWeight: 600,
              }}
            >
              {kind.includes('sticker') ? <PlayCircle size={16} /> : <FileText size={16} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(media as { filename?: string | null }).filename || msg.mediaFilename || 'Documento'}
              </span>
            </a>
            {captionText && <span style={{ fontSize: 12, color: mutedColor }}>{captionText}</span>}
          </div>
        )
      })}
    </div>
  )
}

export function PainelChat({ conversa, mensagens, onTogglePainel, painelAberto, onTransferir, onResolver, mensagensEndRef, unreadCount = 0, onVoltar, isMobile = false, onReply, onReact }: PainelChatProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const { user } = useAuth()
  const isAdmin = !!user && user.role !== 'company_agent'
  const [ajuste, setAjuste] = useState<{ mensagemId: string; original: string } | null>(null)
  // Qual mensagem está com o seletor de emoji aberto (hover/click no botão de reagir).
  const [reactPickerFor, setReactPickerFor] = useState<string | null>(null)
  const grupos = useMemo(() => agruparMensagensPorData(mensagens), [mensagens])

  // ── Scroll estilo WhatsApp: ao abrir COLA NO FINAL (robusto a mídia); aviso de não-lidas é separado ──
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const scrolledForRef = useRef<string | null>(null)
  // Enquanto true, o chat "gruda" no fim e re-cola a cada crescimento (ex.: mídia carregando).
  // Vira false assim que o usuário rola para cima — sem cap de tempo, sem brigar com o scroll do usuário.
  const stickToBottomRef = useRef(true)
  const [pilulaNaoLidasVisivel, setPilulaNaoLidasVisivel] = useState(false)

  // id da 1ª mensagem não-lida (= a unreadCount-ésima de ENTRADA a partir do fim). Só p/ o marcador + a pílula.
  const firstUnreadId = useMemo(() => {
    if (!unreadCount || unreadCount <= 0) return null
    const entradas = mensagens.filter(m => m.direcao === 'entrada')
    if (entradas.length === 0) return null
    return entradas[Math.max(0, entradas.length - unreadCount)]?.id ?? null
  }, [mensagens, unreadCount])

  const colarNoFim = useCallback((behavior: ScrollBehavior = 'auto') => {
    mensagensEndRef.current?.scrollIntoView({ block: 'end', behavior })
  }, [mensagensEndRef])

  // ABERTURA (troca de conversa): cola no fim e religa o "grudar no fim".
  // `setMensagens([])` em use-mensagens zera a lista ao trocar, então este effect re-roda quando
  // as mensagens da nova conversa chegam (mensagens.length passa de 0 → N) com scrolledForRef ainda antigo.
  useEffect(() => {
    if (!conversa?.id || mensagens.length === 0) return
    if (scrolledForRef.current === conversa.id) return
    scrolledForRef.current = conversa.id
    stickToBottomRef.current = true
    colarNoFim('auto')
    setPilulaNaoLidasVisivel(!!firstUnreadId)
    const raf = requestAnimationFrame(() => { if (stickToBottomRef.current) colarNoFim('auto') })
    return () => cancelAnimationFrame(raf)
  }, [conversa?.id, mensagens.length, firstUnreadId, colarNoFim])

  // CRESCIMENTO do conteúdo (imagens/áudio carregando OU mensagem nova): re-cola no fim se ainda grudado.
  // Observa o WRAPPER DE CONTEÚDO (cresce), NÃO o container de scroll (altura fixa → não dispararia).
  useEffect(() => {
    const alvo = contentRef.current
    if (!alvo || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { if (stickToBottomRef.current) colarNoFim('auto') })
    ro.observe(alvo)
    return () => ro.disconnect()
  }, [colarNoFim])

  // Rolagem do usuário: solta/religa o "grudar" e controla a pílula (visível enquanto a 1ª não-lida
  // estiver acima da área visível — i.e. o usuário precisa subir para vê-la).
  const handleScroll = useCallback(() => {
    const c = scrollContainerRef.current
    if (!c) return
    stickToBottomRef.current = c.scrollHeight - c.scrollTop - c.clientHeight < 180
    if (!firstUnreadId) { setPilulaNaoLidasVisivel(false); return }
    const alvo = c.querySelector(`[data-msg-id="${CSS.escape(firstUnreadId)}"]`) as HTMLElement | null
    if (!alvo) { setPilulaNaoLidasVisivel(false); return }
    setPilulaNaoLidasVisivel(alvo.getBoundingClientRect().top < c.getBoundingClientRect().top)
  }, [firstUnreadId])

  // Pílula "↑ X não lidas" → sobe até a 1ª não-lida.
  const irParaPrimeiraNaoLida = useCallback(() => {
    if (!firstUnreadId) return
    const c = scrollContainerRef.current
    const alvo = c?.querySelector(`[data-msg-id="${CSS.escape(firstUnreadId)}"]`) as HTMLElement | null
    if (alvo) {
      stickToBottomRef.current = false
      alvo.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
    setPilulaNaoLidasVisivel(false)
  }, [firstUnreadId])

  // Participantes do grupo que aparecem na conversa (nomes distintos), p/ o header.
  const participantesGrupo = useMemo(() => {
    if (!conversa.isGroup) return [] as string[]
    const nomes = mensagens
      .filter(m => m.direcao === 'entrada' && m.participantName && m.participantName.trim())
      .map(m => m.participantName!.trim())
    return Array.from(new Set(nomes))
  }, [conversa.isGroup, mensagens])
  const titulo = formatHeaderTitle(conversa)
  const telefone = formatarTelefoneBR(conversa.contato.telefone || conversa.remoteJid)
  const avatarSrc = resolveAvatarSrc(conversa.isGroup ? (conversa.groupAvatarUrl || conversa.contato.avatarUrl) : conversa.contato.avatarUrl)
  const avatarFallback = getAvatarFallback(titulo)
  const canalLabel = getCanalBadgeLabel(conversa.canalTipo)
  const canalDetalhe = [conversa.canalNome, conversa.canalNumero].filter(Boolean).join(' · ')
  const statusTone = getStatusTone(conversa.status)
  const patternOverlayStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  }

  return (
    <div style={{
      flex: 1,
      display: 'grid',
      gridTemplateRows: 'auto minmax(0, 1fr)',
      minWidth: 0,
      minHeight: 0,
      height: '100%',
      overflow: 'hidden',
    }} className="atd-col-bg">
      {/* Header */}
      <div className="atd-header-bg" style={{
        padding: '14px 20px',
        borderBottom: '1px solid var(--ws-divider)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {onVoltar && (
            <button
              type="button"
              onClick={onVoltar}
              aria-label="Voltar para a lista de conversas"
              title="Voltar"
              style={{
                width: 44,
                height: 44,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                border: 'none',
                background: 'transparent',
                color: 'var(--ws-text-2)',
                cursor: 'pointer',
              }}
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <div style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: avatarSrc
              ? 'linear-gradient(135deg, rgba(37, 211, 102, 0.16), rgba(15, 23, 42, 0.08))'
              : 'linear-gradient(135deg, #25D366 0%, #1D9E75 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 800,
            color: 'white',
            overflow: 'hidden',
            flexShrink: 0,
            boxShadow: '0 6px 16px rgba(15, 23, 42, 0.10)',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ws-text-1)', lineHeight: 1.2 }}>
                {titulo}
              </span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
                maxWidth: '100%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                ...statusTone,
              }}>
                {formatStatusLabel(conversa.status)}
              </span>
              {conversa.isGroup && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                  background: 'var(--ws-surface-2)',
                  color: 'var(--ws-text-2)',
                  border: '1px solid var(--ws-glass-border)',
                }}>
                  Grupo
                </span>
              )}
            </div>

            <div style={{ fontSize: 11.5, color: 'var(--ws-text-3)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {telefone && (
                <>
                  <span style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '100%',
                  }}>
                    {telefone}
                  </span>
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(100, 116, 139, 0.45)' }} />
                </>
              )}
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 999,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
                background: conversa.canalTipo === 'webhook' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(37, 211, 102, 0.12)',
                color: conversa.canalTipo === 'webhook' ? '#B45309' : '#1D9E75',
                border: `1px solid ${conversa.canalTipo === 'webhook' ? 'rgba(245, 158, 11, 0.20)' : 'rgba(29, 158, 117, 0.18)'}`,
              }}>
                {canalLabel}
              </span>
              {canalDetalhe && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.03em',
                  textTransform: 'uppercase',
                  background: 'var(--ws-surface-2)',
                  color: 'var(--ws-text-2)',
                  border: '1px solid var(--ws-glass-border)',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {canalDetalhe}
                </span>
              )}
            </div>
            {conversa.isGroup && participantesGrupo.length > 0 && (
              <div
                title={participantesGrupo.join(', ')}
                style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', lineHeight: 1.3 }}
              >
                {participantesGrupo.join(', ')}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button
            type="button"
            onClick={onTogglePainel}
            style={{
              minHeight: isMobile ? 40 : 32,
              width: isMobile ? 40 : undefined,
              padding: isMobile ? 0 : '0 12px',
              borderRadius: 999,
              background: painelAberto
                ? 'rgba(0, 110, 255, 0.10)'
                : 'var(--ws-surface)',
              border: painelAberto
                ? '1px solid rgba(0, 110, 255, 0.18)'
                : '1px solid var(--ws-glass-border)',
              color: painelAberto ? 'var(--ws-blue)' : 'var(--ws-text-2)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              boxShadow: painelAberto
                ? '0 4px 12px rgba(0, 110, 255, 0.10)'
                : '0 1px 2px rgba(15, 23, 42, 0.05)',
              whiteSpace: 'nowrap',
            }}
            title={painelAberto ? 'Fechar painel do contato' : 'Abrir painel do contato'}
            aria-label={painelAberto ? 'Fechar painel do contato' : 'Abrir painel do contato'}
            aria-expanded={painelAberto}
          >
            <User size={14} />
            {!isMobile && (
              <>
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  {painelAberto ? 'Fechar contato' : 'Abrir contato'}
                </span>
                {painelAberto ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onTransferir}
            style={{
              width: isMobile ? 40 : 32,
              height: isMobile ? 40 : 32,
              borderRadius: 10,
              background: 'var(--ws-surface)',
              border: '1px solid var(--ws-glass-border)',
              color: 'var(--ws-text-3)',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
            }}
            title="Transferir"
            aria-label="Transferir conversa"
          >
            <ArrowRightLeft size={14} />
          </button>
          <button
            type="button"
            onClick={onResolver}
            style={{
              border: '1px solid rgba(29, 158, 117, 0.18)',
              background: 'rgba(37, 211, 102, 0.12)',
              color: '#1D9E75',
              cursor: 'pointer',
              padding: isMobile ? '11px 14px' : '8px 12px',
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(29, 158, 117, 0.10)',
            }}
            title="Resolver"
            aria-label="Resolver conversa"
          >
            <Check size={14} />
            Resolver
          </button>
        </div>
      </div>

      {/* Mensagens */}
      <div className="atd-chat-bg" style={{
        position: 'relative',
        minHeight: 0,
        overflow: 'hidden',
      }}>
        <div aria-hidden className="atd-chat-pattern" style={patternOverlayStyle} />
        <div ref={scrollContainerRef} onScroll={handleScroll} style={{
          position: 'relative',
          zIndex: 1,
          minHeight: 0,
          height: '100%',
          overflowY: 'scroll',
          scrollbarGutter: 'stable',
          WebkitOverflowScrolling: 'touch',
          padding: 20,
          background: 'linear-gradient(to bottom, transparent, rgba(0,110,255,0.02))',
          scrollbarWidth: 'thin',
        }}>
          <div ref={contentRef} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <CardRastreamento
            metaHeadline={conversa.contato.metaHeadline}
            metaBody={conversa.contato.metaBody}
            metaImageUrl={conversa.contato.metaImageUrl}
            metaSourceUrl={conversa.contato.metaSourceUrl}
            campanhaOrigem={conversa.contato.campanhaOrigem}
            utmSource={conversa.contato.utmSource}
            utmMedium={conversa.contato.utmMedium}
            primeiraConversaAt={conversa.contato.primeiraConversaAt}
          />
          {grupos.map(grupo => (
            <div key={grupo.data}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <span style={{
                  fontSize: 11,
                  color: 'var(--ws-text-3)',
                  background: 'rgba(255,255,255,0.20)',
                  padding: '4px 12px',
                  borderRadius: 99,
                  border: '1px solid var(--ws-glass-border)',
                  backdropFilter: 'blur(8px)',
                }}>
                  {grupo.data}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {grupo.mensagens.map(msg => {
                // Divisor "X não lidas" (estilo WhatsApp) inserido antes da 1ª mensagem não-lida.
                const divisorNaoLidas = msg.id === firstUnreadId ? (
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: '#006EFF',
                      background: 'rgba(0,110,255,0.10)', border: '1px solid rgba(0,110,255,0.20)',
                      padding: '3px 12px', borderRadius: 99,
                    }}>
                      {unreadCount} {unreadCount === 1 ? 'mensagem não lida' : 'mensagens não lidas'}
                    </span>
                  </div>
                ) : null
                // Mensagem interna do sistema (ex.: handoff/transferência da IA — Fase 4):
                // nota centralizada, não é bolha de contato/agente.
                if (msg.remetenteTipo === 'sistema') {
                  return (
                    <Fragment key={msg.id}>
                      {divisorNaoLidas}
                    <div style={{ alignSelf: 'center', maxWidth: '88%', margin: '6px auto', display: 'flex', justifyContent: 'center' }}>
                      <div style={{
                        fontSize: 11,
                        lineHeight: 1.5,
                        color: '#475569',
                        background: 'rgba(148, 163, 184, 0.14)',
                        border: '1px solid rgba(148, 163, 184, 0.22)',
                        borderRadius: 10,
                        padding: '6px 12px',
                        textAlign: 'center',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {msg.conteudo}
                      </div>
                    </div>
                    </Fragment>
                  )
                }
                const isEntrada = msg.direcao === 'entrada'
                const isIA = AI_HANDOFF_ENABLED && msg.remetenteTipo === 'ia'
                const participantLabel = msg.participantName || msg.remetenteNome || 'Contato'
                const messageStatus = getMessageStatusMeta(msg.waStatus || msg.mediaStatus)
                const messageTime = formatMessageTime(msg.recebidaEm || msg.enviadaEm || msg.criadaEm)
                const isOutgoing = !isEntrada
                const bubbleStyle: CSSProperties = isEntrada
                  ? {
                      background: msg.isMentioned
                        ? 'linear-gradient(180deg, rgba(255, 248, 220, 0.98), rgba(255, 244, 197, 0.96))'
                        : 'var(--ws-surface)',
                      color: msg.isMentioned ? '#0f172a' : 'var(--ws-text-1)',
                      border: `1px solid ${msg.isMentioned ? 'rgba(201, 168, 76, 0.28)' : 'var(--ws-glass-border)'}`,
                      boxShadow: '0 8px 20px rgba(15, 23, 42, 0.06)',
                    }
                  : isIA
                    ? {
                        background: 'linear-gradient(135deg, #0f2744, #1a3a6b)',
                        color: '#ffffff',
                        border: '1px solid rgba(15, 39, 68, 0.18)',
                        boxShadow: '0 10px 22px rgba(15, 39, 68, 0.12)',
                      }
                    : {
                        border: '1px solid rgba(0, 110, 255, 0.12)',
                        boxShadow: '0 10px 22px rgba(0, 110, 255, 0.08)',
                      }
                const isOut = !isEntrada && !isIA
                const footerColor = isEntrada
                  ? 'var(--ws-text-2)'
                  : isIA
                    ? 'var(--ws-glass-bg)'
                    : 'var(--ws-text-2)'
                // Remetente (estilo grupo/WhatsApp): nome em negrito + cor por pessoa + avatar
                const senderNome = isEntrada
                  ? (conversa.isGroup ? participantLabel : (msg.remetenteNome || conversa.contato.nome || 'Contato'))
                  : (isIA ? 'IA Agente' : 'Atendente')
                const senderCor = hashColor(msg.participantJid || senderNome)
                const senderAvatar = isEntrada
                  ? resolveAvatarSrc(conversa.isGroup ? null : conversa.contato.avatarUrl)
                  : null
                return (
                  <Fragment key={msg.id}>
                  {divisorNaoLidas}
                  <div
                    data-msg-id={msg.id}
                    data-wamid={msg.evolutionMsgId || undefined}
                    style={{
                      alignSelf: isEntrada ? 'flex-start' : 'flex-end',
                      maxWidth: isMobile ? '85%' : '70%',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      marginBottom: 12,
                      position: 'relative',
                      paddingLeft: isEntrada ? 36 : 0,
                    }}
                  >
                    {isEntrada && (
                      <div style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        background: senderCor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 10,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}>
                        {senderAvatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={senderAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : getAvatarFallback(senderNome)}
                      </div>
                    )}
                    <div style={{
                      fontSize: isEntrada ? 11 : 9,
                      fontWeight: isEntrada ? 700 : 400,
                      color: isEntrada ? senderCor : 'var(--ws-text-3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      justifyContent: isEntrada ? 'flex-start' : 'flex-end',
                    }}>
                      {senderNome}
                    </div>
                    <div className={`atd-bubble-reply${isOut ? ' atd-bubble-out' : ''}`} style={{
                      position: 'relative',
                      padding: '10px 14px 9px',
                      borderRadius: isEntrada ? '0 16px 16px 16px' : '16px 0 16px 16px',
                      fontSize: 13,
                      lineHeight: 1.5,
                      background: bubbleStyle.background,
                      color: bubbleStyle.color,
                      border: bubbleStyle.border,
                      boxShadow: bubbleStyle.boxShadow,
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                      minWidth: 120,
                    }}>
                      {onReply && (
                        <button
                          type="button"
                          className="atd-reply-chevron"
                          title="Responder"
                          aria-label="Responder"
                          onClick={() => onReply(msg)}
                          style={{
                            position: 'absolute',
                            top: 2,
                            right: 4,
                            border: 'none',
                            background: 'transparent',
                            color: 'inherit',
                            cursor: 'pointer',
                            padding: 2,
                            lineHeight: 0,
                            borderRadius: 4,
                          }}
                        >
                          <ChevronDown size={15} />
                        </button>
                      )}
                      {onReact && msg.evolutionMsgId && (
                        <div style={{ position: 'absolute', top: 2, right: onReply ? 24 : 4 }}>
                          <button
                            type="button"
                            className="atd-reply-chevron"
                            title="Reagir"
                            aria-label="Reagir"
                            onClick={() => setReactPickerFor(reactPickerFor === msg.id ? null : msg.id)}
                            style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 2, lineHeight: 0, borderRadius: 4 }}
                          >
                            <SmilePlus size={15} />
                          </button>
                          {reactPickerFor === msg.id && (
                            <div
                              role="menu"
                              onMouseLeave={() => setReactPickerFor(null)}
                              style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: 4,
                                zIndex: 20,
                                display: 'flex',
                                gap: 2,
                                padding: '4px 6px',
                                background: 'var(--card, #fff)',
                                border: '1px solid var(--border, rgba(15,39,68,0.12))',
                                borderRadius: 999,
                                boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
                              }}
                            >
                              {EMOJIS_REACAO.map(e => (
                                <button
                                  key={e}
                                  type="button"
                                  title={`Reagir com ${e}`}
                                  onClick={() => { onReact(msg, e); setReactPickerFor(null) }}
                                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 3px', borderRadius: 6 }}
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {(msg.quotedText || msg.quotedMessageId) && (
                        <div
                          role={msg.quotedMessageId ? 'button' : undefined}
                          tabIndex={msg.quotedMessageId ? 0 : undefined}
                          title={msg.quotedMessageId ? 'Ir para a mensagem citada' : undefined}
                          onClick={msg.quotedMessageId ? () => scrollToQuoted(msg.quotedMessageId) : undefined}
                          onKeyDown={msg.quotedMessageId ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scrollToQuoted(msg.quotedMessageId) } } : undefined}
                          style={{
                          borderLeft: '3px solid #c9a84c',
                          background: isEntrada ? 'var(--ws-glass-bg)' : 'rgba(255,255,255,0.14)',
                          borderRadius: 6,
                          padding: '4px 8px',
                          marginBottom: 6,
                          fontSize: 12,
                          cursor: msg.quotedMessageId ? 'pointer' : 'default',
                        }}>
                          <div style={{ fontWeight: 600, color: '#c9a84c', fontSize: 11, marginBottom: 2 }}>
                            {quotedAuthorLabel(msg)}
                          </div>
                          <div style={{
                            opacity: 0.82,
                            whiteSpace: 'pre-wrap',
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                          }}>
                            {quotedPreview(msg)}
                          </div>
                        </div>
                      )}
                      {msg.isMentioned && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#c9a84c', marginBottom: 4 }}>
                          @ mencionou você
                        </div>
                      )}
                      {renderMidia(msg, isEntrada, isIA, setLightboxUrl)}
                      {(() => {
                        const temMidia = (msg.midias?.length ?? 0) > 0 || !!msg.mediaUrl
                        const body = msg.conteudo?.trim() ?? ''
                        const isPlaceholder = body === '[mídia]'
                        // Suprimir placeholders de mídia quando media_kind conhecido: "[mídia]", "mídia", "(mídia)"
                        const isMidiaText = msg.mediaKind != null && /^[\[(]?(mídia|midia)[\])]?$/i.test(body)
                        if (!msg.conteudo || (temMidia && isPlaceholder) || isMidiaText) return null
                        return <div style={{ whiteSpace: 'pre-wrap' }}>{renderConteudoComMencoes(msg.conteudo, msg.mentionedNames)}</div>
                      })()}
                      <div style={{
                        fontSize: 10,
                        color: footerColor,
                        marginTop: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 6,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {isOutgoing && isAdmin && (
                          <button
                            type="button"
                            onClick={() => setAjuste({ mensagemId: msg.id, original: msg.conteudo || '' })}
                            title="Sugerir resposta melhor (admin)"
                            style={{ display: 'inline-flex', alignItems: 'center', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: footerColor, opacity: 0.45 }}
                          >
                            <Sparkles size={12} />
                          </button>
                        )}
                        <span>{messageTime}</span>
                        {isOutgoing && messageStatus && (
                          <span
                            title={messageStatus.label}
                            aria-label={messageStatus.label}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minWidth: 14,
                              height: 14,
                              padding: 0,
                              borderRadius: 999,
                              whiteSpace: 'nowrap',
                              ...messageStatus.style,
                            }}
                          >
                            {messageStatus.icon}
                          </span>
                        )}
                      </div>
                      {msg.failedReason && (
                        <div style={{ fontSize: 10, color: isEntrada ? '#a32d2d' : '#b91c1c', marginTop: 4 }}>
                          {msg.failedReason}
                        </div>
                      )}
                      {(msg.reacoes?.length ?? 0) > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                          {msg.reacoes!.map(r => (
                            <button
                              key={r.emoji}
                              type="button"
                              onClick={onReact && msg.evolutionMsgId ? () => onReact(msg, r.emoji) : undefined}
                              title={r.reactors.join(', ')}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontSize: 12,
                                lineHeight: 1,
                                padding: '2px 7px',
                                borderRadius: 999,
                                cursor: onReact && msg.evolutionMsgId ? 'pointer' : 'default',
                                background: r.mine ? 'rgba(0,110,255,0.14)' : 'var(--ws-glass-bg, rgba(15,39,68,0.06))',
                                border: r.mine ? '1px solid #006EFF' : '1px solid transparent',
                                color: 'inherit',
                              }}
                            >
                              <span>{r.emoji}</span>
                              {r.count > 1 && <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{r.count}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  </Fragment>
                )
              })}
              </div>
            </div>
          ))}
          <div ref={mensagensEndRef} />
          </div>
        </div>
        {pilulaNaoLidasVisivel && firstUnreadId && mensagens.length > 0 && (
          <button
            type="button"
            onClick={irParaPrimeiraNaoLida}
            aria-label={`Ir para a primeira de ${unreadCount} mensagens não lidas`}
            style={{
              position: 'absolute',
              bottom: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 5,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: '#006EFF',
              color: '#fff',
              border: 'none',
              borderRadius: 99,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 6px 18px rgba(0,110,255,0.35)',
            }}
          >
            <ChevronUp size={15} />
            {unreadCount} não {unreadCount === 1 ? 'lida' : 'lidas'}
          </button>
        )}
      </div>

      <Dialog open={!!lightboxUrl} onOpenChange={open => { if (!open) setLightboxUrl(null) }}>
        <DialogContent
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(10,14,26,0.96)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 16,
            padding: 16,
            maxWidth: '90vw',
            width: 'fit-content',
          }}
        >
          <DialogTitle className="sr-only">Visualização de imagem</DialogTitle>
          <DialogDescription className="sr-only">Imagem ampliada da conversa</DialogDescription>
          {lightboxUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lightboxUrl}
              alt="Visualização ampliada"
              style={{
                maxWidth: '100%',
                maxHeight: '80vh',
                objectFit: 'contain',
                borderRadius: 10,
                display: 'block',
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      {ajuste && (
        <ModalSugerirResposta
          conversaId={conversa.id}
          mensagemId={ajuste.mensagemId}
          respostaOriginal={ajuste.original}
          onClose={() => setAjuste(null)}
        />
      )}
    </div>
  )
}
