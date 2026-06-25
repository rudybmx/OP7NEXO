'use client'
import { useState } from 'react'

import { Calendar, MessageCircle, Flag, GripVertical } from 'lucide-react'
import type { KanbanCard, Prioridade } from '@/types/kanban'

interface KanbanCardProps {
  card: KanbanCard
  reordenavel?: boolean
  onClick: () => void
}

const PRIORIDADE_CONFIG: Record<Prioridade, { label: string; cor: string; bg: string; border: string }> = {
  baixa:   { label: 'Baixa',   cor: '#8892b0', bg: 'rgba(136,146,176,0.10)', border: 'rgba(136,146,176,0.20)' },
  media:   { label: 'Média',   cor: '#EF9F27', bg: 'rgba(239,159,39,0.10)',  border: 'rgba(239,159,39,0.20)' },
  alta:    { label: 'Alta',    cor: '#FF5C8D', bg: 'rgba(255,92,141,0.10)',  border: 'rgba(255,92,141,0.20)' },
  urgente: { label: 'Urgente', cor: '#FF3B3B', bg: 'rgba(255,59,59,0.10)',   border: 'rgba(255,59,59,0.20)' },
}

function hashColor(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 45%)`
}

function isVencido(iso?: string) {
  if (!iso) return false
  return new Date(iso + 'T23:59:59') < new Date()
}

function formatarDataCurta(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export function KanbanCardComp({ card, reordenavel, onClick }: KanbanCardProps) {
  const [hovered, setHovered] = useState(false)
  const vencido = isVencido(card.dataVencimento)
  const prio = card.prioridade ? PRIORIDADE_CONFIG[card.prioridade] : null

  return (
    <div
      onClick={onClick}
      draggable
      style={{
        background: 'var(--ws-surface)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 10,
        padding: '10px 12px',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(14,20,42,0.08), 0 1px 3px rgba(14,20,42,0.05)',
        transition: 'all 150ms ease',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        setHovered(true)
        e.currentTarget.style.transform = 'translateY(-1px)'
        e.currentTarget.style.boxShadow = '0 6px 20px rgba(14,20,42,0.12), 0 2px 6px rgba(14,20,42,0.08)'
        e.currentTarget.style.borderColor = 'var(--ws-glass-border)'
      }}
      onMouseLeave={e => {
        setHovered(false)
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(14,20,42,0.08), 0 1px 3px rgba(14,20,42,0.05)'
        e.currentTarget.style.borderColor = 'var(--ws-glass-border)'
      }}
    >
      {reordenavel && (
        <div
          className="drag-handle"
          style={{
            position: 'absolute', top: 8, right: 8,
            opacity: hovered && reordenavel ? 0.6 : 0, transition: 'opacity 150ms',
            color: 'var(--ws-text-2)', cursor: 'grab',
            display: 'flex', alignItems: 'center',
          }}
        >
          <GripVertical size={12} />
        </div>
      )}
      {/* Prioridade urgente — barra topo */}
      {card.prioridade === 'urgente' && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #FF3B3B, #FF5C8D)' }} />
      )}

      {/* Tags */}
      {(card.tags ?? []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {card.tags!.slice(0, 3).map(tag => (
            <span key={tag} style={{
              fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 9999,
              background: 'rgba(0,110,255,0.08)', border: '1px solid rgba(0,110,255,0.15)',
              color: '#006EFF', textTransform: 'uppercase', letterSpacing: '0.04em',
            }}>{tag}</span>
          ))}
        </div>
      )}

      {/* Título */}
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)', lineHeight: 1.4, marginBottom: 8 }}>
        {card.titulo}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Prioridade */}
          {prio && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 9999,
              background: prio.bg, border: `1px solid ${prio.border}`, color: prio.cor,
            }}>
              <Flag size={9} /> {prio.label}
            </span>
          )}

          {/* Data */}
          {card.dataVencimento && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 10, color: vencido ? '#FF5C8D' : 'var(--ws-text-2)', fontWeight: vencido ? 600 : 400,
            }}>
              <Calendar size={10} />
              {formatarDataCurta(card.dataVencimento)}
            </span>
          )}

          {/* Comentários */}
          {(card.comentarios ?? []).length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--ws-text-2)' }}>
              <MessageCircle size={10} />
              {card.comentarios!.length}
            </span>
          )}
        </div>

        {/* Avatar responsável */}
        {card.responsavel && (
          <div
            title={card.responsavel}
            style={{
              width: 22, height: 22, borderRadius: '50%',
              background: hashColor(card.responsavel),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, color: 'white', fontWeight: 700, flexShrink: 0,
            }}
          >
            {card.responsavelInitials}
          </div>
        )}
      </div>
    </div>
  )
}
