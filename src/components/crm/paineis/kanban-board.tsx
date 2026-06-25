'use client'

import { useState } from 'react'
import { Plus, GripVertical } from 'lucide-react'
import type { KanbanBoard, KanbanCard, KanbanColuna } from '@/types/kanban'
import { KanbanCardComp } from './kanban-card'
import { ColunaMenu } from './coluna-menu'

interface KanbanBoardProps {
  board: KanbanBoard
  reordenavel: boolean
  onCardClick: (card: KanbanCard) => void
  onBoardChange: (board: KanbanBoard) => void
}

export function KanbanBoardComp({ board, reordenavel, onCardClick, onBoardChange }: KanbanBoardProps) {
  const [novoCardColuna, setNovoCardColuna] = useState<string | null>(null)
  const [novoCardTitulo, setNovoCardTitulo] = useState('')

  // Card drag
  const [dragCard, setDragCard] = useState<string | null>(null)
  const [dragOverCard, setDragOverCard] = useState<string | null>(null)
  const [dragOverColuna, setDragOverColuna] = useState<string | null>(null)

  // Coluna drag
  const [dragColuna, setDragColuna] = useState<string | null>(null)
  const [dragOverColunaTarget, setDragOverColunaTarget] = useState<string | null>(null)

  function adicionarCard(colunaId: string) {
    if (!novoCardTitulo.trim()) { setNovoCardColuna(null); return }
    const cardsNaColuna = board.cards.filter(c => c.status === colunaId)
    const novo: KanbanCard = {
      id: `card-${Date.now()}`, titulo: novoCardTitulo.trim(),
      status: colunaId, criadoEm: new Date().toISOString().slice(0, 10),
      atualizadoEm: new Date().toISOString().slice(0, 10), ordem: cardsNaColuna.length,
      comentarios: [], camposCustom: [], tags: [],
    }
    onBoardChange({ ...board, cards: [...board.cards, novo] })
    setNovoCardTitulo(''); setNovoCardColuna(null)
  }

  function adicionarColuna() {
    const nome = prompt('Nome da nova coluna:')
    if (!nome?.trim()) return
    const cores = ['#8892b0', '#006EFF', '#EF9F27', '#0047cc', '#0fa856', '#FF5C8D', '#00b8c8']
    const nova: KanbanColuna = {
      id: `col-${Date.now()}`, nome: nome.trim(),
      cor: cores[board.colunas.length % cores.length], ordem: board.colunas.length,
    }
    onBoardChange({ ...board, colunas: [...board.colunas, nova] })
  }

  function renomearColuna(colunaId: string, novoNome: string) {
    onBoardChange({ ...board, colunas: board.colunas.map(c => c.id === colunaId ? { ...c, nome: novoNome } : c) })
  }

  function excluirColuna(colunaId: string) {
    onBoardChange({
      ...board,
      colunas: board.colunas.filter(c => c.id !== colunaId),
      cards: board.cards.filter(c => c.status !== colunaId),
    })
  }

  // Card drag handlers
  function handleCardDragStart(cardId: string) { if (!reordenavel) return; setDragCard(cardId) }
  function handleCardDragOver(e: React.DragEvent, cardId: string) {
    e.preventDefault(); e.stopPropagation()
    if (!reordenavel || !dragCard || dragColuna) return
    setDragOverCard(cardId); setDragOverColuna(null)
  }
  function handleColunaDragOver(e: React.DragEvent, colunaId: string) {
    e.preventDefault()
    if (!reordenavel || !dragCard || dragColuna) return
    setDragOverColuna(colunaId)
  }
  function handleCardDrop(targetColunaId: string, targetCardId?: string) {
    if (!dragCard || !reordenavel || dragColuna) { setDragCard(null); setDragOverCard(null); setDragOverColuna(null); return }
    const cards = board.cards.map(c => {
      if (c.id !== dragCard) return c
      return { ...c, status: targetColunaId, atualizadoEm: new Date().toISOString().slice(0, 10) }
    })
    if (targetCardId) {
      // Reordenar dentro da coluna
      const colCards = cards.filter(c => c.status === targetColunaId).sort((a, b) => a.ordem - b.ordem)
      const fromIdx = colCards.findIndex(c => c.id === dragCard)
      const toIdx = colCards.findIndex(c => c.id === targetCardId)
      if (fromIdx !== -1 && toIdx !== -1) {
        const [moved] = colCards.splice(fromIdx, 1)
        colCards.splice(toIdx, 0, moved)
        colCards.forEach((c, i) => { const card = cards.find(x => x.id === c.id); if (card) card.ordem = i })
      }
    }
    onBoardChange({ ...board, cards })
    setDragCard(null); setDragOverCard(null); setDragOverColuna(null)
  }

  // Coluna drag handlers
  function handleColunaDragStart(colunaId: string) { if (!reordenavel) return; setDragColuna(colunaId) }
  function handleColunaDragOverTarget(e: React.DragEvent, colunaId: string) {
    e.preventDefault()
    if (!reordenavel || !dragColuna || colunaId === dragColuna) return
    setDragOverColunaTarget(colunaId)
  }
  function handleColunaDrop(targetId: string) {
    if (!dragColuna || !reordenavel || dragColuna === targetId) { setDragColuna(null); setDragOverColunaTarget(null); return }
    const cols = [...board.colunas].sort((a, b) => a.ordem - b.ordem)
    const fromIdx = cols.findIndex(c => c.id === dragColuna)
    const toIdx = cols.findIndex(c => c.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const [moved] = cols.splice(fromIdx, 1)
    cols.splice(toIdx, 0, moved)
    const novasColunas = cols.map((c, i) => ({ ...c, ordem: i }))
    onBoardChange({ ...board, colunas: novasColunas })
    setDragColuna(null); setDragOverColunaTarget(null)
  }

  const colunasOrdenadas = [...board.colunas].sort((a, b) => a.ordem - b.ordem)

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 16, minHeight: 400 }}>
      {colunasOrdenadas.map(coluna => {
        const cards = board.cards.filter(c => c.status === coluna.id).sort((a, b) => a.ordem - b.ordem)
        const isOver = dragOverColuna === coluna.id
        const isWipExceeded = coluna.limite && cards.length > coluna.limite
        const isColunaOver = dragOverColunaTarget === coluna.id
        const isColunaDragging = dragColuna === coluna.id

        return (
          <div
            key={coluna.id}
            draggable={reordenavel && !dragCard}
            onDragStart={() => handleColunaDragStart(coluna.id)}
            onDragOver={e => { handleColunaDragOverTarget(e, coluna.id); handleColunaDragOver(e, coluna.id) }}
            onDrop={() => { if (dragColuna) handleColunaDrop(coluna.id); else handleCardDrop(coluna.id) }}
            onDragEnd={() => { setDragColuna(null); setDragOverColunaTarget(null) }}
            style={{
              width: 264, flexShrink: 0,
              background: isOver ? 'rgba(0,110,255,0.04)' : 'var(--ws-surface-2)',
              border: `1px solid ${isColunaOver ? 'rgba(0,110,255,0.40)' : isOver ? 'rgba(0,110,255,0.25)' : 'var(--ws-glass-border)'}`,
              borderRadius: 12, padding: '12px 10px',
              transition: 'all 150ms ease',
              opacity: isColunaDragging ? 0.4 : 1,
              cursor: reordenavel && !dragCard ? 'grab' : 'default',
            }}
          >
            {/* Header da coluna */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingLeft: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {reordenavel && (
                  <GripVertical size={13} style={{ color: 'var(--ws-text-2)', cursor: 'grab', flexShrink: 0 }} />
                )}
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: coluna.cor, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-1)' }}>{coluna.nome}</span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 9999,
                  background: isWipExceeded ? 'rgba(255,92,141,0.12)' : 'var(--ws-surface-2)',
                  color: isWipExceeded ? 'var(--ws-text-1)' : 'var(--ws-text-2)',
                  border: isWipExceeded ? '1px solid rgba(255,92,141,0.20)' : 'none',
                }}>
                  {cards.length}{coluna.limite ? `/${coluna.limite}` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ColunaMenu
                  coluna={coluna}
                  onRenomear={nome => renomearColuna(coluna.id, nome)}
                  onNovoCard={() => setNovoCardColuna(coluna.id)}
                  onExcluir={() => excluirColuna(coluna.id)}
                />
                <button
                  onClick={() => setNovoCardColuna(coluna.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-2)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', transition: 'all 150ms' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--ws-glass-bg)'; e.currentTarget.style.color = 'var(--ws-text-1)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--ws-text-2)' }}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {isWipExceeded && (
              <div style={{ fontSize: 10, color: 'var(--ws-text-1)', background: 'rgba(255,92,141,0.06)', border: '1px solid rgba(255,92,141,0.15)', borderRadius: 6, padding: '4px 8px', marginBottom: 8, textAlign: 'center', fontWeight: 500 }}>
                Limite WIP excedido ({cards.length}/{coluna.limite})
              </div>
            )}

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 40 }}>
              {cards.map(card => (
                <div
                  key={card.id}
                  draggable={reordenavel}
                  onDragStart={e => { e.stopPropagation(); handleCardDragStart(card.id) }}
                  onDragOver={e => handleCardDragOver(e, card.id)}
                  onDrop={e => { e.stopPropagation(); handleCardDrop(coluna.id, card.id) }}
                  onDragEnd={() => { setDragCard(null); setDragOverCard(null) }}
                  style={{
                    opacity: dragCard === card.id ? 0.4 : 1,
                    borderTop: dragOverCard === card.id ? '2px solid rgba(0,110,255,0.40)' : undefined,
                    transition: 'opacity 150ms',
                  }}
                >
                  <KanbanCardComp
                    card={card}
                    reordenavel={reordenavel}
                    onClick={() => onCardClick(card)}
                  />
                </div>
              ))}

              {novoCardColuna === coluna.id ? (
                <div style={{ background: 'var(--ws-surface)', border: '1px solid rgba(0,110,255,0.30)', borderRadius: 10, padding: '8px 10px' }}>
                  <textarea
                    autoFocus value={novoCardTitulo}
                    onChange={e => setNovoCardTitulo(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); adicionarCard(coluna.id) } if (e.key === 'Escape') { setNovoCardColuna(null); setNovoCardTitulo('') } }}
                    placeholder="Título do card..." rows={2}
                    style={{ width: '100%', fontSize: 13, color: 'var(--ws-text-1)', background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button onClick={() => adicionarCard(coluna.id)} style={{ padding: '4px 12px', background: 'linear-gradient(135deg, #006EFF, #0047cc)', border: 'none', borderRadius: 6, fontSize: 11, color: 'white', cursor: 'pointer', fontWeight: 600 }}>Adicionar</button>
                    <button onClick={() => { setNovoCardColuna(null); setNovoCardTitulo('') }} style={{ padding: '4px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--ws-text-2)' }}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setNovoCardColuna(coluna.id)}
                  style={{ width: '100%', padding: '7px 10px', background: 'transparent', border: '1px dashed var(--ws-glass-border)', borderRadius: 8, fontSize: 12, color: 'var(--ws-text-2)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 150ms' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,110,255,0.04)'; e.currentTarget.style.color = '#006EFF'; e.currentTarget.style.borderColor = 'rgba(0,110,255,0.25)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ws-text-2)'; e.currentTarget.style.borderColor = 'var(--ws-glass-border)' }}
                >
                  <Plus size={13} /> Novo item
                </button>
              )}
            </div>
          </div>
        )
      })}

      <button
        onClick={adicionarColuna}
        style={{ width: 200, flexShrink: 0, padding: '10px 16px', background: 'var(--ws-surface-2)', border: '1px dashed var(--ws-glass-border)', borderRadius: 12, fontSize: 12, color: 'var(--ws-text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 150ms', whiteSpace: 'nowrap' as const }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,110,255,0.04)'; e.currentTarget.style.color = '#006EFF'; e.currentTarget.style.borderColor = 'rgba(0,110,255,0.25)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--ws-surface-2)'; e.currentTarget.style.color = 'var(--ws-text-2)'; e.currentTarget.style.borderColor = 'var(--ws-glass-border)' }}
      >
        <Plus size={14} /> Adicionar coluna
      </button>
    </div>
  )
}
