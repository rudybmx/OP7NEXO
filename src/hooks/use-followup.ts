'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { FiltrosFollowup, FollowupLead, LeadStatusFechamento, LeadTemperatura } from '@/types/followup'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'

export function useFollowup() {
  const { workspaceAtual } = useWorkspace()
  const [leads, setLeads] = useState<FollowupLead[]>([])
  const [carregando, setCarregando] = useState(false)

  const carregar = useCallback(async () => {
    if (!workspaceAtual) { setLeads([]); return }
    setCarregando(true)
    try {
      setLeads(await api.get<FollowupLead[]>(`/crm/followups/leads?workspace_id=${workspaceAtual}`))
    } catch {
      setLeads([])
    } finally {
      setCarregando(false)
    }
  }, [workspaceAtual])

  useEffect(() => { carregar() }, [carregar])

  const listarLeads = (filtros: FiltrosFollowup) => {
    return leads.filter(lead => {
      const matchStatus = filtros.status === 'todos' || lead.status_followup === filtros.status
      const matchFechamento = filtros.status_fechamento === 'todos' || lead.status_fechamento === filtros.status_fechamento
      const matchTemperatura = filtros.temperatura === 'todos' || lead.temperatura === filtros.temperatura
      const matchOrigem = filtros.origem === 'todos' || lead.origem === filtros.origem
      const matchBusca = !filtros.busca ||
        lead.nome?.toLowerCase().includes(filtros.busca.toLowerCase()) ||
        lead.telefone.includes(filtros.busca)

      let matchEnvio = true
      if (filtros.proximo_envio_range !== 'todos') {
        const hoje = new Date().toISOString().split('T')[0]
        if (filtros.proximo_envio_range === 'hoje') {
          matchEnvio = lead.proximo_envio?.startsWith(hoje) || false
        } else if (filtros.proximo_envio_range === 'atrasados') {
          matchEnvio = (lead.proximo_envio && lead.proximo_envio < hoje) || false
        }
      }

      return matchStatus && matchFechamento && matchTemperatura && matchOrigem && matchBusca && matchEnvio
    })
  }

  const getLead = (id: string) => leads.find(l => l.id === id)

  // Persiste no backend (ganho/perda é a ação de venda que importa).
  const atualizarStatusFechamento = async (id: string, status: LeadStatusFechamento) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status_fechamento: status } : l))
    try {
      await api.patch(`/crm/followups/conversa/${id}/fechamento`, { status_fechamento: status })
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar fechamento')
      carregar()
    }
  }

  // Temperatura é automática (análise da IA, Fase 1) — não é editável aqui.
  const atualizarTemperatura = (_id: string, _temperatura: LeadTemperatura) => {
    toast.info('A temperatura é definida automaticamente pela análise da IA.')
  }
  // Pausar/reativar followup chega num próximo incremento (não persiste ainda).
  const pausarLead = (_id: string) => { toast.info('Pausar followup chega em breve.') }
  const reativarLead = (_id: string) => { toast.info('Reativar followup chega em breve.') }

  const metricas = useMemo(() => {
    const total = leads.length
    const ganhos = leads.filter(l => l.status_fechamento === 'ganho').length
    return {
      ativos: leads.filter(l => l.status_followup === 'ativo').length,
      vencidos: leads.filter(l => l.status_followup === 'vencido').length,
      esgotados: leads.filter(l => l.status_followup === 'esgotado').length,
      ganhos,
      percas: leads.filter(l => l.status_fechamento === 'perca').length,
      total,
      taxa_conversao: total > 0 ? (ganhos / total) * 100 : 0,
      responderam: leads.filter(l => l.status_followup === 'respondeu').length,
    }
  }, [leads])

  return {
    leads,
    carregando,
    carregar,
    listarLeads,
    getLead,
    atualizarStatusFechamento,
    atualizarTemperatura,
    pausarLead,
    reativarLead,
    metricas,
  }
}
