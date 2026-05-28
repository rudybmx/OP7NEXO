'use client'

import { useCallback, useEffect, useState } from 'react'
import api from '@/lib/api-client'

export interface CrmFollowup {
  id: string
  workspace_id: string
  canal_id: string | null
  contato_id: string
  conversa_id: string | null
  responsavel_id: string | null
  tipo: string
  status: 'pendente' | 'feito' | 'adiado' | 'cancelado' | 'vencido' | string
  due_at: string
  completed_at: string | null
  nota: string | null
  created_at: string
  updated_at: string
}

interface CreateFollowupInput {
  workspace_id: string
  canal_id?: string | null
  contato_id: string
  conversa_id?: string | null
  responsavel_id?: string | null
  due_at: string
  tipo: string
  nota?: string | null
}

interface UseCrmFollowupsReturn {
  followups: CrmFollowup[]
  isLoading: boolean
  isSaving: boolean
  error: string | null
  refetch: () => void
  createFollowup: (input: CreateFollowupInput) => Promise<boolean>
  updateFollowup: (id: string, patch: Partial<Pick<CrmFollowup, 'status' | 'due_at' | 'tipo' | 'nota' | 'responsavel_id'>>) => Promise<boolean>
}

export function useCrmFollowups(
  workspaceId?: string | null,
  conversaId?: string | null,
  enabled = true,
): UseCrmFollowupsReturn {
  const [followups, setFollowups] = useState<CrmFollowup[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!enabled || !workspaceId || !conversaId) {
      setFollowups([])
      setError(null)
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      const params = new URLSearchParams({
        workspace_id: workspaceId,
        conversa_id: conversaId,
        limit: '20',
      })
      const data = await api.get<CrmFollowup[]>(`/crm/followups?${params.toString()}`)
      setFollowups(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar follow-ups')
    } finally {
      setIsLoading(false)
    }
  }, [enabled, workspaceId, conversaId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void refetch()
    })
    return () => {
      cancelled = true
    }
  }, [refetch])

  const createFollowup = useCallback(async (input: CreateFollowupInput) => {
    try {
      setIsSaving(true)
      setError(null)
      await api.post<CrmFollowup>('/crm/followups', input)
      await refetch()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar follow-up')
      return false
    } finally {
      setIsSaving(false)
    }
  }, [refetch])

  const updateFollowup = useCallback(async (
    id: string,
    patch: Partial<Pick<CrmFollowup, 'status' | 'due_at' | 'tipo' | 'nota' | 'responsavel_id'>>,
  ) => {
    try {
      setIsSaving(true)
      setError(null)
      await api.patch<CrmFollowup>(`/crm/followups/${id}`, patch)
      await refetch()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar follow-up')
      return false
    } finally {
      setIsSaving(false)
    }
  }, [refetch])

  return { followups, isLoading, isSaving, error, refetch, createFollowup, updateFollowup }
}
