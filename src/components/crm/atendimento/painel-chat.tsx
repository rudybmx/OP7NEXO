'use client'

import { useMemo } from 'react'
import { ArrowRightLeft, Check, User } from 'lucide-react'
import type { ConversaApi, MensagemApi } from '@/hooks/use-conversas'
import { CardRastreamento } from './card-rastreamento'

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

export function PainelChat({ conversa, mensagens, onTogglePainel, onTransferir, onResolver, mensagensEndRef }: PainelChatProps) {
  const grupos = useMemo(() => agruparMensagensPorData(mensagens), [mensagens])

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minWidth: 0, minHeight: 0, height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--ws-divider)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: (conversa.isGroup ? conversa.groupAvatarUrl : conversa.contato.avatarUrl) ? 'none' : 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: 'white',
            overflow: 'hidden',
          }}>
            {(() => {
              const avatarSrc = conversa.isGroup ? conversa.groupAvatarUrl : conversa.contato.avatarUrl
              const nome = conversa.isGroup ? (conversa.groupName || conversa.contato.nome) : conversa.contato.nome
              return avatarSrc ? (
                <img src={avatarSrc} alt={nome} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                nome.slice(0, 2).toUpperCase()
              )
            })()}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ws-text-1)' }}>
              {conversa.isGroup ? `👥 ${conversa.groupName || conversa.contato.nome}` : conversa.contato.nome}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>
              {conversa.status.replace('_', ' ')}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onTogglePainel}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ws-text-3)',
              cursor: 'pointer',
              padding: 6,
              display: 'flex',
              alignItems: 'center',
              fontSize: 13,
            }}
            title="Painel do contato"
          >
            <User size={14} />
          </button>
          <button
            onClick={onTransferir}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ws-text-3)',
              cursor: 'pointer',
              padding: 6,
              display: 'flex',
              alignItems: 'center',
              fontSize: 13,
            }} title="Transferir">
            <ArrowRightLeft size={14} />
          </button>
          <button
            onClick={onResolver}
            style={{
              background: 'none',
              border: 'none',
              color: '#1D9E75',
              cursor: 'pointer',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
            }} title="Resolver">
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
              const isIA = msg.remetenteTipo === 'ia'
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
                    {isIA && '🤖'}
                    {isEntrada
                      ? (msg.participantName || msg.remetenteNome || 'Contato')
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
                    {msg.conteudo}
                    {msg.mediaUrl && (
                      <div style={{ marginTop: 8 }}>
                        <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" style={{ color: isEntrada ? '#3E5BFF' : '#ffffff', fontSize: 12 }}>
                          📎 Ver mídia
                        </a>
                      </div>
                    )}
                    <div style={{
                      fontSize: 9,
                      color: isEntrada ? '#64748b' : 'rgba(255,255,255,0.7)',
                      textAlign: 'right',
                      marginTop: 4,
                    }}>
                      {msg.recebidaEm ? new Date(msg.recebidaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </div>
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
