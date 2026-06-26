'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Agenda,
  AgendaCor,
  AgendaTipo,
  HorarioAgenda,
  Bloqueio,
} from '@/types/agenda'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'

// ─── Tipos de entrada ─────────────────────────────────────────────────────────
export interface CriarAgendaInput {
  nome: string
  tipo: AgendaTipo
  cor: AgendaCor
  capacidade_simultanea: number
  fuso_horario: string
  webhook_url?: string
}

export interface EditarAgendaInput extends Partial<CriarAgendaInput> {
  ativo?: boolean
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAgendas() {
  const { workspaceAtual } = useWorkspace()
  const [agendas, setAgendas] = useState<Agenda[]>([])
  const [horarios, setHorarios] = useState<HorarioAgenda[]>([])
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ─── Carga do backend (fetch condicional — não busca sem workspace resolvido) ──
  const refetch = useCallback(async () => {
    if (!workspaceAtual) {
      setAgendas([])
      setHorarios([])
      setBloqueios([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const ws = workspaceAtual
      const ags = await api.get<Agenda[]>(`/agenda/agendas?workspace_id=${ws}&incluir_inativas=false`)
      setAgendas(ags)
      // horários de cada agenda (poucas agendas por workspace)
      const listas = await Promise.all(
        ags.map((a) =>
          api.get<HorarioAgenda[]>(`/agenda/agendas/${a.id}/horarios`).catch(() => [] as HorarioAgenda[])
        )
      )
      setHorarios(listas.flat())
      const blqs = await api.get<Bloqueio[]>(`/agenda/bloqueios?workspace_id=${ws}`)
      setBloqueios(blqs)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar agendas.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [workspaceAtual])

  useEffect(() => {
    void refetch()
  }, [refetch])

  // ─── Agendas ────────────────────────────────────────────────────────────────
  const listarAgendas = useCallback(
    (apenasAtivas = false): Agenda[] => {
      return apenasAtivas ? agendas.filter((a) => a.ativo) : agendas
    },
    [agendas]
  )

  const criarAgenda = useCallback(
    async (input: CriarAgendaInput): Promise<Agenda | null> => {
      if (!workspaceAtual) {
        toast.error('Selecione um workspace antes de criar a agenda.')
        return null
      }
      setLoading(true)
      setError(null)
      try {
        const nova = await api.post<Agenda>('/agenda/agendas', { workspace_id: workspaceAtual, ...input })
        setAgendas((prev) => [...prev, nova])
        toast.success(`Agenda "${nova.nome}" criada com sucesso!`)
        return nova
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao criar agenda.'
        setError(msg)
        toast.error(msg)
        return null
      } finally {
        setLoading(false)
      }
    },
    [workspaceAtual]
  )

  const editarAgenda = useCallback(
    async (id: string, input: EditarAgendaInput): Promise<Agenda | null> => {
      setLoading(true)
      setError(null)
      try {
        const updated = await api.patch<Agenda>(`/agenda/agendas/${id}`, input)
        setAgendas((prev) => prev.map((a) => (a.id === id ? updated : a)))
        toast.success('Agenda atualizada com sucesso!')
        return updated
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao editar agenda.'
        setError(msg)
        toast.error(msg)
        return null
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const deletarAgenda = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      await api.delete(`/agenda/agendas/${id}`)
      setAgendas((prev) => prev.map((a) => (a.id === id ? { ...a, ativo: false } : a)))
      toast.success('Agenda desativada.')
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao desativar agenda.'
      setError(msg)
      toast.error(msg)
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  const getAgenda = useCallback(
    (id: string): Agenda | undefined => agendas.find((a) => a.id === id),
    [agendas]
  )

  // ─── Horários ───────────────────────────────────────────────────────────────
  const getHorariosAgenda = useCallback(
    (agendaId: string) => horarios.filter((h) => h.agenda_id === agendaId),
    [horarios]
  )

  const salvarHorarios = useCallback(async (agendaId: string, novosHorarios: HorarioAgenda[]) => {
    setLoading(true)
    setError(null)
    try {
      const salvos = await api.put<HorarioAgenda[]>(`/agenda/agendas/${agendaId}/horarios`, {
        horarios: novosHorarios,
      })
      setHorarios((prev) => [...prev.filter((h) => h.agenda_id !== agendaId), ...salvos])
      toast.success('Configurações de horários salvas!')
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar horários.'
      setError(msg)
      toast.error(msg)
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  // ─── Bloqueios ──────────────────────────────────────────────────────────────
  const listarBloqueios = useCallback(
    (busca?: string) => {
      if (!busca) return bloqueios
      const q = busca.toLowerCase()
      return bloqueios.filter((b) => b.motivo.toLowerCase().includes(q))
    },
    [bloqueios]
  )

  const adicionarBloqueio = useCallback(
    async (bloqueio: Omit<Bloqueio, 'id' | 'created_at'>) => {
      if (!workspaceAtual) {
        toast.error('Selecione um workspace antes de criar o bloqueio.')
        return null
      }
      setLoading(true)
      setError(null)
      try {
        const novo = await api.post<Bloqueio>('/agenda/bloqueios', {
          workspace_id: workspaceAtual,
          ...bloqueio,
        })
        setBloqueios((prev) => [novo, ...prev])
        toast.success('Bloqueio adicionado com sucesso!')
        return novo
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao adicionar bloqueio.'
        setError(msg)
        toast.error(msg)
        return null
      } finally {
        setLoading(false)
      }
    },
    [workspaceAtual]
  )

  const removerBloqueio = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      await api.delete(`/agenda/bloqueios/${id}`)
      setBloqueios((prev) => prev.filter((b) => b.id !== id))
      toast.success('Bloqueio removido.')
      return true
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao remover bloqueio.'
      setError(msg)
      toast.error(msg)
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    agendas,
    horarios,
    bloqueios,
    loading,
    error,
    listarAgendas,
    criarAgenda,
    editarAgenda,
    deletarAgenda,
    getAgenda,
    // horarios
    getHorariosAgenda,
    salvarHorarios,
    // bloqueios
    listarBloqueios,
    adicionarBloqueio,
    removerBloqueio,
    // extra (não quebra consumidores existentes)
    refetch,
  }
}
