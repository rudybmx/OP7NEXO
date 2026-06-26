'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
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
  Settings,
  Lock,
  Eye,
  EyeOff,
  Pencil,
} from 'lucide-react'

import { tabAtiva, tabInativa } from '@/lib/utils'
import { useAgendas } from '@/hooks/use-agendas'
import { useAgendamentos } from '@/hooks/use-agendamentos'
import { CalendarioView, AgendamentoStatus, Agendamento, Agenda } from '@/types/agenda'

import { CalendarioSemana } from '@/components/agenda/calendario-semana'
import { CalendarioMes } from '@/components/agenda/calendario-mes'
import { ListaAgendamentos } from '@/components/agenda/lista-agendamentos'
import { ModalAgendamento } from '@/components/agenda/modal-agendamento'
import { ModalAgenda } from '@/components/agenda/modal-agenda'
import { DashboardAgenda } from '@/components/agenda/dashboard-agenda'
import { GestaoAgendas } from '@/components/agenda/gestao-agendas'

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
  const router = useRouter()

  // ─── Estado de view e navegação temporal ───────────────────────────────────
  // Seção ativa derivada da sub-rota — em RENDER (reativo via usePathname), NÃO em useState.
  // Todas as sub-rotas re-exportam ESTA mesma página no mesmo slot, então a navegação soft
  // (clique na sidebar) PRESERVA a instância: o initializer de um useState NÃO re-roda.
  // Por isso o conteúdo é dirigido por `secao` (reativo), não por estado guardado.
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
  const [filtroStatus, setFiltroStatus] = useState<AgendamentoStatus[]>([])
  const [sidebarColapsada, setSidebarColapsada] = useState(false)

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

  // ─── Agendas visíveis (checkbox na sidebar) ────────────────────────────────
  const [agendasVisiveis, setAgendasVisiveis] = useState<string[]>([])
  // Semeia "todas visíveis" UMA vez quando as agendas carregam (fetch é async → o
  // initializer do useState rodou com agendas=[]). Ref evita brigar com o toggle do usuário.
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

  // ─── Semana para CalendarioSemana ──────────────────────────────────────────
  const semanaInicio = startOfWeek(dataReferencia, { weekStartsOn: 1 })

  return (
    <div style={{ background: 'var(--ws-page-bg)', minHeight: '100%', padding: '24px' }}>

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

      {/* ── Calendário / Agendamentos: sidebar de agendas + conteúdo ── */}
      {(secao === 'calendario' || secao === 'agendamentos') && (
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* ── Sidebar de agendas ── */}
        <div
          style={{
            position: 'relative',
            flexShrink: 0,
            width: sidebarColapsada ? 44 : 240,
            transition: 'width 250ms cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'relative',
              background: 'var(--ws-glass-bg)',
              borderRight: '1px solid var(--ws-glass-border)',
              borderRadius: 'var(--ws-radius-lg)',
              backdropFilter: 'blur(20px)',
              boxShadow: 'var(--ws-glass-shadow)',
              height: '100%',
              overflow: 'hidden',
            }}
          >
            {/* brilho no topo */}
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

            {/* Header da sidebar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: sidebarColapsada ? '14px 10px' : '14px 16px',
                borderBottom: '1px solid var(--ws-glass-border)',
              }}
            >
              {!sidebarColapsada && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--ws-text-3)',
                  }}
                >
                  Agendas
                </span>
              )}
              <button
                onClick={() => setSidebarColapsada((p) => !p)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--muted-foreground)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: 4,
                  borderRadius: 6,
                  marginLeft: sidebarColapsada ? 'auto' : undefined,
                  marginRight: sidebarColapsada ? 'auto' : undefined,
                }}
              >
                {sidebarColapsada ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
            </div>

            {/* Conteúdo (visível apenas expandido) */}
            {!sidebarColapsada && (
              <div style={{ padding: '12px 12px 8px' }}>

                {/* Botão Nova Agenda */}
                <button
                  onClick={() => abrirModalAgenda()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: '100%',
                    padding: '7px 10px',
                    marginBottom: 12,
                    border: 'none',
                    borderRadius: 'var(--ws-radius-md)',
                    background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'opacity 150ms ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  <Plus size={14} />
                  Nova Agenda
                </button>

                {/* Lista de agendas */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {agendas.filter((a) => a.ativo).map((agenda) => {
                    const visivel = agendasVisiveis.includes(agenda.id)
                    return (
                      <div
                        key={agenda.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 8px',
                          borderRadius: 8,
                          transition: 'background 150ms ease',
                          cursor: 'default',
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = 'transparent')
                        }
                      >
                        {/* Bolinha colorida */}
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: agenda.cor,
                            flexShrink: 0,
                            opacity: visivel ? 1 : 0.3,
                            boxShadow: visivel ? `0 0 6px ${agenda.cor}80` : 'none',
                            transition: 'all 200ms ease',
                          }}
                        />
                        {/* Nome */}
                        <span
                          style={{
                            flex: 1,
                            fontSize: 12,
                            color: visivel ? 'var(--ws-text-1)' : 'var(--ws-text-3)',
                            fontWeight: 400,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            transition: 'color 200ms ease',
                          }}
                        >
                          {agenda.nome}
                        </span>
                        {/* Ações */}
                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                          <button
                            onClick={() => toggleVisibilidadeAgenda(agenda.id)}
                            title={visivel ? 'Ocultar' : 'Mostrar'}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--muted-foreground)',
                              display: 'flex',
                              padding: 3,
                              borderRadius: 4,
                            }}
                          >
                            {visivel ? <Eye size={12} /> : <EyeOff size={12} />}
                          </button>
                          <button
                            onClick={() => abrirModalAgenda(agenda)}
                            title="Editar"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--muted-foreground)',
                              display: 'flex',
                              padding: 3,
                              borderRadius: 4,
                            }}
                          >
                            <Pencil size={12} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Divisor */}
                <div
                  style={{
                    height: 1,
                    background: 'var(--ws-glass-border)',
                    margin: '12px 0',
                  }}
                />

                {/* Links de configuração */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button
                    onClick={() => router.push('/crm/gestao/agenda/configuracoes')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontSize: 12,
                      color: 'var(--muted-foreground)',
                      transition: 'all 150ms ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                      e.currentTarget.style.color = 'var(--foreground)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--muted-foreground)'
                    }}
                  >
                    <Settings size={13} />
                    Configurações
                  </button>
                  <button
                    onClick={() => router.push('/crm/gestao/agenda/configuracoes?tab=bloqueios')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontSize: 12,
                      color: 'var(--muted-foreground)',
                      transition: 'all 150ms ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                      e.currentTarget.style.color = 'var(--foreground)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--muted-foreground)'
                    }}
                  >
                    <Lock size={13} />
                    Bloqueios
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Conteúdo principal ── */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
          }}
        >
          {/* Toolbar */}
          <div
            style={{
              position: 'relative',
              background: 'var(--ws-glass-bg)',
              border: '1px solid var(--ws-glass-border)',
              borderRadius: 'var(--ws-radius-lg) var(--ws-radius-lg) 0 0',
              backdropFilter: 'blur(16px)',
              boxShadow: 'var(--ws-glass-shadow)',
              padding: '0 16px',
              display: 'flex',
              alignItems: 'stretch',
              gap: 0,
              borderBottom: '1px solid var(--ws-glass-border)',
            }}
          >
            {/* brilho no topo */}
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

            {/* Tabs Semana/Mês + navegação temporal — só no Calendário */}
            {secao === 'calendario' && (
            <>
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
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

            {/* Divisor vertical */}
            <div
              style={{
                width: 1,
                background: 'var(--ws-glass-border)',
                margin: '8px 12px',
                flexShrink: 0,
              }}
            />

            {/* Navegação temporal */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <button
                onClick={navAnterior}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--muted-foreground)',
                  display: 'flex',
                  padding: 6,
                  borderRadius: 6,
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--foreground)',
                  minWidth: 160,
                  textAlign: 'center',
                  textTransform: 'capitalize',
                }}
              >
                {labelPeriodo}
              </span>
              <button
                onClick={navProximo}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--muted-foreground)',
                  display: 'flex',
                  padding: 6,
                  borderRadius: 6,
                }}
              >
                <ChevronRight size={16} />
              </button>
              <button
                onClick={navHoje}
                style={{
                  padding: '4px 10px',
                  background: 'rgba(201,168,76,0.12)',
                  border: '0.5px solid var(--ws-gold)',
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--ws-gold)',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                Hoje
              </button>
            </div>
            </>
            )}

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Busca */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 0',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--ws-glass-border)',
                  borderRadius: 8,
                  padding: '5px 10px',
                }}
              >
                <Search size={13} style={{ color: 'var(--muted-foreground)' }} />
                <input
                  type="text"
                  placeholder="Buscar cliente..."
                  value={buscaCliente}
                  onChange={(e) => {
                    setBuscaCliente(e.target.value)
                    setFiltros((f) => ({ ...f, busca: e.target.value }))
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: 12,
                    color: 'var(--foreground)',
                    width: 160,
                  }}
                />
              </div>

              {/* Botão novo agendamento */}
              <button
                onClick={() => abrirNovoAgendamento()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  border: 'none',
                  borderRadius: 'var(--ws-radius-md)',
                  background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'opacity 150ms ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                <Plus size={14} />
                Novo Agendamento
              </button>
            </div>
          </div>

          {/* Conteúdo do calendário */}
          <div
            style={{
              position: 'relative',
              background: 'var(--ws-glass-bg)',
              border: '1px solid var(--ws-glass-border)',
              borderTop: 'none',
              borderRadius: '0 0 var(--ws-radius-lg) var(--ws-radius-lg)',
              backdropFilter: 'blur(16px)',
              boxShadow: 'var(--ws-glass-shadow)',
              minHeight: 480,
              overflow: 'hidden',
            }}
          >
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
              />
            )}
          </div>
        </div>
      </div>
      )}

      {/* ── Overlay + Modais deslizantes ── */}

      {/* Overlay */}
      {(modalAgendamentoAberto || modalAgendaAberto) && (
        <div
          onClick={() => {
            fecharModalAgendamento()
            fecharModalAgenda()
          }}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(2px)',
            zIndex: 40,
          }}
        />
      )}

      {/* Modal de Agendamento */}
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

      {/* Modal de Agenda */}
      <ModalAgenda
        aberto={modalAgendaAberto}
        agendaInicial={agendaEditando}
        onSalvar={salvarAgenda}
        onFechar={fecharModalAgenda}
      />
    </div>
  )
}
