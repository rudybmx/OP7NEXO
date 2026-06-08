export type Canal = 'meta' | 'google' | 'tiktok' | 'linkedin'

export interface MonthValue {
  month: number
  aprovado: number
  realizado: number
}

export interface CanalRow {
  canal: Canal
  label: string
  color: string
  sem_integracao?: boolean
  months: MonthValue[]
}

export interface MatrizPlan {
  id: string
  clientId: string
  clientName: string
  year: number
  rows: CanalRow[]
  updatedAt: string
  updatedBy: string
}

export interface MatrizDraft {
  rows: CanalRow[]
  isDirty: boolean
}

export interface CanalMetrics {
  canal: Canal
  totalAprovado: number
  totalRealizado: number
  percentualDoTotal: number
  variacaoMoM: number
  execucao: number
}

export interface MonthMetrics {
  month: number
  totalAprovado: number
  totalRealizado: number
  execucao: number
}
