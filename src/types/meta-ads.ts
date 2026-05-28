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
  leadsWhatsapp: number
  leadsInstagram: number
  leadsMessenger: number
  leadsFormulario: number
  leadsConversa7d?: number
  linkClick?: number
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

export interface VideoMetrics {
  videoViews: number
  thruplay: number
  p25: number
  p50: number
  p75: number
  p100: number
  video3Sec: number
}

export interface CriativoTop {
  id: string
  nome: string
  tipo: 'IMAGE' | 'VIDEO' | 'CAROUSEL'
  thumbnailUrl?: string
  imageUrlHq?: string
  linkAnuncio?: string
  headline?: string | null
  destinationUrl?: string | null
  urlTags?: string | null
  utmSource?: string | null
  utmCampaign?: string | null
  utmMedium?: string | null
  utmContent?: string | null
  utmTerm?: string | null
  carouselItems?: Array<{
    card_index?: number | null
    picture?: string | null
    image_url_hq?: string | null
    video_id?: string | null
    link?: string | null
  }>
  leads: number
  ctr: number
  cpl: number
  linkClicks?: number
  cpm?: number
  frequencia?: number
  videoMetrics?: VideoMetrics
}

export interface DadosDiarios {
  data: string
  investimento: number
  leads: number
}

export interface MetaInsightsVisaoGeral {
  contas: ContaAnuncio[]
  leadsPorCanal: LeadsByPlatform[]
  dadosDiarios: DadosDiarios[]
  topCriativos: CriativoTop[]
  insightsIA?: any[] // Usando any[] temporariamente para evitar circular dependency ou importar tipo específico
  periodo: { inicio: string; fim: string }
}

export interface CampanhaPorCriativo {
  id: string
  nome: string
  leads: number
  spend: number
  cpl: number
  ctr: number
  linkClick: number
  cpm: number
  frequencia: number
}

export interface FiltrosMeta {
  agrupamento: string | null
  contaIds: string[]
  dataInicio: string
  dataFim: string
  comparativo: TipoComparativo
}
