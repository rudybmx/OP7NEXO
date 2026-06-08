'use client'

import { useCallback, useEffect, useState } from 'react'
import api from '@/lib/api-client'
import { CANAL_CONFIG } from '@/lib/matriz-utils'
import type { Canal, CanalRow, MatrizPlan } from '@/types/matriz'

interface MesValorApi {
  mes: number
  aprovado: number
  realizado: number
}

interface CanalApi {
  canal: string
  label: string
  sem_integracao: boolean
  meses: MesValorApi[]
}

interface MatrizApiResponse {
  workspace_id: string
  year: number
  updated_at: string | null
  updated_by: string | null
  canais: CanalApi[]
}

function apiToPlan(data: MatrizApiResponse, workspaceName: string): MatrizPlan {
  return {
    id: `${data.workspace_id}-${data.year}`,
    clientId: data.workspace_id,
    clientName: workspaceName,
    year: data.year,
    rows: data.canais.map((c): CanalRow => ({
      canal: c.canal as Canal,
      label: c.label,
      color: CANAL_CONFIG[c.canal as Canal]?.color ?? '#888888',
      sem_integracao: c.sem_integracao,
      months: c.meses.map((m) => ({
        month: m.mes,
        aprovado: m.aprovado,
        realizado: m.realizado,
      })),
    })),
    updatedAt: data.updated_at ?? '',
    updatedBy: data.updated_by ?? '',
  }
}

export function useMatrizInvestimento(
  workspaceId: string | null,
  workspaceName: string,
  year: number,
) {
  const [plan, setPlan] = useState<MatrizPlan | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!workspaceId) return
    setIsLoading(true)
    try {
      const data = await api.get<MatrizApiResponse>(
        `/workspaces/${workspaceId}/matriz-investimento?year=${year}`,
      )
      setPlan(apiToPlan(data, workspaceName))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar matriz')
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId, workspaceName, year])

  useEffect(() => {
    void fetch()
  }, [fetch])

  async function salvar(rows: CanalRow[]) {
    if (!workspaceId) return
    setIsSaving(true)
    try {
      const canais = rows.map((row) => ({
        canal: row.canal,
        meses: row.months.map((m) => ({ mes: m.month, aprovado: m.aprovado })),
      }))
      const data = await api.put<MatrizApiResponse>(
        `/workspaces/${workspaceId}/matriz-investimento`,
        { year, canais },
      )
      setPlan(apiToPlan(data, workspaceName))
      setError(null)
    } finally {
      setIsSaving(false)
    }
  }

  return { plan, isLoading, isSaving, error, refetch: fetch, salvar }
}
