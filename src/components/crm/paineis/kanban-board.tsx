'use client'

import { useState } from 'react'
import { Plus, GripVertical, Lock } from 'lucide-react'
import type { KanbanCard, KanbanColuna } from '@/types/kanban'
import { KanbanCardComp } from './kanban-card'
import { ColunaMenu } from './coluna-menu'
import { Input } from '@/components/ui/input'

interface KanbanBoardProps {
  colunas: KanbanColuna[]
  cards: KanbanCard[]
  bloqueado?: boolean
  reordenavel: boolean
  onCardClick: (card: KanbanCard) => void
  onCriarCard: (faseId: string, titulo: string) => void
  onMoverCard: (cardId: string, faseId: string, ordem?: number) => void
  onReordenarFases: (ordem: string[]) => void
  onCriarFase: (nome: string) => void
  onRenomearFase: (faseId: string, nome: string) => void
  onExcluirFase: (faseId: string) => void
}

export function KanbanBoardComp({
  colunas,
  cards,
  bloqueado,
  reordenavel,
  onCardClick,
  onCriarCard,
  onMoverCard,
  onReordenarFases,
  onCriarFase,
  onRenomearFase,
  onExcluirFase,
}: KanbanBoardProps) {
  const [novoCardColuna, setNovoCardColuna] = useState<string | null>(null)
  const [novoCardTitulo, setNovoCardTitulo] = useState('')
  const [novaColuna, setNovaColuna] = useState(false)
  const [novaColunaNome, setNovaColunaNome] = useState('')

  // Card drag
  const [dragCard, setDragCard] = useState<string | null>(null)
  const [dragOverCard, setDragOverCard] = useState<string | null>(null)
  const [dragOverColuna, setDragOverColuna] = useState<string | null>(null)

  // Coluna drag
  const [dragColuna, setDragColuna] = useState<string | null>(null)
  const [dragOverColunaTarget, setDragOverColunaTarget] = useState<string | null>(null)

  const colunasOrdenadas = [...colunas].sort((a, b) => a.ordem - b.ordem)

  function adicionarCard(colunaId: string) {
    const titulo = novoCardTitulo.trim()
    if (!titulo) {
      setNovoCardColuna(null)
      return
    }
    onCriarCard(colunaId, titulo)
    setNovoCardTitulo('')
    setNovoCardColuna(null)
  }

  function adicionarColuna() {
    const nome = novaColunaNome.trim()
    if (nome) onCriarFase(nome)
    setNovaColunaNome('')
    setNovaColuna(false)
  }

  // Card drag handlers
  function handleCardDragStart(cardId: string) {
    if (!reordenavel) return
    setDragCard(cardId)
  }
  function handleCardDragOver(e: React.DragEvent, cardId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!reordenavel || !dragCard || dragColuna) return
    setDragOverCard(cardId)
    setDragOverColuna(null)
  }
  function handleColunaDragOver(e: React.DragEvent, colunaId: string) {
    e.preventDefault()
    if (!reordenavel || !dragCard || dragColuna) return
    setDragOverColuna(colunaId)
  }
  function handleCardDrop(targetColunaId: string, targetCardId?: string) {
    if (!dragCard || !reordenavel || dragColuna) {
      limparDrag()
      return
    }
    let ordem: number | undefined
    if (targetCardId && targetCardId !== dragCard) {
      const colCards = cards
        .filter((c) => c.status === targetColunaId)
        .sort((a, b) => a.ordem - b.ordem)
      const idx = colCards.findIndex((c) => c.id === targetCardId)
      if (idx !== -1) ordem = idx
    }
    onMoverCard(dragCard, targetColunaId, ordem)
    limparDrag()
  }

  // Coluna drag handlers
  function handleColunaDragStart(colunaId: string) {
    if (!reordenavel || bloqueado) return
    setDragColuna(colunaId)
  }
  function handleColunaDragOverTarget(e: React.DragEvent, colunaId: string) {
    e.preventDefault()
    if (!reordenavel || !dragColuna || colunaId === dragColuna) return
    setDragOverColunaTarget(colunaId)
  }
  function handleColunaDrop(targetId: string) {
    if (!dragColuna || !reordenavel || dragColuna === targetId) {
      limparDrag()
      return
    }
    const ids = colunasOrdenadas.map((c) => c.id)
    const fromIdx = ids.indexOf(dragColuna)
    const toIdx = ids.indexOf(targetId)
    if (fromIdx !== -1 && toIdx !== -1) {
      const [moved] = ids.splice(fromIdx, 1)
      ids.splice(toIdx, 0, moved)
      onReordenarFases(ids)
    }
    limparDrag()
  }

  function limparDrag() {
    setDragCard(null)
    setDragOverCard(null)
    setDragOverColuna(null)
    setDragColuna(null)
    setDragOverColunaTarget(null)
  }

  const podeArrastarColuna = reordenavel && !bloqueado

  return (
    <div className="flex items-start gap-3 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
      {colunasOrdenadas.map((coluna) => {
        const colCards = cards.filter((c) => c.status === coluna.id).sort((a, b) => a.ordem - b.ordem)
        const isOver = dragOverColuna === coluna.id
        const wipExcedido = coluna.limite ? colCards.length > coluna.limite : false
        const isColunaOver = dragOverColunaTarget === coluna.id
        const isColunaDragging = dragColuna === coluna.id

        return (
          <div
            key={coluna.id}
            draggable={podeArrastarColuna && !dragCard}
            onDragStart={() => handleColunaDragStart(coluna.id)}
            onDragOver={(e) => {
              handleColunaDragOverTarget(e, coluna.id)
              handleColunaDragOver(e, coluna.id)
            }}
            onDrop={() => {
              if (dragColuna) handleColunaDrop(coluna.id)
              else handleCardDrop(coluna.id)
            }}
            onDragEnd={limparDrag}
            className={`w-[272px] shrink-0 rounded-xl border p-2.5 transition-colors ${
              isColunaOver
                ? 'border-primary/50 bg-primary/5'
                : isOver
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border bg-muted/40'
            } ${isColunaDragging ? 'opacity-40' : ''} ${
              podeArrastarColuna && !dragCard ? 'cursor-grab' : ''
            }`}
          >
            {/* Header da coluna */}
            <div className="mb-3 flex items-center justify-between pl-0.5">
              <div className="flex min-w-0 items-center gap-2">
                {podeArrastarColuna && (
                  <GripVertical className="size-3 shrink-0 cursor-grab text-muted-foreground" />
                )}
                <span className="size-2 shrink-0 rounded-full" style={{ background: coluna.cor }} />
                <span className="truncate text-sm font-semibold text-foreground">{coluna.nome}</span>
                {coluna.fixa && <Lock className="size-3 shrink-0 text-muted-foreground" />}
                <span
                  className={`shrink-0 rounded-full px-1.5 py-px text-micro font-semibold ${
                    wipExcedido
                      ? 'bg-destructive/12 text-destructive'
                      : 'bg-muted/70 text-muted-foreground'
                  }`}
                >
                  {colCards.length}
                  {coluna.limite ? `/${coluna.limite}` : ''}
                </span>
              </div>
              <ColunaMenu
                coluna={coluna}
                bloqueado={bloqueado}
                onRenomear={(nome) => onRenomearFase(coluna.id, nome)}
                onNovoCard={() => setNovoCardColuna(coluna.id)}
                onExcluir={() => onExcluirFase(coluna.id)}
              />
            </div>

            {wipExcedido && (
              <div className="mb-2 rounded-md border border-destructive/20 bg-destructive/10 px-2 py-1 text-center text-micro font-medium text-destructive">
                Limite WIP excedido ({colCards.length}/{coluna.limite})
              </div>
            )}

            {/* Cards */}
            <div className="flex flex-col gap-2" style={{ minHeight: 40 }}>
              {colCards.map((card) => (
                <div
                  key={card.id}
                  draggable={reordenavel}
                  onDragStart={(e) => {
                    e.stopPropagation()
                    handleCardDragStart(card.id)
                  }}
                  onDragOver={(e) => handleCardDragOver(e, card.id)}
                  onDrop={(e) => {
                    e.stopPropagation()
                    handleCardDrop(coluna.id, card.id)
                  }}
                  onDragEnd={limparDrag}
                  className={`transition-opacity ${dragCard === card.id ? 'opacity-40' : ''} ${
                    dragOverCard === card.id ? 'border-t-2 border-primary/50 pt-0.5' : ''
                  }`}
                >
                  <KanbanCardComp card={card} reordenavel={reordenavel} onClick={() => onCardClick(card)} />
                </div>
              ))}

              {novoCardColuna === coluna.id ? (
                <div className="rounded-lg border border-primary/30 bg-card p-2">
                  <textarea
                    autoFocus
                    value={novoCardTitulo}
                    onChange={(e) => setNovoCardTitulo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        adicionarCard(coluna.id)
                      }
                      if (e.key === 'Escape') {
                        setNovoCardColuna(null)
                        setNovoCardTitulo('')
                      }
                    }}
                    placeholder="Título do card..."
                    rows={2}
                    className="w-full resize-none border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      onClick={() => adicionarCard(coluna.id)}
                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      Adicionar
                    </button>
                    <button
                      onClick={() => {
                        setNovoCardColuna(null)
                        setNovoCardTitulo('')
                      }}
                      className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setNovoCardColuna(coluna.id)}
                  className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                >
                  <Plus className="size-3" /> Novo item
                </button>
              )}
            </div>
          </div>
        )
      })}

      {/* Adicionar fase */}
      {!bloqueado &&
        (novaColuna ? (
          <div className="w-[220px] shrink-0 rounded-xl border border-primary/30 bg-card p-2.5">
            <Input
              autoFocus
              value={novaColunaNome}
              onChange={(e) => setNovaColunaNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') adicionarColuna()
                if (e.key === 'Escape') {
                  setNovaColuna(false)
                  setNovaColunaNome('')
                }
              }}
              onBlur={adicionarColuna}
              placeholder="Nome da fase..."
              className="h-8 text-sm"
            />
          </div>
        ) : (
          <button
            onClick={() => setNovaColuna(true)}
            className="flex w-[200px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-dashed border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
          >
            <Plus className="size-3.5" /> Adicionar fase
          </button>
        ))}
    </div>
  )
}
