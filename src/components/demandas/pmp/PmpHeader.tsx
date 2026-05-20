'use client'

import { FileText, GitBranch, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatDateBR, getStatusColor, getStatusLabel } from '@/lib/gantt-utils'
import type { TaskStatusDerived } from '@/types/pmp'

interface PmpHeaderProps {
  clients: { id: string; name: string }[]
  selectedClientId: string
  selectedVersion: string
  updatedAt: string
  planStatus: TaskStatusDerived
  onClientChange: (id: string) => void
  years: number[]
  selectedYear: number
  onYearChange: (year: number) => void
  selectedMonth: number
  onMonthChange: (month: number) => void
  onNewVersion: () => void
  onNovaTarefa?: () => void
  onNovoPlano?: () => void
}

export default function PmpHeader({
  clients,
  selectedClientId,
  selectedVersion,
  updatedAt,
  planStatus,
  onClientChange,
  years,
  selectedYear,
  onYearChange,
  selectedMonth,
  onMonthChange,
  onNewVersion,
  onNovaTarefa,
  onNovoPlano,
}: PmpHeaderProps) {
  const statusColor = getStatusColor(planStatus)

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
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold text-foreground">Plano de Marketing Personalizado</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <span>{`v${selectedVersion} • Atualizado em ${formatDateBR(updatedAt)}`}</span>
            <Badge
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                statusColor.bg,
                statusColor.text,
                statusColor.border
              )}
            >
              {getStatusLabel(planStatus)}
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

        {onNovoPlano && (
          <Button
            type="button"
            variant="outline"
            onClick={onNovoPlano}
            className="h-10 text-foreground hover:bg-muted/30"
            style={{ border: '1px solid var(--ws-glass-border-strong)' }}
          >
            <Plus className="h-4 w-4" />
            Novo Plano
          </Button>
        )}

        {onNovaTarefa && (
          <Button
            type="button"
            onClick={onNovaTarefa}
            className="h-10 border-[var(--ws-gold)] bg-[var(--ws-gold)] text-white hover:bg-[#b8943d]"
          >
            <Plus className="h-4 w-4" />
            Nova Tarefa
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={onNewVersion}
          className="h-10 text-foreground hover:bg-muted/30"
          style={{ border: '1px solid var(--ws-glass-border-strong)' }}
        >
          <GitBranch className="h-4 w-4" />
          Linha do Tempo
        </Button>
      </div>
    </header>
  )
}
