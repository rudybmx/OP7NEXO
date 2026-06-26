'use client'

import React from 'react'
import { Plus, Pencil, Users, Clock, CalendarDays } from 'lucide-react'
import { Agenda, AgendaTipo } from '@/types/agenda'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const TIPO_LABELS: Record<AgendaTipo, string> = {
  profissional: 'Profissional',
  sala: 'Sala',
  equipamento: 'Equipamento',
  outro: 'Outro',
}

const FUSO_CURTO: Record<string, string> = {
  'America/Sao_Paulo': 'Brasília (GMT-3)',
  'America/Rio_Branco': 'Acre (GMT-5)',
  'America/Noronha': 'Noronha (GMT-2)',
  'America/Manaus': 'Manaus (GMT-4)',
}

interface GestaoAgendasProps {
  agendas: Agenda[]
  onNova: () => void
  onEditar: (agenda: Agenda) => void
}

export function GestaoAgendas({ agendas, onNova, onEditar }: GestaoAgendasProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="ds-section-title text-foreground">Agendas</h1>
          <p className="text-sm text-muted-foreground">
            Profissionais, salas e equipamentos que recebem agendamentos
          </p>
        </div>
        <Button onClick={onNova}>
          <Plus size={14} />
          Nova agenda
        </Button>
      </div>

      {/* Grid de cards */}
      {agendas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
          <CalendarDays size={28} className="mx-auto mb-2 text-muted-foreground" />
          <div className="mb-1 text-sm font-semibold text-foreground">Nenhuma agenda ainda</div>
          <div className="mb-4 text-sm text-muted-foreground">
            Crie a primeira agenda (um profissional, uma sala ou um equipamento) para começar a agendar.
          </div>
          <Button onClick={onNova}>
            <Plus size={14} />
            Criar primeira agenda
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {agendas.map((agenda) => (
            <div
              key={agenda.id}
              className="relative overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              {/* faixa de cor lateral */}
              <div
                className="absolute inset-y-0 left-0 w-1"
                style={{ background: agenda.cor }}
              />

              {/* Topo: nome + editar */}
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ background: agenda.cor }}
                  />
                  <span className="truncate text-sm font-semibold text-foreground">
                    {agenda.nome}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onEditar(agenda)}
                  title="Editar agenda"
                >
                  <Pencil size={14} />
                </Button>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">{TIPO_LABELS[agenda.tipo]}</Badge>
                <Badge variant="secondary" className="gap-1">
                  <Users size={11} />
                  {agenda.capacidade_simultanea} simultâneo{agenda.capacidade_simultanea > 1 ? 's' : ''}
                </Badge>
                {!agenda.ativo && (
                  <Badge variant="outline" className="text-muted-foreground">Inativa</Badge>
                )}
              </div>

              {/* Rodapé: fuso */}
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock size={11} />
                {FUSO_CURTO[agenda.fuso_horario] ?? agenda.fuso_horario}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
