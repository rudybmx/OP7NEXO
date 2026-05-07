import { CANAL_CONFIG } from '@/lib/matriz-utils'
import type { Canal, CanalRow, MatrizPlan, MonthValue } from '@/types/matriz'

const CLIENTS = [
  {
    id: 'vila-mariana',
    name: 'OdontoCompany - Vila Mariana',
    updatedAt: '2025-04-10',
    updatedBy: 'Fernanda Reis',
    values: {
      meta: [2500, 2500, 3000, 3000, 3500, 3500, 4000, 4000, 4500, 4500, 5000, 5500],
      google: [1500, 1500, 1800, 1800, 2000, 2000, 2200, 2500, 2500, 2800, 3000, 3500],
      tiktok: [500, 500, 600, 600, 700, 800, 800, 900, 900, 1000, 1200, 1500],
      linkedin: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
  },
  {
    id: 'tatuape',
    name: 'OdontoCompany - Tatuapé',
    updatedAt: '2025-04-09',
    updatedBy: 'Marcos Dutra',
    values: {
      meta: [3000, 3200, 3500, 3500, 3800, 4000, 4200, 4500, 4500, 5000, 5500, 6000],
      google: [2000, 2200, 2400, 2500, 2500, 2800, 3000, 3000, 3200, 3500, 3800, 4000],
      tiktok: [600, 600, 700, 800, 900, 1000, 1000, 1200, 1200, 1500, 1500, 1800],
      linkedin: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
  },
  {
    id: 'santana',
    name: 'OdontoCompany - Santana',
    updatedAt: '2025-04-08',
    updatedBy: 'Ana Lima',
    values: {
      meta: [2000, 2000, 2500, 2500, 2800, 3000, 3000, 3200, 3500, 3800, 4000, 4500],
      google: [1200, 1200, 1500, 1500, 1800, 1800, 2000, 2000, 2200, 2500, 2800, 3000],
      tiktok: [400, 400, 500, 500, 600, 700, 700, 800, 800, 900, 1000, 1200],
      linkedin: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
  },
  {
    id: 'pinheiros',
    name: 'OdontoCompany - Pinheiros',
    updatedAt: '2025-04-10',
    updatedBy: 'Juliana Park',
    values: {
      meta: [4000, 4200, 4500, 4800, 5000, 5000, 5500, 5800, 6000, 6500, 7000, 7500],
      google: [2500, 2500, 2800, 3000, 3200, 3500, 3500, 3800, 4000, 4200, 4500, 5000],
      tiktok: [800, 900, 1000, 1200, 1200, 1500, 1500, 1800, 2000, 2000, 2500, 3000],
      linkedin: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
  },
] as const

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
