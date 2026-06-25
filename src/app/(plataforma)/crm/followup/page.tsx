"use client"

import React, { useState, useMemo } from 'react'
import {
  Plus,
  Filter,
  Search,
  Calendar,
  Clock,
  ChevronRight,
  Smartphone,
  Globe,
  MessageCircle,
  Briefcase,
  Music
} from 'lucide-react'
import { useFollowup } from '@/hooks/use-followup'
import { FollowupLead, FiltrosFollowup, LeadOrigem } from '@/types/followup'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FollowupKpis } from '@/components/followup/followup-kpis'
import { FollowupGraficoTentativas } from '@/components/followup/followup-grafico-tentativas'
import { FollowupTabela } from '@/components/followup/followup-tabela'
import { 
  format, 
  parseISO, 
  isToday, 
  isTomorrow, 
  isPast, 
  addDays, 
  differenceInHours 
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTES AUXILIARES INLINE (CONFORME REQUISITADO)
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

export default function FollowupPage() {
  const { 
    listarLeads, 
    metricas, 
    leads, 
    atualizarStatusFechamento, 
    atualizarTemperatura 
  } = useFollowup()
  
  const [filtros, setFiltros] = useState<FiltrosFollowup>({
    status: 'todos',
    status_fechamento: 'todos', 
    temperatura: 'todos',
    origem: 'todos',
    agente_id: '',
    proximo_envio_range: 'todos',
    busca: '',
    periodo: 'atual',
  })

  const [filtroProximos, setFiltroProximos] = useState<'todos' | 'hoje' | 'amanha' | '7dias' | 'atrasados'>('todos')
  const [leadSelecionado, setLeadSelecionado] = useState<FollowupLead | null>(null)
  const [painelAberto, setPainelAberto] = useState(false)

  const leadsFiltrados = listarLeads(filtros)

  // Lógica de Próximos Disparos
  const proximosDisparos = useMemo(() => {
    const agora = new Date()
    return leads
      .filter(l => l.status_followup === 'ativo' || l.status_followup === 'vencido')
      .filter(l => {
        if (!l.proximo_envio) return false
        const data = parseISO(l.proximo_envio)
        
        if (filtroProximos === 'todos') return true
        if (filtroProximos === 'hoje') return isToday(data)
        if (filtroProximos === 'amanha') return isTomorrow(data)
        if (filtroProximos === 'atrasados') return isPast(data) && !isToday(data)
        if (filtroProximos === '7dias') return data <= addDays(agora, 7)
        return true
      })
      .sort((a, b) => {
        if (!a.proximo_envio || !b.proximo_envio) return 0
        return parseISO(a.proximo_envio).getTime() - parseISO(b.proximo_envio).getTime()
      })
      .slice(0, 20) // Limite maior para o scroll interno
  }, [leads, filtroProximos])

  const getUrgenciaColor = (dateStr?: string) => {
    if (!dateStr) return 'var(--ws-text-3)'
    const data = parseISO(dateStr)
    if (isPast(data) && !isToday(data)) return 'var(--ws-coral)'
    if (isToday(data)) return 'var(--ws-green)'
    if (isTomorrow(data)) return 'var(--ws-gold)'
    return 'var(--ws-text-3)'
  }

  const handleLeadClick = (lead: FollowupLead) => {
    setLeadSelecionado(lead)
    setPainelAberto(true)
  }

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
            Reengaje leads inativos com sequências inteligentes de mensagens
          </p>
        </div>
        <Button 
          style={{ 
            background: 'linear-gradient(135deg,var(--ws-blue),var(--ws-purple))',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--ws-radius-md)',
            boxShadow: '0 4px 16px rgba(0,110,255,0.35)'
          }}
          className="gap-2"
        >
          <Plus size={18} />
          Novo Lead
        </Button>
      </div>

      {/* KPI Cards */}
      <FollowupKpis metricas={metricas} />

      {/* Top Row: Gráfico e Próximos Disparos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Parte B: Gráfico */}
        <FollowupGraficoTentativas leads={leads} />

        {/* Parte C: Próximos Disparos */}
        <div style={{ 
          background: 'var(--ws-glass-bg)',
          border: '1px solid var(--ws-glass-border)',
          borderRadius: 'var(--ws-radius-lg)',
          backdropFilter: 'blur(16px)',
          boxShadow: 'var(--ws-glass-shadow)',
          padding: '20px',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          height: '320px'
        }}>
          <div style={{ position:'absolute',top:0,left:0,right:0,height:1,
            background:'linear-gradient(90deg,transparent,var(--ws-glass-border),transparent)',
            pointerEvents:'none' }} />

          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 style={{ 
                fontSize: '10px', 
                fontWeight: 'bold', 
                textTransform: 'uppercase', 
                color: 'var(--ws-text-2)',
                letterSpacing: '0.05em'
              }}>
                Próximos Disparos
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--ws-text-3)' }}>
                filas de automação pendentes
              </p>
            </div>
            <div style={{
              background: 'var(--ws-surface-2)',
              padding: '2px 8px',
              borderRadius: '99px',
              fontSize: '10px',
              fontWeight: 600,
              color: 'var(--ws-text-2)',
              border: '1px solid var(--ws-glass-border)'
            }}>
              {proximosDisparos.length} total
            </div>
          </div>

          <div className="flex flex-wrap gap-1 mb-4">
            {['todos', 'hoje', 'amanha', '7dias', 'atrasados'].map((f) => (
              <button
                key={f}
                onClick={() => setFiltroProximos(f as any)}
                style={{
                  background: filtroProximos === f ? 'rgba(201,168,76,0.12)' : 'transparent',
                  border: filtroProximos === f ? '1px solid var(--ws-gold)' : '1px solid transparent',
                  color: filtroProximos === f ? 'var(--ws-gold)' : 'var(--ws-text-3)',
                  borderRadius: 'var(--ws-radius-sm)',
                  padding: '4px 12px',
                  fontSize: 11,
                  fontWeight: filtroProximos === f ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {f === 'amanha' ? 'AMANHÃ' : f === '7dias' ? '7 DIAS' : f.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
            {proximosDisparos.map((lead) => (
              <div 
                key={lead.id}
                onClick={() => handleLeadClick(lead)}
                style={{
                  padding: '10px 12px',
                  background: 'var(--ws-surface-2)',
                  borderRadius: '8px',
                  borderLeft: `3px solid ${getUrgenciaColor(lead.proximo_envio)}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, background 0.2s'
                }}
                className="hover:bg-white/5 active:scale-[0.98]"
              >
                <div style={{ 
                  fontSize: '11px', 
                  fontWeight: 'bold', 
                  color: getUrgenciaColor(lead.proximo_envio),
                  minWidth: '50px' 
                }}>
                  {lead.proximo_envio ? format(parseISO(lead.proximo_envio), 'HH:mm') : '--:--'}
                </div>

                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ws-text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {lead.nome}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--ws-text-3)' }}>
                    {lead.telefone}
                  </div>
                </div>

                <div style={{ 
                  fontSize: '10px', 
                  fontWeight: 600, 
                  color: 'var(--ws-text-2)',
                  background: 'var(--ws-surface-2)',
                  padding: '2px 6px',
                  borderRadius: '4px'
                }}>
                  T{lead.tentativa_atual}
                </div>

                {lead.temperatura && (
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: lead.temperatura === 'quente' ? 'var(--ws-coral)' : lead.temperatura === 'morno' ? 'var(--ws-gold)' : 'var(--ws-blue)'
                  }} />
                )}

                <OrigemIcon origem={lead.origem} />
              </div>
            ))}

            {proximosDisparos.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center opacity-40 py-8">
                <Clock size={32} className="mb-2" />
                <p className="text-xs">Nenhum disparo agendado</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div 
        style={{ 
          background: 'var(--ws-glass-bg)',
          border: '1px solid var(--ws-glass-border)',
          borderRadius: 'var(--ws-radius-lg)',
          backdropFilter: 'blur(16px)',
          boxShadow: 'var(--ws-glass-shadow)',
          position: 'relative',
          overflow: 'hidden'
        }}
        className="p-4"
      >
        <div style={{ position:'absolute',top:0,left:0,right:0,height:1,
          background:'linear-gradient(90deg,transparent,var(--ws-glass-border),transparent)',
          pointerEvents:'none' }} />

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
          {/* Linha de brilho no topo */}
          <div style={{ position:'absolute',top:0,left:0,right:0,height:1,
            background:'linear-gradient(90deg,transparent,var(--ws-glass-border),transparent)',
            pointerEvents:'none' }} />

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

          {/* Botões de status */}
          <div className="flex gap-1.5 p-1">
            {['todos', 'ativo', 'vencido', 'esgotado', 'ganho'].map((s) => (
              <button
                key={s}
                onClick={() => setFiltros(f => ({ ...f, status: s as any }))}
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

          <Button variant="ghost" className="text-[color:var(--ws-text-2)] gap-2 border border-[var(--ws-glass-border)] bg-[var(--ws-surface-2)] hover:bg-[var(--ws-glass-bg)] text-xs py-1 h-8">
            <Calendar size={14} />
            Período
          </Button>

          <Button variant="ghost" className="text-[color:var(--ws-text-2)] gap-2 border border-[var(--ws-glass-border)] bg-[var(--ws-surface-2)] hover:bg-[var(--ws-glass-bg)] text-xs py-1 h-8">
            <Filter size={14} />
            Mais Filtros
          </Button>
        </div>

        <FollowupTabela 
          leads={leadsFiltrados} 
          onLeadClick={handleLeadClick}
          onStatusFechamentoChange={atualizarStatusFechamento}
          onTemperaturaChange={atualizarTemperatura}
        />
      </div>

      {/* Painel Lateral Lead - Sliding Panel */}
      {painelAberto && leadSelecionado && (
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
            justifyContent: 'flex-start' // ESQUERDA PARA DIREITA
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
                <h2 className="text-2xl font-bold mb-1">{leadSelecionado.nome || 'Lead sem nome'}</h2>
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Smartphone size={14} />
                  {leadSelecionado.telefone}
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
              {/* Status Section */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                  <p className="text-[9px] uppercase text-muted-foreground mb-1 font-bold">Temperatura</p>
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: leadSelecionado.temperatura === 'quente' ? 'var(--ws-coral)' : 'var(--ws-gold)' }} />
                    {leadSelecionado.temperatura?.toUpperCase()}
                  </div>
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                  <p className="text-[9px] uppercase text-muted-foreground mb-1 font-bold">Origem</p>
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <OrigemIcon origem={leadSelecionado.origem} size={14} />
                    {leadSelecionado.origem.replace('_', ' ').toUpperCase()}
                  </div>
                </div>
              </div>

              {/* IA Summary */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-white/10 to-transparent border border-white/10 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-full bg-[var(--ws-blue)] flex items-center justify-center text-[10px] font-bold">IA</div>
                  <h4 className="text-[10px] uppercase font-bold tracking-widest text-white/60">Resumo da Interação</h4>
                </div>
                <p className="text-sm leading-relaxed text-white/90">
                  {leadSelecionado.ultimo_resumo || "O robô ainda não processou um resumo detalhado para este lead."}
                </p>
              </div>

              {/* Sequência / Histórico */}
              <div>
                <h4 className="text-[10px] uppercase font-bold tracking-widest text-white/40 mb-4 px-1">Próximos Passos na Cadência</h4>
                <div className="space-y-3 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-px before:bg-white/10">
                  {[1, 2, 3, 4].map((step) => {
                    const isDone = step < leadSelecionado.tentativa_atual
                    const isCurrent = step === leadSelecionado.tentativa_atual
                    return (
                      <div key={step} className="flex gap-4 items-start relative">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold z-10 
                          ${isDone ? 'bg-[var(--ws-green)] text-white' : isCurrent ? 'bg-[var(--ws-blue)] text-white' : 'bg-white/5 text-white/20'}`}>
                          {isDone ? '✓' : step}
                        </div>
                        <div className="flex-1 pt-1">
                          <p className={`text-xs font-bold ${isCurrent ? 'text-white' : 'text-white/40'}`}>
                            Mensagem {step}
                          </p>
                          {isCurrent && (
                            <p className="text-[10px] text-[var(--ws-blue)] font-medium mt-0.5">
                              {leadSelecionado.proximo_envio ? `Programado para ${format(parseISO(leadSelecionado.proximo_envio), 'dd/MM HH:mm')}` : 'Aguardando agendamento'}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <Button 
              className="mt-12 w-full gap-2"
              style={{ 
                background: 'linear-gradient(135deg,var(--ws-blue),var(--ws-purple))',
                boxShadow: '0 4px 16px rgba(0,110,255,0.2)'
              }}
            >
              <MessageCircle size={16} />
              Abrir no WhatsApp
            </Button>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--ws-glass-border);
          border-radius: 99px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--ws-text-3);
        }
      `}</style>
    </div>
  )
}
