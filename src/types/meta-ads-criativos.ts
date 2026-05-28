export type TipoCriativo = 'IMAGE' | 'VIDEO' | 'CAROUSEL'
export type StatusCriativo = 'evergreen' | 'novo' | 'atencao' | 'fadiga'
export type SeveridadeInsight = 'alerta' | 'oportunidade' | 'info'

export interface CampanhaUsando {
  id: string
  nome: string
  leads: number
  cpl: number
}

export interface VideoMetrics {
  videoViews: number
  thruplay: number
  p25: number
  p50: number
  p75: number
  p100: number
  video3Sec: number
}

export interface Criativo {
  id: string
  baseCreativeId?: string
  cardIndex?: number
  nome: string
  tipo: TipoCriativo
  status: StatusCriativo
  corFundo: string
  thumbnailUrl?: string
  linkAnuncio?: string | null
  headline?: string | null
  destinationUrl?: string | null
  urlTags?: string | null
  utmSource?: string | null
  utmCampaign?: string | null
  utmMedium?: string | null
  utmContent?: string | null
  utmTerm?: string | null
  carouselCards?: Array<{
    card_index: number
    image_url_hq?: string | null
    picture?: string | null
    video_id?: string | null
    link?: string | null
  }>
  currentCarouselIndex?: number
  diasAtivo: number
  campanhas: number
  campanhasDetalhe: CampanhaUsando[]

  leads: number
  investimento: number
  cpl: number
  ctr: number
  cpc: number
  cpm: number
  alcance: number
  impressoes: number
  frequencia: number
  linkClicks?: number
  videoMetrics?: VideoMetrics

  hookRate: number | null
  holdRate: number | null
  videoViews3s: number | null
  videoViews15s: number | null
  videoThruPlays: number | null

  score: number
}

export interface FiltrosCriativos {
  tipo: string
  status: string
  ordenarPor: 'score' | 'leads' | 'cpl' | 'hookRate' | 'holdRate' | 'diasAtivo'
  colunas: number
  campaign_id?: string
  adset_id?: string
}

export interface InsightCriativo {
  id: string
  criativoId: string
  severidade: SeveridadeInsight
  titulo: string
  mensagem: string
  analiseCompleta: string
  labelAcao: string
}
