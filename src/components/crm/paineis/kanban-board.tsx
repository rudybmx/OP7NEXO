'use client'

import { useState } from 'react'
import { Plus, GripVertical } from 'lucide-react'
import type { KanbanBoard, KanbanCard } from '@/types/kanban'
import { KanbanCardComp } from './kanban-card'
import { ColunaMenu } from './coluna-menu'

interface KanbanBoardProps {
  board: KanbanBoard
  estruturaEditavel: boolean
  onCardClick: (card: KanbanCard) => void
  onMoverCard: (cardId: string, faseId: string, ordem?: number) => void
  onCriarCard: (faseId: string, titulo: string) => void
  onCriarFase: (nome: string) => void
  onRenomearFase: (faseId: string, nome: string) => void
  onExcluirFase: (faseId: string) => void
  onReordenarFases: (ids: string[]) => void
}

export function KanbanBoardComp({
  board, estruturaEditavel, onCardClick,
  onMoverCard, onCriarCard, onCriarFase, onRenomearFase, onExcluirFase, onReordenarFases,
}: KanbanBoardProps) {
  const [novoCardColuna, setNovoCardColuna] = useState<string | null>(null)
  const [novoCardTitulo, setNovoCardTitulo] = useState('')

  // Card drag (sempre habilitado)
  const [dragCard, setDragCard] = useState<string | null>(null)
  const [dragOverCard, setDragOverCard] = useState<string | null>(null)
  const [dragOverColuna, setDragOverColuna] = useState<string | null>(null)

  // Coluna (fase) drag — só quando estrutura editável
  const [dragColuna, setDragColuna] = useState<string | null>(null)
  const [dragOverColunaTarget, setDragOverColunaTarget] = useState<string | null>(null)

  function adicionarCard(colunaId: string) {
    if (!novoCardTitulo.trim()) { setNovoCardColuna(null); return }
    onCriarCard(colunaId, novoCardTitulo.trim())
    setNovoCardTitulo(''); setNovoCardColuna(null)
  }

  function adicionarColuna() {
    const nome = prompt('Nome da nova fase:')
    if (!nome?.trim()) return
    onCriarFase(nome.trim())
  }

  // Card drag handlers
  function handleCardDragStart(cardId: string) { setDragCard(cardId) }
  function handleCardDragOver(e: React.DragEvent, cardId: string) {
    e.preventDefault(); e.stopPropagation()
    if (!dragCard || dragColuna) return
    setDragOverCard(cardId); setDragOverColuna(null)
  }
  function handleColunaDragOver(e: React.DragEvent, colunaId: string) {
    e.preventDefault()
    if (!dragCard || dragColuna) return
    setDragOverColuna(colunaId)
  }
  function handleCardDrop(targetColunaId: string, targetCardId?: string) {
    if (!dragCard || dragColuna) { setDragCard(null); setDragOverCard(null); setDragOverColuna(null); return }
    const cardId = dragCard
    let ordem: number | undefined
    if (targetCardId) {
      const alvo = board.cards.find(c => c.id === targetCardId)
      ordem = alvo?.ordem
    } else {
      ordem = board.cards.filter(c => c.status === targetColunaId).length
    }
    onMoverCard(cardId, targetColunaId, ordem)
    setDragCard(null); setDragOverCard(null); setDragOverColuna(null)
  }

  // Coluna drag handlers
  function handleColunaDragStart(colunaId: string) { if (!estruturaEditavel) return; setDragColuna(colunaId) }
  function handleColunaDragOverTarget(e: React.DragEvent, colunaId: string) {
    e.preventDefault()
    if (!estruturaEditavel || !dragColuna || colunaId === dragColuna) return
    setDragOverColunaTarget(colunaId)
  }
  function handleColunaDrop(targetId: string) {
    if (!dragColuna || !estruturaEditavel || dragColuna === targetId) { setDragColuna(null); setDragOverColunaTarget(null); return }
    const cols = [...board.colunas].sort((a, b) => a.ordem - b.ordem)
    const fromIdx = cols.findIndex(c => c.id === dragColuna)
    const toIdx = cols.findIndex(c => c.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const [moved] = cols.splice(fromIdx, 1)
    cols.splice(toIdx, 0, moved)
    onReordenarFases(cols.map(c => c.id))
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
            draggable={estruturaEditavel && !dragCard}
            onDragStart={() => handleColunaDragStart(coluna.id)}
            onDragOver={e => { handleColunaDragOverTarget(e, coluna.id); handleColunaDragOver(e, coluna.id) }}
            onDrop={() => { if (dragColuna) handleColunaDrop(coluna.id); else handleCardDrop(coluna.id) }}
            onDragEnd={() => { setDragColuna(null); setDragOverColunaTarget(null) }}
            style={{
              width: 264, flexShrink: 0,
              background: isOver ? 'rgba(62,91,255,0.04)' : 'rgba(14,20,42,0.03)',
              border: `1px solid ${isColunaOver ? 'rgba(62,91,255,0.40)' : isOver ? 'rgba(62,91,255,0.25)' : 'rgba(14,20,42,0.06)'}`,
              borderRadius: 12, padding: '12px 10px',
              transition: 'all 150ms ease',
              opacity: isColunaDragging ? 0.4 : 1,
              cursor: estruturaEditavel && !dragCard ? 'grab' : 'default',
            }}
          >
            {/* Header da coluna */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingLeft: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {estruturaEditavel && (
                  <GripVertical size={13} style={{ color: '#8892b0', cursor: 'grab', flexShrink: 0 }} />
                )}
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: coluna.cor, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#0E142A' }}>{coluna.nome}</span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 9999,
                  background: isWipExceeded ? 'rgba(255,92,141,0.12)' : 'rgba(14,20,42,0.06)',
                  color: isWipExceeded ? '#c2004f' : '#8892b0',
                  border: isWipExceeded ? '1px solid rgba(255,92,141,0.20)' : 'none',
                }}>
                  {cards.length}{coluna.limite ? `/${coluna.limite}` : ''}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ColunaMenu
                  coluna={coluna}
                  podeEditar={estruturaEditavel && !coluna.fixa}
                  onRenomear={nome => onRenomearFase(coluna.id, nome)}
                  onNovoCard={() => setNovoCardColuna(coluna.id)}
                  onExcluir={() => onExcluirFase(coluna.id)}
                />
                <button
                  onClick={() => setNovoCardColuna(coluna.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8892b0', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', transition: 'all 150ms' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(14,20,42,0.08)'; e.currentTarget.style.color = '#0E142A' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#8892b0' }}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {isWipExceeded && (
              <div style={{ fontSize: 10, color: '#c2004f', background: 'rgba(255,92,141,0.06)', border: '1px solid rgba(255,92,141,0.15)', borderRadius: 6, padding: '4px 8px', marginBottom: 8, textAlign: 'center', fontWeight: 500 }}>
                Limite WIP excedido ({cards.length}/{coluna.limite})
              </div>
            )}

            {/* Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 40 }}>
              {cards.map(card => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={e => { e.stopPropagation(); handleCardDragStart(card.id) }}
                  onDragOver={e => handleCardDragOver(e, card.id)}
                  onDrop={e => { e.stopPropagation(); handleCardDrop(coluna.id, card.id) }}
                  onDragEnd={() => { setDragCard(null); setDragOverCard(null) }}
                  style={{
                    opacity: dragCard === card.id ? 0.4 : 1,
                    borderTop: dragOverCard === card.id ? '2px solid rgba(62,91,255,0.40)' : undefined,
                    transition: 'opacity 150ms',
                  }}
                >
                  <KanbanCardComp
                    card={card}
                    reordenavel
                    onClick={() => onCardClick(card)}
                  />
                </div>
              ))}

              {novoCardColuna === coluna.id ? (
                <div style={{ background: 'rgba(255,255,255,0.80)', border: '1px solid rgba(62,91,255,0.30)', borderRadius: 10, padding: '8px 10px' }}>
                  <textarea
                    autoFocus value={novoCardTitulo}
                    onChange={e => setNovoCardTitulo(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); adicionarCard(coluna.id) } if (e.key === 'Escape') { setNovoCardColuna(null); setNovoCardTitulo('') } }}
                    placeholder="Título do card..." rows={2}
                    style={{ width: '100%', fontSize: 13, color: '#0E142A', background: 'transparent', border: 'none', outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button onClick={() => adicionarCard(coluna.id)} style={{ padding: '4px 12px', background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)', border: 'none', borderRadius: 6, fontSize: 11, color: 'white', cursor: 'pointer', fontWeight: 600 }}>Adicionar</button>
                    <button onClick={() => { setNovoCardColuna(null); setNovoCardTitulo('') }} style={{ padding: '4px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#8892b0' }}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setNovoCardColuna(coluna.id)}
                  style={{ width: '100%', padding: '7px 10px', background: 'transparent', border: '1px dashed rgba(14,20,42,0.12)', borderRadius: 8, fontSize: 12, color: '#8892b0', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 150ms' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(62,91,255,0.04)'; e.currentTarget.style.color = '#3E5BFF'; e.currentTarget.style.borderColor = 'rgba(62,91,255,0.25)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8892b0'; e.currentTarget.style.borderColor = 'rgba(14,20,42,0.12)' }}
                >
                  <Plus size={13} /> Novo item
                </button>
              )}
            </div>
          </div>
        )
      })}

      {estruturaEditavel && (
        <button
          onClick={adicionarColuna}
          style={{ width: 200, flexShrink: 0, padding: '10px 16px', background: 'rgba(14,20,42,0.03)', border: '1px dashed rgba(14,20,42,0.12)', borderRadius: 12, fontSize: 12, color: '#8892b0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 150ms', whiteSpace: 'nowrap' as const }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(62,91,255,0.04)'; e.currentTarget.style.color = '#3E5BFF'; e.currentTarget.style.borderColor = 'rgba(62,91,255,0.25)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(14,20,42,0.03)'; e.currentTarget.style.color = '#8892b0'; e.currentTarget.style.borderColor = 'rgba(14,20,42,0.12)' }}
        >
          <Plus size={14} /> Adicionar fase
        </button>
      )}
    </div>
  )
}
