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

/** Timestamp completo (data + hora) — para a timeline de comentários. */
export function formatarDataHora(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Telefone BR para exibição: +55 (11) 99999-9999 quando possível. */
export function formatarTelefone(tel?: string | null): string {
  if (!tel) return ''
  const d = tel.replace(/\D/g, '')
  const n = d.startsWith('55') ? d.slice(2) : d
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  return tel
}

/** Paleta de cores para fases novas. */
export const CORES_FASE = ['#64748b', '#006EFF', '#f59e0b', '#a855f7', '#16a34a', '#ef4444', '#06b6d4']
