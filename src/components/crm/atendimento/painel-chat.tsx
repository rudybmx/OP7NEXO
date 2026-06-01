'use client'

import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { ArrowRightLeft, Check, CheckCheck, Clock, FileText, PlayCircle, AlertCircle, User } from 'lucide-react'
import type { ConversaApi, MensagemApi } from '@/hooks/use-conversas'
import { CardRastreamento } from './card-rastreamento'
import { getCanalBadgeLabel } from '@/lib/whatsapp-canal'

const AI_HANDOFF_ENABLED = false

interface PainelChatProps {
  conversa: ConversaApi
  mensagens: MensagemApi[]
  onTogglePainel: () => void
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

function statusIcon(status?: string | null) {
  if (status === 'failed') return <AlertCircle size={12} color="#ffb4b4" />
  if (status === 'read' || status === 'played') return <CheckCheck size={13} color="#00F5FF" />
  if (status === 'delivered') return <CheckCheck size={13} />
  if (status === 'sent' || status === 'enviada') return <Check size={12} />
  return <Clock size={12} />
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

function renderMidia(msg: MensagemApi, isEntrada: boolean) {
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
            <div key={media.id} style={{ fontSize: 12, color: isEntrada ? '#64748b' : 'rgba(255,255,255,0.78)' }}>
              Mídia em processamento
            </div>
          )
        }
        if (tipo.includes('image') || tipo.includes('imagem')) {
          return (
            <a key={media.id} href={url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={media.caption || media.filename || 'Imagem da conversa'}
                style={{ display: 'block', maxWidth: 260, maxHeight: 260, borderRadius: 10, objectFit: 'cover' }}
              />
            </a>
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
              color: isEntrada ? '#3E5BFF' : '#ffffff',
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

export function PainelChat({ conversa, mensagens, onTogglePainel, onTransferir, onResolver, mensagensEndRef }: PainelChatProps) {
  const grupos = useMemo(() => agruparMensagensPorData(mensagens), [mensagens])
  const titulo = formatHeaderTitle(conversa)
  const telefone = formatPhoneLabel(conversa.contato.numeroEvo || conversa.contato.telefone || conversa.remoteJid)
  const avatarSrc = conversa.isGroup ? conversa.groupAvatarUrl : conversa.contato.avatarUrl
  const avatarFallback = getAvatarFallback(titulo)
  const canalLabel = getCanalBadgeLabel(conversa.canalTipo)
  const canalDetalhe = [conversa.canalNome, conversa.canalNumero].filter(Boolean).join(' · ')
  const statusTone = getStatusTone(conversa.status)

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
            title="Painel do contato"
            aria-label="Painel do contato"
          >
            <User size={14} />
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
        minHeight: 0,
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
                background: 'rgba(255,255,255,0.05)',
                padding: '4px 12px',
                borderRadius: 99,
                border: '1px solid var(--ws-glass-border)',
              }}>
                {grupo.data}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {grupo.mensagens.map(msg => {
              const isEntrada = msg.direcao === 'entrada'
              const isIA = AI_HANDOFF_ENABLED && msg.remetenteTipo === 'ia'
              const participantLabel = msg.participantName || msg.remetenteNome || 'Contato'
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
                    padding: '10px 14px',
                    borderRadius: isEntrada ? '0 12px 12px 12px' : '12px 0 12px 12px',
                    fontSize: 13,
                    lineHeight: 1.5,
                    background: isEntrada
                      ? (msg.isMentioned ? 'rgba(201,168,76,0.18)' : 'rgba(255,255,255,0.85)')
                      : (isIA ? 'linear-gradient(135deg, #0f2744, #1a3a6b)' : 'linear-gradient(135deg, #3E5BFF, #7A5AF8)'),
                    color: isEntrada ? '#0f2744' : '#ffffff',
                    border: isEntrada ? `1px solid ${msg.isMentioned ? '#c9a84c' : 'var(--ws-glass-border)'}` : 'none',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                    wordBreak: 'break-word',
                  }}>
                    {msg.isMentioned && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#c9a84c', marginBottom: 4 }}>
                        @mention
                      </div>
                    )}
                    {renderMidia(msg, isEntrada)}
                    {msg.conteudo}
                    <div style={{
                      fontSize: 9,
                      color: isEntrada ? '#64748b' : 'rgba(255,255,255,0.7)',
                      marginTop: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 4,
                    }}>
                      <span>{(msg.recebidaEm || msg.enviadaEm || msg.criadaEm) ? new Date(msg.recebidaEm || msg.enviadaEm || msg.criadaEm || '').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      {!isEntrada && statusIcon(msg.waStatus)}
                    </div>
                    {msg.failedReason && (
                      <div style={{ fontSize: 10, color: isEntrada ? '#a32d2d' : '#ffb4b4', marginTop: 4 }}>
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
  )
}
