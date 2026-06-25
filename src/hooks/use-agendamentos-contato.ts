'use client'

import { useCallback, useEffect, useState } from 'react'
import api from '@/lib/api-client'
import type { Agendamento } from '@/types/agenda'

export interface ResumoComparecimento {
  total: number
  compareceu: number
  falta: number
  taxa_comparecimento: number
}

export interface AgendamentosContato {
  proximos: Agendamento[]
  historico: Agendamento[]
  resumo: ResumoComparecimento
}

const VAZIO: AgendamentosContato = {
  proximos: [],
  historico: [],
  resumo: { total: 0, compareceu: 0, falta: 0, taxa_comparecimento: 0 },
}

/**
 * Agendamentos de um contato (para a caixa no painel do Atendimento).
 * Bate em GET /agenda/contatos/agendamentos?telefone= — o backend casa por telefone
 * normalizado (9º dígito BR) OU por quem marcou (exceção terceiro). Fetch condicional:
 * não busca sem workspace + telefone resolvidos.
 */
export function useAgendamentosContato(
  workspaceId?: string | null,
  telefone?: string | null,
  enabled = true,
) {
  const [dados, setDados] = useState<AgendamentosContato>(VAZIO)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!enabled || !workspaceId || !telefone) {
      setDados(VAZIO)
      setError(null)
      setIsLoading(false)
      return
    }
    try {
      setIsLoading(true)
      setError(null)
      const params = new URLSearchParams({ workspace_id: workspaceId, telefone })
      const data = await api.get<AgendamentosContato>(`/agenda/contatos/agendamentos?${params.toString()}`)
      setDados(data ?? VAZIO)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar agendamentos do contato')
    } finally {
      setIsLoading(false)
    }
  }, [enabled, workspaceId, telefone])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) void refetch()
    })
    return () => {
      cancelled = true
    }
  }, [refetch])

  return { ...dados, isLoading, error, refetch }
}
