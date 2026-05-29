'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'
import { ordenarPlataformasResumo, type PlataformaResumo } from '@/lib/plataformas-meta'
import type { CodigoVeiculacao } from '@/lib/veiculacao'
import type {
  AnuncioPerformance,
  FiltrosAnuncios,
  OpcaoCampanhaAnuncio,
  ResumoAnunciosPerformance,
  TipoAnuncio,
  VideoRetentionPoint,
} from '@/types/meta-ads-anuncios'

const LIMIT_PADRAO = 15

const RESUMO_VAZIO: ResumoAnunciosPerformance = {
  investimento_total: 0,
  leads_total: 0,
  ctr_medio: 0,
  frequencia_media: 0,
}

interface AnuncioPerformanceApi {
  id: string
  nome: string
  campaign_id: string
  campaign_name: string
  adset_id: string
  adset_name: string
  creative_id?: string | null
  creative_type: string
  video_id?: string | null
  video_source_url?: string | null
  video_thumbnail_url?: string | null
  video_thumbnail_hq_url?: string | null
  thumbnail_url?: string | null
  image_url_hq?: string | null
  permalink_url?: string | null
  link_anuncio?: string | null
  carousel_items?: Array<{ picture?: string; image_url_hq?: string; video_id?: string; link?: string }>
  status: string
  veiculacao: string
  veiculacao_label: string
  veiculacao_grupo: string
  veiculacao_motivo?: string | null
  veiculacao_cor?: string
  veiculacao_cor_bg?: string
  veiculacao_cor_border?: string
  plataformas: Array<'facebook' | 'instagram' | 'whatsapp'>
  plataformas_resumo: PlataformaResumo[]
  platform_display_name: string
  ad_text?: string | null
  ad_title?: string | null
  headline?: string | null
  ad_description?: string | null
  ad_cta?: string | null
  ad_url?: string | null
  destination_url?: string | null
  url_tags?: string | null
  utm_source?: string | null
  utm_campaign?: string | null
  utm_medium?: string | null
  utm_content?: string | null
  utm_term?: string | null
  pixel_id?: string | null
  investimento: number
  leads: number
  cliques: number
  link_clicks: number
  result_count?: number | null
  result_indicator?: string | null
  impressoes: number
  alcance: number
  cpl: number
  ctr: number
  cpc: number
  cpm: number
  frequencia: number
  hook_rate?: number | null
  hold_rate_25?: number | null
  hold_rate_50?: number | null
  hold_rate_75?: number | null
  hold_rate_100?: number | null
  video_metrics?: VideoMetricsApi | null
  video_retention_data?: VideoRetentionPoint[]
  score: number
  dias_ativo: number
}

interface VideoMetricsApi {
  video_views?: number | null
  thruplay?: number | null
  p25?: number | null
  p50?: number | null
  p75?: number | null
  p100?: number | null
  video_3_sec?: number | null
  avg_watch_time?: number | null
}

interface AnunciosPerformanceResponseApi {
  items: AnuncioPerformanceApi[]
  page: number
  limit: number
  total: number
  has_more: boolean
  resumo: ResumoAnunciosPerformance
  campanhas_disponiveis: OpcaoCampanhaAnuncio[]
  plataformas_disponiveis: Array<{ codigo: 'facebook' | 'instagram' | 'whatsapp'; label: string }>
}

function toTipoAnuncio(valor?: string | null): TipoAnuncio {
  const tipo = (valor || 'IMAGE').toUpperCase()
  if (tipo === 'VIDEO' || tipo === 'CAROUSEL') return tipo
  return 'IMAGE'
}

function toCodigoVeiculacao(valor?: string | null): CodigoVeiculacao {
  const codigo = (valor || 'DESATIVADO').toUpperCase()
  const validos: CodigoVeiculacao[] = [
    'ATIVO',
    'DESATIVADO',
    'CONCLUIDO',
    'PROGRAMADO',
    'APRENDIZADO',
    'APRENDIZADO_LIMITADO',
    'EM_ANALISE',
    'REJEITADO',
    'PROCESSANDO',
    'ERRO_CONTA',
    'ITENS_AUSENTES',
  ]
  return (validos.includes(codigo as CodigoVeiculacao) ? codigo : 'DESATIVADO') as CodigoVeiculacao
}

function mapAnuncioApi(item: AnuncioPerformanceApi): AnuncioPerformance {
  const plataformasResumo = ordenarPlataformasResumo(item.plataformas_resumo ?? [])
  const carouselItems = Array.isArray(item.carousel_items) ? item.carousel_items : []
  const creativeType = carouselItems.length > 0 ? 'CAROUSEL' : toTipoAnuncio(item.creative_type)
  const veiculacao = toCodigoVeiculacao(item.veiculacao)
  const veiculacaoLabel = item.veiculacao_label || veiculacao
  const veiculacaoGrupo = item.veiculacao_grupo || 'operacional'

  const rawVm = item.video_metrics ?? null
  const videoMetrics = rawVm ? {
    videoViews: rawVm.video_views ?? 0,
    thruplay: rawVm.thruplay ?? 0,
    p25: rawVm.p25 ?? 0,
    p50: rawVm.p50 ?? 0,
    p75: rawVm.p75 ?? 0,
    p100: rawVm.p100 ?? 0,
    video3Sec: rawVm.video_3_sec ?? 0,
    avgWatchTime: rawVm.avg_watch_time ?? null,
  } : null
  const videoRetentionData = item.video_retention_data ?? []
  const tendencia: AnuncioPerformance['tendencia'] = item.score >= 70 ? 'subindo' : item.score <= 35 ? 'caindo' : 'estavel'

  return {
    id: item.id,
    nome: item.nome,
    campaignId: item.campaign_id,
    campaignName: item.campaign_name,
    adsetId: item.adset_id,
    adsetName: item.adset_name,
    creativeId: item.creative_id ?? null,
    creativeType,
    videoId: item.video_id ?? null,
    videoSourceUrl: item.video_source_url ?? null,
    videoThumbnailUrl: item.video_thumbnail_url ?? null,
    videoThumbnailHqUrl: item.video_thumbnail_hq_url ?? null,
    thumbnailUrl: item.thumbnail_url ?? item.video_thumbnail_url ?? null,
    imageUrlHq: item.image_url_hq ?? item.video_thumbnail_hq_url ?? item.video_thumbnail_url ?? item.thumbnail_url ?? null,
    permalinkUrl: item.permalink_url ?? null,
    linkAnuncio: item.link_anuncio ?? null,
    carouselItems,

    status: (item.status?.toUpperCase() === 'ACTIVE' ? 'ACTIVE' : item.status?.toUpperCase() === 'LEARNING' ? 'LEARNING' : 'PAUSED'),
    veiculacao,
    veiculacaoLabel,
    veiculacaoGrupo,
    veiculacaoMotivo: item.veiculacao_motivo ?? null,
    veiculacaoCor: item.veiculacao_cor,
    veiculacaoCorBg: item.veiculacao_cor_bg,
    veiculacaoCorBorder: item.veiculacao_cor_border,

    plataformas: item.plataformas ?? [],
    plataformasResumo,
    platformDisplayName: item.platform_display_name || (plataformasResumo.length ? plataformasResumo.map(pl => pl.label).join(', ') : 'Não identificado'),

    adText: item.ad_text ?? null,
    adTitle: item.ad_title ?? null,
    headline: item.headline ?? item.ad_title ?? null,
    adDescription: item.ad_description ?? null,
    adCta: item.ad_cta ?? null,
    adUrl: item.ad_url ?? null,
    destinationUrl: item.destination_url ?? item.ad_url ?? null,
    urlTags: item.url_tags ?? null,
    utmSource: item.utm_source ?? null,
    utmCampaign: item.utm_campaign ?? null,
    utmMedium: item.utm_medium ?? null,
    utmContent: item.utm_content ?? null,
    utmTerm: item.utm_term ?? null,
    pixelId: item.pixel_id ?? null,

    investimento: Number(item.investimento ?? 0),
    leads: Number(item.leads ?? 0),
    cliques: Number(item.cliques ?? 0),
    linkClicks: Number(item.link_clicks ?? 0),
    resultCount: Number(item.result_count ?? 0),
    resultIndicator: item.result_indicator ?? null,
    impressoes: Number(item.impressoes ?? 0),
    alcance: Number(item.alcance ?? 0),
    cpl: Number(item.cpl ?? 0),
    ctr: Number(item.ctr ?? 0),
    cpc: Number(item.cpc ?? 0),
    cpm: Number(item.cpm ?? 0),
    frequencia: Number(item.frequencia ?? 0),
    hookRate: item.hook_rate ?? null,
    holdRate25: item.hold_rate_25 ?? null,
    holdRate50: item.hold_rate_50 ?? null,
    holdRate75: item.hold_rate_75 ?? null,
    holdRate100: item.hold_rate_100 ?? null,
    videoMetrics,
    videoRetentionData,

    score: Number(item.score ?? 0),
    tendencia,
    diasAtivo: Number(item.dias_ativo ?? 0),
  }
}

function mapResponseApi(data: AnunciosPerformanceResponseApi): {
  items: AnuncioPerformance[]
  page: number
  limit: number
  total: number
  has_more: boolean
  resumo: ResumoAnunciosPerformance
  campanhas_disponiveis: OpcaoCampanhaAnuncio[]
  plataformas_disponiveis: AnunciosPerformanceResponseApi['plataformas_disponiveis']
} {
  return {
    items: (data.items ?? []).map(mapAnuncioApi),
    page: data.page,
    limit: data.limit,
    total: data.total,
    has_more: data.has_more,
    resumo: data.resumo ?? RESUMO_VAZIO,
    campanhas_disponiveis: data.campanhas_disponiveis ?? [],
    plataformas_disponiveis: data.plataformas_disponiveis ?? [],
  }
}

function buildKey(params: {
  wsId?: string
  dataInicio: string
  dataFim: string
  contaIds: string[]
  campaignIds: string[]
  campaignsReady: boolean
  filtros: FiltrosAnuncios
  page: number
}) {
  const { wsId, dataInicio, dataFim, contaIds, campaignIds, campaignsReady, filtros, page } = params
  if (!wsId) return null
  if (!campaignsReady) return null
  if (campaignIds.length === 0) return null

  const contaIdsParam = contaIds.length ? `&conta_ids=${contaIds.join(',')}` : ''
  const normalizedCampaignIds = [...campaignIds].filter(Boolean).sort()
  const campaignIdsParam = normalizedCampaignIds.length ? `&campaign_ids=${normalizedCampaignIds.join(',')}` : ''
  const platformParam = filtros.plataforma !== 'todas' ? `&platform_filter=${filtros.plataforma}` : ''
  const statusParam = filtros.status !== 'todos' ? `&status_filter=${filtros.status}` : ''
  const tipoParam = filtros.tipo !== 'todos' ? `&tipo=${filtros.tipo}` : ''
  const sortParam = `&ordenar_por=${filtros.ordenarPor}`
  const resultadoParam = `&resultado=${filtros.resultado ?? 'performance'}`

  return `/meta/insights/anuncios-performance?workspace_id=${wsId}&data_inicio=${dataInicio}&data_fim=${dataFim}${contaIdsParam}${campaignIdsParam}${platformParam}${statusParam}${tipoParam}${sortParam}${resultadoParam}&page=${page}&limit=${LIMIT_PADRAO}`
}

export function useMetaAnuncios(
  filtros: FiltrosAnuncios,
  dataInicio: string,
  dataFim: string,
  contaIds: string[] = [],
  workspaceId: string | null = null,
  campaignIds: string[] = [],
  campaignsReady = true,
  page = 1,
) {
  const { workspaceAtivo } = useWorkspace()
  const wsId = (workspaceId ?? workspaceAtivo) ?? undefined

  const queryKey = buildKey({
    wsId,
    dataInicio,
    dataFim,
    contaIds,
    campaignIds,
    campaignsReady,
    filtros,
    page,
  })

  const { data, error, isLoading, isValidating } = useSWR<AnunciosPerformanceResponseApi>(
    queryKey,
    () => api.get<AnunciosPerformanceResponseApi>(queryKey!),
    { revalidateOnFocus: false }
  )

  const mappedResponse = useMemo(() => (data ? mapResponseApi(data) : null), [data])
  const [resumo, setResumo] = useState<ResumoAnunciosPerformance>(RESUMO_VAZIO)
  const [total, setTotal] = useState(0)

  const resetKey = useMemo(() => {
    return [
      wsId ?? '',
      dataInicio,
      dataFim,
      contaIds.join(','),
      [...campaignIds].filter(Boolean).sort().join(','),
      campaignsReady ? '1' : '0',
      filtros.status,
      filtros.plataforma,
      filtros.tipo,
    ].join('|')
  }, [
    wsId,
    dataInicio,
    dataFim,
    contaIds,
    campaignIds,
    campaignsReady,
    filtros.status,
    filtros.plataforma,
    filtros.tipo,
  ])

  useEffect(() => {
    setResumo(RESUMO_VAZIO)
    setTotal(0)
  }, [resetKey])

  useEffect(() => {
    if (!mappedResponse) return
    setResumo(mappedResponse.resumo ?? RESUMO_VAZIO)
    setTotal(mappedResponse.total ?? 0)
  }, [mappedResponse])

  const loadingCascade = !!wsId && !campaignsReady
  const anuncios = mappedResponse?.items ?? []
  const campanhasDisponiveis = mappedResponse?.campanhas_disponiveis ?? []
  const plataformasDisponiveis = mappedResponse?.plataformas_disponiveis ?? []

  return {
    anuncios,
    campanhasDisponiveis,
    plataformasDisponiveis,
    total,
    resumo,
    limit: LIMIT_PADRAO,
    isLoading: loadingCascade || isLoading,
    isValidating,
    error: error ?? null,
  }
}
