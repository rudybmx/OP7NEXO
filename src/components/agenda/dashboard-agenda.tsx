'use client'

import React from 'react'
import { parseISO } from 'date-fns'
import { format } from 'date-fns'
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

// ─── KPI Card (movido da página — só o Dashboard usa KPIs agora) ────────────────
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
    <div
      style={{
        position: 'relative',
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)',
        backdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)',
        padding: '12px 14px',
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.8),transparent)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 3,
          bottom: 0,
          background: accentColor,
          borderRadius: '4px 0 0 4px',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--ws-text-3)',
              marginBottom: 6,
              fontWeight: 600,
            }}
          >
            {label}
          </div>
          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--ws-text-1)', lineHeight: 1.2 }}>
            {value}
          </div>
          {delta && (
            <div
              style={{
                fontSize: 11,
                marginTop: 4,
                color: deltaPositivo ? 'var(--ws-green)' : 'var(--ws-coral)',
                fontWeight: 600,
              }}
            >
              {delta}
            </div>
          )}
        </div>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `${accentColor}18`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}

// ─── Painel ─────────────────────────────────────────────────────────────────────
const PAINEL: React.CSSProperties = {
  position: 'relative',
  background: 'var(--ws-glass-bg)',
  border: '1px solid var(--ws-glass-border)',
  borderRadius: 'var(--ws-radius-lg)',
  backdropFilter: 'blur(16px)',
  boxShadow: 'var(--ws-glass-shadow)',
  padding: 16,
  overflow: 'hidden',
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

export function DashboardAgenda({
  kpis,
  agendamentos,
  agendas,
  onNovoAgendamento,
  onAbrirAgendamento,
}: DashboardAgendaProps) {
  const agora = new Date()

  // Próximos agendamentos ativos (futuros, ordenados, limite 7)
  const proximos = agendamentos
    .filter((a) => !STATUS_INATIVOS.has(a.status) && parseISO(a.data_hora_inicio) >= agora)
    .sort((a, b) => parseISO(a.data_hora_inicio).getTime() - parseISO(b.data_hora_inicio).getTime())
    .slice(0, 7)

  // Split por origem (Web/IA/manual) — reduce client-side sobre os agendamentos já carregados
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

  const corAgenda = (agendaId: string) => agendas.find((a) => a.id === agendaId)?.cor ?? 'var(--ws-blue)'
  const nomeAgenda = (agendaId: string) => agendas.find((a) => a.id === agendaId)?.nome ?? 'Agenda'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ws-text-1)', margin: 0 }}>
            Visão Geral
          </h1>
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
            Resumo da agenda — hoje e próximos atendimentos
          </p>
        </div>
        <button
          onClick={onNovoAgendamento}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            border: 'none',
            borderRadius: 'var(--ws-radius-md)',
            background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))',
            color: '#fff',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <Plus size={14} />
          Novo Agendamento
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <KpiCard
          label="Agendamentos Hoje"
          value={kpis.agendamentosHoje}
          delta="no dia de hoje"
          deltaPositivo
          icon={<Calendar size={16} color="var(--ws-blue)" />}
          accentColor="var(--ws-blue)"
        />
        <KpiCard
          label="Confirmados"
          value={kpis.confirmadosHoje}
          delta={`de ${kpis.agendamentosHoje} hoje`}
          deltaPositivo={kpis.confirmadosHoje >= kpis.agendamentosHoje / 2}
          icon={<UserCheck size={16} color="var(--ws-green)" />}
          accentColor="var(--ws-green)"
        />
        <KpiCard
          label="Faltas (semana)"
          value={kpis.faltasSemana}
          delta={kpis.faltasSemana > 2 ? 'Acima da média' : 'Dentro da meta'}
          deltaPositivo={kpis.faltasSemana <= 2}
          icon={<UserX size={16} color="var(--ws-coral)" />}
          accentColor="var(--ws-coral)"
        />
        <KpiCard
          label="Taxa Comparecimento"
          value={`${kpis.taxaComparecimento}%`}
          delta={kpis.taxaComparecimento >= 80 ? '▲ Meta atingida' : '▼ Abaixo da meta'}
          deltaPositivo={kpis.taxaComparecimento >= 80}
          icon={<BarChart2 size={16} color="var(--ws-gold)" />}
          accentColor="var(--ws-gold)"
        />
      </div>

      {/* Próximos + Por origem */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Próximos agendamentos */}
        <div style={{ ...PAINEL, flex: 2, minWidth: 320 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <CalendarClock size={15} color="var(--ws-blue)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>
              Próximos agendamentos
            </span>
          </div>

          {proximos.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
              Nenhum agendamento futuro. Clique em “Novo Agendamento” para começar.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {proximos.map((ag) => {
                const dt = parseISO(ag.data_hora_inicio)
                return (
                  <button
                    key={ag.id}
                    onClick={() => onAbrirAgendamento(ag)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 8px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      transition: 'background 150ms ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Data/hora */}
                    <div style={{ width: 64, flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-1)' }}>
                        {format(dt, 'HH:mm')}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted-foreground)', textTransform: 'capitalize' }}>
                        {format(dt, "dd MMM", { locale: ptBR })}
                      </div>
                    </div>
                    {/* Bolinha agenda */}
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: corAgenda(ag.agenda_id),
                        flexShrink: 0,
                      }}
                    />
                    {/* Cliente + serviço */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: 'var(--ws-text-1)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ag.cliente_nome}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--muted-foreground)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ag.servico ? `${ag.servico} · ` : ''}{nomeAgenda(ag.agenda_id)}
                      </div>
                    </div>
                    {/* Status */}
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: 9999,
                        color: STATUS_COLORS[ag.status],
                        background: `${STATUS_COLORS[ag.status]}1a`,
                      }}
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
        <div style={{ ...PAINEL, flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <BarChart2 size={15} color="var(--ws-purple)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>
              Por origem
            </span>
          </div>

          {origensOrdenadas.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 12 }}>
              Sem agendamentos ainda.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {origensOrdenadas.map(({ origem, total }) => {
                const pct = Math.round((total / totalOrigem) * 100)
                const cor = origem === 'agente' ? 'var(--ws-purple)' : origem === 'manual' ? 'var(--ws-blue)' : 'var(--ws-cyan)'
                return (
                  <div key={origem}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--ws-text-1)' }}>{ORIGEM_LABELS[origem]}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-1)' }}>
                        {total} <span style={{ color: 'var(--muted-foreground)', fontWeight: 400 }}>({pct}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 9999, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 9999 }} />
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
