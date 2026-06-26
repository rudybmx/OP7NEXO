"use client"

import React, { useState } from 'react'
import Link from 'next/link'
import {
  Search,
  ChevronRight,
  Smartphone,
  Globe,
  MessageCircle,
  MessageSquare,
  Briefcase,
  Music,
  RefreshCw,
  AlertTriangle,
  Inbox,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useFollowup } from '@/hooks/use-followup'
import { usePersistedState } from '@/hooks/use-estado-persistido'
import { FollowupLead, FiltrosFollowup, LeadOrigem, LeadStatusFechamento } from '@/types/followup'
import { Button } from '@/components/ui/button'
import { FollowupKpis } from '@/components/followup/followup-kpis'
import { FollowupTabela } from '@/components/followup/followup-tabela'

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTES AUXILIARES INLINE
// ─────────────────────────────────────────────────────────────────────────────

const OrigemIcon = ({ origem, size = 12 }: { origem: LeadOrigem, size?: number }) => {
  const configs: Record<LeadOrigem, { icon: any, color: string }> = {
    meta_ads: { icon: Globe, color: '#1877F2' },
    google_ads: { icon: Search, color: '#4285F4' },
    whatsapp: { icon: MessageCircle, color: '#25d366' },
    linkedin_ads: { icon: Briefcase, color: '#0A66C2' },
    tiktok_ads: { icon: Music, color: '#000000' },
    offline: { icon: Smartphone, color: '#64748b' },
    organico: { icon: Globe, color: '#3E5BFF' },
    indicacao: { icon: Globe, color: '#7A5AF8' },
    outro: { icon: Globe, color: '#64748b' }
  }
  const config = configs[origem] || configs.outro
  const Icon = config.icon
  return <Icon size={size} style={{ color: config.color }} />
}

// Botões de desfecho usados no painel lateral.
const FECHAMENTO_OPCOES: { key: LeadStatusFechamento, label: string, color: string }[] = [
  { key: 'ganho', label: 'Ganho', color: 'var(--ws-green)' },
  { key: 'perca', label: 'Perca', color: 'var(--ws-coral)' },
  { key: 'reagendado', label: 'Reagendado', color: 'var(--ws-gold)' },
  { key: 'em_aberto', label: 'Em aberto', color: 'var(--ws-text-2)' },
]

export default function FollowupPage() {
  const {
    leads,
    metricas,
    listarLeads,
    atualizarStatusFechamento,
    isLoading,
    error,
    refetch,
  } = useFollowup()

  // Filtros persistidos (Nielsen #6: sobrevivem a F5).
  const [filtros, setFiltros] = usePersistedState<FiltrosFollowup>('crm:followup:filtros', {
    status: 'todos',
    status_fechamento: 'todos',
    temperatura: 'todos',
    origem: 'todos',
    agente_id: '',
    proximo_envio_range: 'todos',
    busca: '',
    periodo: 'atual',
  })

  const [leadSelecionadoId, setLeadSelecionadoId] = useState<string | null>(null)
  const [painelAberto, setPainelAberto] = useState(false)

  const leadsFiltrados = listarLeads(filtros)
  // Lê sempre da lista para o painel refletir o desfecho recém-gravado.
  const leadAtual: FollowupLead | null =
    leadSelecionadoId ? (leads.find(l => l.id === leadSelecionadoId) || null) : null

  const handleLeadClick = (lead: FollowupLead) => {
    setLeadSelecionadoId(lead.id)
    setPainelAberto(true)
  }

  const semLeads = !isLoading && !error && leads.length === 0

  return (
    <div style={{ background: 'var(--ws-page-bg)', minHeight: '100%', padding: '24px' }}>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 style={{
            fontSize: 20,
            fontWeight: 600,
            color: 'var(--ws-text-1)',
            letterSpacing: '-0.3px',
            fontFamily: 'var(--font-sans-base)'
          }}>
            Follow-up / Resgate
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ws-text-2)', marginTop: 4 }}>
            Leads que o agente atendeu e pararam de responder — priorize o resgate e registre o desfecho
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => refetch()}
          disabled={isLoading}
          className="gap-2 text-[color:var(--ws-text-2)] border border-[var(--ws-glass-border)] bg-[var(--ws-surface-2)] hover:bg-[var(--ws-glass-bg)] h-9"
        >
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
          Atualizar
        </Button>
      </div>

      {/* KPI Cards */}
      <FollowupKpis metricas={metricas} />

      {/* Main Table Container */}
      <div
        style={{
          background: 'var(--ws-glass-bg)',
          border: '1px solid var(--ws-glass-border)',
          borderRadius: 'var(--ws-radius-lg)',
          backdropFilter: 'blur(16px)',
          boxShadow: 'var(--ws-glass-shadow)',
          position: 'relative',
          overflow: 'hidden',
          marginTop: 24,
        }}
        className="p-4"
      >
        <div style={{ position:'absolute',top:0,left:0,right:0,height:1,
          background:'linear-gradient(90deg,transparent,var(--ws-glass-border),transparent)',
          pointerEvents:'none' }} />

        {/* Barra de filtros */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          background: 'var(--ws-glass-bg)',
          border: '1px solid var(--ws-glass-border)',
          borderRadius: 'var(--ws-radius-lg)',
          backdropFilter: 'blur(16px)',
          marginBottom: 12,
          flexWrap: 'wrap',
          position: 'relative'
        }}>
          {/* Busca */}
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={13} style={{
              position: 'absolute', left: 10, top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--ws-text-3)',
            }} />
            <input
              placeholder="Buscar lead ou telefone..."
              value={filtros.busca}
              onChange={(e) => setFiltros(f => ({ ...f, busca: e.target.value }))}
              style={{
                width: '100%',
                paddingLeft: 32, paddingRight: 12,
                paddingTop: 7, paddingBottom: 7,
                background: 'var(--ws-surface-2)',
                border: '1px solid var(--ws-glass-border)',
                borderRadius: 'var(--ws-radius-md)',
                color: 'var(--ws-text-1)',
                fontSize: 12,
                outline: 'none',
              }}
            />
          </div>

          {/* Separador */}
          <div style={{ width: 1, height: 20, background: 'var(--ws-divider)' }} />

          {/* Botões de status (engajamento + desfecho) */}
          <div className="flex gap-1.5 p-1">
            {['todos', 'ativo', 'respondeu', 'ganho', 'perca'].map((s) => (
              <button
                key={s}
                onClick={() => setFiltros(f => ({ ...f, status: s as FiltrosFollowup['status'] }))}
                style={{
                  padding: '5px 14px',
                  borderRadius: 'var(--ws-radius-sm)',
                  border: filtros.status === s ? '1px solid var(--ws-gold)' : '1px solid transparent',
                  background: filtros.status === s ? 'rgba(201,168,76,0.12)' : 'transparent',
                  color: filtros.status === s ? 'var(--ws-gold)' : 'var(--ws-text-2)',
                  fontSize: 11,
                  fontWeight: filtros.status === s ? 600 : 400,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  transition: 'all 0.18s ease',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Estados: erro / carregando / vazio / tabela */}
        {error ? (
          <div className="flex flex-col items-center justify-center text-center gap-3 py-16">
            <AlertTriangle size={32} className="text-[var(--ws-coral)]" />
            <div>
              <p className="text-sm font-semibold text-[var(--ws-text-1)]">Não foi possível carregar os follow-ups</p>
              <p className="text-xs text-[var(--ws-text-3)] mt-1 max-w-md">{error}</p>
            </div>
            <Button variant="ghost" onClick={() => refetch()} className="gap-2 border border-[var(--ws-glass-border)] bg-[var(--ws-surface-2)] h-9 text-[color:var(--ws-text-1)]">
              <RefreshCw size={14} />
              Tentar novamente
            </Button>
          </div>
        ) : isLoading && leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 opacity-60">
            <Loader2 size={28} className="animate-spin text-[var(--ws-blue)]" />
            <p className="text-xs text-[var(--ws-text-3)]">Carregando leads em follow-up…</p>
          </div>
        ) : semLeads ? (
          <div className="flex flex-col items-center justify-center text-center gap-3 py-16">
            <Inbox size={32} className="text-[var(--ws-text-3)]" />
            <div>
              <p className="text-sm font-semibold text-[var(--ws-text-1)]">Nenhum lead em follow-up</p>
              <p className="text-xs text-[var(--ws-text-3)] mt-1 max-w-md">
                Os leads entram aqui automaticamente quando param de responder. Configure
                {' '}<strong>“Tempo sem resposta do lead”</strong> no agente para ativar.
              </p>
            </div>
            <Link href="/admin/central-agentes" className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--ws-blue)] hover:underline">
              Configurar agente
              <ChevronRight size={14} />
            </Link>
          </div>
        ) : (
          <FollowupTabela
            leads={leadsFiltrados}
            onLeadClick={handleLeadClick}
            onStatusFechamentoChange={atualizarStatusFechamento}
          />
        )}
      </div>

      {/* Painel Lateral Lead */}
      {painelAberto && leadAtual && (
        <div
          onClick={() => setPainelAberto(false)}
          className="animate-in fade-in duration-300"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 100,
            display: 'flex',
            justifyContent: 'flex-start'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="animate-in slide-in-from-left duration-500 ease-out"
            style={{
              width: '480px',
              height: '100%',
              background: 'var(--ws-navy)',
              borderRight: '1px solid var(--ws-glass-border)',
              boxShadow: 'var(--ws-glass-shadow)',
              padding: '32px 24px',
              color: 'white',
              position: 'relative',
              overflowY: 'auto'
            }}
          >
            {/* Header do Painel */}
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-2xl font-bold mb-1">{leadAtual.nome || 'Lead sem nome'}</h2>
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Smartphone size={14} />
                  {leadAtual.telefone}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setPainelAberto(false)}
                className="text-white/40 hover:text-white"
              >
                <ChevronRight className="rotate-180" />
              </Button>
            </div>

            <div className="space-y-6">
              {/* Temperatura + Origem (leitura da IA) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                  <p className="text-[9px] uppercase text-muted-foreground mb-1 font-bold">Temperatura</p>
                  <div className="text-sm font-semibold flex items-center gap-2">
                    {leadAtual.temperatura ? (
                      <>
                        <div className="w-2 h-2 rounded-full" style={{ background: leadAtual.temperatura === 'quente' ? 'var(--ws-coral)' : leadAtual.temperatura === 'morno' ? 'var(--ws-gold)' : 'var(--ws-blue)' }} />
                        {leadAtual.temperatura.toUpperCase()}
                      </>
                    ) : (
                      <span className="text-white/40 italic text-xs font-normal">Sem análise</span>
                    )}
                  </div>
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                  <p className="text-[9px] uppercase text-muted-foreground mb-1 font-bold">Origem</p>
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <OrigemIcon origem={leadAtual.origem} size={14} />
                    {leadAtual.origem.replace('_', ' ').toUpperCase()}
                  </div>
                </div>
              </div>

              {/* Interesse (leitura da IA) */}
              {leadAtual.interesse && (
                <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                  <p className="text-[9px] uppercase text-muted-foreground mb-1 font-bold">Interesse</p>
                  <p className="text-sm text-white/90">{leadAtual.interesse}</p>
                </div>
              )}

              {/* Resumo da IA */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-white/10 to-transparent border border-white/10 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-[var(--ws-blue)] flex items-center justify-center text-[10px] font-bold">IA</div>
                  <h4 className="text-[10px] uppercase font-bold tracking-widest text-white/60">Resumo da Interação</h4>
                </div>
                <p className="text-sm leading-relaxed text-white/90">
                  {leadAtual.ultimo_resumo || "O agente ainda não gerou um resumo para esta conversa."}
                </p>
              </div>

              {/* Desfecho (persiste no clique) */}
              <div>
                <h4 className="text-[10px] uppercase font-bold tracking-widest text-white/40 mb-3 px-1">Desfecho</h4>
                <div className="grid grid-cols-2 gap-2">
                  {FECHAMENTO_OPCOES.map((opt) => {
                    const ativo = leadAtual.status_fechamento === opt.key
                    return (
                      <button
                        key={opt.key}
                        onClick={() => { atualizarStatusFechamento(leadAtual.id, opt.key); toast.success(`Fechamento: ${opt.label}`) }}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-bold transition-all border"
                        style={{
                          background: ativo ? `${opt.color}20` : 'rgba(255,255,255,0.04)',
                          borderColor: ativo ? opt.color : 'rgba(255,255,255,0.08)',
                          color: ativo ? opt.color : 'rgba(255,255,255,0.7)',
                        }}
                      >
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: opt.color }} />
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Ação: abrir a conversa no Atendimento */}
            {leadAtual.session_id ? (
              <Link
                href={`/crm/atendimento?session=${leadAtual.session_id}`}
                className="mt-12 w-full inline-flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-semibold text-white"
                style={{
                  background: 'linear-gradient(135deg,var(--ws-blue),var(--ws-purple))',
                  boxShadow: '0 4px 16px rgba(0,110,255,0.2)'
                }}
              >
                <MessageSquare size={16} />
                Ver Conversa no Atendimento
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
