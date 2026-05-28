'use client'

import { useState, useEffect } from 'react'
import api from '@/lib/api-client'
import { Grid3X3, Briefcase, ChevronDown, CalendarDays, Check } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'
import {
  DateRangePickerRefinado,
  buildDateRangeShortcuts,
  type DateRangeShortcut,
} from '@/components/ui/date-range-picker-refinado'
import type { FiltrosMeta, TipoComparativo } from '@/types/meta-ads'
import type { DateRange } from 'react-day-picker'

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
  plataforma?: string
  sincronizado_em?: string | null
}

interface FiltrosMetaProps {
  workspaceId: string | null
  filtros: FiltrosMeta
  onChange: (filtros: FiltrosMeta) => void
  onSyncVersionChange?: (syncVersion: string | null) => void
}

// Removido CalendarioMes antigo em favor do shadcn Calendar

export function FiltrosMeta({ workspaceId, filtros, onChange, onSyncVersionChange }: FiltrosMetaProps) {
  const [agrupamentoAberto, setAgrupamentoAberto] = useState(false)
  const [contaAberta, setContaAberta] = useState(false)
  const [dataAberta, setDataAberta] = useState(false)
  const [atalhoAtivo, setAtalhoAtivo] = useState<string | null>('este-mes')
  const [dataInicioInput, setDataInicioInput] = useState(filtros.dataInicio)
  const [dataFimInput, setDataFimInput] = useState(filtros.dataFim)
  const [contasReais, setContasReais] = useState<ContaReal[]>([])
  const [contasCarregadas, setContasCarregadas] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const hoje = new Date()
  const hojeIso = format(hoje, 'yyyy-MM-dd')
  const atalhos = buildDateRangeShortcuts(hoje, { maxDate: hoje })

  useEffect(() => {
    const handleRefresh = () => setRefreshTick((valor) => valor + 1)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleRefresh()
      }
    }

    window.addEventListener('focus', handleRefresh)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('focus', handleRefresh)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  useEffect(() => {
    let ativo = true
    setContasReais([])
    setContasCarregadas(false)

    async function loadContas() {
      try {
        if (!workspaceId) {
          if (ativo) {
            setContasReais([])
            setContasCarregadas(true)
          }
          return
        }
        const contas = await api.get<ContaReal[]>(`/workspaces/${workspaceId}/ads-accounts`)
        if (!ativo) return
        setContasReais(contas.filter(c => c.plataforma === 'meta' || !('plataforma' in c)))
      } catch {
        // silencioso — continua com lista vazia
      } finally {
        if (ativo) setContasCarregadas(true)
      }
    }

    loadContas()

    return () => {
      ativo = false
    }
  }, [workspaceId, refreshTick])

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

  const ultimaAtualizacaoIso = contasCarregadas
    ? contasSelecionadas
        .map(conta => conta.sincronizado_em)
        .filter((valor): valor is string => Boolean(valor))
        .reduce<string | null>((maisRecente, valorAtual) => {
          const atualTimestamp = Date.parse(valorAtual)
          if (!Number.isFinite(atualTimestamp)) {
            return maisRecente
          }
          if (!maisRecente) {
            return valorAtual
          }
          const melhorTimestamp = Date.parse(maisRecente)
          if (!Number.isFinite(melhorTimestamp) || atualTimestamp > melhorTimestamp) {
            return valorAtual
          }
          return maisRecente
        }, null)
    : null

  const ultimaAtualizacaoLabel = ultimaAtualizacaoIso
    ? format(parseISO(ultimaAtualizacaoIso), 'dd/MM/yyyy HH:mm', { locale: ptBR })
    : null

  useEffect(() => {
    onSyncVersionChange?.(ultimaAtualizacaoIso)
  }, [ultimaAtualizacaoIso, onSyncVersionChange])

  const formatarIntervalo = () => {
    const inicio = format(parseISO(filtros.dataInicio + 'T12:00:00'), "dd 'de' MMM", { locale: ptBR })
    const fim = format(parseISO(filtros.dataFim + 'T12:00:00'), "dd 'de' MMM", { locale: ptBR })
    return `${inicio} — ${fim}`
  }

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

  const handleShortcutSelect = (shortcut: DateRangeShortcut) => {
    setAtalhoAtivo(shortcut.id)

    if (shortcut.id === 'personalizado') {
      return
    }

    if (shortcut.range?.from) setDataInicioInput(format(shortcut.range.from, 'yyyy-MM-dd'))
    else setDataInicioInput('')

    if (shortcut.range?.to) setDataFimInput(format(shortcut.range.to, 'yyyy-MM-dd'))
    else setDataFimInput('')
  }

  const handleFiltrar = () => {
    if (!dataInicioInput || !dataFimInput) return

    const dataInicioNormalizada = dataInicioInput > hojeIso ? hojeIso : dataInicioInput
    const dataFimNormalizada = dataFimInput > hojeIso ? hojeIso : dataFimInput

    if (dataInicioNormalizada > dataFimNormalizada) return

    onChange({ ...filtros, dataInicio: dataInicioNormalizada, dataFim: dataFimNormalizada })
    setDataAberta(false)
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
              <span className="truncate max-w-[120px]">
                {filtros.contaIds.length === 0
                  ? 'Todas as contas'
                  : contasSelecionadas.length === 1
                    ? (contasSelecionadas[0].account_name || contasSelecionadas[0].account_id)
                    : `${contasSelecionadas.length} contas`}
              </span>
              <ChevronDown size={12} style={{ color: 'var(--ws-text-3)', marginLeft: 'auto' }} />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-1 bg-[rgba(255,255,255,0.97)] dark:bg-[rgba(20,28,56,0.97)] border-[1px] border-[rgba(14,20,42,0.10)] dark:border-[rgba(255,255,255,0.10)] rounded-[10px] shadow-[0_8px_32px_rgba(14,20,42,0.14),0_2px_8px_rgba(14,20,42,0.08)] backdrop-blur-[20px]" align="start">
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
        <div style={{
          marginLeft: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 4,
        }}>
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
            <PopoverContent
              style={{ fontFamily: 'var(--font-plus-jakarta-sans), ui-sans-serif, system-ui, sans-serif' }}
              className="w-[780px] max-w-[95vw] border-none bg-transparent p-0 shadow-none"
              align="end"
              sideOffset={8}
            >
              <DateRangePickerRefinado
                range={localRange}
                shortcuts={atalhos}
                selectedShortcutId={atalhoAtivo}
                onRangeChange={handleSelectRange}
                onShortcutSelect={handleShortcutSelect}
                onCancel={handleCancelar}
                onApply={handleFiltrar}
                maxDate={hoje}
                reverseMonths
                style={{ maxWidth: '100%' }}
              />
            </PopoverContent>
          </Popover>
          <span
            style={{
              fontSize: 11,
              lineHeight: 1.2,
              color: 'var(--ws-text-3)',
              whiteSpace: 'nowrap',
              maxWidth: 260,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textAlign: 'right',
            }}
          >
            {contasCarregadas
              ? `Última atualização: ${ultimaAtualizacaoLabel ?? 'Sem atualização ainda'}`
              : 'Última atualização: carregando...'}
          </span>
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
