'use client'

import { Search, RefreshCw, MessageCircle, AtSign, Paperclip } from 'lucide-react'
import type { ConversaApi } from '@/hooks/use-conversas'
import type { WhatsappCanal } from '@/hooks/use-whatsapp-canais'

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

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', height: '100%', width: '100%', minWidth: 0, minHeight: 0, boxSizing: 'border-box', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: 16, borderBottom: '1px solid var(--ws-divider)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ws-text-1)', margin: 0 }}>Conversas</h2>
            {aoVivo && (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10,
                color: '#1D9E75',
                background: 'rgba(29,158,117,0.12)',
                padding: '2px 8px',
                borderRadius: 99,
                fontWeight: 600,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {onIniciarConversa && (
              <button
                onClick={onIniciarConversa}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#3E5BFF',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color 0.2s',
                }}
                title="Iniciar nova conversa"
              >
                <MessageCircle size={16} />
              </button>
            )}
            <button
              onClick={onRefetch}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ws-text-3)',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
              }}
              title="Atualizar"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Busca */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ws-text-3)' }} />
            <input
              value={busca}
              onChange={e => onBuscaChange(e.target.value)}
              placeholder="Buscar..."
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '8px 12px 8px 34px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--ws-glass-border)',
              color: 'var(--ws-text-1)',
              fontSize: 13,
              outline: 'none',
            }}
          />
        </div>

        {/* Canal */}
        {onCanalChange && canais.length > 0 && (
          <select
            value={canalSelecionadoId}
            onChange={e => onCanalChange(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              marginBottom: 12,
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--ws-glass-border)',
              color: 'var(--ws-text-1)',
              fontSize: 12,
              outline: 'none',
            }}
          >
            <option value="todos">Todos os números</option>
            {canais.map(canal => (
              <option key={canal.id} value={canal.id}>
                {canal.nome}{canal.numero_telefone ? ` · ${canal.numero_telefone}` : ''}
              </option>
            ))}
          </select>
        )}

        {/* Abas */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {filtros.map(f => (
            <button
              key={f.id}
              onClick={() => onFiltroChange(f.id)}
              style={{
                padding: '4px 10px',
                borderRadius: 99,
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
                border: '1px solid var(--ws-glass-border)',
                background: filtroAtivo === f.id ? 'var(--ws-blue)' : 'rgba(255,255,255,0.05)',
                color: filtroAtivo === f.id ? 'white' : 'var(--ws-text-3)',
                transition: 'all 0.2s',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div style={{ minHeight: 0, overflowY: 'scroll', scrollbarGutter: 'stable', scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}>
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
        {conversas.map(conversa => (
          <div
            key={conversa.id}
            onClick={() => onSelectConversa(conversa.id)}
            style={{
              padding: '12px 16px',
              cursor: 'pointer',
              background: conversaAtivaId === conversa.id ? 'rgba(62,91,255,0.08)' : 'transparent',
              borderLeft: conversaAtivaId === conversa.id ? '3px solid var(--ws-blue)' : '3px solid transparent',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
              {/* Avatar */}
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
                flexShrink: 0,
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

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conversa.isGroup ? `Grupo · ${conversa.groupName || conversa.contato.nome}` : conversa.contato.nome}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--ws-text-3)', flexShrink: 0 }}>
                    {conversa.ultimaMensagemAt ? new Date(conversa.ultimaMensagemAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <div style={{
                  fontSize: 12,
                  color: 'var(--ws-text-3)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontWeight: conversa.naoLidas > 0 ? 600 : 400,
                }}>
                  {conversa.badges?.mentioned && <AtSign size={11} style={{ display: 'inline', marginRight: 4, color: '#c9a84c', verticalAlign: '-1px' }} />}
                  {conversa.badges?.hasMedia && <Paperclip size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />}
                  {conversa.ultimaMensagem}
                </div>
              </div>

              {conversa.naoLidas > 0 && (
                <div style={{
                  background: 'var(--ws-blue)',
                  color: 'white',
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 99,
                  height: 'fit-content',
                  flexShrink: 0,
                }}>
                  {conversa.naoLidas}
                </div>
              )}
            </div>

            {/* Tags */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginLeft: 48 }}>
              <span style={{
                fontSize: 9,
                padding: '1px 6px',
                borderRadius: 4,
                background: 'rgba(37,211,102,0.12)',
                color: '#25D366',
                border: '1px solid rgba(37,211,102,0.18)',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}>
                WhatsApp
              </span>
              {conversa.canalNome && (
                <span style={{
                  fontSize: 9,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'rgba(62,91,255,0.10)',
                  color: 'var(--ws-blue)',
                  border: '1px solid rgba(62,91,255,0.18)',
                  fontWeight: 700,
                }}>
                  {conversa.canalNome}
                </span>
              )}
              {conversa.badges?.overdueFollowup && (
                <span style={{
                  fontSize: 9,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: 'rgba(163,45,45,0.10)',
                  color: '#a32d2d',
                  border: '1px solid rgba(163,45,45,0.20)',
                  fontWeight: 700,
                }}>
                  Follow-up vencido
                </span>
              )}
              <span style={{
                fontSize: 9,
                padding: '1px 6px',
                borderRadius: 4,
                background: conversa.status === 'em_atendimento' ? 'rgba(62,91,255,0.10)' : 'rgba(255,255,255,0.05)',
                color: conversa.status === 'em_atendimento' ? 'var(--ws-blue)' : 'var(--ws-text-3)',
                border: '1px solid var(--ws-glass-border)',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}>
                {conversa.status.replace('_', ' ')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
