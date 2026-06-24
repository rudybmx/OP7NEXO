'use client'

import { useCallback, useState } from 'react'
import api from '@/lib/api-client'

export interface UsoTotais {
  tokens_input: number
  tokens_output: number
  tokens_total: number
  custo_usd: number
  chamadas: number
  conversas: number
  handoffs: number
  taxa_handoff: number
  score_medio: number | null
}

export interface UsoSeriePonto {
  dia: string
  tokens: number
}

export interface UsoDashboard {
  totais: UsoTotais
  serie: UsoSeriePonto[]
}

export interface DashboardFiltros {
  agente_id?: string | null
  canal_id?: string | null
  modelo?: string | null
  dias?: number
}

/** Dashboard de uso & consumo dos agentes do workspace. Imperativo (igual use-meta-tokens). */
export function useAgenteDashboard(workspaceId: string | null) {
  const [dados, setDados] = useState<UsoDashboard | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(
    async (filtros: DashboardFiltros = {}) => {
      if (!workspaceId) {
        setDados(null)
        return
      }
      setCarregando(true)
      setErro(null)
      try {
        const p = new URLSearchParams()
        if (filtros.agente_id) p.set('agente_id', filtros.agente_id)
        if (filtros.canal_id) p.set('canal_id', filtros.canal_id)
        if (filtros.modelo) p.set('modelo', filtros.modelo)
        if (filtros.dias) {
          const fim = new Date()
          const inicio = new Date()
          inicio.setDate(inicio.getDate() - filtros.dias)
          p.set('inicio', inicio.toISOString().slice(0, 10))
          p.set('fim', fim.toISOString().slice(0, 10))
        }
        const qs = p.toString()
        setDados(await api.get<UsoDashboard>(`/workspaces/${workspaceId}/agentes/uso/dashboard${qs ? `?${qs}` : ''}`))
      } catch (e: any) {
        setErro(e?.message || 'Erro ao carregar dashboard')
      } finally {
        setCarregando(false)
      }
    },
    [workspaceId],
  )

  return { dados, carregando, erro, carregar }
}
