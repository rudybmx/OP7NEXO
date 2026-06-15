'use client'

import { Calendar, Flag, MessageCircle, GripVertical, Plus } from 'lucide-react'
import { useState, useRef } from 'react'
import type { KanbanBoard, KanbanCard, KanbanColuna, Prioridade } from '@/types/kanban'

interface ListaViewProps {
  board: KanbanBoard
  onCardClick: (card: KanbanCard) => void
  onMoverCard: (cardId: string, faseId: string, ordem?: number) => void
  onCriarCard: (faseId: string, titulo: string) => void
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
  return `hsl(${Math.abs(hash) % 360}, 55%, 45%)`
}

function isVencido(iso?: string) {
  if (!iso) return false
  return new Date(iso + 'T23:59:59') < new Date()
}

function formatarData(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export function ListaView({ board, onCardClick, onMoverCard, onCriarCard }: ListaViewProps) {
  const reordenavel = true
  const [dragCardId, setDragCardId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [novoCardAtivo, setNovoCardAtivo] = useState(false)
  const [novoTitulo, setNovoTitulo] = useState('')

  // Todos os cards em ordem global (por status ordem → ordem dentro do status)
  const colunasOrdenadas = [...board.colunas].sort((a, b) => a.ordem - b.ordem)
  const todosCards = colunasOrdenadas.flatMap(col =>
    board.cards.filter(c => c.status === col.id).sort((a, b) => a.ordem - b.ordem)
  )

  function getColuna(colunaId: string): KanbanColuna | undefined {
    return board.colunas.find(c => c.id === colunaId)
  }

  function handleDragStart(cardId: string) {
    if (!reordenavel) return
    setDragCardId(cardId)
  }

  function handleDragOver(e: React.DragEvent, cardId: string) {
    e.preventDefault()
    if (!reordenavel || cardId === dragCardId) return
    setDragOverId(cardId)
  }

  function handleDrop(targetId: string) {
    if (!dragCardId || dragCardId === targetId) {
      setDragCardId(null); setDragOverId(null); return
    }
    const alvo = board.cards.find(c => c.id === targetId)
    if (alvo) onMoverCard(dragCardId, alvo.status, alvo.ordem)
    setDragCardId(null); setDragOverId(null)
  }

  function adicionarCard() {
    if (!novoTitulo.trim()) { setNovoCardAtivo(false); return }
    const coluna = colunasOrdenadas[0]
    if (!coluna) return
    onCriarCard(coluna.id, novoTitulo.trim())
    setNovoTitulo(''); setNovoCardAtivo(false)
  }

  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 12,
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Shine line */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }} />

      {/* Cabeçalho da tabela */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: reordenavel ? '28px 1fr 140px 100px 120px 50px' : '1fr 140px 100px 120px 50px',
        padding: '8px 16px',
        background: 'rgba(62,91,255,0.03)',
        borderBottom: '1px solid var(--ws-divider)',
      }}>
        {reordenavel && <span />}
        {['Nome', 'Status', 'Responsável', 'Prioridade', 'Vencimento', ''].map(h => (
          <span key={h} style={{ fontSize: 9, fontWeight: 600, color: '#8892b0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
        ))}
      </div>

      {/* Linhas */}
      {todosCards.map((card, i) => {
        const coluna = getColuna(card.status)
        const prio = card.prioridade ? PRIORIDADE_CONFIG[card.prioridade] : null
        const vencido = isVencido(card.dataVencimento)
        const isDragging = dragCardId === card.id
        const isOver = dragOverId === card.id

        return (
          <div
            key={card.id}
            draggable={reordenavel}
            onDragStart={() => handleDragStart(card.id)}
            onDragOver={e => handleDragOver(e, card.id)}
            onDrop={() => handleDrop(card.id)}
            onDragEnd={() => { setDragCardId(null); setDragOverId(null) }}
            style={{
              display: 'grid',
              gridTemplateColumns: reordenavel ? '28px 1fr 140px 100px 120px 50px' : '1fr 140px 100px 120px 50px',
              padding: '0 16px',
              borderBottom: i < todosCards.length - 1 ? '1px solid var(--ws-divider)' : 'none',
              alignItems: 'center',
              transition: 'background 100ms',
              opacity: isDragging ? 0.4 : 1,
              background: isOver ? 'rgba(62,91,255,0.06)' : 'transparent',
              borderTop: isOver ? '2px solid rgba(62,91,255,0.40)' : undefined,
            }}
            onMouseEnter={e => { if (!isDragging) (e.currentTarget as HTMLDivElement).style.background = 'rgba(62,91,255,0.02)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isOver ? 'rgba(62,91,255,0.06)' : 'transparent' }}
          >
            {/* Handle de drag */}
            {reordenavel && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', opacity: 0.3, padding: '12px 0' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.3'}
              >
                <GripVertical size={13} style={{ color: '#8892b0' }} />
              </div>
            )}

            {/* Nome */}
            <div
              onClick={() => onCardClick(card)}
              style={{ padding: '11px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <div style={{ width: 14, height: 14, border: '1.5px solid rgba(14,20,42,0.20)', borderRadius: 3, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 400, color: '#0E142A' }}>{card.titulo}</div>
                {(card.tags ?? []).length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                    {card.tags!.slice(0, 2).map(tag => (
                      <span key={tag} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 9999, background: 'rgba(62,91,255,0.08)', color: '#3E5BFF', border: '1px solid rgba(62,91,255,0.15)', fontWeight: 600 }}>{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Status */}
            <div onClick={() => onCardClick(card)} style={{ cursor: 'pointer', padding: '11px 0' }}>
              {coluna ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: coluna.cor, background: coluna.cor + '15', border: `1px solid ${coluna.cor}30`, borderRadius: 9999, padding: '2px 8px', fontWeight: 500 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: coluna.cor }} />
                  {coluna.nome}
                </span>
              ) : <span style={{ fontSize: 11, color: '#8892b0' }}>—</span>}
            </div>

            {/* Responsável */}
            <div onClick={() => onCardClick(card)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              {card.responsavel ? (
                <>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: hashColor(card.responsavel), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: 'white', fontWeight: 700 }}>
                    {card.responsavelInitials}
                  </div>
                  <span style={{ fontSize: 11, color: '#4a5580', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.responsavel.split(' ')[0]}</span>
                </>
              ) : <span style={{ fontSize: 11, color: '#8892b0' }}>—</span>}
            </div>

            {/* Prioridade */}
            <div onClick={() => onCardClick(card)} style={{ cursor: 'pointer' }}>
              {prio ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 9999, background: prio.bg, border: `1px solid ${prio.border}`, color: prio.cor }}>
                  <Flag size={9} /> {prio.label}
                </span>
              ) : <span style={{ fontSize: 11, color: '#8892b0' }}>—</span>}
            </div>

            {/* Vencimento */}
            <div onClick={() => onCardClick(card)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              {card.dataVencimento ? (
                <>
                  <Calendar size={11} style={{ color: vencido ? '#FF5C8D' : '#8892b0' }} />
                  <span style={{ fontSize: 11, color: vencido ? '#FF5C8D' : '#4a5580', fontWeight: vencido ? 600 : 400 }}>
                    {formatarData(card.dataVencimento) /* FIXME: it should be formatarData(card.dataVencimento) */}
                  </span>
                </>
              ) : <span style={{ fontSize: 11, color: '#8892b0' }}>—</span>}
            </div>

            {/* Comentários */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
              {(card.comentarios ?? []).length > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: '#8892b0' }}>
                  <MessageCircle size={10} />
                  {card.comentarios!.length}
                </span>
              )}
            </div>
          </div>
        )
      })}

      {/* Novo item inline */}
      {novoCardAtivo ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderTop: '1px solid var(--ws-divider)' }}>
          {reordenavel && <div style={{ width: 28 }} />}
          <div style={{ width: 14, height: 14, border: '1.5px solid rgba(14,20,42,0.20)', borderRadius: 3, flexShrink: 0 }} />
          <input
            autoFocus
            type="text"
            value={novoTitulo}
            onChange={e => setNovoTitulo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') adicionarCard(); if (e.key === 'Escape') { setNovoCardAtivo(false); setNovoTitulo('') } }}
            onBlur={adicionarCard}
            placeholder="Nome do card..."
            style={{ flex: 1, fontSize: 13, color: '#0E142A', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'inherit' }}
          />
        </div>
      ) : (
        <button
          onClick={() => setNovoCardAtivo(true)}
          style={{
            width: '100%', textAlign: 'left', padding: '9px 16px',
            background: 'none', border: 'none', borderTop: '1px solid var(--ws-divider)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 12, color: '#8892b0', transition: 'all 150ms', fontFamily: 'inherit',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(62,91,255,0.02)'; e.currentTarget.style.color = '#3E5BFF' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#8892b0' }}
        >
          {reordenavel && <div style={{ width: 28 }} />}
          <Plus size={13} /> Novo item
        </button>
      )}
    </div>
  )
}
