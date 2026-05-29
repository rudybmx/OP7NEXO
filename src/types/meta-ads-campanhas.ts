import type { ObjetivoCampanha } from '@/lib/objetivos-meta'
import type { PlataformaResumo } from '@/lib/plataformas-meta'

export type { ObjetivoCampanha } from '@/lib/objetivos-meta'

export type StatusCampanha = 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED' | 'LEARNING' | 'CONCLUIDO' | 'OUTRO'
export type TipoCriativo = 'IMAGE' | 'VIDEO' | 'CAROUSEL'
export type Plataforma = 'facebook' | 'instagram' | 'whatsapp'
export type ResultadoFiltro = 'performance' | 'todos'

export interface Criativo {
  id: string
  tipo: TipoCriativo
  thumbnailUrl?: string
  imageUrlHq?: string
  corFundo: string
}

export interface Anuncio {
  id: string
  nome: string
  status: StatusCampanha
  plataformas: Plataforma[]
  criativo: Criativo
  permalinkUrl?: string       // Meta Ads Library URL for the ad (always set as fallback)
  instagramPermalink?: string // Real Instagram post URL (only when ad was created from existing post)
  investimento: number
  leads: number
  cliques: number
  impressoes: number
  alcance: number
  cpl: number
  ctr: number
  cpc: number
  cpm: number
  frequencia: number
  indiceDesempenho: number
  dataAtualizacao?: string
  veiculacao?: string
  veiculacaoLabel?: string
  veiculacaoMotivo?: string | null
  plataformasResumo?: PlataformaResumo[]
}

export interface ConjuntoAnuncios {
  id: string
  nome: string
  status: StatusCampanha
  plataformas: Plataforma[]
  orcamentoDiario?: number | null
  orcamentoLabel?: string | null
  investimento: number
  leads: number
  cpl: number
  ctr: number
  cpc: number
  cpm: number
  alcance: number
  impressoes: number
  frequencia: number
  indiceDesempenho: number
  dataAtualizacao?: string  // ISO date — from Meta API field: updated_time
  veiculacao?: string
  veiculacaoLabel?: string
  veiculacaoMotivo?: string | null
  plataformasResumo?: PlataformaResumo[]
  anuncios: Anuncio[]
}

export interface Campanha {
  id: string
  nome: string
  nomeAbreviado: string
  objetivo: ObjetivoCampanha
  objetivoOriginal?: string | null
  objetivoLabel: string
  objetivoDescricao: string
  status: StatusCampanha
  plataformas: Plataforma[]
  orcamentoDiario?: number | null
  orcamentoLabel?: string | null
  investimento: number
  leads: number
  cpl: number
  ctr: number
  cpc: number
  cpm: number
  alcance: number
  impressoes: number
  frequencia: number
  indiceDesempenho: number
  dataAtualizacao?: string  // ISO date — from Meta API field: updated_time
  veiculacaoResumo?: 'ATIVA' | 'COM_RESULTADO' | 'INATIVA'
  veiculacao?: string
  veiculacaoLabel?: string
  veiculacaoMotivo?: string | null
  plataformasResumo?: PlataformaResumo[]
  qtdAnunciosAtivos?: number
  qtdAnunciosInativos?: number
  conjuntos: ConjuntoAnuncios[]
}

export interface ResumoCampanhas {
  totalCampanhas: number
  campanhasAtivas: number
  investimentoTotal: number
  leadsTotal: number
  cplMedio: number
  ctrMedio: number
  melhorCpl: number
  melhorCplNome: string
}

export interface FiltrosCampanhas {
  busca: string
  objetivo: string
  veiculacao: string
  resultado: ResultadoFiltro
  plataformas: Plataforma[]
}
