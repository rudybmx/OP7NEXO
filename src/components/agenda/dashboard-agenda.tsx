'use client'

import React from 'react'
import { parseISO, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Calendar,
  UserCheck,
  UserX,
  BarChart2,
  Plus,
  CalendarClock,
} from 'lucide-react'
import {
  Agendamento,
  Agenda,
  AgendamentoOrigem,
  STATUS_LABELS,
  STATUS_COLORS,
  ORIGEM_LABELS,
} from '@/types/agenda'
import { Button } from '@/components/ui/button'

// ─── KPI Card ───────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string
  value: string | number
  delta?: string
  deltaPositivo?: boolean
  icon: React.ReactNode
  accentColor: string
}

function KpiCard({ label, value, delta, deltaPositivo, icon, accentColor }: KpiCardProps) {
  return (
    <div className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <div className="absolute inset-y-0 left-0 w-[3px] rounded-l" style={{ background: accentColor }} />
      <div className="flex items-start justify-between">
        <div>
          <div className="ds-label text-muted-foreground">{label}</div>
          <div className="mt-1 text-xl font-medium leading-tight text-foreground">{value}</div>
          {delta && (
            <div className={`mt-1 text-[11px] font-semibold ${deltaPositivo ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
              {delta}
            </div>
          )}
        </div>
        <div
          className="flex size-8 shrink-0 items-center justify-center rounded-lg"
          style={{ background: `${accentColor}1F` }}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}

// Status que NÃO contam como "próximo agendamento ativo"
const STATUS_INATIVOS = new Set(['cancelado', 'falta', 'reagendado', 'bloqueado', 'compareceu'])

export interface KpisDashboard {
  agendamentosHoje: number
  confirmadosHoje: number
  faltasSemana: number
  taxaComparecimento: number
}

interface DashboardAgendaProps {
  kpis: KpisDashboard
  agendamentos: Agendamento[]
  agendas: Agenda[]
  onNovoAgendamento: () => void
  onAbrirAgendamento: (ag: Agendamento) => void
}

const C_BLUE = '#006EFF'
const C_GREEN = '#0fa856'
const C_RED = '#e5484d'
const C_GOLD = '#f5a623'
const C_VIOLET = '#7A5AF8'
const C_CYAN = '#00b8c8'

export function DashboardAgenda({
  kpis,
  agendamentos,
  agendas,
  onNovoAgendamento,
  onAbrirAgendamento,
}: DashboardAgendaProps) {
  const agora = new Date()

  const proximos = agendamentos
    .filter((a) => !STATUS_INATIVOS.has(a.status) && parseISO(a.data_hora_inicio) >= agora)
    .sort((a, b) => parseISO(a.data_hora_inicio).getTime() - parseISO(b.data_hora_inicio).getTime())
    .slice(0, 7)

  const porOrigem = agendamentos.reduce(
    (acc, a) => {
      acc[a.origem] = (acc[a.origem] ?? 0) + 1
      return acc
    },
    {} as Record<AgendamentoOrigem, number>
  )
  const totalOrigem = agendamentos.length || 1
  const origensOrdenadas = (Object.keys(ORIGEM_LABELS) as AgendamentoOrigem[])
    .map((o) => ({ origem: o, total: porOrigem[o] ?? 0 }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total)

  const corAgenda = (agendaId: string) => agendas.find((a) => a.id === agendaId)?.cor ?? C_BLUE
  const nomeAgenda = (agendaId: string) => agendas.find((a) => a.id === agendaId)?.nome ?? 'Agenda'

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="ds-section-title text-foreground">Visão Geral</h1>
          <p className="text-sm text-muted-foreground">Resumo da agenda — hoje e próximos atendimentos</p>
        </div>
        <Button onClick={onNovoAgendamento}>
          <Plus size={14} />
          Novo agendamento
        </Button>
      </div>

      {/* KPIs */}
      <div className="flex flex-wrap gap-3">
        <KpiCard
          label="Agendamentos hoje"
          value={kpis.agendamentosHoje}
          delta="no dia de hoje"
          deltaPositivo
          icon={<Calendar size={16} color={C_BLUE} />}
          accentColor={C_BLUE}
        />
        <KpiCard
          label="Confirmados"
          value={kpis.confirmadosHoje}
          delta={`de ${kpis.agendamentosHoje} hoje`}
          deltaPositivo={kpis.confirmadosHoje >= kpis.agendamentosHoje / 2}
          icon={<UserCheck size={16} color={C_GREEN} />}
          accentColor={C_GREEN}
        />
        <KpiCard
          label="Faltas (semana)"
          value={kpis.faltasSemana}
          delta={kpis.faltasSemana > 2 ? 'Acima da média' : 'Dentro da meta'}
          deltaPositivo={kpis.faltasSemana <= 2}
          icon={<UserX size={16} color={C_RED} />}
          accentColor={C_RED}
        />
        <KpiCard
          label="Taxa de comparecimento"
          value={`${kpis.taxaComparecimento}%`}
          delta={kpis.taxaComparecimento >= 80 ? '▲ Meta atingida' : '▼ Abaixo da meta'}
          deltaPositivo={kpis.taxaComparecimento >= 80}
          icon={<BarChart2 size={16} color={C_GOLD} />}
          accentColor={C_GOLD}
        />
      </div>

      {/* Próximos + Por origem */}
      <div className="flex flex-wrap items-start gap-4">
        {/* Próximos agendamentos */}
        <div className="min-w-[320px] flex-[2] rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <CalendarClock size={15} color={C_BLUE} />
            <span className="text-[13px] font-semibold text-foreground">Próximos agendamentos</span>
          </div>

          {proximos.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Nenhum agendamento futuro. Clique em "Novo agendamento" para começar.
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {proximos.map((ag) => {
                const dt = parseISO(ag.data_hora_inicio)
                return (
                  <button
                    key={ag.id}
                    onClick={() => onAbrirAgendamento(ag)}
                    className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-muted"
                  >
                    {/* Data/hora */}
                    <div className="w-16 shrink-0">
                      <div className="text-xs font-semibold text-foreground">{format(dt, 'HH:mm')}</div>
                      <div className="text-[10px] capitalize text-muted-foreground">
                        {format(dt, 'dd MMM', { locale: ptBR })}
                      </div>
                    </div>
                    {/* Bolinha agenda */}
                    <div className="size-2 shrink-0 rounded-full" style={{ background: corAgenda(ag.agenda_id) }} />
                    {/* Cliente + serviço */}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-foreground">{ag.cliente_nome}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {ag.servico ? `${ag.servico} · ` : ''}
                        {nomeAgenda(ag.agenda_id)}
                      </div>
                    </div>
                    {/* Status */}
                    <span
                      className="shrink-0 rounded-full px-2 py-[3px] text-[10px] font-semibold"
                      style={{ color: STATUS_COLORS[ag.status], background: `${STATUS_COLORS[ag.status]}1a` }}
                    >
                      {STATUS_LABELS[ag.status]}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Por origem */}
        <div className="min-w-[240px] flex-1 rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <BarChart2 size={15} color={C_VIOLET} />
            <span className="text-[13px] font-semibold text-foreground">Por origem</span>
          </div>

          {origensOrdenadas.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">Sem agendamentos ainda.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {origensOrdenadas.map(({ origem, total }) => {
                const pct = Math.round((total / totalOrigem) * 100)
                const cor = origem === 'agente' ? C_VIOLET : origem === 'manual' ? C_BLUE : C_CYAN
                return (
                  <div key={origem}>
                    <div className="mb-1 flex justify-between">
                      <span className="text-xs text-foreground">{ORIGEM_LABELS[origem]}</span>
                      <span className="text-xs font-semibold text-foreground">
                        {total} <span className="font-normal text-muted-foreground">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: cor }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
