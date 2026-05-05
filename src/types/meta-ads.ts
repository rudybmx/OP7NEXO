export type PlaceholderPlatform =
  | 'facebook_feed'
  | 'facebook_stories'
  | 'instagram_feed'
  | 'instagram_stories'
  | 'instagram_reels'
  | 'messenger'
  | 'whatsapp'
  | 'audience_network'

export interface LeadsByPlatform {
  platform: PlaceholderPlatform
  label: string
  count: number
  color: string
}

export interface ComparativoPeriodo {
  investimento: number
  leads: number
  cpl: number
  ctr: number
  cpc: number
  cpm: number
  alcance: number
  impressoes: number
  frequencia: number
}

export interface ContaAnuncio {
  id: string
  nome: string
  nomeAbreviado?: string
  status: 'ACTIVE' | 'DISABLED' | 'UNSETTLED'
  investimento: number
  leads: number
  leadsMensagem: number
  leadsCadastro: number
  leadsCompra: number
  leadsPorPlataforma: LeadsByPlatform[]
  cpl: number
  ctr: number
  cpc: number
  cpm: number
  alcance: number
  impressoes: number
  frequencia: number
  saldo: number
  saldoInicial: number
  metaAccountId?: string            // Meta text ID: "act_394136101703780"
  isPrepay?: boolean
  limiteCartao?: number
  ultimoValorRecarga?: number
  fundingSourceType?: string
  periodoAnterior?: ComparativoPeriodo
}

export type TipoComparativo = 'periodo_anterior' | 'mes_anterior' | 'ano_anterior' | 'nenhum'

export interface CriativoTop {
  id: string
  nome: string
  tipo: 'IMAGE' | 'VIDEO' | 'CAROUSEL'
  thumbnailUrl?: string
  leads: number
  ctr: number
  cpl: number
}

export interface DadosDiarios {
  data: string
  investimento: number
  leads: number
}

export interface MetaInsightsVisaoGeral {
  contas: ContaAnuncio[]
  dadosDiarios: DadosDiarios[]
  topCriativos: CriativoTop[]
  insightsIA?: any[] // Usando any[] temporariamente para evitar circular dependency ou importar tipo específico
  periodo: { inicio: string; fim: string }
}

export interface FiltrosMeta {
  agrupamento: string | null
  contaIds: string[]
  dataInicio: string
  dataFim: string
  comparativo: TipoComparativo
}