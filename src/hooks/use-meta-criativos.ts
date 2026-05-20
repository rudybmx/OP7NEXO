'use client'

import useSWR from 'swr'
import api from '@/lib/api-client'
import { Criativo, FiltrosCriativos, TipoCriativo, StatusCriativo } from '@/types/meta-ads-criativos'
import { useWorkspace } from '@/lib/workspace-context'

interface CriativoRow {
  creative_id: string
  tipo_criativo: string
  thumbnail_url: string | null
  image_url_hq: string | null
  link_anuncio: string | null
  status: string | null
  total_anuncios: number
  total_campanhas: number
  dias_ativo: number
  spend: number
  leads: number
  impressions: number
  reach: number
  clicks: number
  ctr: number
  cpc: number
  cpm: number
  cpl: number
  frequencia: number
  score: number
  link_click?: number
  video_metrics?: {
    video_views: number
    thruplay: number
    p25: number
    p50: number
    p75: number
    p100: number
    video_3_sec: number
  }
}

interface CatalogoCriativoRow {
  creative_id: string
  nome: string | null
  tipo_criativo: string
  thumbnail_url: string | null
  image_url_hq: string | null
  link_anuncio: string | null
  headline?: string | null
  destination_url?: string | null
  url_tags?: string | null
  utm_source?: string | null
  utm_campaign?: string | null
  utm_medium?: string | null
  utm_content?: string | null
  utm_term?: string | null
  carousel_cards?: Array<{
    card_index: number
    image_url_hq?: string | null
    picture?: string | null
  }>
}

function scoreToStatus(score: number, diasAtivo: number): StatusCriativo {
  if (diasAtivo <= 7) return 'novo'
  if (score < 50) return 'fadiga'
  if (score < 75) return 'atencao'
  return 'evergreen'
}

function mapCriativo(row: CriativoRow, cat?: CatalogoCriativoRow): Criativo {
  const score = row.score ?? 0
  const diasAtivo = row.dias_ativo ?? 0
  return {
    id:            row.creative_id,
    baseCreativeId: row.creative_id,
    nome:          cat?.nome || row.creative_id,
    tipo:          (((cat?.tipo_criativo || row.tipo_criativo || 'IMAGE').toUpperCase()) as TipoCriativo),
    status:        scoreToStatus(score, diasAtivo),
    corFundo:      '#f0f0f0',
    thumbnailUrl:  cat?.image_url_hq ?? cat?.thumbnail_url ?? row.image_url_hq ?? row.thumbnail_url ?? undefined,
    linkAnuncio:   cat?.link_anuncio ?? undefined,
    headline:      cat?.headline ?? undefined,
    destinationUrl: cat?.destination_url ?? undefined,
    urlTags:       cat?.url_tags ?? undefined,
    utmSource:     cat?.utm_source ?? undefined,
    utmCampaign:   cat?.utm_campaign ?? undefined,
    utmMedium:     cat?.utm_medium ?? undefined,
    utmContent:    cat?.utm_content ?? undefined,
    utmTerm:       cat?.utm_term ?? undefined,
    carouselCards: cat?.carousel_cards ?? [],
    diasAtivo,
    campanhas:     row.total_campanhas,
    campanhasDetalhe: [],
    leads:         row.leads,
    investimento:  row.spend,
    cpl:           row.cpl,
    ctr:           row.ctr,
    cpc:           row.cpc,
    cpm:           row.cpm,
    alcance:       row.reach,
    impressoes:    row.impressions,
    frequencia:    row.frequencia,
    linkClicks:    row.link_click ?? 0,
    videoMetrics:  row.video_metrics ? {
      videoViews: row.video_metrics.video_views,
      thruplay: row.video_metrics.thruplay,
      p25: row.video_metrics.p25,
      p50: row.video_metrics.p50,
      p75: row.video_metrics.p75,
      p100: row.video_metrics.p100,
      video3Sec: row.video_metrics.video_3_sec,
    } : undefined,
    hookRate:      null,
    holdRate:      null,
    videoViews3s:  null,
    videoViews15s: null,
    videoThruPlays: null,
    score,
  }
}

export function useMetaCriativos(
  filtros: FiltrosCriativos,
  dataInicio: string,
  dataFim: string,
  contaIds: string[] = [],
  workspaceId: string | null = null,
) {
  const { workspaceAtivo } = useWorkspace()
  const wsId = (workspaceId ?? workspaceAtivo) ?? undefined

  const contaIdsParam = contaIds.length
    ? `&conta_ids=${contaIds.join(',')}`
    : ''
  const campParam = filtros.campaign_id && filtros.campaign_id !== 'todas'
    ? `&campaign_id=${filtros.campaign_id}`
    : ''
  const adsetParam = filtros.adset_id && filtros.adset_id !== 'todos'
    ? `&adset_id=${filtros.adset_id}`
    : ''

  const key = wsId
    ? `/meta/insights/criativos?workspace_id=${wsId}&data_inicio=${dataInicio}&data_fim=${dataFim}${contaIdsParam}${campParam}${adsetParam}`
    : null
  const catalogKey = wsId
    ? `/meta/catalogo/criativos?workspace_id=${wsId}&limit=5000${campParam}`
    : null

  const { data: rows, isLoading, error } = useSWR(
    key,
    () => api.get<CriativoRow[]>(key!),
    { revalidateOnFocus: false }
  )
  const { data: catalogRows } = useSWR(
    catalogKey,
    () => api.get<CatalogoCriativoRow[]>(catalogKey!),
    { revalidateOnFocus: false }
  )

  const catMap = new Map((catalogRows ?? []).map((c) => [c.creative_id, c] as const))
  let resultado = (rows ?? []).map((row) => {
    const cat = catMap.get(row.creative_id)
    return mapCriativo(row, cat)
  })

  if (filtros.tipo !== 'todos') {
    resultado = resultado.filter(c => c.tipo === filtros.tipo)
  }
  if (filtros.status !== 'todos') {
    resultado = resultado.filter(c => c.status === filtros.status)
  }

  resultado.sort((a, b) => {
    switch (filtros.ordenarPor) {
      case 'leads':    return b.leads - a.leads
      case 'cpl':      return a.cpl - b.cpl
      case 'hookRate':
        if (a.hookRate === null) return 1
        if (b.hookRate === null) return -1
        return b.hookRate - a.hookRate
      case 'holdRate':
        if (a.holdRate === null) return 1
        if (b.holdRate === null) return -1
        return b.holdRate - a.holdRate
      case 'diasAtivo': return b.diasAtivo - a.diasAtivo
      default:          return b.score - a.score
    }
  })

  return { criativos: resultado, total: resultado.length, isLoading, error: error ?? null }
}
