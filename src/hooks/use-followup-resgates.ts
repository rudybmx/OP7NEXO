'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'

export interface FollowupResgate {
  id: string
  conversa_id: string
  contato_nome: string | null
  telefone: string | null
  agente_id: string | null
  tentativa: number
  status: string
  mensagem: string | null
  score: number | null
  created_at: string | null
}

/**
 * Fila de rascunhos de resgate (Fase 2): mensagens que a IA gerou e aguardam aprovação humana
 * (agente em modo 'rascunho'). Aprovar → envia no WhatsApp; cancelar → descarta.
 */
export function useFollowupResgates() {
  const { workspaceAtual } = useWorkspace()
  const [resgates, setResgates] = useState<FollowupResgate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [acaoId, setAcaoId] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!workspaceAtual) { setResgates([]); return }
    setIsLoading(true)
    try {
      setResgates(await api.get<FollowupResgate[]>(`/crm/followups/resgates?workspace_id=${workspaceAtual}&status=pendente`))
    } catch {
      setResgates([])
    } finally {
      setIsLoading(false)
    }
  }, [workspaceAtual])

  useEffect(() => { refetch() }, [refetch])

  const aprovar = useCallback(async (id: string) => {
    setAcaoId(id)
    try {
      await api.post(`/crm/followups/resgates/${id}/aprovar`)
      setResgates(prev => prev.filter(r => r.id !== id))
      toast.success('Mensagem de resgate enviada ✓')
      return true
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao enviar o resgate')
      return false
    } finally {
      setAcaoId(null)
    }
  }, [])

  const cancelar = useCallback(async (id: string) => {
    setAcaoId(id)
    try {
      await api.post(`/crm/followups/resgates/${id}/cancelar`)
      setResgates(prev => prev.filter(r => r.id !== id))
      toast.success('Rascunho descartado')
      return true
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao cancelar')
      return false
    } finally {
      setAcaoId(null)
    }
  }, [])

  return { resgates, isLoading, acaoId, refetch, aprovar, cancelar }
}
