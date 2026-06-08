'use client'

import React from 'react'
import type { FiltrosGoogle } from '@/types/google-ads'
import { useGoogleVisaoGeral } from '@/hooks/use-google-visao-geral'
import { useInsightsGoogle } from '@/hooks/use-insights-google'
import { KpiGoogle } from './kpi-google'
import { GraficoTemporalGoogle } from './grafico-temporal'
import { ImpressionShare } from './impression-share'
import { BreakdownCampanhas } from './breakdown-campanhas'
import { GraficosQualidade } from './graficos-qualidade'
import { InsightsGoogle } from './insights-google'

interface Props {
  filtros: FiltrosGoogle
  adsAccountId?: string
}

export function VisaoGeralGoogle({ filtros, adsAccountId }: Props) {
  const { campanhas, kpi, dadosDiarios, breakdownTipos, distribuicaoQS, isLoading } = useGoogleVisaoGeral(filtros, adsAccountId)
  const insights = useInsightsGoogle(campanhas)

  const [isMobile, setIsMobile] = React.useState(false)
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <div className="space-y-4">
      <InsightsGoogle insights={insights} />
      {kpi !== null && <KpiGoogle kpi={kpi} campanhas={campanhas} />}
      <GraficoTemporalGoogle dados={dadosDiarios} />
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
        <ImpressionShare campanhas={campanhas} />
        <BreakdownCampanhas tipos={breakdownTipos} />
      </div>
      <GraficosQualidade campanhas={campanhas} distribuicaoQS={distribuicaoQS} />
    </div>
  )
}
