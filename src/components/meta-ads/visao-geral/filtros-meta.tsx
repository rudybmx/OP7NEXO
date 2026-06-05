'use client'

import { useState, useEffect } from 'react'
import api from '@/lib/api-client'
import { Grid3X3, Briefcase, ChevronDown, CalendarDays, Check, LayoutDashboard } from 'lucide-react'
import { format, addMonths, subMonths, subDays, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, isWithinInterval, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'
import { Calendar } from '@/components/ui/calendar'
import type { FiltrosMeta, TipoComparativo } from '@/types/meta-ads'
import type { DateRange } from 'react-day-picker'

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const OPCOES_COMPARATIVO: { valor: TipoComparativo; label: string }[] = [
  { valor: 'periodo_anterior', label: 'Período ant.' },
  { valor: 'mes_anterior', label: 'Mês ant.' },
  { valor: 'ano_anterior', label: 'Ano ant.' },
  { valor: 'nenhum', label: 'Nenhum' },
]

interface ContaReal {
  id: string
  account_id: string
  account_name: string | null
  agrupamento: string | null
}

interface FiltrosMetaProps {
  workspaceId: string | null
  filtros: FiltrosMeta
  onChange: (filtros: FiltrosMeta) => void
  ultimaAtualizacao?: string | null
}

// Removido CalendarioMes antigo em favor do shadcn Calendar

export function FiltrosMeta({ workspaceId, filtros, onChange, ultimaAtualizacao }: FiltrosMetaProps) {
  const [agrupamentoAberto, setAgrupamentoAberto] = useState(false)
  const [contaAberta, setContaAberta] = useState(false)
  const [dataAberta, setDataAberta] = useState(false)
  const [atalhoAtivo, setAtalhoAtivo] = useState<string | null>('este-mes')
  const [dataInicioInput, setDataInicioInput] = useState(filtros.dataInicio)
  const [dataFimInput, setDataFimInput] = useState(filtros.dataFim)
  const [contasReais, setContasReais] = useState<ContaReal[]>([])

  useEffect(() => {
    async function loadContas() {
      try {
        if (!workspaceId) return
        const contas = await api.get<ContaReal[]>(`/workspaces/${workspaceId}/ads-accounts`)
        setContasReais(contas.filter(c => (c as any).plataforma === 'meta' || !('plataforma' in c)))
      } catch {
        // silencioso — continua com lista vazia
      }
    }
    loadContas()
  }, [workspaceId])

  const agrupamentosUnicos = Array.from(
    new Set(contasReais.map(c => c.agrupamento).filter(Boolean) as string[])
  )

  const handleDataAbertaChange = (open: boolean) => {
    setDataAberta(open)
    if (open) {
      setDataInicioInput(filtros.dataInicio)
      setDataFimInput(filtros.dataFim)
    }
  }

  const contasSelecionadas = filtros.contaIds.length === 0
    ? contasReais
    : contasReais.filter(c => filtros.contaIds.includes(c.account_id))

  const formatarIntervalo = () => {
    const inicio = format(parseISO(filtros.dataInicio + 'T12:00:00'), "dd 'de' MMM", { locale: ptBR })
    const fim = format(parseISO(filtros.dataFim + 'T12:00:00'), "dd 'de' MMM", { locale: ptBR })
    return `${inicio} — ${fim}`
  }

  const atalhos = [
    { id: 'ontem', label: 'Ontem', inicio: format(subDays(new Date(), 1), 'yyyy-MM-dd'), fim: format(subDays(new Date(), 1), 'yyyy-MM-dd') },
    { id: 'esta-semana', label: 'Esta semana', inicio: format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd'), fim: format(endOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd') },
    { id: 'semana-passada', label: 'Semana passada', inicio: format(startOfWeek(subDays(new Date(), 7), { weekStartsOn: 0 }), 'yyyy-MM-dd'), fim: format(endOfWeek(subDays(new Date(), 7), { weekStartsOn: 0 }), 'yyyy-MM-dd') },
    { id: 'este-mes', label: 'Este mês', inicio: format(startOfMonth(new Date()), 'yyyy-MM-dd'), fim: format(endOfMonth(new Date()), 'yyyy-MM-dd') },
    { id: 'mes-passado', label: 'Mês passado', inicio: format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd'), fim: format(endOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd') },
  ]

  const localRange: DateRange | undefined = dataInicioInput ? {
    from: parseISO(dataInicioInput + 'T12:00:00'),
    to: dataFimInput ? parseISO(dataFimInput + 'T12:00:00') : undefined,
  } : undefined

  const toggleConta = (id: string) => {
    const novos = filtros.contaIds.includes(id)
      ? filtros.contaIds.filter((i) => i !== id)
      : [...filtros.contaIds, id]
    onChange({ ...filtros, contaIds: novos })
  }

  const selecionarTodas = () => {
    onChange({ ...filtros, contaIds: [] })
  }

  const aplicarAtalho = (atalho: typeof atalhos[0]) => {
    setAtalhoAtivo(atalho.id)
    setDataInicioInput(atalho.inicio)
    setDataFimInput(atalho.fim)
  }

  const handleSelectRange = (range: DateRange | undefined) => {
    setAtalhoAtivo('personalizado')
    if (!range) {
      setDataInicioInput('')
      setDataFimInput('')
      return
    }
    if (range.from) setDataInicioInput(format(range.from, 'yyyy-MM-dd'))
    else setDataInicioInput('')
    
    if (range.to) setDataFimInput(format(range.to, 'yyyy-MM-dd'))
    else setDataFimInput('')
  }

  const handleFiltrar = () => {
    if (dataInicioInput && dataFimInput) {
      onChange({ ...filtros, dataInicio: dataInicioInput, dataFim: dataFimInput })
      setDataAberta(false)
    }
  }

  const handleCancelar = () => {
    setDataAberta(false)
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        marginBottom: 18,
        alignItems: 'center',
      }}>
        {/* Seletor de agrupamento */}
        <Popover open={agrupamentoAberto} onOpenChange={setAgrupamentoAberto}>
          <PopoverTrigger asChild>
            <button style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 32,
              padding: '0 10px',
              background: 'var(--ws-glass-bg)',
              border: '1px solid var(--ws-glass-border)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRadius: 'var(--ws-radius-md)',
              boxShadow: 'var(--ws-glass-shadow-sm)',
              fontSize: 12,
              color: 'var(--ws-text-1)',
              cursor: 'pointer',
              transition: 'var(--ws-transition)',
              whiteSpace: 'nowrap',
              outline: 'none',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--ws-glass-bg-hover)'
              e.currentTarget.style.borderColor = 'var(--ws-glass-border-strong)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--ws-glass-bg)'
              e.currentTarget.style.borderColor = 'var(--ws-glass-border)'
            }}>
              <Grid3X3 size={13} style={{ color: 'var(--ws-text-3)' }} />
              <span>{filtros.agrupamento || 'Todos os agrupamentos'}</span>
              <ChevronDown size={12} style={{ color: 'var(--ws-text-3)', marginLeft: 'auto' }} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-1 bg-[rgba(255,255,255,0.97)] dark:bg-[rgba(20,28,56,0.97)] border-[1px] border-[rgba(14,20,42,0.10)] dark:border-[rgba(255,255,255,0.10)] rounded-[10px] shadow-[0_8px_32px_rgba(14,20,42,0.14),0_2px_8px_rgba(14,20,42,0.08)] backdrop-blur-[20px]" align="start">
            <Command className="bg-transparent">
              <CommandInput placeholder="Buscar agrupamento..." className="h-8 text-[12px]" />
              <CommandList>
                <CommandEmpty className="py-2 text-[11px] text-center">Nenhum encontrado</CommandEmpty>
                <CommandGroup>
                  {['Todos os agrupamentos', ...agrupamentosUnicos].map((ag) => {
                    const isSelected = filtros.agrupamento === ag || (!filtros.agrupamento && ag === 'Todos os agrupamentos')
                    return (
                      <CommandItem
                        key={ag}
                        onSelect={() => {
                          if (ag === 'Todos os agrupamentos') {
                            onChange({ ...filtros, agrupamento: null, contaIds: [] })
                            setAgrupamentoAberto(false)
                            return
                          }
                          const contaIdsAgrupamento = contasReais
                            .filter(c => c.agrupamento === ag)
                            .map(c => c.account_id)
                          onChange({
                            ...filtros,
                            agrupamento: ag,
                            contaIds: contaIdsAgrupamento,
                          })
                          setAgrupamentoAberto(false)
                        }}
                        className={`text-[12px] rounded-[6px] px-[10px] py-[6px] cursor-pointer transition-colors ${isSelected ? 'bg-[rgba(62,91,255,0.06)] text-[#3E5BFF] font-medium' : 'text-[#0E142A] dark:text-[rgba(255,255,255,0.80)] hover:bg-[rgba(62,91,255,0.06)] dark:hover:bg-[rgba(62,91,255,0.15)] hover:text-[#3E5BFF]'}`}
                      >
                        <Check className={`mr-2 h-4 w-4 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                        {ag}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Seletor de conta */}
        <Popover open={contaAberta} onOpenChange={setContaAberta}>
          <PopoverTrigger asChild>
            <button style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 32,
              padding: '0 10px',
              background: 'var(--ws-glass-bg)',
              border: '1px solid var(--ws-glass-border)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRadius: 'var(--ws-radius-md)',
              boxShadow: 'var(--ws-glass-shadow-sm)',
              fontSize: 12,
              color: 'var(--ws-text-1)',
              cursor: 'pointer',
              transition: 'var(--ws-transition)',
              whiteSpace: 'nowrap',
              outline: 'none',
              minWidth: 200,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--ws-glass-bg-hover)'
              e.currentTarget.style.borderColor = 'var(--ws-glass-border-strong)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--ws-glass-bg)'
              e.currentTarget.style.borderColor = 'var(--ws-glass-border)'
            }}>
              <Briefcase size={13} style={{ color: 'var(--ws-text-3)' }} />
              {filtros.contaIds.length > 0 && (
                <span className="bg-[#3E5BFF] text-white text-[10px] font-bold px-[6px] py-[1px] rounded-[10px]">
                  {filtros.contaIds.length}
                </span>
              )}
              <span className="truncate max-w-[240px]">
                {filtros.contaIds.length === 0
                  ? 'Todas as contas'
                  : contasSelecionadas.length === 1
                    ? (contasSelecionadas[0].account_name || contasSelecionadas[0].account_id)
                    : `${contasSelecionadas.length} contas`}
              </span>
              <ChevronDown size={12} style={{ color: 'var(--ws-text-3)', marginLeft: 'auto' }} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[560px] p-1 bg-[rgba(255,255,255,0.97)] dark:bg-[rgba(20,28,56,0.97)] border-[1px] border-[rgba(14,20,42,0.10)] dark:border-[rgba(255,255,255,0.10)] rounded-[10px] shadow-[0_8px_32px_rgba(14,20,42,0.14),0_2px_8px_rgba(14,20,42,0.08)] backdrop-blur-[20px]" align="start">
            <Command className="bg-transparent">
              <CommandInput placeholder="Buscar conta..." className="h-8 text-[12px]" />
              <CommandList>
                <CommandEmpty className="py-2 text-[11px] text-center">Nenhuma encontrada</CommandEmpty>
                <CommandGroup>
                  <CommandItem onSelect={selecionarTodas} className={`text-[12px] rounded-[6px] px-[10px] py-[6px] cursor-pointer transition-colors ${filtros.contaIds.length === 0 ? 'bg-[rgba(62,91,255,0.06)] text-[#3E5BFF] font-medium' : 'text-[#0E142A] dark:text-[rgba(255,255,255,0.80)] hover:bg-[rgba(62,91,255,0.06)] dark:hover:bg-[rgba(62,91,255,0.15)] hover:text-[#3E5BFF]'}`}>
                    <Check className={`mr-2 h-4 w-4 ${filtros.contaIds.length === 0 ? 'opacity-100' : 'opacity-0'}`} />
                    <span>Todas as contas ({contasReais.length})</span>
                  </CommandItem>
                  {contasReais.map((conta) => {
                    const isSelected = filtros.contaIds.includes(conta.account_id)
                    return (
                      <CommandItem key={conta.account_id} onSelect={() => toggleConta(conta.account_id)} className={`text-[12px] rounded-[6px] px-[10px] py-[6px] cursor-pointer transition-colors ${isSelected ? 'bg-[rgba(62,91,255,0.06)] text-[#3E5BFF] font-medium' : 'text-[#0E142A] dark:text-[rgba(255,255,255,0.80)] hover:bg-[rgba(62,91,255,0.06)] dark:hover:bg-[rgba(62,91,255,0.15)] hover:text-[#3E5BFF]'}`}>
                        <Check className={`mr-2 h-4 w-4 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                        <div className="flex flex-col">
                          <span>{conta.account_name || conta.account_id}</span>
                          <span className="text-[10px] opacity-60 font-mono tracking-tight">{conta.account_id}</span>
                        </div>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Seletor de data */}
        {/* Seletor de data */}
        <div style={{ marginLeft: 'auto' }}>
          <Popover open={dataAberta} onOpenChange={handleDataAbertaChange}>
            <PopoverTrigger asChild>
              <button style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: 32,
                padding: '0 12px',
                background: 'var(--ws-glass-bg)',
                border: '1px solid var(--ws-glass-border)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                borderRadius: 'var(--ws-radius-md)',
                boxShadow: 'var(--ws-glass-shadow-sm)',
                fontSize: 12,
                color: 'var(--ws-text-1)',
                cursor: 'pointer',
                transition: 'var(--ws-transition)',
                whiteSpace: 'nowrap',
                outline: 'none',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--ws-glass-bg-hover)'
                e.currentTarget.style.borderColor = 'var(--ws-glass-border-strong)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--ws-glass-bg)'
                e.currentTarget.style.borderColor = 'var(--ws-glass-border)'
              }}>
                <CalendarDays size={13} style={{ color: 'var(--ws-text-3)' }} />
                <span>{filtros.dataInicio && filtros.dataFim ? formatarIntervalo() : 'Selecionar período'}</span>
                <ChevronDown size={12} style={{ color: 'var(--ws-text-3)' }} />
              </button>
            </PopoverTrigger>
            <PopoverContent style={{ fontFamily: 'var(--font-plus-jakarta-sans), ui-sans-serif, system-ui, sans-serif' }} className="w-[780px] max-w-[95vw] p-[20px] bg-[rgba(255,255,255,0.98)] dark:bg-[rgba(20,28,56,0.98)] border border-[rgba(14,20,42,0.10)] dark:border-[rgba(255,255,255,0.10)] rounded-[14px] shadow-[0_16px_48px_rgba(14,20,42,0.16)] backdrop-blur-[20px]" align="end" sideOffset={8}>
              <div className="grid grid-rows-[auto_1fr_auto] gap-[16px]">
                {/* ROW 1: Inputs */}
                <div className="grid grid-cols-2 gap-[16px]">
                  <div>
                    <div className="text-[11px] text-[#8892b0] mb-[6px]">Início do período</div>
                    <div className="h-[34px] rounded-[8px] border border-[rgba(14,20,42,0.12)] dark:border-[rgba(255,255,255,0.10)] bg-[rgba(14,20,42,0.03)] dark:bg-[rgba(255,255,255,0.06)] flex items-center justify-center text-[12px] font-medium text-[#0E142A] dark:text-white px-[12px]">
                      {dataInicioInput ? format(parseISO(dataInicioInput + 'T12:00:00'), 'dd/MM/yyyy') : '__/__/____'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[#8892b0] mb-[6px]">Fim do período</div>
                    <div className="h-[34px] rounded-[8px] border border-[rgba(14,20,42,0.12)] dark:border-[rgba(255,255,255,0.10)] bg-[rgba(14,20,42,0.03)] dark:bg-[rgba(255,255,255,0.06)] flex items-center justify-center text-[12px] font-medium text-[#0E142A] dark:text-white px-[12px]">
                      {dataFimInput ? format(parseISO(dataFimInput + 'T12:00:00'), 'dd/MM/yyyy') : '__/__/____'}
                    </div>
                  </div>
                </div>

                {/* ROW 2: Calendars and Shortcuts */}
                <div className="grid grid-cols-[1fr_180px] gap-[24px]">
                  <div className="flex justify-center">
                    <Calendar
                      initialFocus
                      mode="range"
                      selected={localRange}
                      onSelect={handleSelectRange}
                      numberOfMonths={2}
                      locale={ptBR}
                      className="p-0 border-none relative w-full flex justify-center"
                      classNames={{
                        months: "flex flex-row gap-[24px]",
                        month: "flex flex-col gap-[8px]",
                        month_caption: "flex justify-center h-7 relative items-center",
                        caption_label: "text-[11px] font-semibold tracking-tight",
                        nav: "flex items-center gap-1",
                        button_previous: "absolute left-0 top-0 h-7 w-7 flex items-center justify-center bg-transparent p-0 opacity-50 hover:opacity-100 cursor-pointer transition-opacity z-10 [&_svg]:pointer-events-none [&_svg]:w-3 [&_svg]:h-3",
                        button_next: "absolute right-0 top-0 h-7 w-7 flex items-center justify-center bg-transparent p-0 opacity-50 hover:opacity-100 cursor-pointer transition-opacity z-10 [&_svg]:pointer-events-none [&_svg]:w-3 [&_svg]:h-3",
                        month_grid: "w-full border-collapse",
                        weekdays: "flex",
                        weekday: "w-[32px] font-normal text-[9px] mb-1 flex items-center justify-center capitalize opacity-50",
                        week: "flex w-full mt-[2px] justify-between",
                        day: "p-0 text-center flex items-center justify-center",
                        day_button: "h-[28px] w-[28px] p-0 font-normal text-[11px] transition-colors hover:bg-[rgba(62,91,255,0.08)] rounded-[5px] flex items-center justify-center cursor-pointer",
                        selected: "!bg-[#3E5BFF] !text-white !font-medium !rounded-[5px]",
                        today: "border border-[rgba(62,91,255,0.40)] text-[#3E5BFF] rounded-[5px]",
                        outside: "opacity-20 pointer-events-none",
                        range_middle: "!bg-[rgba(62,91,255,0.08)] !text-[#3E5BFF] !rounded-none",
                        range_start: "!bg-[#3E5BFF] !text-white !rounded-r-none !rounded-l-[5px]",
                        range_end: "!bg-[#3E5BFF] !text-white !rounded-l-none !rounded-r-[5px]",
                      }}
                    />
                  </div>
                  
                  {/* Shortcuts */}
                  <div className="flex flex-col gap-[2px] pl-[24px] border-l border-[rgba(14,20,42,0.06)] dark:border-[rgba(255,255,255,0.06)]">
                    {[...atalhos, { id: 'personalizado', label: 'Período customizado' }].map((at) => {
                      const isActive = atalhoAtivo === at.id
                      return (
                        <button
                          key={at.id}
                          onClick={() => at.id === 'personalizado' ? setAtalhoAtivo('personalizado') : aplicarAtalho(at as typeof atalhos[0])}
                          className={`
                            w-full text-left px-[10px] py-[6px] rounded-[8px] text-[12px] transition-all duration-150 outline-none cursor-pointer
                            ${isActive 
                              ? 'bg-[rgba(62,91,255,0.08)] text-[#3E5BFF] dark:text-white font-medium' 
                              : 'text-[#4a5580] dark:text-[rgba(255,255,255,0.60)] bg-transparent hover:bg-[rgba(62,91,255,0.06)] hover:text-[#3E5BFF] dark:hover:text-white'
                            }
                          `}
                        >
                          {at.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* ROW 3: Buttons */}
                <div className="flex justify-end gap-[8px] border-t border-[rgba(14,20,42,0.06)] dark:border-[rgba(255,255,255,0.06)] pt-[16px]">
                  <button onClick={handleCancelar} className="h-[32px] px-[16px] bg-transparent border border-[rgba(14,20,42,0.12)] dark:border-[rgba(255,255,255,0.12)] rounded-[8px] text-[12px] text-[#4a5580] dark:text-[rgba(255,255,255,0.70)] hover:border-[rgba(14,20,42,0.25)] dark:hover:border-[rgba(255,255,255,0.25)] hover:text-[#0E142A] dark:hover:text-white transition-all outline-none cursor-pointer">
                    Cancelar
                  </button>
                  <button onClick={handleFiltrar} className="h-[32px] px-[20px] bg-linear-to-br from-[#3E5BFF] to-[#7A5AF8] border-none rounded-[8px] text-[12px] font-medium text-white shadow-[0_4px_12px_rgba(62,91,255,0.35)] hover:shadow-[0_6px_20px_rgba(62,91,255,0.45)] transition-all outline-none cursor-pointer">
                    Filtrar
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          {ultimaAtualizacao && (
            <div style={{ fontSize: 10, color: 'var(--ws-text-3)', marginTop: 4, textAlign: 'right', whiteSpace: 'nowrap' }}>
              Atualizado em {format(parseISO(ultimaAtualizacao), "dd/MM/yyyy, HH:mm", { locale: ptBR })}
            </div>
          )}
        </div>
      </div>

      {/* Comparison period selector */}
      <div className="flex items-center gap-[4px] text-[11px] text-[#4a5580] dark:text-[rgba(255,255,255,0.55)] mb-[16px]">
        <span>Comparar com:</span>
        {OPCOES_COMPARATIVO.map((op) => (
          <button
            key={op.valor}
            onClick={() => onChange({ ...filtros, comparativo: op.valor })}
            className={`
              px-[8px] py-[2px] rounded-[10px] border-[0.5px] cursor-pointer transition-all duration-150 font-inherit
              ${filtros.comparativo === op.valor 
                ? 'bg-[#0E142A] dark:bg-[rgba(255,255,255,0.15)] text-white border-transparent shadow-sm' 
                : 'bg-transparent text-[#4a5580] dark:text-[rgba(255,255,255,0.45)] border-[rgba(14,20,42,0.10)] dark:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(62,91,255,0.05)] hover:text-[#3E5BFF]'
              }
            `}
          >
            {op.label}
          </button>
        ))}
      </div>
    </div>
  )
}
