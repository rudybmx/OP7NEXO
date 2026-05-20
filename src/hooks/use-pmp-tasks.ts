'use client'

import { useCallback, useEffect, useState } from 'react'
import api from '@/lib/api-client'

export type PmpTaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
export type PmpTaskPhase = 'diagnostico' | 'identidade' | 'conteudo' | 'midia-paga' | 'analise'
export type PmpTaskCategory =
  | 'MIDIA_PAGA' | 'CONTEUDO' | 'SEO' | 'EVENTO'
  | 'REUNIAO' | 'EMAIL_MARKETING' | 'SOCIAL' | 'OUTRO'

export interface PmpTaskApi {
  id: string
  workspace_id: string
  plan_id: string
  phase: PmpTaskPhase
  title: string
  description: string | null
  responsible_id: string | null
  responsible_email: string | null
  category: PmpTaskCategory
  status: PmpTaskStatus
  start_date: string
  end_date: string
  completed_at: string | null
  blocked_reason: string | null
  display_order: number
  created_at: string
  updated_at: string
}

export function usePmpTasks(planId: string | null) {
  const [tasks, setTasks] = useState<PmpTaskApi[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!planId) return
    setIsLoading(true)
    try {
      const data = await api.get<PmpTaskApi[]>(`/pmp/plans/${planId}/tasks`)
      setTasks(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar tarefas')
    } finally {
      setIsLoading(false)
    }
  }, [planId])

  useEffect(() => {
    void fetch()
  }, [fetch])

  async function criarTarefa(body: {
    phase: PmpTaskPhase
    title: string
    category: PmpTaskCategory
    start_date: string
    end_date: string
    description?: string
    responsible_email?: string
    display_order?: number
  }) {
    if (!planId) return
    const task = await api.post<PmpTaskApi>(`/pmp/plans/${planId}/tasks`, body)
    setTasks((prev) => [...prev, task])
    return task
  }

  async function atualizarStatus(
    taskId: string,
    update: {
      status: PmpTaskStatus
      completed_at?: string
      blocked_reason?: string
    },
  ) {
    if (!planId) return
    const updated = await api.patch<PmpTaskApi>(`/pmp/plans/${planId}/tasks/${taskId}`, update)
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)))
    return updated
  }

  async function excluirTarefa(taskId: string) {
    if (!planId) return
    await api.delete(`/pmp/plans/${planId}/tasks/${taskId}`)
    setTasks((prev) => prev.filter((t) => t.id !== taskId))
  }

  return { tasks, isLoading, error, refetch: fetch, criarTarefa, atualizarStatus, excluirTarefa }
}
