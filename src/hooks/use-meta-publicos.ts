'use client'

import useSWR from 'swr'
import type {
  DadosDemograficos,
  DadosPlacement,
  DadosDispositivo,
  DadosSO,
  DadosCidade,
  DadosHora,
  KpiPublicos,
  FiltrosPublicos,
} from '@/types/meta-ads-publicos'
import { makeFetcher, SWR_OPTS } from '@/lib/swr'
import { 
  MOCK_DEMOGRAPHICS_ROWS, 
  MOCK_GEO_ROWS, 
  MOCK_ACCOUNT_SUMMARY_ROWS,
  MOCK_PLACEMENTS,
  MOCK_DISPOSITIVOS,
  MOCK_SO_ROWS,
  MOCK_HEATMAP
} from '@/lib/mock-meta-ads'

interface DemographicsRow {
  age: string
  gender: string
  leads: number
  investimento: string | number
  cpl: string | number
  ctr: string | number
  alcance: number
  impressoes: number
}

interface GeoRow {
  region: string
  leads: number
  investimento: string | number
  cpl: string | number
}

interface AccountSummaryRow {
  alcance: number
  frequencia_media: string | number
}

const fetchDemo    = makeFetcher<DemographicsRow[]>()
const fetchGeo     = makeFetcher<GeoRow[]>()
const fetchAccount = makeFetcher<AccountSummaryRow[]>()

// ─── Static fallbacks for unavailable data ────────────────────────────────────

const PLACEMENTS_VAZIO: DadosPlacement[] = []

const DISPOSITIVOS_FIXO: DadosDispositivo[] = [
  { tipo: 'mobile',  percentual: 85, leads: 0, cpl: 0 },
  { tipo: 'desktop', percentual: 12, leads: 0, cpl: 0 },
  { tipo: 'tablet',  percentual: 3,  leads: 0, cpl: 0 },
]

const SO_FIXO: DadosSO[] = [
  { nome: 'Android', percentual: 68, cpl: 0 },
  { nome: 'iOS',     percentual: 29, cpl: 0 },
  { nome: 'Windows', percentual: 3,  cpl: 0 },
]

const HEATMAP_VAZIO: DadosHora[] = []

const KPI_VAZIO: KpiPublicos = {
  alcanceTotal: 0, frequenciaMedia: 0,
  melhorFaixaCpl: 'N/D', melhorFaixaValor: 0,
  melhorPlacement: 'N/D', melhorPlacementCpl: 0,
  melhorHorario: 'N/D', melhorDia: 'N/D',
  melhorCidade: 'N/D', melhorCidadeLeads: 0,
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapDemografico(row: DemographicsRow): DadosDemograficos {
  return {
    faixa:        row.age.replace('-', '–'),
    genero:       row.gender === 'male' ? 'masc' : 'fem',
    leads:        row.leads,
    investimento: Number(row.investimento),
    cpl:          Number(row.cpl),
    ctr:          Number(row.ctr),
    alcance:      row.alcance,
    impressoes:   row.impressoes,
  }
}

function mapCidades(rows: GeoRow[]): DadosCidade[] {
  const totalLeads = rows.reduce((s, r) => s + r.leads, 0)
  return rows.map(row => ({
    nome:            row.region,
    leads:           row.leads,
    investimento:    Number(row.investimento),
    cpl:             Number(row.cpl),
    percentualLeads: totalLeads > 0 ? (row.leads / totalLeads) * 100 : 0,
  }))
}

function computeKpi(
  demograficos: DadosDemograficos[],
  cidades: DadosCidade[],
  accountRows: AccountSummaryRow[],
  placements: DadosPlacement[],
  heatmap: DadosHora[]
): KpiPublicos {
  const alcanceTotal    = accountRows.reduce((s, r) => s + r.alcance, 0)
  const frequenciaMedia = accountRows.length > 0 ? Number(accountRows[0].frequencia_media) : 0

  const comLeads   = demograficos.filter(d => d.leads > 0)
  const melhorDemo = comLeads.length > 0
    ? comLeads.reduce((best, d) => d.cpl < best.cpl ? d : best)
    : null

  const melhorCidade = cidades.length > 0
    ? cidades.reduce((best, c) => c.leads > best.leads ? c : best)
    : null

  const melhorPlac = placements.length > 0
    ? placements.reduce((best, p) => p.leads > best.leads ? p : best)
    : null

  const melhorH = heatmap.length > 0
    ? heatmap.reduce((best, h) => h.leads > best.leads ? h : best)
    : null

  const diasSemana = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

  return {
    alcanceTotal,
    frequenciaMedia,
    melhorFaixaCpl:     melhorDemo
      ? `${melhorDemo.faixa} ${melhorDemo.genero === 'masc' ? '(M)' : '(F)'}`
      : 'N/D',
    melhorFaixaValor:   melhorDemo?.cpl ?? 0,
    melhorPlacement:    melhorPlac?.nome ?? 'N/D',
    melhorPlacementCpl: melhorPlac?.cpl ?? 0,
    melhorHorario:      melhorH ? `${melhorH.hora}h` : 'N/D',
    melhorDia:          melhorH ? diasSemana[melhorH.dia] : 'N/D',
    melhorCidade:       melhorCidade?.nome ?? 'N/D',
    melhorCidadeLeads:  melhorCidade?.leads ?? 0,
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMetaPublicos(_filtros: FiltrosPublicos, dataInicio: string, dataFim: string) {
  const r1 = useSWR(['rpc/get_demograficos_periodo', { p_inicio: dataInicio, p_fim: dataFim }] as const, fetchDemo, SWR_OPTS)
  const r2 = useSWR(['rpc/get_geo_periodo', { p_inicio: dataInicio, p_fim: dataFim }] as const, fetchGeo, SWR_OPTS)
  const r3 = useSWR(
    ['vw_meta_account_summary', { select: 'alcance,frequencia_media' }] as const,
    fetchAccount, SWR_OPTS
  )

  const isLoading = r1.isLoading || r2.isLoading || r3.isLoading
  const error     = r1.error ?? r2.error ?? r3.error ?? null

  const useMock = !isLoading && (!r1.data || r1.data.length === 0)
  
  const finalDemo = useMock ? MOCK_DEMOGRAPHICS_ROWS : (r1.data ?? [])
  const finalGeo  = useMock ? MOCK_GEO_ROWS : (r2.data ?? [])
  const finalAcct = useMock ? MOCK_ACCOUNT_SUMMARY_ROWS : (r3.data ?? [])

  const demograficos = finalDemo.map(mapDemografico)
  const cidades      = mapCidades(finalGeo as any)
  
  const placements   = useMock ? MOCK_PLACEMENTS : PLACEMENTS_VAZIO
  const dispositivos = useMock ? MOCK_DISPOSITIVOS : DISPOSITIVOS_FIXO
  const so           = useMock ? MOCK_SO_ROWS : SO_FIXO
  const heatmap      = useMock ? MOCK_HEATMAP : HEATMAP_VAZIO

  const kpi          = (finalDemo.length > 0 && finalGeo.length > 0 && finalAcct.length > 0)
    ? computeKpi(demograficos, cidades, finalAcct as any, placements as any, heatmap as any)
    : KPI_VAZIO

  return {
    demograficos,
    placements:         useMock ? MOCK_PLACEMENTS : PLACEMENTS_VAZIO,
    dispositivos:       useMock ? MOCK_DISPOSITIVOS : DISPOSITIVOS_FIXO,
    sistemaOperacional: useMock ? MOCK_SO_ROWS : SO_FIXO,
    heatmapHoras:       useMock ? MOCK_HEATMAP : HEATMAP_VAZIO,
    cidades,
    kpi,
    isLoading,
    error,
  }
}
