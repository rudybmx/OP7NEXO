'use client'

import { Calendar, Flag, MessageCircle, GripVertical, Plus } from 'lucide-react'
import { useState } from 'react'
import type { KanbanCard, KanbanColuna } from '@/types/kanban'
import { PRIORIDADE_CONFIG, isVencido, formatarData } from './_shared'
import { Input } from '@/components/ui/input'

interface ListaViewProps {
  colunas: KanbanColuna[]
  cards: KanbanCard[]
  reordenavel: boolean
  onCardClick: (card: KanbanCard) => void
  onCriarCard: (faseId: string, titulo: string) => void
  onMoverCard: (cardId: string, faseId: string, ordem?: number) => void
}

export function ListaView({
  colunas,
  cards,
  reordenavel,
  onCardClick,
  onCriarCard,
  onMoverCard,
}: ListaViewProps) {
  const [dragCardId, setDragCardId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [novoCardAtivo, setNovoCardAtivo] = useState(false)
  const [novoTitulo, setNovoTitulo] = useState('')

  const colunasOrdenadas = [...colunas].sort((a, b) => a.ordem - b.ordem)
  const todosCards = colunasOrdenadas.flatMap((col) =>
    cards.filter((c) => c.status === col.id).sort((a, b) => a.ordem - b.ordem),
  )

  function getColuna(colunaId: string): KanbanColuna | undefined {
    return colunas.find((c) => c.id === colunaId)
  }

  function handleDrop(targetId: string) {
    if (!dragCardId || !reordenavel || dragCardId === targetId) {
      setDragCardId(null)
      setDragOverId(null)
      return
    }
    const alvo = cards.find((c) => c.id === targetId)
    if (alvo) {
      const naFase = cards.filter((c) => c.status === alvo.status).sort((a, b) => a.ordem - b.ordem)
      const idx = naFase.findIndex((c) => c.id === targetId)
      onMoverCard(dragCardId, alvo.status, idx === -1 ? undefined : idx)
    }
    setDragCardId(null)
    setDragOverId(null)
  }

  function adicionarCard() {
    const titulo = novoTitulo.trim()
    const coluna = colunasOrdenadas[0]
    if (!titulo || !coluna) {
      setNovoCardAtivo(false)
      setNovoTitulo('')
      return
    }
    onCriarCard(coluna.id, titulo)
    setNovoTitulo('')
    setNovoCardAtivo(false)
  }

  const cols = reordenavel ? '28px 1fr 150px 110px 120px 50px' : '1fr 150px 110px 120px 50px'

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Cabeçalho */}
      <div
        className="grid items-center border-b border-border bg-muted/40 px-4 py-2"
        style={{ gridTemplateColumns: cols }}
      >
        {reordenavel && <span />}
        {['Nome', 'Status', 'Responsável', 'Prioridade', 'Vencimento', ''].map((h, i) => (
          <span key={h || i} className="ds-kpi-label text-muted-foreground">
            {h}
          </span>
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
            onDragStart={() => reordenavel && setDragCardId(card.id)}
            onDragOver={(e) => {
              e.preventDefault()
              if (reordenavel && card.id !== dragCardId) setDragOverId(card.id)
            }}
            onDrop={() => handleDrop(card.id)}
            onDragEnd={() => {
              setDragCardId(null)
              setDragOverId(null)
            }}
            style={{ gridTemplateColumns: cols }}
            className={`grid items-center px-4 transition-colors ${
              i < todosCards.length - 1 ? 'border-b border-border' : ''
            } ${isDragging ? 'opacity-40' : ''} ${
              isOver ? 'border-t-2 border-primary/40 bg-primary/5' : 'hover:bg-muted/30'
            }`}
          >
            {reordenavel && (
              <div className="flex cursor-grab items-center justify-center py-3 text-muted-foreground opacity-40 hover:opacity-90">
                <GripVertical className="size-3" />
              </div>
            )}

            {/* Nome */}
            <div onClick={() => onCardClick(card)} className="flex cursor-pointer items-center gap-2 py-2.5">
              <span className="size-3.5 shrink-0 rounded-sm border-[1.5px] border-border" />
              <span className="text-sm text-foreground">{card.titulo}</span>
            </div>

            {/* Status */}
            <div onClick={() => onCardClick(card)} className="cursor-pointer py-2.5">
              {coluna ? (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ color: coluna.cor, background: coluna.cor + '1f' }}
                >
                  <span className="size-1.5 rounded-full" style={{ background: coluna.cor }} />
                  {coluna.nome}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>

            {/* Responsável */}
            <div onClick={() => onCardClick(card)} className="flex cursor-pointer items-center gap-1.5">
              {card.responsavel ? (
                <>
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary/15 text-[7px] font-bold text-primary">
                    {card.responsavelInitials}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {card.responsavel.split(' ')[0]}
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>

            {/* Prioridade */}
            <div onClick={() => onCardClick(card)} className="cursor-pointer">
              {prio ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-micro font-semibold ${prio.classe}`}
                >
                  <Flag className="size-2.5" /> {prio.label}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>

            {/* Vencimento */}
            <div onClick={() => onCardClick(card)} className="flex cursor-pointer items-center gap-1">
              {card.dataVencimento ? (
                <span
                  className={`inline-flex items-center gap-1 text-xs ${
                    vencido ? 'font-semibold text-destructive' : 'text-muted-foreground'
                  }`}
                >
                  <Calendar className="size-3" />
                  {formatarData(card.dataVencimento)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>

            {/* Comentários */}
            <div className="flex items-center justify-end gap-1">
              {(card.comentarios ?? []).length > 0 && (
                <span className="flex items-center gap-1 text-micro text-muted-foreground">
                  <MessageCircle className="size-2.5" />
                  {card.comentarios!.length}
                </span>
              )}
            </div>
          </div>
        )
      })}

      {todosCards.length === 0 && !novoCardAtivo && (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum card neste painel.</div>
      )}

      {/* Novo item */}
      {novoCardAtivo ? (
        <div className="flex items-center gap-2 border-t border-border px-4 py-2">
          {reordenavel && <div className="w-7" />}
          <span className="size-3.5 shrink-0 rounded-sm border-[1.5px] border-border" />
          <Input
            autoFocus
            value={novoTitulo}
            onChange={(e) => setNovoTitulo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') adicionarCard()
              if (e.key === 'Escape') {
                setNovoCardAtivo(false)
                setNovoTitulo('')
              }
            }}
            onBlur={adicionarCard}
            placeholder="Nome do card..."
            className="h-7 flex-1 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>
      ) : (
        <button
          onClick={() => setNovoCardAtivo(true)}
          className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary"
        >
          {reordenavel && <div className="w-7" />}
          <Plus className="size-3" /> Novo item
        </button>
      )}
    </div>
  )
}
