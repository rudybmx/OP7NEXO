'use client'

import { useCallback, useState } from 'react'
import api from '@/lib/api-client'

export type StatusAgente = 'ativo' | 'inativo'

export interface CanalVinculado {
  canal_id: string
  canal_nome: string | null
  ativo: boolean
}

export interface AgenteListItem {
  id: string
  nome: string
  status: string
  modelo: string | null
  provider_id: string | null
  provider_nome: string | null
  canais: CanalVinculado[]
  ultima_atividade: string | null
}

export interface HorarioItem {
  dia_semana: number
  hora_inicio: string
  hora_fim: string
  ativo: boolean
}

export interface AgenteDetalhe extends AgenteListItem {
  workspace_id: string
  descricao: string | null
  tom: string | null
  idiomas: string[]
  blacklist_topicos: string[]
  threshold_confianca: number
  tempo_resposta_target_ms: number | null
  debounce_segundos: number
  limite_tokens_dia: number | null
  alerta_threshold_pct: number
  mensagem_abertura: string | null
  objetivo: string | null
  tempo_followup_min: number | null
  horarios: (HorarioItem & { id: string })[]
  habilidades: unknown[]
  prompt_draft: string | null
  prompt_publicado: string | null
  criado_em: string | null
  atualizado_em: string | null
}

export interface AgenteInput {
  nome: string
  descricao?: string | null
  provider_id?: string | null
  modelo?: string | null
  status?: StatusAgente
  tom?: string | null
  idiomas?: string[]
  blacklist_topicos?: string[]
  threshold_confianca?: number
  tempo_resposta_target_ms?: number | null
  debounce_segundos?: number
  limite_tokens_dia?: number | null
  alerta_threshold_pct?: number
  mensagem_abertura?: string | null
  objetivo?: string | null
  tempo_followup_min?: number | null
  canais?: string[]
  horarios?: HorarioItem[]
  prompt?: string | null
}

/** CRUD de agentes do workspace (platform_admin). Padrão imperativo (igual use-meta-tokens). */
export function useAgentes(workspaceId: string | null) {
  const [agentes, setAgentes] = useState<AgenteListItem[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!workspaceId) {
      setAgentes([])
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      setAgentes(await api.get<AgenteListItem[]>(`/workspaces/${workspaceId}/agentes`))
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar agentes')
    } finally {
      setCarregando(false)
    }
  }, [workspaceId])

  const obter = useCallback(
    (id: string) => api.get<AgenteDetalhe>(`/workspaces/${workspaceId}/agentes/${id}`),
    [workspaceId],
  )

  const criar = useCallback(
    (payload: AgenteInput) => api.post<AgenteDetalhe>(`/workspaces/${workspaceId}/agentes`, payload),
    [workspaceId],
  )

  const atualizar = useCallback(
    (id: string, payload: Partial<AgenteInput>) =>
      api.put<AgenteDetalhe>(`/workspaces/${workspaceId}/agentes/${id}`, payload),
    [workspaceId],
  )

  const alternarStatus = useCallback(
    (id: string, status: StatusAgente) =>
      api.post<AgenteDetalhe>(`/workspaces/${workspaceId}/agentes/${id}/toggle`, { status }),
    [workspaceId],
  )

  const excluir = useCallback(
    (id: string) => api.delete<void>(`/workspaces/${workspaceId}/agentes/${id}`),
    [workspaceId],
  )

  return { agentes, carregando, erro, carregar, obter, criar, atualizar, alternarStatus, excluir }
}
