import type { CampanhaGoogle, DadosDiarios, BreakdownTipo, DistribuicaoQS, KpiGoogleVisaoGeral, FiltrosGoogle } from '@/types/google-ads'
import { 
  MOCK_CAMPANHAS_GOOGLE, 
  MOCK_DADOS_DIARIOS_GOOGLE, 
  MOCK_BREAKDOWN_TIPOS, 
  MOCK_DISTRIBUICAO_QS_GOOGLE,
  MOCK_INSIGHTS_GOOGLE
} from '@/lib/mock-google-ads'

export function useGoogleVisaoGeral(filtros: FiltrosGoogle) {
  // Simulando busca de dados
  const hasData = true // Aqui seria rpc/get_google_data
  
  let campanhas = hasData ? [...MOCK_CAMPANHAS_GOOGLE] : []

  if (filtros.tipoCampanha !== 'todas')
    campanhas = campanhas.filter(c => c.tipo === filtros.tipoCampanha)
  if (filtros.status !== 'todos')
    campanhas = campanhas.filter(c => c.status === filtros.status)

  const len = campanhas.length || 1

  const kpi: KpiGoogleVisaoGeral = {
    investimentoTotal: campanhas.reduce((s, c) => s + c.investimento, 0),
    cliquesTotal: campanhas.reduce((s, c) => s + c.cliques, 0),
    conversoesTotal: campanhas.reduce((s, c) => s + c.conversoes, 0),
    ctrMedio: campanhas.reduce((s, c) => s + c.ctr, 0) / len,
    cpcMedio: campanhas.reduce((s, c) => s + c.cpcMedio, 0) / len,
    roasMedio: campanhas.reduce((s, c) => s + c.roas * c.investimento, 0) /
               Math.max(1, campanhas.reduce((s, c) => s + c.investimento, 0)),
    impressionShareMedio: campanhas
      .filter(c => c.impressionShare > 0)
      .reduce((s, c) => s + c.impressionShare, 0) /
      Math.max(1, campanhas.filter(c => c.impressionShare > 0).length),
    qualityScoreMedio: campanhas
      .filter(c => c.qualityScoreMedio > 0)
      .reduce((s, c) => s + c.qualityScoreMedio, 0) /
      Math.max(1, campanhas.filter(c => c.qualityScoreMedio > 0).length),
    deltaInvestimento: 14.2,
    deltaCliques: 8.6,
    deltaConversoes: 22.1,
    deltaCtr: 0.4,
    deltaCpc: -6.2,
    deltaRoas: 18.3,
  }

  const breakdownTipos: BreakdownTipo[] = hasData ? MOCK_BREAKDOWN_TIPOS : []
  const distribuicaoQS: DistribuicaoQS[] = hasData ? MOCK_DISTRIBUICAO_QS_GOOGLE : []
  const insights = hasData ? MOCK_INSIGHTS_GOOGLE : []

  return { 
    campanhas, 
    kpi, 
    dadosDiarios: hasData ? MOCK_DADOS_DIARIOS_GOOGLE : [], 
    breakdownTipos, 
    distribuicaoQS,
    insights
  }
}
