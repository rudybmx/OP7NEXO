'use client'

import { useState, useEffect } from 'react'
import api from '@/lib/api-client'
import { Grid3X3, Briefcase, ChevronDown, Check } from 'lucide-react'
import { format, parseISO, startOfDay, endOfDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'
import { GoogleDateRangePicker } from '@/components/ui/google-date-range-picker'
import type { DateRange } from '@/components/ui/google-date-range-picker'
import type { FiltrosMeta, TipoComparativo } from '@/types/meta-ads'

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

export function FiltrosMeta({ workspaceId, filtros, onChange, ultimaAtualizacao }: FiltrosMetaProps) {
  const [agrupamentoAberto, setAgrupamentoAberto] = useState(false)
  const [contaAberta, setContaAberta] = useState(false)
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

  const contasSelecionadas = filtros.contaIds.length === 0
    ? contasReais
    : contasReais.filter(c => filtros.contaIds.includes(c.account_id))

  const toggleConta = (id: string) => {
    const novos = filtros.contaIds.includes(id)
      ? filtros.contaIds.filter((i) => i !== id)
      : [...filtros.contaIds, id]
    onChange({ ...filtros, contaIds: novos })
  }

  const selecionarTodas = () => {
    onChange({ ...filtros, contaIds: [] })
  }

  // Ponte string yyyy-MM-dd <-> Date para o GoogleDateRangePicker
  const dateRangeValue: DateRange = {
    start: startOfDay(parseISO(filtros.dataInicio + 'T12:00:00')),
    end: endOfDay(parseISO(filtros.dataFim + 'T12:00:00')),
  }

  const handleDateRangeChange = (range: DateRange) => {
    onChange({
      ...filtros,
      dataInicio: format(range.start, 'yyyy-MM-dd'),
      dataFim: format(range.end, 'yyyy-MM-dd'),
    })
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

        {/* Date range picker — componente padrão (mesmo do Google Ads) */}
        <div style={{ marginLeft: 'auto' }}>
          <GoogleDateRangePicker
            value={dateRangeValue}
            onChange={handleDateRangeChange}
          />
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
