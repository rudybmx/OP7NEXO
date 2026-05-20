// Status armazenado no banco
export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'blocked'

// Status derivado (calculado em runtime, não armazenado)
export type TaskStatusDerived = TaskStatus | 'atrasado' | 'em_risco'

export type TaskPriority = 'alta' | 'media' | 'baixa'

export type TaskPhase = 'diagnostico' | 'identidade' | 'conteudo' | 'midia-paga' | 'analise'

export type TaskCategory =
  | 'MIDIA_PAGA' | 'CONTEUDO' | 'SEO' | 'EVENTO'
  | 'REUNIAO' | 'EMAIL_MARKETING' | 'SOCIAL' | 'OUTRO'

export interface PmpTask {
  id: string
  phase: TaskPhase
  phaseOrder: number
  title: string
  assignee: string
  assigneeInitials: string
  startDate: string
  endDate: string
  status: TaskStatus
  statusDerived: TaskStatusDerived
  priority: TaskPriority
  progress: number
  description?: string
  deliverables?: string[]
  tags?: string[]
  color?: string
  completedAt?: string
  blockedReason?: string
  category?: TaskCategory
  responsibleEmail?: string
}

export interface PmpPhase {
  id: string
  name: string
  order: number
  tasks: PmpTask[]
  color: string
}

export interface PmpVersion {
  id: string
  version: string
  createdAt: string
  createdBy: string
  changesSummary: string
}

export interface PmpPlan {
  id: string
  clientId: string
  clientName: string
  version: string
  title: string
  startDate: string
  endDate: string
  status: TaskStatus
  createdAt: string
  updatedAt: string
  createdBy: string
  phases: PmpPhase[]
  versions: PmpVersion[]
}

// Helpers

export function calcularStatusDerived(task: Pick<PmpTask, 'status' | 'endDate'>): TaskStatusDerived {
  if (task.status === 'done' || task.status === 'blocked') return task.status
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const fim = new Date(task.endDate)
  const diasRestantes = Math.ceil((fim.getTime() - hoje.getTime()) / 86400000)
  if (diasRestantes < 0) return 'atrasado'
  if (diasRestantes <= 3) return 'em_risco'
  return task.status
}

export const FASES_LABELS: Record<TaskPhase, string> = {
  diagnostico: 'Diagnóstico e Estratégia',
  identidade: 'Identidade e Posicionamento',
  conteudo: 'Criação de Conteúdo',
  'midia-paga': 'Mídia Paga',
  analise: 'Análise e Otimização',
}

export const CATEGORIAS_LABELS: Record<TaskCategory, string> = {
  MIDIA_PAGA: 'Mídia Paga',
  CONTEUDO: 'Conteúdo',
  SEO: 'SEO',
  EVENTO: 'Evento',
  REUNIAO: 'Reunião',
  EMAIL_MARKETING: 'E-mail Marketing',
  SOCIAL: 'Social',
  OUTRO: 'Outro',
}
