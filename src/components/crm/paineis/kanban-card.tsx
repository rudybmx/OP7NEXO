'use client'

import { Calendar, MessageCircle, Flag, GripVertical, Bot } from 'lucide-react'
import type { KanbanCard } from '@/types/kanban'
import { PRIORIDADE_CONFIG, isVencido, formatarDataCurta } from './_shared'

interface KanbanCardProps {
  card: KanbanCard
  reordenavel?: boolean
  onClick: () => void
}

export function KanbanCardComp({ card, reordenavel, onClick }: KanbanCardProps) {
  const vencido = isVencido(card.dataVencimento)
  const prio = card.prioridade ? PRIORIDADE_CONFIG[card.prioridade] : null

  return (
    <div
      onClick={onClick}
      className="group/card relative cursor-pointer overflow-hidden rounded-lg border border-border bg-card p-2.5 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      {/* Barra topo p/ urgente */}
      {card.prioridade === 'urgente' && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-destructive" />
      )}

      {reordenavel && (
        <div className="absolute right-1.5 top-1.5 text-muted-foreground opacity-0 transition-opacity group-hover/card:opacity-60">
          <GripVertical className="size-3" />
        </div>
      )}

      {/* Título */}
      <div className="mb-2 pr-4 text-sm font-medium leading-snug text-foreground">{card.titulo}</div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          {prio && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-micro font-semibold ${prio.classe}`}
            >
              <Flag className="size-2.5" /> {prio.label}
            </span>
          )}

          {card.dataVencimento && (
            <span
              className={`inline-flex items-center gap-1 text-micro ${
                vencido ? 'font-semibold text-destructive' : 'text-muted-foreground'
              }`}
            >
              <Calendar className="size-2.5" />
              {formatarDataCurta(card.dataVencimento)}
            </span>
          )}

          {(card.comentarios ?? []).length > 0 && (
            <span className="inline-flex items-center gap-1 text-micro text-muted-foreground">
              <MessageCircle className="size-2.5" />
              {card.comentarios!.length}
            </span>
          )}

          {card.origemAgente && (
            <span
              className="inline-flex items-center text-micro text-primary"
              title="Card criado por automação / agente de IA"
            >
              <Bot className="size-3" />
            </span>
          )}
        </div>

        {card.responsavel && (
          <div
            title={card.responsavel}
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[8px] font-bold text-primary"
          >
            {card.responsavelInitials}
          </div>
        )}
      </div>
    </div>
  )
}
