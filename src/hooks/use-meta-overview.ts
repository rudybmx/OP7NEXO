'use client'

import useSWR from 'swr'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'
import { SWR_OPTS } from '@/lib/swr'

interface MetaOverview {
  kpis: {
    spend: number
    leads: number
    impressions: number
    reach: number
    clicks: number
    ctr: number
    cpc: number
    cpm: number
    cpl: number
  }
  financeiro: {
    saldo: number
    limite: number
    formaPagamento: string
    nomeBm: string
  }
  isLoading: boolean
  error: any
  hasData: boolean
}

function mesAtual(): { inicio: string; fim: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return { inicio: `${y}-${m}-01`, fim: `${y}-${m}-${d}` }
}

export function useMetaOverview(): MetaOverview {
  const { workspaceAtivo } = useWorkspace()
  const wsId = workspaceAtivo ?? undefined
  const { inicio, fim } = mesAtual()

  const { data: raw, isLoading, error } = useSWR(
    wsId ? `/meta/insights/visao-geral?workspace_id=${wsId}&data_inicio=${inicio}&data_fim=${fim}` : null,
    () =>
      api.get<any>(
        `/meta/insights/visao-geral?workspace_id=${wsId}&data_inicio=${inicio}&data_fim=${fim}`
      ),
    SWR_OPTS,
  )

  const kpis = raw?.kpis ?? {
    spend: 0,
    leads: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    ctr: 0,
    cpc: 0,
    cpm: 0,
    cpl: 0,
  }

  const totalSaldo = (raw?.contas ?? []).reduce(
    (acc: number, c: any) => acc + (c.saldo ?? 0),
    0
  )

  return {
    kpis,
    financeiro: { saldo: totalSaldo, limite: 0, formaPagamento: '-', nomeBm: '-' },
    isLoading: !wsId || isLoading,
    error,
    hasData: raw != null,
  }
}
