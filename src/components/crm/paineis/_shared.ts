import type { Prioridade } from '@/types/kanban'

/** Classes Tailwind por prioridade (funcionam em light e dark). */
export const PRIORIDADE_CONFIG: Record<
  Prioridade,
  { label: string; classe: string; dot: string }
> = {
  baixa: { label: 'Baixa', classe: 'bg-muted/60 text-muted-foreground', dot: 'bg-muted-foreground' },
  media: { label: 'Média', classe: 'bg-amber-500/12 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  alta: { label: 'Alta', classe: 'bg-orange-500/12 text-orange-600 dark:text-orange-400', dot: 'bg-orange-500' },
  urgente: { label: 'Urgente', classe: 'bg-destructive/12 text-destructive', dot: 'bg-destructive' },
}

export const PRIORIDADES: Prioridade[] = ['baixa', 'media', 'alta', 'urgente']

export function isVencido(iso?: string): boolean {
  if (!iso) return false
  return new Date(iso + 'T23:59:59') < new Date()
}

export function formatarDataCurta(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export function formatarData(iso?: string): string {
  if (!iso) return ''
  return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Paleta de cores para fases novas. */
export const CORES_FASE = ['#64748b', '#006EFF', '#f59e0b', '#a855f7', '#16a34a', '#ef4444', '#06b6d4']
