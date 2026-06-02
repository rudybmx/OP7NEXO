'use client'

import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowRightLeft, Check, CheckCheck, ChevronLeft, ChevronRight, Clock, FileText, PlayCircle, AlertCircle, User } from 'lucide-react'
import type { ConversaApi, MensagemApi } from '@/hooks/use-conversas'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { CardRastreamento } from './card-rastreamento'
import { getCanalBadgeLabel } from '@/lib/whatsapp-canal'

const AI_HANDOFF_ENABLED = false
const CHAT_PATTERN_URL = 'https://pub-db8ed4fb33634589a6ce5fb07e85cb46.r2.dev/logo/op7_dash_odc/Pattern%20OP7.svg'

interface PainelChatProps {
  conversa: ConversaApi
  mensagens: MensagemApi[]
  onTogglePainel: () => void
  painelAberto: boolean
  onTransferir: () => void
  onResolver: () => void
  mensagensEndRef: React.RefObject<HTMLDivElement | null>
}

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

function formatPhoneLabel(value?: string | null) {
  if (!value) return 'Telefone indisponível'
  const digits = onlyDigits(value)
  if (!digits) return value
  if (digits.startsWith('55') && digits.length >= 12) {
    const ddd = digits.slice(2, 4)
    const local = digits.slice(4)
    if (local.length > 8) {
      return `+55 ${ddd} ${local.slice(0, local.length - 4)}-${local.slice(-4)}`
    }
    return `+55 ${ddd} ${local}`
  }
  return digits || value
}

function formatHeaderTitle(conversa: ConversaApi) {
  const name = conversa.isGroup ? conversa.groupName : conversa.contato.nome
  return (name?.trim() || conversa.contato.nome?.trim() || formatPhoneLabel(conversa.contato.telefone) || onlyDigits(conversa.remoteJid) || 'Contato')
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
        background: 'rgba(62, 91, 255, 0.10)',
        color: 'var(--ws-blue)',
        border: '1px solid rgba(62, 91, 255, 0.16)',
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
      background: 'rgba(15, 23, 42, 0.06)',
      color: 'var(--ws-text-2)',
      border: '1px solid rgba(15, 23, 42, 0.10)',
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
      background: 'rgba(62, 91, 255, 0.10)',
      color: 'var(--ws-blue)',
      border: '1px solid rgba(62, 91, 255, 0.18)',
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
        background: 'rgba(15,23,42,0.06)',
        aspectRatio: loaded && !error ? 'auto' : '4/3',
      }}
    >
      {!loaded && !error && (
        <>
          <div
            className="animate-pulse"
            style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.08)' }}
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
                border: '2.5px solid rgba(62,91,255,0.20)',
                borderTopColor: 'rgba(62,91,255,0.80)',
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
          color: 'rgba(15,23,42,0.45)',
        }}>
          Imagem indisponível
        </div>
      )}
    </div>
  )
}

function renderMidia(msg: MensagemApi, isEntrada: boolean, isIA: boolean, onOpenLightbox: (url: string) => void) {
  const midias = msg.midias?.length
    ? msg.midias
    : msg.mediaUrl ? [{ id: `${msg.id}-media`, tipo: msg.messageType || 'document', url: msg.mediaUrl }] : []

  if (midias.length === 0) return null

  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: msg.conteudo ? 8 : 0 }}>
      {midias.map(media => {
        const tipo = (media.tipo || msg.messageType || '').toLowerCase()
        const url = media.url
        if (!url) {
          return (
            <div
              key={media.id}
              style={{
                fontSize: 12,
                color: isEntrada ? '#64748b' : (isIA ? 'rgba(255,255,255,0.78)' : '#10203a'),
              }}
            >
              Mídia em processamento
            </div>
          )
        }
        if (tipo.includes('image') || tipo.includes('imagem')) {
          return (
            <div key={media.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <MediaImagem
                url={url}
                alt={media.caption || media.filename || 'Imagem da conversa'}
                onOpen={onOpenLightbox}
              />
              {media.caption && (
                <span style={{ fontSize: 12, color: isEntrada ? '#64748b' : (isIA ? 'rgba(255,255,255,0.78)' : '#10203a') }}>
                  {media.caption}
                </span>
              )}
            </div>
          )
        }
        if (tipo.includes('audio')) {
          return <audio key={media.id} controls src={url} style={{ width: 250, maxWidth: '100%' }} />
        }
        if (tipo.includes('video')) {
          return <video key={media.id} controls src={url} style={{ display: 'block', width: 260, maxWidth: '100%', borderRadius: 10 }} />
        }
        return (
          <a
            key={media.id}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: isEntrada ? '#3E5BFF' : (isIA ? '#ffffff' : '#0f2744'),
              textDecoration: 'none',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {tipo.includes('sticker') ? <PlayCircle size={16} /> : <FileText size={16} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {media.filename || 'Documento'}
            </span>
          </a>
        )
      })}
    </div>
  )
}

export function PainelChat({ conversa, mensagens, onTogglePainel, painelAberto, onTransferir, onResolver, mensagensEndRef }: PainelChatProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const grupos = useMemo(() => agruparMensagensPorData(mensagens), [mensagens])
  const titulo = formatHeaderTitle(conversa)
  const telefone = formatPhoneLabel(conversa.contato.numeroEvo || conversa.contato.telefone || conversa.remoteJid)
  const avatarSrc = conversa.isGroup ? conversa.groupAvatarUrl : conversa.contato.avatarUrl
  const avatarFallback = getAvatarFallback(titulo)
  const canalLabel = getCanalBadgeLabel(conversa.canalTipo)
  const canalDetalhe = [conversa.canalNome, conversa.canalNumero].filter(Boolean).join(' · ')
  const statusTone = getStatusTone(conversa.status)
  const patternOverlayStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    backgroundImage: `url(${CHAT_PATTERN_URL})`,
    backgroundRepeat: 'repeat',
    backgroundPosition: 'center top',
    backgroundSize: '440px auto',
    opacity: 0.065,
    mixBlendMode: 'multiply',
    filter: 'saturate(0.8)',
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
      background: 'rgba(255, 255, 255, 0.72)',
      backdropFilter: 'blur(12px)',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px',
        borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 250, 252, 0.92) 100%)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
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
          }}>
            {avatarSrc ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarSrc} alt={titulo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </>
            ) : avatarFallback}
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
                  background: 'rgba(15, 23, 42, 0.05)',
                  color: 'var(--ws-text-2)',
                  border: '1px solid rgba(15, 23, 42, 0.10)',
                }}>
                  Grupo
                </span>
              )}
            </div>

            <div style={{ fontSize: 11.5, color: 'var(--ws-text-3)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}>
                {telefone}
              </span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(100, 116, 139, 0.45)' }} />
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
                  background: 'rgba(15, 23, 42, 0.04)',
                  color: 'var(--ws-text-2)',
                  border: '1px solid rgba(15, 23, 42, 0.08)',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {canalDetalhe}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button
            type="button"
            onClick={onTogglePainel}
            style={{
              minHeight: 32,
              padding: '0 12px',
              borderRadius: 999,
              background: painelAberto
                ? 'rgba(62, 91, 255, 0.10)'
                : 'rgba(255, 255, 255, 0.90)',
              border: painelAberto
                ? '1px solid rgba(62, 91, 255, 0.18)'
                : '1px solid rgba(15, 23, 42, 0.08)',
              color: painelAberto ? 'var(--ws-blue)' : 'var(--ws-text-2)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              boxShadow: painelAberto
                ? '0 4px 12px rgba(62, 91, 255, 0.10)'
                : '0 1px 2px rgba(15, 23, 42, 0.05)',
              whiteSpace: 'nowrap',
            }}
            title={painelAberto ? 'Fechar painel do contato' : 'Abrir painel do contato'}
            aria-label={painelAberto ? 'Fechar painel do contato' : 'Abrir painel do contato'}
            aria-expanded={painelAberto}
          >
            <User size={14} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              {painelAberto ? 'Fechar contato' : 'Abrir contato'}
            </span>
            {painelAberto ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
          <button
            type="button"
            onClick={onTransferir}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.90)',
              border: '1px solid rgba(15, 23, 42, 0.08)',
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
              padding: '8px 12px',
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
      <div style={{
        position: 'relative',
        minHeight: 0,
        overflow: 'hidden',
        background: 'linear-gradient(180deg, rgba(248, 250, 252, 0.98) 0%, rgba(244, 247, 255, 0.98) 100%)',
      }}>
        <div aria-hidden style={patternOverlayStyle} />
        <div style={{
          position: 'relative',
          zIndex: 1,
          minHeight: 0,
          height: '100%',
          overflowY: 'scroll',
          scrollbarGutter: 'stable',
          WebkitOverflowScrolling: 'touch',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          background: 'linear-gradient(to bottom, transparent, rgba(62,91,255,0.02))',
          scrollbarWidth: 'thin',
        }}>
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
                  border: '1px solid rgba(15, 23, 42, 0.08)',
                  backdropFilter: 'blur(8px)',
                }}>
                  {grupo.data}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {grupo.mensagens.map(msg => {
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
                        : 'rgba(255, 255, 255, 0.96)',
                      color: '#0f172a',
                      border: `1px solid ${msg.isMentioned ? 'rgba(201, 168, 76, 0.28)' : 'rgba(15, 23, 42, 0.08)'}`,
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
                        background: 'linear-gradient(180deg, #E9EEFD 0%, #DDE3FA 100%)',
                        color: '#10203a',
                        border: '1px solid rgba(62, 91, 255, 0.12)',
                        boxShadow: '0 10px 22px rgba(62, 91, 255, 0.08)',
                      }
                const footerColor = isEntrada
                  ? '#64748b'
                  : isIA
                    ? 'rgba(255,255,255,0.72)'
                    : 'rgba(16, 32, 58, 0.70)'
                return (
                  <div
                    key={msg.id}
                    style={{
                      alignSelf: isEntrada ? 'flex-start' : 'flex-end',
                      maxWidth: '70%',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      marginBottom: 12,
                    }}
                  >
                    <div style={{
                      fontSize: 9,
                      color: 'var(--ws-text-3)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      justifyContent: isEntrada ? 'flex-start' : 'flex-end',
                    }}>
                      {isEntrada
                        ? (conversa.isGroup ? participantLabel : (msg.remetenteNome || 'Contato'))
                        : (isIA ? 'IA Agente' : 'Atendente')}
                    </div>
                    <div style={{
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
                      {msg.isMentioned && (
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#c9a84c', marginBottom: 4 }}>
                          @mention
                        </div>
                      )}
                      {renderMidia(msg, isEntrada, isIA, setLightboxUrl)}
                      {(() => {
                        const temMidia = (msg.midias?.length ?? 0) > 0 || !!msg.mediaUrl
                        const isPlaceholder = msg.conteudo?.trim() === '[mídia]'
                        if (!msg.conteudo || (temMidia && isPlaceholder)) return null
                        return <div style={{ whiteSpace: 'pre-wrap' }}>{msg.conteudo}</div>
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
                    </div>
                  </div>
                )
              })}
              </div>
            </div>
          ))}
          <div ref={mensagensEndRef} />
        </div>
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
    </div>
  )
}
