import type { CodigoVeiculacao } from '@/lib/veiculacao'
import type { PlataformaResumo } from '@/lib/plataformas-meta'

export type TipoAnuncio = 'IMAGE' | 'VIDEO' | 'CAROUSEL'
export type StatusAnuncioBase = 'ACTIVE' | 'PAUSED' | 'LEARNING' | 'ARCHIVED'
export type SeveridadeInsight = 'alerta' | 'oportunidade' | 'info'
export type PlataformaFiltroAnuncio = 'todas' | 'facebook' | 'instagram' | 'whatsapp'
export type VisualizacaoAnuncios = 'linhas' | 'blocos'
export type OrdenacaoAnuncio =
  | 'campanha'
  | 'conjunto'
  | 'anuncio'
  | 'score'
  | 'leads'
  | 'cpl'
  | 'ctr'
  | 'frequencia'
  | 'spend'
  | 'hookRate'

export interface VideoMetrics {
  videoViews: number
  thruplay: number
  p25: number
  p50: number
  p75: number
  p100: number
  video3Sec: number
  avgWatchTime?: number | null
}

export interface VideoRetentionPoint {
  label: string
  percentage: number
  views_count: number
}

export interface ResumoAnunciosPerformance {
  investimento_total: number
  leads_total: number
  ctr_medio: number
  frequencia_media: number
}

export interface AnuncioPerformance {
  id: string
  nome: string
  campaignId: string
  campaignName: string
  adsetId: string
  adsetName: string
  creativeId?: string | null
  creativeType: TipoAnuncio
  videoId?: string | null
  videoSourceUrl?: string | null
  videoThumbnailUrl?: string | null
  videoThumbnailHqUrl?: string | null
  thumbnailUrl?: string | null
  imageUrlHq?: string | null
  permalinkUrl?: string | null
  linkAnuncio?: string | null
  carouselItems?: Array<{ picture?: string; image_url_hq?: string; video_id?: string; link?: string }>

  status: StatusAnuncioBase
  veiculacao: CodigoVeiculacao
  veiculacaoLabel: string
  veiculacaoGrupo: string
  veiculacaoMotivo?: string | null
  veiculacaoCor?: string
  veiculacaoCorBg?: string
  veiculacaoCorBorder?: string

  plataformas: Array<'facebook' | 'instagram' | 'whatsapp'>
  plataformasResumo: PlataformaResumo[]
  platformDisplayName: string

  adText?: string | null
  adTitle?: string | null
  headline?: string | null
  adDescription?: string | null
  adCta?: string | null
  adUrl?: string | null
  destinationUrl?: string | null
  urlTags?: string | null
  utmSource?: string | null
  utmCampaign?: string | null
  utmMedium?: string | null
  utmContent?: string | null
  utmTerm?: string | null
  pixelId?: string | null

  investimento: number
  leads: number
  cliques: number
  linkClicks: number
  resultCount?: number | null
  resultIndicator?: string | null
  impressoes: number
  alcance: number
  cpl: number
  ctr: number
  cpc: number
  cpm: number
  frequencia: number
  hookRate?: number | null
  holdRate25?: number | null
  holdRate50?: number | null
  holdRate75?: number | null
  holdRate100?: number | null
  videoMetrics?: VideoMetrics | null
  videoRetentionData?: VideoRetentionPoint[]

  score: number
  tendencia: 'subindo' | 'estavel' | 'caindo'
  diasAtivo: number
}

export interface InsightIA {
  id: string
  anuncioId: string
  severidade: SeveridadeInsight
  titulo: string
  mensagem: string
  analiseCompleta: string
  labelAcao: string
}

export interface FiltrosAnuncios {
  status: 'todos' | CodigoVeiculacao
  plataforma: PlataformaFiltroAnuncio
  tipo: 'todos' | TipoAnuncio
  ordenarPor: OrdenacaoAnuncio
  resultado: 'performance' | 'todos'
}

export interface OpcaoCampanhaAnuncio {
  id: string
  nome: string
}

export interface AnunciosPerformanceResponse {
  items: AnuncioPerformance[]
  page: number
  limit: number
  total: number
  has_more: boolean
  resumo: ResumoAnunciosPerformance
  campanhas_disponiveis: OpcaoCampanhaAnuncio[]
  plataformas_disponiveis: Array<{ codigo: 'facebook' | 'instagram' | 'whatsapp'; label: string }>
}

export type Anuncio = AnuncioPerformance
