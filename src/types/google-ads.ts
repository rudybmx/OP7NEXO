export type EstrategiaLance =
  | 'TARGET_CPA'
  | 'TARGET_ROAS'
  | 'MAXIMIZE_CONVERSIONS'
  | 'MAXIMIZE_CONVERSION_VALUE'
  | 'MANUAL_CPC'
  | 'ENHANCED_CPC'
  | 'TARGET_IMPRESSION_SHARE'
  | 'MAXIMIZE_CLICKS'

export type TipoCampanha =
  | 'SEARCH'
  | 'DISPLAY'
  | 'PERFORMANCE_MAX'
  | 'VIDEO'
  | 'SHOPPING'
  | 'DEMAND_GEN'

export type StatusGoogle = 'ENABLED' | 'PAUSED' | 'REMOVED'
export type MatchType = 'EXACT' | 'PHRASE' | 'BROAD'
export type AdStrength = 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'POOR' | 'PENDING'
export type SeveridadeInsight = 'alerta' | 'oportunidade' | 'info'

export interface CampanhaGoogle {
  id: string
  nome: string
  tipo: TipoCampanha
  status: StatusGoogle
  orcamentoDiario: number
  investimento: number
  cliques: number
  impressoes: number
  conversoes: number
  valorConversoes: number
  ctr: number
  cpcMedio: number
  cpm: number
  roas: number
  taxaConversao: number
  custoConversao: number
  impressionShare: number
  isPeridoBudget: number
  isPerdidoRank: number
  absoluteTopIS: number
  qualityScoreMedio: number
}

export interface GrupoAnuncios {
  id: string
  campanhaId: string
  nome: string
  status: StatusGoogle
  investimento: number
  cliques: number
  impressoes: number
  conversoes: number
  ctr: number
  cpcMedio: number
  roas: number
  taxaConversao: number
  custoConversao: number
  qualityScoreMedio: number
  keywordsAtivas: number
}

export interface FiltrosCampanhasGoogle {
  busca: string
  tipo: string
  status: string
  ordenarPor: 'investimento' | 'conversoes' | 'roas' | 'ctr' | 'qualityScore'
  ordem: 'asc' | 'desc'
}

export interface DadosDiarios {
  data: string
  cliques: number
  impressoes: number
  conversoes: number
  custo: number
  ctr: number
}

export interface BreakdownTipo {
  tipo: TipoCampanha
  label: string
  investimento: number
  cliques: number
  conversoes: number
  ctr: number
  roas: number
  cor: string
}

export interface DistribuicaoQS {
  faixa: string
  quantidade: number
  cor: string
}

export interface KpiGoogleVisaoGeral {
  investimentoTotal: number
  cliquesTotal: number
  conversoesTotal: number
  ctrMedio: number
  cpcMedio: number
  roasMedio: number
  impressionShareMedio: number
  qualityScoreMedio: number
  deltaInvestimento: number
  deltaCliques: number
  deltaConversoes: number
  deltaCtr: number
  deltaCpc: number
  deltaRoas: number
}

export interface InsightGoogle {
  id: string
  campanhaId?: string
  severidade: SeveridadeInsight
  titulo: string
  mensagem: string
  analiseCompleta: string
  labelAcao: string
}

export interface GrupoAnunciosDetalhe {
  id: string
  campanhaId: string
  campanhaNome: string
  tipoCampanha: TipoCampanha
  nome: string
  status: StatusGoogle

  estrategiaLance: EstrategiaLance
  targetCpaMicros: number | null
  targetRoas: number | null
  cpcMaximoMicros: number | null
  emAprendizado: boolean
  diasAprendizado: number

  investimento: number
  cliques: number
  impressoes: number
  conversoes: number
  valorConversoes: number
  ctr: number
  cpcMedio: number
  cpm: number
  roas: number
  taxaConversao: number
  custoConversao: number

  qualityScoreMedio: number
  keywordsAtivas: number
  keywordsTotal: number
  adStrength: AdStrength | null
  anunciosAtivos: number

  impressionShare: number | null
  isPerdidoBudget: number | null
  isPerdidoRank: number | null
}

export interface FiltrosGruposGoogle {
  busca: string
  campanhaId: string
  status: string
  estrategia: string
  ordenarPor: 'investimento' | 'conversoes' | 'roas' | 'ctr' | 'qualityScore' | 'custoConversao'
  ordem: 'asc' | 'desc'
}

export interface KeywordGoogle {
  id: string
  adGroupId: string
  campanhaId: string
  texto: string
  matchType: MatchType
  status: StatusGoogle
  qualityScore: number
  investimento: number
  cliques: number
  impressoes: number
  conversoes: number
  ctr: number
  cpcMedio: number
  custoConversao: number
}

export interface AdGoogle {
  id: string
  adGroupId: string
  campanhaId: string
  titulo: string
  desc: string
  status: StatusGoogle
  adStrength: AdStrength
  investimento: number
  cliques: number
  impressoes: number
  conversoes: number
  ctr: number
  cpcMedio: number
  custoConversao: number
}

export interface PublicoGoogle {
  id: string
  nome: string
  leads: number
  investimento: number
  cpl: number
  ctr: number
  percentual: number
}

export interface FiltrosGoogle {
  periodo: '7d' | '30d' | '90d'
  tipoCampanha: string
  status: string
}
