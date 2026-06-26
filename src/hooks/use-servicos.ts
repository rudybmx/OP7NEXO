'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'

export interface ServicoAgenda {
  id: string
  workspace_id: string
  agenda_id: string | null // null = serviço do workspace (todas as agendas)
  nome: string
  duracao_minutos: number
  preco: number | null
  cor: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface CriarServicoInput {
  agenda_id?: string | null
  nome: string
  duracao_minutos: number
  preco?: number | null
  cor?: string | null
}

/**
 * Catálogo de serviços (CRUD). Fetch condicional no workspaceAtual.
 * `agendaId` filtra os serviços daquela agenda + os do workspace (agenda_id null).
 */
export function useServicos(agendaId?: string | null) {
  const { workspaceAtual } = useWorkspace()
  const [servicos, setServicos] = useState<ServicoAgenda[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!workspaceAtual) {
      setServicos([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ workspace_id: workspaceAtual })
      if (agendaId) params.set('agenda_id', agendaId)
      const data = await api.get<ServicoAgenda[]>(`/agenda/servicos?${params.toString()}`)
      setServicos(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar serviços')
    } finally {
      setLoading(false)
    }
  }, [workspaceAtual, agendaId])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const criarServico = useCallback(
    async (input: CriarServicoInput) => {
      if (!workspaceAtual) {
        toast.error('Selecione um workspace antes de criar o serviço.')
        return null
      }
      setLoading(true)
      try {
        const novo = await api.post<ServicoAgenda>('/agenda/servicos', {
          workspace_id: workspaceAtual,
          ...input,
        })
        setServicos((prev) => [...prev, novo])
        toast.success(`Serviço "${novo.nome}" criado!`)
        return novo
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao criar serviço')
        return null
      } finally {
        setLoading(false)
      }
    },
    [workspaceAtual]
  )

  const editarServico = useCallback(
    async (id: string, patch: Partial<CriarServicoInput> & { ativo?: boolean }) => {
      try {
        const upd = await api.patch<ServicoAgenda>(`/agenda/servicos/${id}`, patch)
        setServicos((prev) => prev.map((s) => (s.id === id ? upd : s)))
        toast.success('Serviço atualizado!')
        return upd
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao editar serviço')
        return null
      }
    },
    []
  )

  const removerServico = useCallback(async (id: string) => {
    try {
      await api.delete(`/agenda/servicos/${id}`)
      setServicos((prev) => prev.filter((s) => s.id !== id))
      toast.success('Serviço removido.')
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover serviço')
      return false
    }
  }, [])

  return { servicos, loading, error, refetch, criarServico, editarServico, removerServico }
}
