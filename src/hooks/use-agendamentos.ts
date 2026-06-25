'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { toast } from 'sonner'
import {
  isWithinInterval,
  parseISO,
  startOfWeek,
  endOfWeek,
  isSameDay,
} from 'date-fns'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'
import {
  Agendamento,
  AgendamentoStatus,
  AgendamentoOrigem,
  FiltrosAgendamento,
} from '@/types/agenda'

// ─── Tipos de entrada ─────────────────────────────────────────────────────────
export interface CriarAgendamentoInput {
  agenda_id: string
  cliente_nome: string
  cliente_telefone: string
  cliente_email?: string
  data_hora_inicio: string
  data_hora_fim: string
  servico?: string
  observacoes?: string
  origem: AgendamentoOrigem
  criado_por?: string
  // Exceção terceiro (agendamento para outra pessoa que não o dono do telefone)
  para_terceiro?: boolean
  agendado_por_telefone?: string
}

export interface EditarAgendamentoInput extends Partial<CriarAgendamentoInput> {}

// ─── Filtros padrão ───────────────────────────────────────────────────────────
export const FILTROS_PADRAO: FiltrosAgendamento = {
  agenda_ids: [],
  status: [],
  origem: [],
  data_inicio: '',
  data_fim: '',
  busca: '',
}

// Campos que o PATCH /agenda/agendamentos/{id} aceita (edição parcial)
const CAMPOS_EDITAVEIS = ['cliente_nome', 'cliente_email', 'data_hora_inicio', 'data_hora_fim', 'servico', 'observacoes'] as const

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAgendamentos() {
  const { workspaceAtual } = useWorkspace()
  const [todos, setTodos] = useState<Agendamento[]>([])
  const [filtros, setFiltros] = useState<FiltrosAgendamento>(FILTROS_PADRAO)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ─── Carga do backend (fetch condicional — não busca sem workspace resolvido) ──
  const refetch = useCallback(async () => {
    if (!workspaceAtual) {
      setTodos([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ workspace_id: workspaceAtual, limit: '2000' })
      const data = await api.get<Agendamento[]>(`/agenda/agendamentos?${params.toString()}`)
      setTodos(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar agendamentos.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [workspaceAtual])

  useEffect(() => {
    void refetch()
  }, [refetch])

  // ─── Aplicar filtros reativamente (client-side sobre `todos`) ──────────────────
  const agendamentos = useMemo(() => {
    let resultado = [...todos]

    if (filtros.agenda_ids.length > 0) {
      resultado = resultado.filter((a) => filtros.agenda_ids.includes(a.agenda_id))
    }
    if (filtros.status.length > 0) {
      resultado = resultado.filter((a) => filtros.status.includes(a.status))
    }
    if (filtros.origem.length > 0) {
      resultado = resultado.filter((a) => filtros.origem.includes(a.origem))
    }
    if (filtros.data_inicio) {
      const inicio = parseISO(filtros.data_inicio)
      resultado = resultado.filter((a) => parseISO(a.data_hora_inicio) >= inicio)
    }
    if (filtros.data_fim) {
      const fim = parseISO(filtros.data_fim)
      resultado = resultado.filter((a) => parseISO(a.data_hora_inicio) <= fim)
    }
    if (filtros.busca.trim()) {
      const q = filtros.busca.toLowerCase()
      resultado = resultado.filter(
        (a) =>
          a.cliente_nome.toLowerCase().includes(q) ||
          (a.cliente_telefone ?? '').includes(q) ||
          (a.servico ?? '').toLowerCase().includes(q)
      )
    }

    return resultado.sort(
      (a, b) =>
        new Date(a.data_hora_inicio).getTime() - new Date(b.data_hora_inicio).getTime()
    )
  }, [todos, filtros])

  // ─── Getters derivados (em memória sobre `todos`) ──────────────────────────────
  const getAgendamentosDoDia = useCallback(
    (data: string, agenda_id?: string): Agendamento[] => {
      const dia = parseISO(data)
      return todos.filter((a) => {
        const mesmodia = isSameDay(parseISO(a.data_hora_inicio), dia)
        if (agenda_id) return mesmodia && a.agenda_id === agenda_id
        return mesmodia
      })
    },
    [todos]
  )

  const getAgendamentosDaSemana = useCallback(
    (inicio: string, fim: string, agenda_ids: string[] = []): Agendamento[] => {
      const start = parseISO(inicio)
      const end = parseISO(fim)
      return todos.filter((a) => {
        const dt = parseISO(a.data_hora_inicio)
        const dentroIntervalo = isWithinInterval(dt, { start, end })
        if (agenda_ids.length === 0) return dentroIntervalo
        return dentroIntervalo && agenda_ids.includes(a.agenda_id)
      })
    },
    [todos]
  )

  // ─── KPIs utilitários ─────────────────────────────────────────────────────────
  const getKpisHoje = useCallback(() => {
    const hoje = new Date()
    const dodiaHoje = todos.filter((a) => isSameDay(parseISO(a.data_hora_inicio), hoje))
    const confirmados = dodiaHoje.filter((a) =>
      ['confirmado', 'compareceu', 'em_atendimento'].includes(a.status)
    ).length
    const faltasSemana = todos.filter(
      (a) =>
        a.status === 'falta' &&
        isWithinInterval(parseISO(a.data_hora_inicio), {
          start: startOfWeek(hoje, { weekStartsOn: 1 }),
          end: endOfWeek(hoje, { weekStartsOn: 1 }),
        })
    ).length
    const atendidosSemana = todos.filter(
      (a) =>
        a.status === 'compareceu' &&
        isWithinInterval(parseISO(a.data_hora_inicio), {
          start: startOfWeek(hoje, { weekStartsOn: 1 }),
          end: endOfWeek(hoje, { weekStartsOn: 1 }),
        })
    ).length
    const totalSemana = atendidosSemana + faltasSemana
    const taxaComparecimento = totalSemana > 0 ? Math.round((atendidosSemana / totalSemana) * 100) : 0

    return {
      agendamentosHoje: dodiaHoje.length,
      confirmadosHoje: confirmados,
      faltasSemana,
      taxaComparecimento,
    }
  }, [todos])

  // ─── Mutações (API real) ───────────────────────────────────────────────────────
  const criarAgendamento = useCallback(
    async (input: CriarAgendamentoInput): Promise<Agendamento | null> => {
      if (!workspaceAtual) {
        toast.error('Selecione um workspace antes de agendar.')
        return null
      }
      setLoading(true)
      setError(null)
      try {
        const novo = await api.post<Agendamento>('/agenda/agendamentos', {
          workspace_id: workspaceAtual,
          ...input,
        })
        setTodos((prev) => [...prev, novo])
        toast.success(`Agendamento criado para ${input.cliente_nome}!`)
        return novo
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao criar agendamento.'
        setError(msg)
        toast.error(msg)
        return null
      } finally {
        setLoading(false)
      }
    },
    [workspaceAtual]
  )

  const editarAgendamento = useCallback(
    async (id: string, input: EditarAgendamentoInput): Promise<Agendamento | null> => {
      setLoading(true)
      setError(null)
      try {
        const patch: Record<string, unknown> = {}
        for (const campo of CAMPOS_EDITAVEIS) {
          if (input[campo] !== undefined) patch[campo] = input[campo]
        }
        const updated = await api.patch<Agendamento>(`/agenda/agendamentos/${id}`, patch)
        setTodos((prev) => prev.map((a) => (a.id === id ? updated : a)))
        toast.success('Agendamento atualizado!')
        return updated
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao editar agendamento.'
        setError(msg)
        toast.error(msg)
        return null
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const atualizarStatus = useCallback(
    async (
      id: string,
      status: AgendamentoStatus,
      extras?: {
        cancelamento_motivo?: string
        cancelado_por?: string
        reagendado_de?: string
      }
    ): Promise<boolean> => {
      setLoading(true)
      setError(null)
      try {
        const updated = await api.patch<Agendamento>(`/agenda/agendamentos/${id}/status`, {
          status,
          ...extras,
        })
        setTodos((prev) => prev.map((a) => (a.id === id ? updated : a)))
        const MSG: Partial<Record<AgendamentoStatus, string>> = {
          confirmado: 'Agendamento confirmado!',
          compareceu: 'Marcado como compareceu ✓',
          falta: 'Marcado como falta.',
          cancelado: 'Agendamento cancelado.',
          em_atendimento: 'Em atendimento.',
        }
        toast.success(MSG[status] ?? 'Status atualizado.')
        return true
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao atualizar status.'
        setError(msg)
        toast.error(msg)
        return false
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const deletarAgendamento = useCallback(
    async (id: string): Promise<boolean> => {
      return atualizarStatus(id, 'cancelado')
    },
    [atualizarStatus]
  )

  return {
    agendamentos,
    todos,
    filtros,
    setFiltros,
    loading,
    error,
    // getters
    getAgendamentosDoDia,
    getAgendamentosDaSemana,
    getKpisHoje,
    // mutações
    criarAgendamento,
    editarAgendamento,
    atualizarStatus,
    deletarAgendamento,
    // extra (não quebra consumidores existentes)
    refetch,
  }
}
