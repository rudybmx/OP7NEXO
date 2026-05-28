'use client'

import useSWR from 'swr'
import api from '@/lib/api-client'
import { SWR_OPTS } from '@/lib/swr'
import { formatarMoeda, formatarNumero, formatarPorcentagem } from '@/lib/formatar'
import { makeFallbackPoster, type AdCreativeModalOverviewData } from '@/components/design-system/ad-creative-modal-overview'
import { type AdCreativeModalCampaignData, type CreativeComparativo } from '@/components/design-system/ad-creative-modal-campaign'
import { type AdCreativeModalAdsData, type DiagnosticSignal, type FunnelDiagnostic, type TrackingField, type AdDistribution } from '@/components/design-system/ad-creative-modal-ads'
import { normalizeCarouselItems, type CarouselMediaItem } from '@/components/meta-ads/carousel-media'

export type DetailLookupType = 'ad' | 'creative'

export interface DetailTrendPointApi {
  date: string
  cpl: number
  leads: number
}

export interface DetailPlatformApi {
  platform: 'instagram' | 'facebook'
  leads: number
  spend: number
  ctr: number
  cpl: number
}

export interface DetailComparativoApi {
  ad_id: string
  creative_id?: string | null
  name: string
  thumbnail_url?: string | null
  status?: string | null
  leads: number
  spend: number
  cpl: number
  ctr: number
  is_current?: boolean
}

export interface DetailDistributionApi {
  campaign_id: string
  campaign_name: string
  adset_id: string
  adset_name: string
  status?: string | null
  leads: number
  spend: number
  cpl: number
  ctr: number
}

export interface DetailVideoMetricsApi {
  video_views: number
  thruplay: number
  p25: number
  p50: number
  p75: number
  p100: number
  video_3_sec: number
  hook_rate?: number | null
  hold_rate?: number | null
  ctr_link?: number | null
}

export interface DetailTrackingApi {
  headline?: string | null
  destination_url?: string | null
  url_tags?: string | null
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  utm_term?: string | null
  pixel_id?: string | null
}

export interface AdCreativeDetailApi extends DetailTrackingApi {
  id: string
  lookup_type: DetailLookupType
  lookup_id: string
  period: {
    inicio: string
    fim: string
    label: string
  }
  ad_id?: string | null
  creative_id?: string | null
  name: string
  status: string
  creative_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL'
  thumbnail_url?: string | null
  image_url_hq?: string | null
  meta_url?: string | null
  campaign_id?: string | null
  campaign_name?: string | null
  adset_id?: string | null
  adset_name?: string | null
  spend: number
  leads: number
  impressions: number
  reach: number
  clicks: number
  link_click: number
  cpl: number
  ctr: number
  frequencia: number
  score_ia: number
  dias_ativo: number
  trend: DetailTrendPointApi[]
  platforms: DetailPlatformApi[]
  comparativo: DetailComparativoApi[]
  distribution: DetailDistributionApi[]
  video_metrics?: DetailVideoMetricsApi | null
  carousel_items?: CarouselMediaItem[] | null
  period_rank: number
  period_total: number
}

export interface DetailQueryArgs {
  workspaceId: string | null
  lookupId: string | null
  lookupType: DetailLookupType
  dataInicio: string
  dataFim: string
  contaIds?: string[]
  syncVersion?: string | null
  enabled?: boolean
}

function buildDetailUrl({
  workspaceId,
  lookupId,
  lookupType,
  dataInicio,
  dataFim,
  contaIds = [],
  syncVersion,
}: Omit<DetailQueryArgs, 'enabled'>): { endpoint: string; legacyEndpoint: string } | null {
  if (!workspaceId || !lookupId) return null
  const params = new URLSearchParams({
    workspace_id: workspaceId,
    lookup_id: lookupId,
    lookup_type: lookupType,
    data_inicio: dataInicio,
    data_fim: dataFim,
  })
  if (contaIds.length > 0) {
    params.set('conta_ids', contaIds.join(','))
  }
  if (syncVersion) {
    params.set('sync_version', syncVersion)
  }
  const query = params.toString()
  return {
    endpoint: `/meta/insights/anuncios/${encodeURIComponent(lookupId)}?${query}`,
    legacyEndpoint: `/meta/insights/anuncio-detalhe?${query}`,
  }
}

function normalizeStatus(status?: string | null): 'Ativo' | 'Pausado' | 'Desativado' {
  const raw = (status ?? '').trim().toUpperCase()
  if (!raw) return 'Pausado'
  if (['ATIVO', 'ACTIVE', 'APRENDIZADO', 'APRENDIZADO_LIMITADO', 'LEARNING', 'LEARNING_LIMITED'].includes(raw)) {
    return 'Ativo'
  }
  if (['DESATIVADO', 'ARCHIVED', 'DELETED'].includes(raw)) {
    return 'Desativado'
  }
  return 'Pausado'
}

function normalizeAssetType(value?: string | null): 'IMAGE' | 'VIDEO' {
  return (value ?? '').toUpperCase() === 'VIDEO' ? 'VIDEO' : 'IMAGE'
}

function normalizeCreativeAssetType(value?: string | null): 'IMAGE' | 'VIDEO' | 'CAROUSEL' {
  const raw = (value ?? '').trim().toUpperCase()
  if (raw === 'VIDEO' || raw === 'CAROUSEL') return raw
  return 'IMAGE'
}

function pickImageUrl(data: Pick<AdCreativeDetailApi, 'image_url_hq' | 'thumbnail_url' | 'name' | 'creative_type'>): string {
  return data.image_url_hq
    || data.thumbnail_url
    || makeFallbackPoster(data.name, normalizeAssetType(data.creative_type))
}

function toMetric(value: number, formatted: string, delta?: { value: number; direction: 'up' | 'down'; isPositive: boolean; label: string }) {
  return { value, formatted, delta }
}

function buildVideoMetrics(data: AdCreativeDetailApi): AdCreativeModalOverviewData['videoMetrics'] {
  if (!data.video_metrics) return undefined
  const impressions = data.impressions || 0
  const linkClicks = data.link_click || data.clicks || 0
  const video3Sec = data.video_metrics.video_3_sec || 0
  const hookRate = impressions > 0 ? (video3Sec / impressions) * 100 : 0
  const holdRate = video3Sec > 0 ? (data.video_metrics.p50 / video3Sec) * 100 : 0
  const ctrLink = impressions > 0 ? (linkClicks / impressions) * 100 : 0
  return {
    hookRate: round2(hookRate),
    holdRate: round2(holdRate),
    ctrLink: round2(ctrLink),
    retention: [
      { checkpoint: '3s', value: round2(hookRate) },
      { checkpoint: '25%', value: video3Sec > 0 ? round2((data.video_metrics.p25 / video3Sec) * 100) : 0 },
      { checkpoint: '50%', value: video3Sec > 0 ? round2((data.video_metrics.p50 / video3Sec) * 100) : 0 },
      { checkpoint: '75%', value: video3Sec > 0 ? round2((data.video_metrics.p75 / video3Sec) * 100) : 0 },
      { checkpoint: '100%', value: video3Sec > 0 ? round2((data.video_metrics.p100 / video3Sec) * 100) : 0 },
    ],
  }
}

function buildTrackingFields(data: AdCreativeDetailApi): TrackingField[] {
  return [
    { key: 'Headline', value: data.headline ?? undefined, configured: Boolean(data.headline) },
    { key: 'URL Destino', value: data.destination_url ?? undefined, configured: Boolean(data.destination_url) },
    { key: 'utm_source', value: data.utm_source ?? undefined, configured: Boolean(data.utm_source) },
    { key: 'utm_medium', value: data.utm_medium ?? undefined, configured: Boolean(data.utm_medium) },
    { key: 'utm_campaign', value: data.utm_campaign ?? undefined, configured: Boolean(data.utm_campaign) },
    { key: 'utm_content', value: data.utm_content ?? undefined, configured: Boolean(data.utm_content) },
    { key: 'utm_term', value: data.utm_term ?? undefined, configured: Boolean(data.utm_term) },
    { key: 'URL tags', value: data.url_tags ?? undefined, configured: Boolean(data.url_tags) },
    { key: 'Pixel ID', value: data.pixel_id ?? undefined, configured: Boolean(data.pixel_id) },
  ]
}

function buildTrackingScore(tracking: TrackingField[]) {
  return {
    configured: tracking.filter((field) => field.configured).length,
    total: tracking.length,
  }
}

function buildSignals(data: AdCreativeDetailApi, videoMetrics?: NonNullable<AdCreativeModalAdsData['videoMetrics']>): DiagnosticSignal[] {
  const signals: DiagnosticSignal[] = []

  const cplStatus = data.leads <= 0 && data.spend > 0
    ? 'Crítico'
    : data.cpl <= 1
      ? 'Saudável'
      : data.cpl <= 5
        ? 'Atenção'
        : 'Crítico'
  signals.push({
    label: 'CPL',
    value: formatarMoeda(data.cpl),
    status: cplStatus,
    delta: data.leads > 0 ? undefined : 'sem leads no período',
  })

  const ctrStatus = data.ctr >= 3
    ? 'Saudável'
    : data.ctr >= 1.5
      ? 'Atenção'
      : 'Crítico'
  signals.push({
    label: 'CTR',
    value: formatarPorcentagem(data.ctr),
    status: ctrStatus,
  })

  const freqStatus = data.frequencia <= 2
    ? 'Saudável'
    : data.frequencia <= 3.5
      ? 'Atenção'
      : 'Crítico'
  signals.push({
    label: 'Frequência',
    value: data.frequencia.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    status: freqStatus,
  })

  signals.push({
    label: 'Pontuação IA',
    value: `${Math.round(data.score_ia)}/100`,
    status: data.score_ia >= 75 ? 'Saudável' : data.score_ia >= 40 ? 'Atenção' : 'Crítico',
  })

  if (videoMetrics) {
    signals.push({
      label: 'Hook rate',
      value: formatarPorcentagem(videoMetrics.hookRate),
      status: videoMetrics.hookRate >= 15 ? 'Saudável' : videoMetrics.hookRate >= 5 ? 'Atenção' : 'Crítico',
    })
    signals.push({
      label: 'Hold rate',
      value: formatarPorcentagem(videoMetrics.holdRate),
      status: videoMetrics.holdRate >= 25 ? 'Saudável' : videoMetrics.holdRate >= 15 ? 'Atenção' : 'Crítico',
    })
  }

  return signals
}

function buildFunnel(data: AdCreativeDetailApi): FunnelDiagnostic {
  const ctr = data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0
  const cvr = data.clicks > 0 ? (data.leads / data.clicks) * 100 : 0
  const ctrStatus: FunnelDiagnostic['ctrStatus'] = ctr < 1 ? 'Crítico' : ctr <= 2 ? 'Atenção' : 'Saudável'
  const cvrStatus: FunnelDiagnostic['cvrStatus'] = cvr < 5 ? 'Crítico' : cvr <= 8 ? 'Atenção' : 'Saudável'
  const gargalo = cvrStatus === 'Crítico'
    ? 'CVR'
    : ctrStatus === 'Crítico'
      ? 'CTR'
      : data.frequencia > 3.5
        ? 'Frequência'
        : undefined

  return {
    impressions: data.impressions,
    clicks: data.clicks,
    leads: data.leads,
    ctr: round2(ctr),
    cvr: round2(cvr),
    ctrStatus,
    cvrStatus,
    gargalo,
  }
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function mapPlatforms(data: AdCreativeDetailApi): AdCreativeModalOverviewData['platforms'] {
  return (data.platforms ?? []).map((platform) => ({
    platform: platform.platform === 'instagram' ? 'Instagram' : 'Facebook',
    leads: platform.leads,
    cpl: platform.cpl,
    ctr: platform.ctr,
    spend: platform.spend,
  }))
}

function mapComparativo(items: DetailComparativoApi[]): CreativeComparativo[] {
  return items.map((item) => ({
    adId: item.ad_id,
    name: item.name,
    thumbnailUrl: item.thumbnail_url ?? makeFallbackPoster(item.name, 'IMAGE'),
    isCurrentAd: Boolean(item.is_current),
    leads: item.leads,
    cpl: item.cpl,
    ctr: item.ctr,
    spend: item.spend,
    status: normalizeStatus(item.status),
  }))
}

function mapDistribution(items: DetailDistributionApi[]): AdDistribution[] {
  return items.map((item) => ({
    campanhaId: item.campaign_id,
    campanhaNome: item.campaign_name,
    conjuntoId: item.adset_id,
    conjuntoNome: item.adset_name,
    status: normalizeStatus(item.status),
    leads: item.leads,
    cpl: item.cpl,
    spend: item.spend,
  }))
}

function mapDetailToOverview(data: AdCreativeDetailApi): AdCreativeModalOverviewData {
  const carouselItems = normalizeCarouselItems(data.carousel_items)
  const normalizedAssetType = normalizeCreativeAssetType(data.creative_type)
  const assetType = normalizedAssetType === 'VIDEO'
    ? 'VIDEO'
    : (normalizedAssetType === 'CAROUSEL' || carouselItems.length > 0)
      ? 'CAROUSEL'
      : 'IMAGE'
  const videoMetrics = assetType === 'VIDEO' ? buildVideoMetrics(data) : undefined

  return {
    id: data.id,
    name: data.name,
    status: normalizeStatus(data.status),
    assetType,
    imageUrl: pickImageUrl(data),
    carouselItems,
    metaUrl: data.meta_url ?? data.destination_url ?? undefined,
    period: data.period.label,
    rankInPeriod: data.period_rank || 1,
    totalInPeriod: data.period_total || 1,
    leads: toMetric(data.leads, formatarNumero(data.leads)),
    cpl: toMetric(data.cpl, formatarMoeda(data.cpl)),
    ctr: toMetric(data.ctr, formatarPorcentagem(data.ctr)),
    spend: toMetric(data.spend, formatarMoeda(data.spend)),
    scoreIA: Math.round(data.score_ia),
    trend: data.trend.map((point) => ({
      date: point.date,
      cpl: point.cpl,
      leads: point.leads,
    })),
    reach: data.reach,
    frequencia: data.frequencia,
    platforms: mapPlatforms(data),
    qualityRankings: undefined,
    aiInsight: undefined,
    videoMetrics,
  }
}

function mapDetailToCampaign(data: AdCreativeDetailApi): AdCreativeModalCampaignData {
  const assetType = normalizeAssetType(data.creative_type)
  const comparativo = mapComparativo(data.comparativo ?? [])
  const platforms = mapPlatforms(data)

  return {
    id: data.creative_id ?? data.id,
    adId: data.ad_id ?? data.id,
    name: data.name,
    status: normalizeStatus(data.status),
    assetType,
    imageUrl: pickImageUrl(data),
    metaUrl: data.meta_url ?? undefined,
    campanha: {
      id: data.campaign_id ?? data.id,
      name: data.campaign_name ?? data.campaign_id ?? 'Campanha',
    },
    conjunto: {
      id: data.adset_id ?? data.id,
      name: data.adset_name ?? data.adset_id ?? 'Conjunto',
    },
    campanhaUrl: undefined,
    conjuntoUrl: undefined,
    leads: data.leads,
    cpl: data.cpl,
    ctr: data.ctr,
    spend: data.spend,
    linkClicks: data.link_click,
    comparativo,
    headline: data.headline ?? undefined,
    destinationUrl: data.destination_url ?? undefined,
    utmSource: data.utm_source ?? undefined,
    utmMedium: data.utm_medium ?? undefined,
    utmCampaign: data.utm_campaign ?? undefined,
    utmContent: data.utm_content ?? undefined,
    utmTerm: data.utm_term ?? undefined,
    platforms,
  }
}

function mapDetailToAds(data: AdCreativeDetailApi): AdCreativeModalAdsData {
  const carouselItems = normalizeCarouselItems(data.carousel_items)
  const normalizedAssetType = normalizeCreativeAssetType(data.creative_type)
  const assetType = normalizedAssetType === 'VIDEO'
    ? 'VIDEO'
    : (normalizedAssetType === 'CAROUSEL' || carouselItems.length > 0)
      ? 'CAROUSEL'
      : 'IMAGE'
  const videoMetrics = assetType === 'VIDEO' ? buildVideoMetrics(data) : undefined
  const tracking = buildTrackingFields(data)

  return {
    id: data.creative_id ?? data.id,
    adId: data.ad_id ?? data.id,
    name: data.name,
    status: normalizeStatus(data.status),
    assetType,
    imageUrl: pickImageUrl(data),
    carouselItems,
    metaUrl: data.meta_url ?? undefined,
    diasRodando: data.dias_ativo,
    campanha: {
      id: data.campaign_id ?? data.id,
      name: data.campaign_name ?? data.campaign_id ?? 'Campanha',
    },
    conjunto: {
      id: data.adset_id ?? data.id,
      name: data.adset_name ?? data.adset_id ?? 'Conjunto',
    },
    campanhaUrl: undefined,
    conjuntoUrl: undefined,
    diagnosticStatus: 'Atenção',
    signals: buildSignals(data, videoMetrics),
    funnel: buildFunnel(data),
    videoMetrics,
    tracking,
    trackingScore: buildTrackingScore(tracking),
    distribution: mapDistribution(data.distribution ?? []),
    aiInsight: undefined,
  }
}

export function useAdCreativeDetail(args: DetailQueryArgs) {
  const {
    workspaceId,
    lookupId,
    lookupType,
    dataInicio,
    dataFim,
    contaIds = [],
    syncVersion,
    enabled = true,
  } = args
  const endpoints = enabled
    ? buildDetailUrl({ workspaceId, lookupId, lookupType, dataInicio, dataFim, contaIds, syncVersion })
    : null
  const endpoint = endpoints?.endpoint ?? null

  const { data, error, isLoading } = useSWR<AdCreativeDetailApi>(
    endpoint,
    async () => {
      if (!endpoints) {
        throw new Error('Endpoint de detalhe indisponível')
      }
      try {
        return await api.get<AdCreativeDetailApi>(endpoints.endpoint)
      } catch (primaryError) {
        if (endpoints.legacyEndpoint && endpoints.legacyEndpoint !== endpoints.endpoint) {
          return api.get<AdCreativeDetailApi>(endpoints.legacyEndpoint)
        }
        throw primaryError
      }
    },
    SWR_OPTS,
  )

  return {
    detail: data ?? null,
    error: error ?? null,
    isLoading: Boolean(endpoint) && isLoading,
    endpoint,
  }
}

export function mapDetailOverviewData(detail: AdCreativeDetailApi | null): AdCreativeModalOverviewData | null {
  return detail ? mapDetailToOverview(detail) : null
}

export function mapDetailCampaignData(detail: AdCreativeDetailApi | null): AdCreativeModalCampaignData | null {
  return detail ? mapDetailToCampaign(detail) : null
}

export function mapDetailAdsData(detail: AdCreativeDetailApi | null): AdCreativeModalAdsData | null {
  return detail ? mapDetailToAds(detail) : null
}
