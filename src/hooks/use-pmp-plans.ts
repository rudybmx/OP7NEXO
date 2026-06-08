'use client'

import { useCallback, useEffect, useState } from 'react'
import api from '@/lib/api-client'

export interface PmpPlanApi {
  id: string
  workspace_id: string
  client_name: string
  title: string
  version: string
  start_date: string
  end_date: string
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
  unidade_id: string | null
  created_at: string
  updated_at: string
}

export interface PlanEditBody {
  client_name?: string
  title?: string
  start_date?: string
  end_date?: string
  unidade_id?: string | null
}

export function usePmpPlans(workspaceId: string | null) {
  const [plans, setPlans] = useState<PmpPlanApi[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!workspaceId) return
    setIsLoading(true)
    try {
      const data = await api.get<PmpPlanApi[]>(`/pmp/plans?workspace_id=${workspaceId}`)
      setPlans(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar planos')
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void fetch()
  }, [fetch])

  async function criarPlano(body: {
    client_name: string
    title: string
    start_date: string
    end_date: string
    unidade_id?: string | null
  }) {
    if (!workspaceId) return
    const plan = await api.post<PmpPlanApi>('/pmp/plans', { ...body, workspace_id: workspaceId })
    setPlans((prev) => [plan, ...prev])
    return plan
  }

  async function atualizarPlano(id: string, body: PlanEditBody) {
    const updated = await api.patch<PmpPlanApi>(`/pmp/plans/${id}`, body)
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)))
    return updated
  }

  async function excluirPlano(id: string) {
    await api.delete(`/pmp/plans/${id}`)
    setPlans((prev) => prev.filter((p) => p.id !== id))
  }

  async function duplicarPlano(id: string) {
    const novo = await api.post<PmpPlanApi>(`/pmp/plans/${id}/duplicate`)
    setPlans((prev) => [novo, ...prev])
    return novo
  }

  return { plans, isLoading, error, refetch: fetch, criarPlano, atualizarPlano, excluirPlano, duplicarPlano }
}
