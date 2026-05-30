'use client'

import useSWR from 'swr'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'
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

interface AccountSummaryRow {
  alcance: number
  frequencia_media: number
}

interface PublicosDemograficoRow {
  faixa: string | null
  genero: string | null
  leads: number
  spend: number
  cpl: number
  ctr: number
  alcance: number
  impressoes: number
}

interface PublicosPlacementRow {
  nome: string | null
  plataforma: string | null
  leads: number
  spend: number
  cpl: number
  percentual: number
}

interface PublicosDispositivoRow {
  tipo: DadosDispositivo['tipo']
  percentual: number
  leads: number
  cpl: number
}

interface PublicosSORow {
  nome: string
  percentual: number
  cpl: number
}

interface PublicosHoraRow {
  dia: number
  hora: number
  leads: number
  intensidade?: number | null
}

interface PublicosCidadeRow {
  nome: string
  leads: number
  spend: number
  cpl: number
  percentual: number
}

interface PublicosApiResponse {
  demograficos: PublicosDemograficoRow[]
  placements: PublicosPlacementRow[]
  dispositivos: PublicosDispositivoRow[]
  sistema_operacional: PublicosSORow[]
  heatmap: PublicosHoraRow[]
  cidades: PublicosCidadeRow[]
  alcance_total: number
  frequencia_media: number
}

const KPI_VAZIO: KpiPublicos = {
  alcanceTotal: 0, frequenciaMedia: 0,
  melhorFaixaCpl: 'N/D', melhorFaixaValor: 0,
  melhorPlacement: 'N/D', melhorPlacementCpl: 0,
  melhorHorario: 'N/D', melhorDia: 'N/D',
  melhorCidade: 'N/D', melhorCidadeLeads: 0,
}

const COR_MAP: Record<string, string> = {
  instagram:        '#E1306C',
  facebook:         '#1877F2',
  messenger:        '#0084FF',
  audience_network: '#7A5AF8',
}

function corPlataforma(plataforma: string): string {
  return COR_MAP[plataforma] ?? '#7A5AF8'
}

function normalizePlataforma(p: string | null | undefined): DadosPlacement['plataforma'] {
  const valid = ['facebook', 'instagram', 'whatsapp', 'audience_network'] as const
  const value = String(p ?? '')
  return (valid as readonly string[]).includes(value)
    ? value as DadosPlacement['plataforma']
    : 'facebook'
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

export function useMetaPublicos(
  _filtros: FiltrosPublicos,
  dataInicio: string,
  dataFim: string,
  contaIds: string[] = [],
  workspaceId: string | null = null
) {
  const { workspaceAtivo } = useWorkspace()
  const wsId = (workspaceId ?? workspaceAtivo) ?? undefined

  const contaIdsParam = contaIds.length ? `&conta_ids=${contaIds.join(',')}` : ''
  const campParam = _filtros.campaign_id && _filtros.campaign_id !== 'todas'
    ? `&campaign_id=${_filtros.campaign_id}`
    : ''
  const key = wsId
    ? `/meta/insights/publicos?workspace_id=${wsId}&data_inicio=${dataInicio}&data_fim=${dataFim}${contaIdsParam}${campParam}`
    : null

  const { data, isLoading, error } = useSWR<PublicosApiResponse>(
    key,
    () => api.get<PublicosApiResponse>(key!),
    { revalidateOnFocus: false }
  )

  const demograficos: DadosDemograficos[] = (data?.demograficos ?? [])
    .filter((row): row is PublicosDemograficoRow & { faixa: string; genero: 'male' | 'female' } => (
      Boolean(row.faixa) && (row.genero === 'male' || row.genero === 'female')
    ))
    .map((row) => ({
      faixa:       row.faixa.replace('-', '–'),
      genero:      row.genero === 'male' ? 'masc' : 'fem',
      leads:       row.leads,
      investimento: row.spend,
      cpl:         row.cpl,
      ctr:         row.ctr,
      alcance:     row.alcance,
      impressoes:  row.impressoes,
    }))

  const placements: DadosPlacement[] = (data?.placements ?? [])
    .filter((row): row is PublicosPlacementRow & { nome: string; plataforma: string } => (
      Boolean(row.nome) && Boolean(row.plataforma)
    ))
    .map((row) => ({
      nome:        row.nome,
      plataforma:  normalizePlataforma(row.plataforma),
      leads:       row.leads,
      investimento: row.spend,
      cpl:         row.cpl,
      percentual:  row.percentual,
      ctr:         0,
      cor:         corPlataforma(row.plataforma),
    }))

  const accountRows: AccountSummaryRow[] = data
    ? [{
      alcance: Number(data.alcance_total ?? 0),
      frequencia_media: Number(data.frequencia_media ?? 0),
    }]
    : []

  const dispositivos: DadosDispositivo[] = (data?.dispositivos ?? []).map((d) => ({
    tipo:       d.tipo as DadosDispositivo['tipo'],
    percentual: d.percentual,
    leads:      d.leads,
    cpl:        d.cpl,
  }))

  const sistemaOperacional: DadosSO[] = (data?.sistema_operacional ?? []).map((s) => ({
    nome:       s.nome,
    percentual: s.percentual,
    cpl:        s.cpl,
  }))

  const heatmapHoras: DadosHora[] = (data?.heatmap ?? []).map((h) => ({
    dia:         h.dia,
    hora:        h.hora,
    leads:       h.leads,
    intensidade: h.intensidade ?? 0,
  }))

  const cidades: DadosCidade[] = (data?.cidades ?? []).map((c) => ({
    nome:         c.nome,
    leads:        c.leads,
    investimento: c.spend,
    cpl:          c.cpl,
    percentualLeads: c.percentual,
  }))

  const kpi = data
    ? computeKpi(demograficos, cidades, accountRows, placements, heatmapHoras)
    : KPI_VAZIO

  return {
    demograficos,
    placements,
    dispositivos,
    sistemaOperacional,
    heatmapHoras:       heatmapHoras,
    cidades,
    kpi,
    isLoading: !wsId || isLoading,
    error: error ?? null,
  }
}
