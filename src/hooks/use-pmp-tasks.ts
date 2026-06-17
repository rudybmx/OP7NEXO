'use client'

import { useCallback, useEffect, useState } from 'react'
import api from '@/lib/api-client'

export type PmpTaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
export type PmpTaskPhase = 'diagnostico' | 'identidade' | 'conteudo' | 'midia-paga' | 'analise'
export type PmpTaskCategory =
  | 'MIDIA_PAGA' | 'CONTEUDO' | 'SEO' | 'EVENTO'
  | 'REUNIAO' | 'EMAIL_MARKETING' | 'SOCIAL' | 'OUTRO'
export type PmpTaskPrioridade = 'baixa' | 'media' | 'alta'

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
  prioridade: PmpTaskPrioridade
  status: PmpTaskStatus
  start_date: string
  end_date: string
  completed_at: string | null
  blocked_reason: string | null
  display_order: number
  created_at: string
  updated_at: string
}

export interface TaskEditBody {
  phase?: PmpTaskPhase
  title?: string
  category?: PmpTaskCategory
  start_date?: string
  end_date?: string
  description?: string | null
  responsible_email?: string | null
  display_order?: number
  prioridade?: PmpTaskPrioridade
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

  async function editarTarefa(taskId: string, body: TaskEditBody) {
    if (!planId) return
    const updated = await api.patch<PmpTaskApi>(`/pmp/plans/${planId}/tasks/${taskId}`, body)
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t)))
    return updated
  }

  /**
   * Reordena as tarefas do plano. Recebe a lista COMPLETA de ids na nova ordem,
   * reatribui display_order = índice e persiste só os que mudaram (PATCH).
   * Atualização otimista com rollback em caso de erro.
   */
  async function reordenarTarefas(orderedIds: string[]) {
    if (!planId) return
    const byId = new Map(tasks.map((t) => [t.id, t]))
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((t): t is PmpTaskApi => Boolean(t))
    // Segurança: aborta se a lista não cobrir todas as tarefas (ex.: filtro ativo)
    if (reordered.length !== tasks.length) return
    const finalList = reordered.map((t, i) => ({ ...t, display_order: i }))
    const changed = finalList.filter((t) => byId.get(t.id)!.display_order !== t.display_order)
    if (changed.length === 0) return
    const previous = tasks
    setTasks(finalList)
    try {
      await Promise.all(
        changed.map((t) =>
          api.patch(`/pmp/plans/${planId}/tasks/${t.id}`, { display_order: t.display_order }),
        ),
      )
    } catch (err) {
      setTasks(previous)
      throw err
    }
  }

  return { tasks, isLoading, error, refetch: fetch, criarTarefa, atualizarStatus, excluirTarefa, editarTarefa, reordenarTarefas }
}
