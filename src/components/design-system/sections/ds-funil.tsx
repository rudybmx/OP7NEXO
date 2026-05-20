'use client'
import { useState } from 'react'
import { Users, Filter, Send, Handshake, CheckCircle2, ChevronDown, ChevronUp, TrendingDown } from 'lucide-react'

interface EtapaFunil {
  id: string
  titulo: string
  leads: number
  percentual: number
  taxaConversao: number
  tempoMedio: string
  cor: string
  icone: React.ReactNode
}

const ETAPAS: EtapaFunil[] = [
  {
    id: 'recepcao',
    titulo: 'Recepção do Lead',
    leads: 1247,
    percentual: 100,
    taxaConversao: 100,
    tempoMedio: '0h',
    cor: 'var(--ws-blue)',
    icone: <Users size={20} />,
  },
  {
    id: 'qualificacao',
    titulo: 'Qualificação',
    leads: 891,
    percentual: 71.5,
    taxaConversao: 71.5,
    tempoMedio: '2h',
    cor: 'var(--ws-purple)',
    icone: <Filter size={20} />,
  },
  {
    id: 'proposta',
    titulo: 'Proposta Enviada',
    leads: 534,
    percentual: 42.8,
    taxaConversao: 59.9,
    tempoMedio: '1.5 dias',
    cor: 'var(--ws-cyan-dark)',
    icone: <Send size={20} />,
  },
  {
    id: 'negociacao',
    titulo: 'Negociação',
    leads: 312,
    percentual: 25.0,
    taxaConversao: 58.4,
    tempoMedio: '3.2 dias',
    cor: 'var(--ws-gold)',
    icone: <Handshake size={20} />,
  },
  {
    id: 'fechamento',
    titulo: 'Fechamento',
    leads: 187,
    percentual: 15.0,
    taxaConversao: 59.9,
    tempoMedio: '5.8 dias',
    cor: 'var(--ws-green)',
    icone: <CheckCircle2 size={20} />,
  },
]

function GlassCard({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)',
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Linha de brilho no topo */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
          zIndex: 1,
        }}
      />
      {children}
    </div>
  )
}

function EtapaCard({
  etapa,
  index,
  expandido,
  onToggle,
}: {
  etapa: EtapaFunil
  index: number
  expandido: boolean
  onToggle: () => void
}) {
  const largura = etapa.percentual
  const etapaAnterior = index > 0 ? ETAPAS[index - 1] : null
  const perda = etapaAnterior ? etapaAnterior.leads - etapa.leads : 0
  const taxaPerda = etapaAnterior ? ((perda / etapaAnterior.leads) * 100).toFixed(1) : '0'

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Barra de progresso visual */}
      <div
        style={{
          width: '100%',
          height: 6,
          background: 'var(--ws-divider)',
          borderRadius: 3,
          marginBottom: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${largura}%`,
            height: '100%',
            background: etapa.cor,
            borderRadius: 3,
            transition: 'width 0.6s ease',
          }}
        />
      </div>

      <GlassCard
        style={{
          cursor: 'pointer',
          transition: 'var(--ws-transition)',
        }}
      >
        <div
          onClick={onToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '16px 20px',
            position: 'relative',
            zIndex: 2,
          }}
        >
          {/* Ícone com cor */}
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--ws-radius-md)',
              background: `${etapa.cor}15`,
              border: `1px solid ${etapa.cor}30`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: etapa.cor,
              flexShrink: 0,
            }}
          >
            {etapa.icone}
          </div>

          {/* Info principal */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--ws-text-1)',
                }}
              >
                {index + 1}. {etapa.titulo}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: etapa.cor,
                  background: `${etapa.cor}15`,
                  border: `1px solid ${etapa.cor}30`,
                  borderRadius: 9999,
                  padding: '1px 8px',
                }}
              >
                {etapa.percentual}%
              </span>
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--ws-text-2)',
              }}
            >
              {etapa.leads.toLocaleString()} leads • Conversão:{' '}
              <span style={{ color: 'var(--ws-green)', fontWeight: 500 }}>
                {etapa.taxaConversao}%
              </span>
            </div>
          </div>

          {/* Expandir */}
          <div style={{ color: 'var(--ws-text-3)' }}>
            {expandido ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>

        {/* Detalhes expandidos */}
        {expandido && (
          <div
            style={{
              padding: '0 20px 16px',
              borderTop: '1px solid var(--ws-divider)',
              position: 'relative',
              zIndex: 2,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 16,
                marginTop: 16,
              }}
            >
              {/* Métrica: Leads */}
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--ws-text-3)',
                    marginBottom: 4,
                  }}
                >
                  Leads
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: 'var(--ws-text-1)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {etapa.leads.toLocaleString()}
                </div>
              </div>

              {/* Métrica: Tempo Médio */}
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--ws-text-3)',
                    marginBottom: 4,
                  }}
                >
                  Tempo Médio
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: 'var(--ws-text-1)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {etapa.tempoMedio}
                </div>
              </div>

              {/* Métrica: Perda (se não for primeira etapa) */}
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--ws-text-3)',
                    marginBottom: 4,
                  }}
                >
                  {index === 0 ? 'Taxa Base' : 'Perda'}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: index === 0 ? 'var(--ws-text-1)' : 'var(--ws-coral)',
                    letterSpacing: '-0.02em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {index === 0 ? (
                    '100%'
                  ) : (
                    <>
                      <TrendingDown size={16} />
                      {taxaPerda}%
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Mini leads simulados */}
            {index > 0 && (
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--ws-text-3)',
                    marginBottom: 8,
                  }}
                >
                  Distribuição
                </div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {Array.from({ length: Math.min(etapa.leads, 50) }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: etapa.cor,
                        opacity: 0.6 + (i % 3) * 0.15,
                      }}
                    />
                  ))}
                  {etapa.leads > 50 && (
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--ws-text-3)',
                        marginLeft: 4,
                      }}
                    >
                      +{etapa.leads - 50}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </GlassCard>

      {/* Conector entre etapas */}
      {index < ETAPAS.length - 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '8px 0',
          }}
        >
          <div
            style={{
              width: 2,
              height: 24,
              background: 'linear-gradient(180deg, var(--ws-divider), var(--ws-divider))',
              borderRadius: 1,
            }}
          />
        </div>
      )}
    </div>
  )
}

export function DSFunil() {
  const [expandido, setExpandido] = useState<string | null>(null)

  const toggleEtapa = (id: string) => {
    setExpandido(expandido === id ? null : id)
  }

  const totalLeads = ETAPAS[0].leads
  const leadsFechados = ETAPAS[ETAPAS.length - 1].leads
  const taxaFinal = ((leadsFechados / totalLeads) * 100).toFixed(1)

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--ws-text-1)',
            marginBottom: 6,
          }}
        >
          Funil de Campanhas
        </h2>
        <p
          style={{
            fontSize: 14,
            color: 'var(--ws-text-2)',
            lineHeight: 1.6,
          }}
        >
          Visualização do funil de conversão de leads desde a recepção até o fechamento.
          Clique em cada etapa para ver detalhes.
        </p>
      </div>

      {/* KPIs do topo */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
          marginBottom: 32,
        }}
      >
        {[
          { label: 'Total de Leads', valor: totalLeads.toLocaleString(), cor: 'var(--ws-blue)' },
          { label: 'Leads Qualificados', valor: ETAPAS[1].leads.toLocaleString(), cor: 'var(--ws-purple)' },
          { label: 'Fechados', valor: leadsFechados.toLocaleString(), cor: 'var(--ws-green)' },
          { label: 'Taxa Final', valor: `${taxaFinal}%`, cor: 'var(--ws-gold)' },
        ].map((kpi) => (
          <GlassCard key={kpi.label} style={{ padding: '16px 20px' }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--ws-text-3)',
                marginBottom: 8,
              }}
            >
              {kpi.label}
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: kpi.cor,
                letterSpacing: '-0.02em',
              }}
            >
              {kpi.valor}
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Funil */}
      <div>
        {ETAPAS.map((etapa, index) => (
          <EtapaCard
            key={etapa.id}
            etapa={etapa}
            index={index}
            expandido={expandido === etapa.id}
            onToggle={() => toggleEtapa(etapa.id)}
          />
        ))}
      </div>

      {/* Footer com legenda */}
      <GlassCard style={{ padding: '16px 20px', marginTop: 8 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--ws-text-3)',
            marginBottom: 12,
          }}
        >
          Legenda
        </div>
        <div
          style={{
            display: 'flex',
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          {ETAPAS.map((etapa) => (
            <div
              key={etapa.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: etapa.cor,
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--ws-text-2)',
                }}
              >
                {etapa.titulo}
              </span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  )
}
