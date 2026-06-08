import { CANAL_CONFIG } from '@/lib/matriz-utils'
import type { Canal, CanalRow, MatrizPlan, MonthValue } from '@/types/matriz'

const CLIENTS: {
  id: string
  name: string
  updatedAt: string
  updatedBy: string
  values: Record<Canal, readonly number[]>
}[] = []

const PERFORMANCE_FACTORS: Record<Canal, number[]> = {
  meta: [0.97, 1.12, 0.99, 0.94],
  google: [0.91, 1.04, 0.88, 1.02],
  tiktok: [0.82, 0.76, 0.68, 0],
  linkedin: [0.95, 0.87, 1.03, 0.9],
}

function buildMonths(canal: Canal, approvedValues: readonly number[]): MonthValue[] {
  return approvedValues.map((aprovado, index) => {
    const month = index + 1
    const realizedFactor = PERFORMANCE_FACTORS[canal][index]
    const realizado = month > 4 ? 0 : Math.round(aprovado * realizedFactor / 10) * 10

    return {
      month,
      aprovado,
      realizado,
    }
  })
}

function buildRow(canal: Canal, approvedValues: readonly number[]): CanalRow {
  return {
    canal,
    label: CANAL_CONFIG[canal].label,
    color: CANAL_CONFIG[canal].color,
    months: buildMonths(canal, approvedValues),
  }
}

export const matrizPlans: MatrizPlan[] = CLIENTS.map((client) => ({
  id: `matriz-${client.id}-2025`,
  clientId: client.id,
  clientName: client.name,
  year: 2025,
  rows: [
    buildRow('meta', client.values.meta),
    buildRow('google', client.values.google),
    buildRow('tiktok', client.values.tiktok),
    buildRow('linkedin', client.values.linkedin),
  ],
  updatedAt: client.updatedAt,
  updatedBy: client.updatedBy,
}))

export const matrizClients = matrizPlans.map((plan) => ({
  id: plan.clientId,
  name: plan.clientName,
}))

export const matrizYears = [2026]
