'use client'

import { useCallback } from 'react'
import api from '@/lib/api-client'

export interface AjusteResposta {
  id: string
  agente_id: string
  conversa_id: string | null
  mensagem_id: string | null
  resposta_original: string
  resposta_sugerida: string
  categoria: string | null
  autor_nome: string | null
  criado_em: string | null
}

export interface AjusteRespostaInput {
  mensagem_id?: string | null
  resposta_original?: string
  resposta_sugerida: string
  categoria?: string | null
}

/** Ajustes de resposta (feedback de qualidade). POST é CRM (supervisor); GET/DELETE são
 * da Central do agente (platform_admin). */
export function useAjustesResposta() {
  const sugerir = useCallback(
    (conversaId: string, payload: AjusteRespostaInput) =>
      api.post<AjusteResposta>(`/conversas/${conversaId}/ajuste-resposta`, payload),
    [],
  )
  const listar = useCallback(
    (ws: string, agenteId: string) =>
      api.get<AjusteResposta[]>(`/workspaces/${ws}/agentes/${agenteId}/ajustes`),
    [],
  )
  const remover = useCallback(
    (ws: string, agenteId: string, id: string) =>
      api.delete<void>(`/workspaces/${ws}/agentes/${agenteId}/ajustes/${id}`),
    [],
  )
  return { sugerir, listar, remover }
}
