'use client'

import { BarChart3, Loader2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDateBR } from '@/lib/gantt-utils'

interface MatrizHeaderProps {
  clients: { id: string; name: string }[]
  selectedClientId: string
  onClientChange: (id: string) => void
  years: number[]
  selectedYear: number
  onYearChange: (year: number) => void
  selectedMonth: number
  onMonthChange: (month: number) => void
  isEditing: boolean
  onEditToggle: () => void
  updatedAt: string
  updatedBy: string
}

export default function MatrizHeader({
  clients,
  selectedClientId,
  onClientChange,
  years,
  selectedYear,
  onYearChange,
  selectedMonth,
  onMonthChange,
  isEditing,
  onEditToggle,
  updatedAt,
  updatedBy,
}: MatrizHeaderProps) {
  return (
    <header
      className="flex flex-wrap items-start justify-between gap-4 p-5"
      style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 14,
        backdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)',
      }}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-xl bg-muted/40 text-foreground">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold text-foreground">Matriz de Investimento</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <span>{`Atualizado em ${formatDateBR(updatedAt)} por ${updatedBy}`}</span>
            <Badge className="rounded-full border border-[var(--ws-gold)]/30 bg-[var(--ws-gold)]/10 px-2 py-0.5 text-[11px] font-medium text-[#92722a]">
              {selectedYear}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Select value={selectedClientId} onValueChange={onClientChange}>
          <SelectTrigger className="h-10 min-w-64 text-foreground" style={{ background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)' }}>
            <SelectValue placeholder="Selecionar cliente" />
          </SelectTrigger>
          <SelectContent style={{ background: 'var(--ws-glass-bg)', borderColor: 'var(--ws-glass-border)', backdropFilter: 'blur(16px)' }}>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(selectedMonth)} onValueChange={(value) => onMonthChange(Number(value))}>
          <SelectTrigger className="h-10 min-w-32 text-foreground" style={{ background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)' }}>
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent style={{ background: 'var(--ws-glass-bg)', borderColor: 'var(--ws-glass-border)', backdropFilter: 'blur(16px)' }}>
            {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(selectedYear)} onValueChange={(value) => onYearChange(Number(value))}>
          <SelectTrigger className="h-10 min-w-28 text-foreground" style={{ background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)' }}>
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent style={{ background: 'var(--ws-glass-bg)', borderColor: 'var(--ws-glass-border)', backdropFilter: 'blur(16px)' }}>
            {years.map((year) => (
              <SelectItem key={year} value={String(year)}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          onClick={onEditToggle}
          className={`h-10 ${isEditing ? 'text-[#92722a]' : 'text-foreground'} hover:bg-muted/30`}
          style={{ border: '1px solid var(--ws-glass-border-strong)' }}
        >
          {isEditing ? <Loader2 className="h-4 w-4 animate-pulse" /> : <Pencil className="h-4 w-4" />}
          {isEditing ? 'Editando...' : 'Editar Matriz'}
        </Button>
      </div>
    </header>
  )
}
