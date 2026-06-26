'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { FiltrosFollowup, FollowupLead, LeadStatusFechamento } from '@/types/followup'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'

/**
 * Worklist de Follow-up / Resgate.
 *
 * Lê os leads em follow-up do backend real: conversas com a etiqueta `followup`
 * (aplicada pelo worker quando o lead para de responder além do
 * `tempo_followup_min` do agente), enriquecidas com a análise da IA
 * (temperatura/interesse/resumo). Não há cadência/disparo — só worklist +
 * edição do desfecho (status_fechamento).
 */
export function useFollowup() {
  const { workspaceAtual } = useWorkspace()
  const [leads, setLeads] = useState<FollowupLead[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!workspaceAtual) { setLeads([]); setError(null); return }
    setIsLoading(true)
    setError(null)
    try {
      setLeads(await api.get<FollowupLead[]>(`/crm/followups/leads?workspace_id=${workspaceAtual}`))
    } catch (e: any) {
      setError(e?.message || 'Erro ao carregar follow-ups')
    } finally {
      setIsLoading(false)
    }
  }, [workspaceAtual])

  useEffect(() => { refetch() }, [refetch])

  // Filtro client-side da tabela. `status` mira engajamento (status_followup:
  // ativo/respondeu) OU desfecho (status_fechamento: ganho/perca/...).
  const listarLeads = (filtros: FiltrosFollowup) => {
    return leads.filter(lead => {
      const matchStatus =
        filtros.status === 'todos' ||
        lead.status_followup === filtros.status ||
        lead.status_fechamento === (filtros.status as unknown as LeadStatusFechamento)
      const matchTemperatura = filtros.temperatura === 'todos' || lead.temperatura === filtros.temperatura
      const matchOrigem = filtros.origem === 'todos' || lead.origem === filtros.origem
      const matchBusca = !filtros.busca ||
        lead.nome?.toLowerCase().includes(filtros.busca.toLowerCase()) ||
        lead.telefone.includes(filtros.busca)
      return matchStatus && matchTemperatura && matchOrigem && matchBusca
    })
  }

  const getLead = (id: string) => leads.find(l => l.id === id)

  // Persiste o desfecho (ganho/perda é a ação de venda que importa).
  // `id` = id da conversa (= lead.id no worklist).
  const atualizarStatusFechamento = async (id: string, status: LeadStatusFechamento) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status_fechamento: status } : l))
    try {
      await api.patch(`/crm/followups/conversa/${id}/fechamento`, { status_fechamento: status })
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar fechamento')
      refetch()
    }
  }

  const metricas = useMemo(() => {
    const total = leads.length
    const ganhos = leads.filter(l => l.status_fechamento === 'ganho').length
    return {
      ativos: leads.filter(l => l.status_followup === 'ativo').length,
      vencidos: leads.filter(l => l.status_followup === 'vencido').length,
      esgotados: leads.filter(l => l.status_followup === 'esgotado').length,
      ganhos,
      percas: leads.filter(l => l.status_fechamento === 'perca' || l.status_fechamento === 'perdido').length,
      total,
      taxa_conversao: total > 0 ? (ganhos / total) * 100 : 0,
      responderam: leads.filter(l => l.status_followup === 'respondeu').length,
    }
  }, [leads])

  return {
    leads,
    isLoading,
    error,
    refetch,
    listarLeads,
    getLead,
    atualizarStatusFechamento,
    metricas,
  }
}
