'use client'

import type { KpiGoogleVisaoGeral, CampanhaGoogle } from '@/types/google-ads'
import { formatarMoeda, formatarNumeroCompacto, formatarPorcentagem } from '@/lib/formatar'
import { InfoTooltip } from '@/components/ui/info-tooltip'

const NOTA_JANELA =
  'Métrica agregada refletindo o período total de sincronização da conta (não o intervalo de datas selecionado). O Google Ads não fornece esta métrica de forma somável por dia.'

interface Props {
  kpi: KpiGoogleVisaoGeral
  campanhas: CampanhaGoogle[]
}

function Delta({ valor, invertido }: { valor: number; invertido?: boolean }) {
  const positivo = invertido ? valor < 0 : valor > 0
  const cor = positivo ? '#3b6d11' : '#a32d2d'
  const sinal = valor >= 0 ? '+' : ''
  return (
    <span style={{ fontSize: 11, color: cor }}>
      {sinal}{valor.toFixed(1).replace('.', ',')}%
    </span>
  )
}

export function KpiGoogle({ kpi, campanhas }: Props) {
  const searchCamps = campanhas.filter(c => c.impressionShare > 0)
  const isMedia = searchCamps.length > 0
    ? searchCamps.reduce((s, c) => s + c.impressionShare, 0) / searchCamps.length
    : kpi.impressionShareMedio
  const isBudgetMedia = searchCamps.length > 0
    ? searchCamps.reduce((s, c) => s + c.isPeridoBudget, 0) / searchCamps.length
    : 0
  const isRankMedia = searchCamps.length > 0
    ? searchCamps.reduce((s, c) => s + c.isPerdidoRank, 0) / searchCamps.length
    : 0

  const qs = kpi.qualityScoreMedio
  const qsCor = qs >= 7 ? '#3b6d11' : qs >= 4 ? '#854f0b' : '#a32d2d'
  const qsKeywords = campanhas.filter(c => c.qualityScoreMedio > 0).length

  const cardStyle: React.CSSProperties = {
    background: 'var(--ws-glass-bg)',
    border: '1px solid var(--ws-glass-border)',
    borderRadius: 'var(--ws-radius-lg)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    boxShadow: 'var(--ws-glass-shadow)',
    padding: '14px 16px',
    position: 'relative',
    overflow: 'hidden',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--ws-text-3)',
    marginBottom: 4,
  }

  const valueStyle: React.CSSProperties = {
    fontSize: 22,
    fontWeight: 500,
    color: 'var(--ws-text-1)',
    marginBottom: 2,
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
  }

  const GlowLine = () => (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1,
      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }} />
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
      {/* Investimento */}
      <div style={cardStyle}>
        <GlowLine />
        <div style={labelStyle}>Investimento</div>
        <div style={valueStyle}>{formatarMoeda(kpi.investimentoTotal)}</div>
        <Delta valor={kpi.deltaInvestimento} />
      </div>

      {/* Cliques */}
      <div style={cardStyle}>
        <GlowLine />
        <div style={labelStyle}>Cliques</div>
        <div style={valueStyle}>{formatarNumeroCompacto(kpi.cliquesTotal)}</div>
        <Delta valor={kpi.deltaCliques} />
      </div>

      {/* Conversões */}
      <div style={cardStyle}>
        <GlowLine />
        <div style={labelStyle}>Conversões</div>
        <div style={valueStyle}>{formatarNumeroCompacto(kpi.conversoesTotal)}</div>
        <Delta valor={kpi.deltaConversoes} />
      </div>

      {/* CTR */}
      <div style={cardStyle}>
        <GlowLine />
        <div style={labelStyle}>CTR médio</div>
        <div style={valueStyle}>{formatarPorcentagem(kpi.ctrMedio)}</div>
        <Delta valor={kpi.deltaCtr} />
      </div>

      {/* CPC */}
      <div style={cardStyle}>
        <GlowLine />
        <div style={labelStyle}>CPC médio</div>
        <div style={valueStyle}>{formatarMoeda(kpi.cpcMedio)}</div>
        <Delta valor={kpi.deltaCpc} invertido />
      </div>

      {/* ROAS */}
      <div style={cardStyle}>
        <GlowLine />
        <div style={labelStyle}>ROAS</div>
        <div style={valueStyle}>{kpi.roasMedio.toFixed(1).replace('.', ',')}×</div>
        <Delta valor={kpi.deltaRoas} />
      </div>

      {/* Impression Share */}
      <div style={{ ...cardStyle, gridColumn: 'span 1' }}>
        <GlowLine />
        <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
          Impression Share
          <InfoTooltip title="Impression Share" description={NOTA_JANELA} />
        </div>
        <div style={valueStyle}>{(isMedia * 100).toFixed(0)}%</div>
        {/* Barras de IS */}
        <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ flex: 1, height: 4, background: 'rgba(14,20,42,0.08)', borderRadius: 2 }}>
              <div style={{ width: `${isMedia * 100}%`, height: '100%', background: '#3E5BFF', borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--ws-text-3)', minWidth: 28 }}>{(isMedia * 100).toFixed(0)}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ flex: 1, height: 4, background: 'rgba(14,20,42,0.08)', borderRadius: 2 }}>
              <div style={{ width: `${isBudgetMedia * 100}%`, height: '100%', background: '#ef9f27', borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 10, color: '#854f0b', minWidth: 28 }}>{(isBudgetMedia * 100).toFixed(0)}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ flex: 1, height: 4, background: 'rgba(14,20,42,0.08)', borderRadius: 2 }}>
              <div style={{ width: `${isRankMedia * 100}%`, height: '100%', background: '#a32d2d', borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 10, color: '#a32d2d', minWidth: 28 }}>{(isRankMedia * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 9, color: 'var(--ws-text-3)' }}>
            <span style={{ color: '#3E5BFF' }}>■</span> Cap. 
            <span style={{ color: '#ef9f27', marginLeft: 4 }}>■</span> Orç. 
            <span style={{ color: '#FF5C8D', marginLeft: 4 }}>■</span> Rank
          </span>
        </div>
      </div>

      {/* Quality Score */}
      <div style={cardStyle}>
        <GlowLine />
        <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
          Quality Score
          <InfoTooltip title="Quality Score" description={NOTA_JANELA} />
        </div>
        <div style={{ ...valueStyle, color: qs > 0 ? qsCor : 'var(--ws-text-3)' }}>
          {qs > 0 ? `${qs.toFixed(1).replace('.', ',')}/10` : 'N/A'}
        </div>
        {qs > 0 && (
          <>
            <div style={{ height: 4, background: 'rgba(14,20,42,0.08)', borderRadius: 2, marginBottom: 4 }}>
              <div style={{ width: `${(qs / 10) * 100}%`, height: '100%', background: qsCor, borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--ws-text-3)' }}>
              {qsKeywords} camp. · média Search
            </div>
          </>
        )}
      </div>
    </div>
  )
}
