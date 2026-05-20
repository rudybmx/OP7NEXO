'use client'

import { useState } from 'react'
import { Phone, User, Users, MessageSquare } from 'lucide-react'
import type { ConversaApi } from '@/hooks/use-conversas'

interface PainelContatoProps {
  conversa: ConversaApi
}

function InfoRow({ label, valor, icon }: { label: string; valor?: string | null; icon?: React.ReactNode }) {
  if (!valor) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{
        width: 24,
        height: 24,
        borderRadius: 8,
        background: 'rgba(62,91,255,0.08)',
        color: 'var(--ws-blue)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon || <User size={12} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--ws-text-1)', wordBreak: 'break-word' }}>{valor}</div>
      </div>
    </div>
  )
}

export function PainelContato({ conversa }: PainelContatoProps) {
  const [expandido, setExpandido] = useState(true)

  return (
    <aside style={{
      width: '100%',
      height: '100%',
      minWidth: 0,
      minHeight: 0,
      overflowY: 'auto',
      overflowX: 'hidden',
      scrollbarWidth: 'thin',
      padding: 16,
      boxSizing: 'border-box',
    }}>
      {/* Header do contato */}
      <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--ws-divider)', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 700,
            color: 'white',
            flexShrink: 0,
          }}>
            {conversa.contato.nome.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ws-text-1)', lineHeight: 1.2 }}>
              {conversa.contato.nome}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 3 }}>
              {conversa.contato.telefone}
            </div>
          </div>
        </div>

        {/* Tags de status */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          <span style={{
            fontSize: 10,
            padding: '2px 8px',
            borderRadius: 999,
            background: 'rgba(37,211,102,0.12)',
            color: '#25D366',
            border: '1px solid rgba(37,211,102,0.18)',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}>WhatsApp</span>
          <span style={{
            fontSize: 10,
            padding: '2px 8px',
            borderRadius: 999,
            background: conversa.status === 'em_atendimento' ? 'rgba(62,91,255,0.10)' : 'rgba(255,255,255,0.05)',
            color: conversa.status === 'em_atendimento' ? 'var(--ws-blue)' : 'var(--ws-text-3)',
            border: '1px solid var(--ws-glass-border)',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}>{conversa.status.replace('_', ' ')}</span>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <InfoRow label="Telefone" valor={conversa.contato.numeroEvo || conversa.contato.telefone} icon={<Phone size={12} />} />
          <InfoRow label="Remote JID" valor={conversa.contato.remoteJid} icon={<MessageSquare size={12} />} />
        </div>
      </div>

      {/* Tags */}
      <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--ws-divider)', marginBottom: 16 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Tags</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {conversa.tags.length ? conversa.tags.map(tag => (
            <span key={tag} style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--ws-text-2)',
              border: '1px solid var(--ws-glass-border)',
            }}>{tag}</span>
          )) : (
            <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>Sem tags</span>
          )}
        </div>
      </div>

      {/* Equipe */}
      {conversa.equipe && (
        <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--ws-divider)', marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Equipe</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={14} color="var(--ws-blue)" />
            <span style={{ fontSize: 12, color: 'var(--ws-text-1)' }}>{conversa.equipe.nome}</span>
            <span style={{ fontSize: 10, color: 'var(--ws-text-3)' }}>({conversa.equipe.membrosCount} membros)</span>
          </div>
        </div>
      )}

      {/* Campanha */}
      {conversa.campanha && (
        <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--ws-divider)', marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Campanha</div>
          <span style={{ fontSize: 12, color: 'var(--ws-text-1)' }}>{conversa.campanha}</span>
        </div>
      )}

      {/* Análise IA */}
      <div>
        <div
          onClick={() => setExpandido(!expandido)}
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--ws-text-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 10,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>🤖 Análise IA</span>
          <span style={{ fontSize: 12 }}>{expandido ? '−' : '+'}</span>
        </div>
        {expandido && (
          <div style={{
            background: 'rgba(62,91,255,0.08)',
            border: '1px solid rgba(62,91,255,0.15)',
            borderRadius: 12,
            padding: 12,
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#3E5BFF', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Resumo</div>
            <p style={{ fontSize: 11, color: 'var(--ws-text-2)', lineHeight: 1.5, margin: 0 }}>
              Lead interagindo via WhatsApp. Aguardando próxima ação do atendente.
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
