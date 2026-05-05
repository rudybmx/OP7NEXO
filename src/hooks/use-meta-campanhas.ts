'use client'

import useSWR from 'swr'
import {
  Campanha, ConjuntoAnuncios, Anuncio, Criativo,
  ResumoCampanhas, FiltrosCampanhas, ObjetivoCampanha, StatusCampanha, TipoCriativo,
} from '@/types/meta-ads-campanhas'
import { makeFetcher, SWR_OPTS } from '@/lib/swr'
import { MOCK_AD_ROWS } from '@/lib/mock-meta-ads'

// ─── Raw row from get_anuncios_periodo ───────────────────────────────────────

interface AdRow {
  org_id: string
  account_id: string
  meta_account_id: string
  campaign_id: string
  campaign_name: string
  adset_id: string
  adset_name: string
  ad_id: string
  ad_name: string
  creative_id?: string
  creative_url?: string
  creative_type?: string
  instagram_permalink_url?: string
  objective?: string
  primeiro_dia: string
  ultimo_dia: string
  dias_com_dados: number
  investimento: string | number
  impressoes: string | number
  alcance: string | number
  cliques: string | number
  leads: number
  leads_mensagem: number
  leads_cadastro: number
  frequencia: string | number
  ctr: string | number
  cpc: string | number
  cpm: string | number
  cpl: string | number
  dias_ativo: number
  tendencia?: string
  score: number
  indice_desempenho: string | number
  status_criativo?: string
  ad_status_calc?: string
  cpl_medio_conta?: string | number
  freq_media_conta?: string | number
}

// ─── Accumulator types for building hierarchy ────────────────────────────────

interface AdsetAccum {
  id: string
  nome: string
  ads: AdRow[]
  investimento: number
  impressoes: number
  alcance: number
  cliques: number
  leads: number
}

interface CampanhaAccum {
  id: string
  nome: string
  objective: string
  adsets: Map<string, AdsetAccum>
  investimento: number
  impressoes: number
  alcance: number
  cliques: number
  leads: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const n = (v: string | number | undefined | null): number => Number(v) || 0

function weightedMetrics(investimento: number, cliques: number, impressoes: number, alcance: number, leads: number) {
  return {
    cpl:       leads     > 0 ? investimento / leads                 : 0,
    ctr:       impressoes > 0 ? (cliques / impressoes) * 100        : 0,
    cpc:       cliques   > 0 ? investimento / cliques               : 0,
    cpm:       impressoes > 0 ? (investimento / impressoes) * 1000  : 0,
    frequencia: alcance  > 0 ? impressoes / alcance                 : 0,
  }
}

const OBJETIVO_MAP: Record<string, ObjetivoCampanha> = {
  OUTCOME_LEADS:         'LEAD_GENERATION',
  LEAD_GENERATION:       'LEAD_GENERATION',
  OUTCOME_SALES:         'CONVERSIONS',
  CONVERSIONS:           'CONVERSIONS',
  OUTCOME_AWARENESS:     'BRAND_AWARENESS',
  BRAND_AWARENESS:       'BRAND_AWARENESS',
  OUTCOME_TRAFFIC:       'TRAFFIC',
  TRAFFIC:               'TRAFFIC',
  OUTCOME_ENGAGEMENT:    'BRAND_AWARENESS',
  REACH:                 'REACH',
  VIDEO_VIEWS:           'VIDEO_VIEWS',
}

function mapObjetivo(raw?: string): ObjetivoCampanha {
  if (!raw) return 'LEAD_GENERATION'
  return OBJETIVO_MAP[raw.toUpperCase()] ?? 'LEAD_GENERATION'
}

function adStatus(row: AdRow): StatusCampanha {
  const s = (row.ad_status_calc || '').toUpperCase()
  if (s === 'PAUSED') return 'PAUSED'
  return 'ACTIVE'
}

function inferStatus(rows: AdRow[]): StatusCampanha {
  return rows.some(r => adStatus(r) === 'ACTIVE') ? 'ACTIVE' : 'PAUSED'
}

// ─── Map ad row → Anuncio ────────────────────────────────────────────────────

function mapAnuncio(row: AdRow): Anuncio {
  const criativo: Criativo = {
    id:           row.creative_id || row.ad_id,
    tipo:         ((row.creative_type?.toUpperCase() || 'IMAGE') as TipoCriativo),
    thumbnailUrl: row.creative_url ?? undefined,
    corFundo:     '#f0f0f0',
  }

  const investimento = n(row.investimento)
  const cliques      = n(row.cliques)
  const impressoes   = n(row.impressoes)
  const alcance      = n(row.alcance)
  const leads        = n(row.leads)
  const metrics      = weightedMetrics(investimento, cliques, impressoes, alcance, leads)

  return {
    id:               row.ad_id,
    nome:             row.ad_name,
    status:           adStatus(row),
    plataformas:      ['facebook', 'instagram'],
    criativo,
    // Always provide Ads Library link as base
    permalinkUrl:       `https://www.facebook.com/ads/library/?id=${row.ad_id}`,
    // Only set instagramPermalink when the DB actually has a real Instagram post URL
    instagramPermalink: row.instagram_permalink_url || undefined,
    investimento,
    leads,
    cliques,
    impressoes,
    alcance,
    cpl:              metrics.cpl,
    ctr:              metrics.ctr,
    cpc:              metrics.cpc,
    cpm:              metrics.cpm,
    frequencia:       metrics.frequencia,
    indiceDesempenho: n(row.score),   // score = 0-100; indice_desempenho = 0-10 (diferente escala)
  }
}

// ─── Build hierarchy from flat ad rows ───────────────────────────────────────

function buildHierarchy(rows: AdRow[]): Campanha[] {
  const campMap = new Map<string, CampanhaAccum>()

  for (const row of rows) {
    // Campaign
    if (!campMap.has(row.campaign_id)) {
      campMap.set(row.campaign_id, {
        id: row.campaign_id,
        nome: row.campaign_name,
        objective: row.objective || '',
        adsets: new Map(),
        investimento: 0, impressoes: 0, alcance: 0, cliques: 0, leads: 0,
      })
    }
    const camp = campMap.get(row.campaign_id)!

    // Adset
    if (!camp.adsets.has(row.adset_id)) {
      camp.adsets.set(row.adset_id, {
        id: row.adset_id,
        nome: row.adset_name,
        ads: [],
        investimento: 0, impressoes: 0, alcance: 0, cliques: 0, leads: 0,
      })
    }
    const adset = camp.adsets.get(row.adset_id)!

    // Accumulate
    const inv = n(row.investimento)
    const imp = n(row.impressoes)
    const alc = n(row.alcance)
    const cli = n(row.cliques)
    const lea = n(row.leads)

    adset.ads.push(row)
    adset.investimento += inv
    adset.impressoes   += imp
    adset.alcance      += alc
    adset.cliques      += cli
    adset.leads        += lea

    camp.investimento  += inv
    camp.impressoes    += imp
    camp.alcance       += alc
    camp.cliques       += cli
    camp.leads         += lea
  }

  // Convert accumulators to typed objects
  return Array.from(campMap.values()).map(camp => {
    const conjuntos: ConjuntoAnuncios[] = Array.from(camp.adsets.values()).map(adset => {
      const { cpl, ctr, cpc, cpm, frequencia } = weightedMetrics(
        adset.investimento, adset.cliques, adset.impressoes, adset.alcance, adset.leads
      )
      const adRows = adset.ads
      const indiceDesempenho = adRows.length > 0
        ? adRows.reduce((s, r) => s + n(r.score), 0) / adRows.length   // score = 0-100
        : 0

      return {
        id:               adset.id,
        nome:             adset.nome,
        status:           inferStatus(adRows),
        plataformas:      ['facebook', 'instagram'],
        investimento:     adset.investimento,
        leads:            adset.leads,
        cpl,
        ctr,
        cpc,
        cpm,
        alcance:          adset.alcance,
        impressoes:       adset.impressoes,
        frequencia,
        indiceDesempenho,
        anuncios:         adRows.map(mapAnuncio),
      }
    })

    const { cpl, ctr, cpc, cpm, frequencia } = weightedMetrics(
      camp.investimento, camp.cliques, camp.impressoes, camp.alcance, camp.leads
    )
    const indiceDesempenho = conjuntos.length > 0
      ? conjuntos.reduce((s, cj) => s + cj.indiceDesempenho, 0) / conjuntos.length
      : 0

    const nome = camp.nome
    const nomeAbreviado = nome.length > 35 ? nome.slice(0, 35) + '…' : nome

    return {
      id:               camp.id,
      nome,
      nomeAbreviado,
      objetivo:         mapObjetivo(camp.objective),
      status:           conjuntos.some(cj => cj.status === 'ACTIVE') ? 'ACTIVE' : 'PAUSED',
      plataformas:      ['facebook', 'instagram'],
      investimento:     camp.investimento,
      leads:            camp.leads,
      cpl,
      ctr,
      cpc,
      cpm,
      alcance:          camp.alcance,
      impressoes:       camp.impressoes,
      frequencia,
      indiceDesempenho,
      conjuntos,
    }
  })
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

const fetchAds = makeFetcher<AdRow[]>()

export function useMetaCampanhas(filtros: FiltrosCampanhas, dataInicio: string, dataFim: string) {
  const { data: rows, isLoading, error } = useSWR(
    ['rpc/get_anuncios_periodo', { p_inicio: dataInicio, p_fim: dataFim }] as const,
    fetchAds, SWR_OPTS
  )

  const useMock = !isLoading && (!rows || rows.length === 0)
  const finalRows = useMock ? (MOCK_AD_ROWS as any as AdRow[]) : (rows ?? [])

  let campanhas = buildHierarchy(finalRows)

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

  const { MOCK_INSIGHTS_IA } = require('@/lib/mock-meta-ads')

  return { campanhas, resumo: computeResumo(campanhas), insightsIA: MOCK_INSIGHTS_IA, isLoading, error: error ?? null }
}
