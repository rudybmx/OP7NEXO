'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  format,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CalendarRange,
  Plus,
  Search,
} from 'lucide-react'

import { tabAtiva, tabInativa } from '@/lib/utils'
import { useAgendas } from '@/hooks/use-agendas'
import { useAgendamentos } from '@/hooks/use-agendamentos'
import { CalendarioView, Agendamento, Agenda } from '@/types/agenda'

import { CalendarioSemana } from '@/components/agenda/calendario-semana'
import { CalendarioMes } from '@/components/agenda/calendario-mes'
import { ListaAgendamentos } from '@/components/agenda/lista-agendamentos'
import { ModalAgendamento } from '@/components/agenda/modal-agendamento'
import { ModalAgenda } from '@/components/agenda/modal-agenda'
import { DashboardAgenda } from '@/components/agenda/dashboard-agenda'
import { GestaoAgendas } from '@/components/agenda/gestao-agendas'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

// ─── View Tab ─────────────────────────────────────────────────────────────────
interface ViewTabProps {
  view: CalendarioView
  current: CalendarioView
  label: string
  icon: React.ReactNode
  onClick: (v: CalendarioView) => void
}

function ViewTab({ view, current, label, icon, onClick }: ViewTabProps) {
  const active = view === current
  return (
    <button
      onClick={() => onClick(view)}
      style={{
        ...(active ? tabAtiva : tabInativa),
        // Override da cor off-brand (--ws-gold) do util compartilhado → brand/semântico.
        color: active ? 'var(--primary)' : 'var(--muted-foreground)',
        borderBottomColor: active ? 'var(--primary)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
type SecaoAgenda = 'visao-geral' | 'calendario' | 'agendamentos' | 'agendas'

export default function AgendaPage() {
  // ─── Estado de view e navegação temporal ───────────────────────────────────
  // Seção ativa derivada da sub-rota — em RENDER (reativo via usePathname), NÃO em useState.
  // Todas as sub-rotas re-exportam ESTA mesma página no mesmo slot, então a navegação soft
  // (clique na sidebar) PRESERVA a instância: o initializer de um useState NÃO re-roda.
  const pathname = usePathname()
  const secao: SecaoAgenda = pathname?.endsWith('/calendario')
    ? 'calendario'
    : pathname?.endsWith('/agendamentos')
      ? 'agendamentos'
      : pathname?.endsWith('/agendas')
        ? 'agendas'
        : 'visao-geral'
  // `view` só controla o toggle Semana/Mês DENTRO do Calendário.
  const [view, setView] = useState<CalendarioView>('semana')
  const [dataReferencia, setDataReferencia] = useState(new Date())
  const [buscaCliente, setBuscaCliente] = useState('')

  // ─── Estado dos modais ─────────────────────────────────────────────────────
  const [modalAgendamentoAberto, setModalAgendamentoAberto] = useState(false)
  const [agendamentoEditando, setAgendamentoEditando] = useState<Agendamento | null>(null)
  const [agendaIdPreSelecionada, setAgendaIdPreSelecionada] = useState<string | undefined>()
  const [dataHoraPreSelecionada, setDataHoraPreSelecionada] = useState<string | undefined>()

  const [modalAgendaAberto, setModalAgendaAberto] = useState(false)
  const [agendaEditando, setAgendaEditando] = useState<Agenda | null>(null)

  // ─── Hooks de dados ────────────────────────────────────────────────────────
  const {
    agendas,
    horarios,
    bloqueios,
    criarAgenda,
    editarAgenda,
  } = useAgendas()

  const {
    agendamentos,
    setFiltros,
    criarAgendamento,
    editarAgendamento,
    atualizarStatus,
    getKpisHoje,
  } = useAgendamentos()

  // ─── Agendas visíveis (chips no topo do calendário) ─────────────────────────
  const [agendasVisiveis, setAgendasVisiveis] = useState<string[]>([])
  const agendasSemeadas = useRef(false)
  useEffect(() => {
    if (!agendasSemeadas.current && agendas.length > 0) {
      setAgendasVisiveis(agendas.map((a) => a.id))
      agendasSemeadas.current = true
    }
  }, [agendas])

  const toggleVisibilidadeAgenda = useCallback((id: string) => {
    setAgendasVisiveis((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }, [])

  // ─── Navegação temporal ────────────────────────────────────────────────────
  const navAnterior = useCallback(() => {
    setDataReferencia((prev) =>
      view === 'mes' ? subMonths(prev, 1) : subWeeks(prev, 1)
    )
  }, [view])

  const navProximo = useCallback(() => {
    setDataReferencia((prev) =>
      view === 'mes' ? addMonths(prev, 1) : addWeeks(prev, 1)
    )
  }, [view])

  const navHoje = useCallback(() => setDataReferencia(new Date()), [])

  // ─── Label do período ──────────────────────────────────────────────────────
  const labelPeriodo = useMemo(() => {
    if (view === 'mes') {
      return format(dataReferencia, 'MMMM yyyy', { locale: ptBR })
    }
    const ini = startOfWeek(dataReferencia, { weekStartsOn: 1 })
    const fim = endOfWeek(dataReferencia, { weekStartsOn: 1 })
    const mesIgual = ini.getMonth() === fim.getMonth()
    if (mesIgual) {
      return `${format(ini, "d")} – ${format(fim, "d 'de' MMMM yyyy", { locale: ptBR })}`
    }
    return `${format(ini, "d MMM", { locale: ptBR })} – ${format(fim, "d MMM yyyy", { locale: ptBR })}`
  }, [view, dataReferencia])

  // ─── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = getKpisHoje()

  // ─── Handlers de modal ─────────────────────────────────────────────────────
  const abrirNovoAgendamento = useCallback((agendaId?: string, dataHora?: string) => {
    setAgendamentoEditando(null)
    setAgendaIdPreSelecionada(agendaId)
    setDataHoraPreSelecionada(dataHora)
    setModalAgendamentoAberto(true)
  }, [])

  const abrirEditarAgendamento = useCallback((ag: Agendamento) => {
    setAgendamentoEditando(ag)
    setModalAgendamentoAberto(true)
  }, [])

  const fecharModalAgendamento = useCallback(() => {
    setModalAgendamentoAberto(false)
    setAgendamentoEditando(null)
    setAgendaIdPreSelecionada(undefined)
    setDataHoraPreSelecionada(undefined)
  }, [])

  const salvarAgendamento = useCallback(async (dados: any) => {
    if (agendamentoEditando) {
      await editarAgendamento(agendamentoEditando.id, dados)
    } else {
      await criarAgendamento(dados)
    }
    fecharModalAgendamento()
  }, [agendamentoEditando, criarAgendamento, editarAgendamento, fecharModalAgendamento])

  const abrirModalAgenda = useCallback((agenda?: Agenda) => {
    setAgendaEditando(agenda ?? null)
    setModalAgendaAberto(true)
  }, [])

  const fecharModalAgenda = useCallback(() => {
    setModalAgendaAberto(false)
    setAgendaEditando(null)
  }, [])

  const salvarAgenda = useCallback(async (dados: any) => {
    if (agendaEditando) {
      await editarAgenda(agendaEditando.id, dados)
    } else {
      await criarAgenda(dados)
    }
    fecharModalAgenda()
  }, [agendaEditando, criarAgenda, editarAgenda, fecharModalAgenda])

  const agendasAtivas = agendas.filter((a) => a.ativo)

  return (
    <div className="min-h-full bg-background p-6">

      {/* ── Visão Geral: dashboard de métricas ── */}
      {secao === 'visao-geral' && (
        <DashboardAgenda
          kpis={kpis}
          agendamentos={agendamentos}
          agendas={agendas}
          onNovoAgendamento={() => abrirNovoAgendamento()}
          onAbrirAgendamento={abrirEditarAgendamento}
        />
      )}

      {/* ── Agendas: gestão (cards) ── */}
      {secao === 'agendas' && (
        <GestaoAgendas
          agendas={agendas}
          onNova={() => abrirModalAgenda()}
          onEditar={(a) => abrirModalAgenda(a)}
        />
      )}

      {/* ── Calendário / Agendamentos ── */}
      {(secao === 'calendario' || secao === 'agendamentos') && (
        <div className="flex flex-col">
          {/* Toolbar */}
          <div className="flex items-stretch gap-0 rounded-t-lg border border-border bg-card px-4">
            {/* Tabs Semana/Mês + navegação temporal — só no Calendário */}
            {secao === 'calendario' && (
              <>
                <div className="flex items-stretch">
                  <ViewTab
                    view="semana"
                    current={view}
                    label="Semana"
                    icon={<CalendarDays size={14} />}
                    onClick={setView}
                  />
                  <ViewTab
                    view="mes"
                    current={view}
                    label="Mês"
                    icon={<CalendarRange size={14} />}
                    onClick={setView}
                  />
                </div>

                <div className="mx-3 my-2 w-px flex-shrink-0 bg-border" />

                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="icon-sm" onClick={navAnterior}>
                    <ChevronLeft size={16} />
                  </Button>
                  <span className="min-w-40 text-center text-sm font-medium capitalize text-foreground">
                    {labelPeriodo}
                  </span>
                  <Button variant="ghost" size="icon-sm" onClick={navProximo}>
                    <ChevronRight size={16} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={navHoje}
                    className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                  >
                    Hoje
                  </Button>
                </div>
              </>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Busca + Novo */}
            <div className="flex items-center gap-2 py-2">
              <div className="relative">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  type="text"
                  placeholder="Buscar cliente..."
                  value={buscaCliente}
                  onChange={(e) => {
                    setBuscaCliente(e.target.value)
                    setFiltros((f) => ({ ...f, busca: e.target.value }))
                  }}
                  className="h-8 w-44 pl-8"
                />
              </div>
              <Button onClick={() => abrirNovoAgendamento()}>
                <Plus size={14} />
                Novo agendamento
              </Button>
            </div>
          </div>

          {/* Chips de agendas (filtro de visibilidade) — só no Calendário */}
          {secao === 'calendario' && agendasAtivas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-x border-border bg-card px-4 py-2.5">
              {agendasAtivas.map((agenda) => {
                const visivel = agendasVisiveis.includes(agenda.id)
                return (
                  <button
                    key={agenda.id}
                    onClick={() => toggleVisibilidadeAgenda(agenda.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                      visivel
                        ? 'border-primary/40 bg-primary/10 text-foreground'
                        : 'border-border bg-muted text-muted-foreground opacity-60 hover:opacity-100'
                    }`}
                  >
                    <span
                      className="size-2.5 rounded-full transition-opacity"
                      style={{ background: agenda.cor, opacity: visivel ? 1 : 0.4 }}
                    />
                    {agenda.nome}
                  </button>
                )
              })}
            </div>
          )}

          {/* Conteúdo do calendário/lista */}
          <div className="relative min-h-[480px] overflow-hidden rounded-b-lg border border-t-0 border-border bg-card">
            {secao === 'agendamentos' ? (
              <ListaAgendamentos
                agendamentos={agendamentos}
                agendas={agendas}
                onAgendamentoClick={abrirEditarAgendamento}
                onStatusChange={atualizarStatus}
              />
            ) : view === 'mes' ? (
              <CalendarioMes
                agendamentos={agendamentos}
                agendas={agendas}
                agendasVisiveis={agendasVisiveis}
                mesAtual={dataReferencia}
                onMesChange={setDataReferencia}
                onDiaClick={(dia) => {
                  setDataReferencia(dia)
                  setView('semana')
                }}
                onAgendamentoClick={abrirEditarAgendamento}
              />
            ) : (
              <CalendarioSemana
                agendamentos={agendamentos}
                agendas={agendas}
                agendasVisiveis={agendasVisiveis}
                semanaAtual={dataReferencia}
                onSemanaChange={setDataReferencia}
                onAgendamentoClick={abrirEditarAgendamento}
                onSlotClick={abrirNovoAgendamento}
                horarios={horarios}
                bloqueios={bloqueios}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Modais (Dialog shadcn — overlay próprio) ── */}
      <ModalAgendamento
        aberto={modalAgendamentoAberto}
        onFechar={fecharModalAgendamento}
        agendas={agendas}
        agendamentoInicial={agendamentoEditando}
        agendaIdInicial={agendaIdPreSelecionada}
        dataInicial={dataHoraPreSelecionada ? dataHoraPreSelecionada.split('T')[0] : undefined}
        horaInicial={dataHoraPreSelecionada ? dataHoraPreSelecionada.split('T')[1]?.substring(0, 5) : undefined}
        onSalvar={salvarAgendamento}
      />

      <ModalAgenda
        aberto={modalAgendaAberto}
        agendaInicial={agendaEditando}
        onSalvar={salvarAgenda}
        onFechar={fecharModalAgenda}
      />
    </div>
  )
}
