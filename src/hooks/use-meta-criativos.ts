'use client'

import useSWR from 'swr'
import { Criativo, FiltrosCriativos, TipoCriativo, StatusCriativo } from '@/types/meta-ads-criativos'
import { makeFetcher, SWR_OPTS } from '@/lib/swr'
import { MOCK_CRIATIVOS_ROWS } from '@/lib/mock-meta-ads'

interface CriativosCompletoRow {
  creative_id: string
  creative_type?: string
  status_criativo?: string
  creative_url?: string
  dias_ativo: number
  campanhas: number
  leads: number
  investimento: string | number
  cpl: string | number
  ctr: string | number
  cpc: string | number
  cpm: string | number
  alcance: number
  impressoes: string | number
  frequencia: string | number
  score: number
}

const fetchCriativos = makeFetcher<CriativosCompletoRow[]>()

function mapCriativo(row: CriativosCompletoRow): Criativo {
  return {
    id:            row.creative_id,
    nome:          row.creative_id,
    tipo:          ((row.creative_type || 'IMAGE') as TipoCriativo),
    status:        ((row.status_criativo || 'novo') as StatusCriativo),
    corFundo:      '#f0f0f0',
    thumbnailUrl:  row.creative_url,
    diasAtivo:     row.dias_ativo,
    campanhas:     row.campanhas,
    campanhasDetalhe: [],
    leads:         row.leads,
    investimento:  Number(row.investimento),
    cpl:           Number(row.cpl),
    ctr:           Number(row.ctr),
    cpc:           Number(row.cpc),
    cpm:           Number(row.cpm),
    alcance:       row.alcance,
    impressoes:    Number(row.impressoes),
    frequencia:    Number(row.frequencia),
    hookRate:      null,
    holdRate:      null,
    videoViews3s:  null,
    videoViews15s: null,
    videoThruPlays: null,
    score:         row.score,
  }
}

export function useMetaCriativos(filtros: FiltrosCriativos, dataInicio: string, dataFim: string) {
  const { data: rows, isLoading, error } = useSWR(
    ['rpc/get_criativos_periodo', { p_inicio: dataInicio, p_fim: dataFim }] as const,
    fetchCriativos, SWR_OPTS
  )

  const useMock = !isLoading && (!rows || rows.length === 0)
  const finalRows = useMock ? (MOCK_CRIATIVOS_ROWS as any as CriativosCompletoRow[]) : (rows ?? [])

  let resultado = finalRows.map(mapCriativo)

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
