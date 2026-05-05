'use client'

import useSWR from 'swr'
import { Anuncio, FiltrosAnuncios, TipoAnuncio, StatusAnuncio, PlataformaAnuncio } from '@/types/meta-ads-anuncios'
import { makeFetcher, SWR_OPTS } from '@/lib/swr'
import { MOCK_AD_ROWS } from '@/lib/mock-meta-ads'

interface AdsCompletoRow {
  ad_id: string
  ad_name: string
  campaign_name: string
  adset_name: string
  creative_type?: string
  ad_status_calc?: string
  creative_url?: string
  investimento: string | number
  leads: number
  leads_mensagem: number
  leads_cadastro: number
  cpl: string | number
  ctr: string | number
  cpc: string | number
  cpm: string | number
  alcance: number
  impressoes: number
  frequencia: string | number
  score: number
  tendencia?: string
  dias_ativo: number
}

const fetchAds = makeFetcher<AdsCompletoRow[]>()

function mapAnuncio(row: AdsCompletoRow): Anuncio {
  return {
    id:            row.ad_id,
    nome:          row.ad_name,
    campanhaNome:  row.campaign_name,
    conjuntoNome:  row.adset_name,
    tipo:          ((row.creative_type || 'IMAGE') as TipoAnuncio),
    status:        ((row.ad_status_calc || 'ACTIVE') as StatusAnuncio),
    plataformas:   ['facebook'] as PlataformaAnuncio[],
    corFundo:      '#f0f0f0',
    thumbnailUrl:  row.creative_url,
    investimento:  Number(row.investimento),
    leads:         row.leads,
    leadsMensagem: row.leads_mensagem,
    leadsCadastro: row.leads_cadastro,
    cpl:           Number(row.cpl),
    ctr:           Number(row.ctr),
    cpc:           Number(row.cpc),
    cpm:           Number(row.cpm),
    alcance:       row.alcance,
    impressoes:    row.impressoes,
    frequencia:    Number(row.frequencia),
    score:         row.score,
    tendencia:     (row.tendencia as Anuncio['tendencia']) || 'estavel',
    diasAtivo:     row.dias_ativo,
  }
}

export function useMetaAnuncios(filtros: FiltrosAnuncios, dataInicio: string, dataFim: string) {
  const { data: rows, isLoading, error } = useSWR(
    ['rpc/get_anuncios_periodo', { p_inicio: dataInicio, p_fim: dataFim }] as const,
    fetchAds, SWR_OPTS
  )

  const useMock = !isLoading && (!rows || rows.length === 0)
  const finalRows = useMock ? (MOCK_AD_ROWS as any as AdsCompletoRow[]) : (rows ?? [])

  let resultado = finalRows.map(mapAnuncio)

  if (filtros.campanha !== 'todas') {
    resultado = resultado.filter(a => a.campanhaNome.includes(filtros.campanha))
  }
  if (filtros.status !== 'todos') {
    resultado = resultado.filter(a => a.status === filtros.status)
  }
  if (filtros.tipo !== 'todos') {
    resultado = resultado.filter(a => a.tipo === filtros.tipo)
  }

  resultado.sort((a, b) => {
    switch (filtros.ordenarPor) {
      case 'leads':      return b.leads - a.leads
      case 'cpl':        return a.cpl - b.cpl
      case 'ctr':        return b.ctr - a.ctr
      case 'frequencia': return b.frequencia - a.frequencia
      default:           return b.score - a.score
    }
  })

  return { anuncios: resultado, total: resultado.length, isLoading, error: error ?? null }
}

// Empty — campaign names are derived dynamically from the hook result
export const campanhasDisponiveis: string[] = []
