'use client'

import useSWR from 'swr'
import api from '@/lib/api-client'
import {
  Campanha, ConjuntoAnuncios, Anuncio, Criativo,
  ResumoCampanhas, FiltrosCampanhas, ObjetivoCampanha, StatusCampanha, TipoCriativo,
} from '@/types/meta-ads-campanhas'
import { calcularScore } from '@/components/meta-ads/anuncios/score-anuncio'

interface Workspace { id: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OBJETIVO_MAP: Record<string, ObjetivoCampanha> = {
  OUTCOME_LEADS:      'LEAD_GENERATION',
  LEAD_GENERATION:    'LEAD_GENERATION',
  OUTCOME_SALES:      'CONVERSIONS',
  CONVERSIONS:        'CONVERSIONS',
  OUTCOME_AWARENESS:  'BRAND_AWARENESS',
  BRAND_AWARENESS:    'BRAND_AWARENESS',
  OUTCOME_TRAFFIC:    'TRAFFIC',
  TRAFFIC:            'TRAFFIC',
  OUTCOME_ENGAGEMENT: 'BRAND_AWARENESS',
  REACH:              'REACH',
  VIDEO_VIEWS:        'VIDEO_VIEWS',
}

function mapObjetivo(raw?: string): ObjetivoCampanha {
  if (!raw) return 'LEAD_GENERATION'
  return OBJETIVO_MAP[raw.toUpperCase()] ?? 'LEAD_GENERATION'
}

function mapStatus(raw?: string): StatusCampanha {
  const s = (raw || 'ACTIVE').toUpperCase()
  if (s === 'PAUSED') return 'PAUSED'
  if (s === 'ARCHIVED') return 'ARCHIVED'
  if (s === 'DELETED') return 'ARCHIVED'
  return 'ACTIVE'
}

function scoreAnuncio(a: { cpl: number; ctr: number; leads: number; frequencia: number; status: StatusCampanha }): number {
  return calcularScore({
    cpl: a.cpl, ctr: a.ctr, leads: a.leads,
    frequencia: a.frequencia,
    status: a.status,
    tendencia: 'estavel',
  })
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapAnuncio(a: any): Anuncio {
  const sp = a.spend ?? 0; const ld = a.leads ?? 0
  const imp = a.impressions ?? 0; const rch = a.reach ?? 0; const cl = a.clicks ?? 0
  const cpl = ld > 0 ? sp / ld : 0
  const ctr = imp > 0 ? (cl / imp) * 100 : a.ctr ?? 0
  const cpc = cl > 0 ? sp / cl : a.cpc ?? 0
  const cpm = imp > 0 ? (sp / imp) * 1000 : a.cpm ?? 0
  const frequencia = rch > 0 ? imp / rch : 0
  const status = mapStatus(a.status)

  const criativo: Criativo = {
    id: a.creative_id || a.ad_id,
    tipo: ((a.tipo_criativo || 'IMAGE').toUpperCase() as TipoCriativo),
    thumbnailUrl: a.image_url_hq ?? a.thumbnail_url ?? undefined,
    corFundo: '#f0f0f0',
  }

  return {
    id: a.ad_id,
    nome: a.nome || a.ad_id,
    status,
    plataformas: ['facebook', 'instagram'],
    criativo,
    permalinkUrl: a.link_anuncio || `https://www.facebook.com/ads/library/?id=${a.ad_id}`,
    investimento: sp,
    leads: ld,
    cliques: cl,
    impressoes: imp,
    alcance: rch,
    cpl, ctr, cpc, cpm, frequencia,
    indiceDesempenho: scoreAnuncio({ cpl, ctr, leads: ld, frequencia, status }),
  }
}

function mapConjunto(adset: any): ConjuntoAnuncios {
  const sp = adset.spend ?? 0; const ld = adset.leads ?? 0
  const imp = adset.impressions ?? 0; const rch = adset.reach ?? 0; const cl = adset.clicks ?? 0
  const anuncios: Anuncio[] = (adset.anuncios ?? []).map(mapAnuncio)
  const indiceDesempenho = anuncios.length > 0
    ? anuncios.reduce((s, a) => s + a.indiceDesempenho, 0) / anuncios.length
    : 0

  return {
    id: adset.adset_id,
    nome: adset.adset_name || adset.adset_id,
    status: mapStatus(adset.status),
    plataformas: ['facebook', 'instagram'],
    investimento: sp,
    leads: ld,
    cpl: ld > 0 ? sp / ld : 0,
    ctr: imp > 0 ? (cl / imp) * 100 : adset.ctr ?? 0,
    cpc: cl > 0 ? sp / cl : adset.cpc ?? 0,
    cpm: imp > 0 ? (sp / imp) * 1000 : adset.cpm ?? 0,
    alcance: rch,
    impressoes: imp,
    frequencia: rch > 0 ? imp / rch : 0,
    indiceDesempenho,
    anuncios,
  }
}

function mapCampanha(c: any): Campanha {
  const sp = c.spend ?? 0; const ld = c.leads ?? 0
  const imp = c.impressions ?? 0; const rch = c.reach ?? 0; const cl = c.clicks ?? 0
  const conjuntos: ConjuntoAnuncios[] = (c.conjuntos ?? []).map(mapConjunto)
  const indiceDesempenho = conjuntos.length > 0
    ? conjuntos.reduce((s, cj) => s + cj.indiceDesempenho, 0) / conjuntos.length
    : 0
  const nome: string = c.nome || c.campaign_id
  const nomeAbreviado = nome.length > 35 ? nome.slice(0, 35) + '…' : nome

  return {
    id: c.campaign_id,
    nome,
    nomeAbreviado,
    objetivo: mapObjetivo(c.objetivo),
    status: mapStatus(c.status),
    plataformas: ['facebook', 'instagram'],
    investimento: sp,
    leads: ld,
    cpl: ld > 0 ? sp / ld : 0,
    ctr: imp > 0 ? (cl / imp) * 100 : c.ctr ?? 0,
    cpc: cl > 0 ? sp / cl : c.cpc ?? 0,
    cpm: imp > 0 ? (sp / imp) * 1000 : c.cpm ?? 0,
    alcance: rch,
    impressoes: imp,
    frequencia: rch > 0 ? imp / rch : 0,
    indiceDesempenho,
    conjuntos,
    orcamentoDiario: c.orcamento_diario ?? null,
  }
}

// ─── Resumo ───────────────────────────────────────────────────────────────────

function computeResumo(campanhas: Campanha[]): ResumoCampanhas {
  const investimentoTotal = campanhas.reduce((s, c) => s + c.investimento, 0)
  const leadsTotal        = campanhas.reduce((s, c) => s + c.leads, 0)
  const cliquesTotal      = campanhas.reduce((s, c) => s + c.conjuntos.reduce((ss, cj) => ss + cj.anuncios.reduce((sss, a) => sss + a.cliques, 0), 0), 0)
  const impressoesTotal   = campanhas.reduce((s, c) => s + c.impressoes, 0)
  const ctrMedio          = impressoesTotal > 0 ? (cliquesTotal / impressoesTotal) * 100 : 0

  const comLeads = campanhas.filter(c => c.leads > 0)
  const melhor   = comLeads.length > 0
    ? comLeads.reduce((best, c) => c.cpl < best.cpl ? c : best)
    : null

  return {
    totalCampanhas:    campanhas.length,
    campanhasAtivas:   campanhas.filter(c => c.status === 'ACTIVE').length,
    investimentoTotal,
    leadsTotal,
    cplMedio:          leadsTotal > 0 ? investimentoTotal / leadsTotal : 0,
    ctrMedio,
    melhorCpl:         melhor?.cpl ?? 0,
    melhorCplNome:     melhor?.nomeAbreviado ?? '',
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMetaCampanhas(filtros: FiltrosCampanhas, dataInicio: string, dataFim: string) {
  const { data: workspaces } = useSWR<Workspace[]>(
    '/workspaces',
    () => api.get<Workspace[]>('/workspaces'),
    { revalidateOnFocus: false }
  )
  const wsId = workspaces?.[0]?.id

  const contaIdsParam = filtros.contaIds?.length
    ? `&conta_ids=${filtros.contaIds.join(',')}`
    : ''

  const hierarquiaKey = wsId
    ? `/meta/insights/campanhas-hierarquia?workspace_id=${wsId}&data_inicio=${dataInicio}&data_fim=${dataFim}${contaIdsParam}`
    : null

  const { data: rawHierarquia, isLoading, error } = useSWR(
    hierarquiaKey,
    () => api.get<any[]>(hierarquiaKey!),
    { revalidateOnFocus: false }
  )

  const { data: iaRaw } = useSWR(
    wsId ? `/meta/insights/ia?workspace_id=${wsId}&data_inicio=${dataInicio}&data_fim=${dataFim}` : null,
    () => api.get<any[]>(`/meta/insights/ia?workspace_id=${wsId}&data_inicio=${dataInicio}&data_fim=${dataFim}`),
    { revalidateOnFocus: false }
  )

  const insightsIA = (iaRaw ?? []).map((item: any, i: number) => {
    const tipoRaw: string = item.severidade ?? item.tipo ?? 'info'
    const severidade = tipoRaw.toLowerCase() as 'alerta' | 'oportunidade' | 'info'
    return {
      id: item.id ?? `ia-${i}`,
      anuncioId: item.anuncio_id ?? item.anuncioId ?? '',
      severidade: ['alerta', 'oportunidade', 'info'].includes(severidade) ? severidade : 'info' as const,
      titulo: item.titulo ?? '',
      mensagem: item.mensagem ?? '',
      analiseCompleta: item.analise_completa ?? item.analiseCompleta ?? '',
      labelAcao: item.labelAcao ?? item.label_acao ?? item.acao ?? '',
    }
  })

  let campanhas: Campanha[] = (rawHierarquia ?? []).map(mapCampanha)

  // Filters
  if (filtros.busca) {
    const b = filtros.busca.toLowerCase()
    campanhas = campanhas.filter(c => c.nome.toLowerCase().includes(b))
  }
  if (filtros.objetivo && filtros.objetivo !== 'todos') {
    campanhas = campanhas.filter(c => c.objetivo === filtros.objetivo)
  }
  if (filtros.status && filtros.status !== 'todos') {
    const statusMap: Record<string, StatusCampanha> = {
      ativa: 'ACTIVE', pausada: 'PAUSED', encerrada: 'ARCHIVED', aprendendo: 'LEARNING',
    }
    const target = statusMap[filtros.status] ?? filtros.status
    campanhas = campanhas.filter(c => c.status === target)
  }

  return {
    campanhas,
    resumo: computeResumo(campanhas),
    insightsIA,
    isLoading: !wsId || isLoading,
    error: error ?? null,
  }
}
