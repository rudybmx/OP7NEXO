'use client'

import useSWR from 'swr'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'

interface MetaGraficoData {
  data: string
  investimento: number
  leads: number
  impressoes: number
  cliques: number
}

interface UseMetaGraficoReturn {
  dados: MetaGraficoData[]
  isLoading: boolean
  error: any
}

function mesAtual(): { inicio: string; fim: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return { inicio: `${y}-${m}-01`, fim: `${y}-${m}-${d}` }
}

export function useMetaGrafico(): UseMetaGraficoReturn {
  const { workspaceAtivo } = useWorkspace()
  const wsId = workspaceAtivo ?? undefined
  const { inicio, fim } = mesAtual()

  const { data: raw, isLoading, error } = useSWR(
    wsId ? `/meta/insights/visao-geral?workspace_id=${wsId}&data_inicio=${inicio}&data_fim=${fim}` : null,
    () =>
      api.get<any>(
        `/meta/insights/visao-geral?workspace_id=${wsId}&data_inicio=${inicio}&data_fim=${fim}`
      ),
    { revalidateOnFocus: false }
  )

  const dados: MetaGraficoData[] = (raw?.dados_diarios ?? []).map((d: any) => ({
    data: d.data,
    investimento: d.spend,
    leads: d.leads,
    impressoes: d.impressions ?? 0,
    cliques: d.clicks ?? 0,
  }))

  return { dados, isLoading: !wsId || isLoading, error }
}
