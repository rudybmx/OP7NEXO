'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { LembreteConfig } from '@/types/agenda'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'

/**
 * Lembretes de agendamento (CRUD). Religado ao `/agenda/lembretes` (substitui o mock).
 * Busca todos os lembretes do workspace; `listarLembretes(agendaId)` filtra por `agenda_id`
 * exato (null = "Padrão (todas)" / global), preservando o comportamento do componente.
 * Fetch condicional no `workspaceAtual` (evita 400-no-boot).
 */
export function useLembretes() {
  const { workspaceAtual } = useWorkspace()
  const [lembretes, setLembretes] = useState<LembreteConfig[]>([])
  const [loading, setLoading] = useState(false)

  const refetch = useCallback(async () => {
    if (!workspaceAtual) {
      setLembretes([])
      return
    }
    setLoading(true)
    try {
      const data = await api.get<LembreteConfig[]>(`/agenda/lembretes?workspace_id=${workspaceAtual}`)
      setLembretes(data)
    } catch {
      // silencioso no load; erros de ação vão para o toast
    } finally {
      setLoading(false)
    }
  }, [workspaceAtual])

  useEffect(() => {
    void refetch()
  }, [refetch])

  // Filtro exato por agenda_id (null = Padrão/global), igual ao mock.
  const listarLembretes = useCallback(
    (agendaId: string | null) => lembretes.filter((l) => (l.agenda_id ?? null) === agendaId),
    [lembretes]
  )

  const salvarLembrete = useCallback(
    async (lembrete: Partial<LembreteConfig>) => {
      if (!workspaceAtual) {
        toast.error('Selecione um workspace antes de salvar o lembrete.')
        return false
      }
      setLoading(true)
      try {
        if (lembrete.id) {
          const upd = await api.patch<LembreteConfig>(`/agenda/lembretes/${lembrete.id}`, lembrete)
          setLembretes((prev) => prev.map((l) => (l.id === lembrete.id ? upd : l)))
          toast.success('Lembrete atualizado!')
        } else {
          const novo = await api.post<LembreteConfig>('/agenda/lembretes', {
            workspace_id: workspaceAtual,
            ...lembrete,
          })
          setLembretes((prev) => [...prev, novo])
          toast.success('Lembrete criado com sucesso!')
        }
        return true
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao salvar lembrete.')
        return false
      } finally {
        setLoading(false)
      }
    },
    [workspaceAtual]
  )

  const excluirLembrete = useCallback(async (id: string) => {
    setLoading(true)
    try {
      await api.delete(`/agenda/lembretes/${id}`)
      setLembretes((prev) => prev.filter((l) => l.id !== id))
      toast.success('Lembrete removido.')
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir lembrete.')
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  const alternarStatus = useCallback(
    async (id: string) => {
      const atual = lembretes.find((l) => l.id === id)
      if (!atual) return
      const novoAtivo = !atual.ativo
      // otimista + reverte no erro
      setLembretes((prev) => prev.map((l) => (l.id === id ? { ...l, ativo: novoAtivo } : l)))
      try {
        await api.patch<LembreteConfig>(`/agenda/lembretes/${id}`, { ativo: novoAtivo })
        toast.info('Status do lembrete alterado.')
      } catch {
        setLembretes((prev) => prev.map((l) => (l.id === id ? { ...l, ativo: atual.ativo } : l)))
        toast.error('Erro ao alterar status.')
      }
    },
    [lembretes]
  )

  return { lembretes, loading, listarLembretes, salvarLembrete, excluirLembrete, alternarStatus, refetch }
}
