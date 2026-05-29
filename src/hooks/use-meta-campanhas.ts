'use client'

import useSWR from 'swr'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'
import { configVeiculacao } from '@/lib/veiculacao'
import { configPlataformaCampanha, normalizarPlataformaCampanha, ordenarPlataformasResumo } from '@/lib/plataformas-meta'
import { configObjetivoCampanha, mapObjetivoCampanha } from '@/lib/objetivos-meta'
import {
  Campanha, ConjuntoAnuncios, Anuncio, Criativo,
  ResumoCampanhas, FiltrosCampanhas, StatusCampanha, TipoCriativo, PlataformaResumo,
} from '@/types/meta-ads-campanhas'
import { calcularScore } from '@/components/meta-ads/anuncios/score-anuncio'

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface RawInsightIA {
  id?: string
  anuncio_id?: string
  anuncioId?: string
  severidade?: string
  tipo?: string
  titulo?: string
  mensagem?: string
  analise_completa?: string
  analiseCompleta?: string
  labelAcao?: string
  label_acao?: string
  acao?: string
}

interface RawAnuncio {
  ad_id: string
  nome?: string
  status?: string
  veiculacao?: string
  veiculacao_label?: string
  veiculacao_motivo?: string | null
  plataformas?: string[]
  plataformas_resumo?: RawPlataformaResumo[]
  creative_id?: string
  tipo_criativo?: string
  thumbnail_url?: string | null
  image_url_hq?: string | null
  link_anuncio?: string | null
  spend?: number | null
  leads?: number | null
  ctr?: number | null
  cpc?: number | null
  cpm?: number | null
  impressions?: number | null
  reach?: number | null
  clicks?: number | null
}

interface RawConjunto {
  adset_id: string
  adset_name?: string
  status?: string
  veiculacao?: string
  veiculacao_label?: string
  veiculacao_motivo?: string | null
  plataformas?: string[]
  plataformas_resumo?: RawPlataformaResumo[]
  orcamento_diario?: number | null
  orcamento_label?: string | null
  spend?: number | null
  leads?: number | null
  ctr?: number | null
  cpc?: number | null
  cpm?: number | null
  impressions?: number | null
  reach?: number | null
  clicks?: number | null
  anuncios?: RawAnuncio[]
}

interface RawCampanha {
  campaign_id: string
  nome?: string
  objetivo?: string
  objetivo_original?: string | null
  objetivo_mapeado?: string | null
  objetivo_label?: string | null
  objetivo_descricao?: string | null
  optimization_goal?: string | null
  billing_event?: string | null
  status?: string
  veiculacao?: string
  veiculacao_label?: string
  veiculacao_motivo?: string | null
  plataformas?: string[]
  plataformas_resumo?: RawPlataformaResumo[]
  orcamento_diario?: number | null
  orcamento_label?: string | null
  spend?: number | null
  leads?: number | null
  ctr?: number | null
  cpc?: number | null
  cpm?: number | null
  impressions?: number | null
  reach?: number | null
  clicks?: number | null
  veiculacao_resumo?: 'ATIVA' | 'COM_RESULTADO' | 'INATIVA'
  qtd_anuncios_ativos?: number | null
  qtd_anuncios_inativos?: number | null
  conjuntos?: RawConjunto[]
}

interface RawPlataformaResumo {
  codigo?: string
  label?: string
  detalhes?: string[]
}

function mapVeiculacao(raw?: string): string {
  const s = (raw || '').toUpperCase()
  if (
    s === 'ATIVO' ||
    s === 'DESATIVADO' ||
    s === 'CONCLUIDO' ||
    s === 'PROGRAMADO' ||
    s === 'APRENDIZADO' ||
    s === 'APRENDIZADO_LIMITADO' ||
    s === 'EM_ANALISE' ||
    s === 'REJEITADO' ||
    s === 'PROCESSANDO' ||
    s === 'ERRO_CONTA' ||
    s === 'ITENS_AUSENTES'
  ) {
    return s
  }

  if (s === 'ACTIVE') return 'ATIVO'
  if (s === 'LEARNING') return 'APRENDIZADO'
  if (s === 'LEARNING_LIMITED') return 'APRENDIZADO_LIMITADO'
  if (s === 'PAUSED' || s === 'CAMPAIGN_PAUSED' || s === 'ADSET_PAUSED' || s === 'ARCHIVED' || s === 'DELETED') {
    return 'DESATIVADO'
  }
  if (s === 'PENDING_REVIEW') return 'EM_ANALISE'
  if (s === 'DISAPPROVED' || s === 'WITH_ISSUES') return 'REJEITADO'
  if (s === 'PROCESSING' || s === 'IN_PROCESS') return 'PROCESSANDO'
  if (s === 'ERROR') return 'ERRO_CONTA'

  return 'DESATIVADO'
}

function mapStatusParaScore(raw?: string): StatusCampanha {
  const veiculacao = mapVeiculacao(raw)
  if (veiculacao === 'ATIVO') return 'ACTIVE'
  if (veiculacao === 'APRENDIZADO' || veiculacao === 'APRENDIZADO_LIMITADO') return 'LEARNING'
  if (veiculacao === 'CONCLUIDO' || veiculacao === 'DESATIVADO') return 'PAUSED'
  return 'OUTRO'
}

function mapPlataformasResumo(raw?: RawPlataformaResumo[], plataformas: string[] = []): PlataformaResumo[] {
  const resumo = (raw ?? [])
    .map(item => {
      if (!item.codigo) return null
      const codigo = normalizarPlataformaCampanha(item.codigo)
      if (!codigo) return null
      const cfg = configPlataformaCampanha(codigo)
      return {
        codigo,
        label: item.label || cfg.label,
        detalhes: item.detalhes ?? [],
      }
    })
    .filter((item): item is PlataformaResumo => item !== null)

  if (resumo.length > 0) {
    return ordenarPlataformasResumo(resumo)
  }

  return plataformas
    .map(codigo => normalizarPlataformaCampanha(codigo))
    .filter((codigo): codigo is PlataformaResumo['codigo'] => codigo !== null)
    .map(codigo => {
      const cfg = configPlataformaCampanha(codigo)
      return {
        codigo,
        label: cfg.label,
        detalhes: [],
      }
    })
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

function mapAnuncio(a: RawAnuncio): Anuncio {
  const sp = a.spend ?? 0; const ld = a.leads ?? 0
  const imp = a.impressions ?? 0; const rch = a.reach ?? 0; const cl = a.clicks ?? 0
  const cpl = ld > 0 ? sp / ld : 0
  const ctr = imp > 0 ? (cl / imp) * 100 : a.ctr ?? 0
  const cpc = cl > 0 ? sp / cl : a.cpc ?? 0
  const cpm = imp > 0 ? (sp / imp) * 1000 : a.cpm ?? 0
  const frequencia = rch > 0 ? imp / rch : 0
  const veiculacao = mapVeiculacao(a.veiculacao || a.status)
  const status = mapStatusParaScore(a.veiculacao || a.status)

  const criativo: Criativo = {
    id: a.creative_id || a.ad_id,
    tipo: ((a.tipo_criativo || 'IMAGE').toUpperCase() as TipoCriativo),
    thumbnailUrl: a.thumbnail_url ?? undefined,
    imageUrlHq: a.image_url_hq ?? a.thumbnail_url ?? undefined,
    corFundo: '#f0f0f0',
  }

  return {
    id: a.ad_id,
    nome: a.nome || a.ad_id,
    status,
    plataformas: (a.plataformas ?? []) as Anuncio['plataformas'],
    plataformasResumo: mapPlataformasResumo(a.plataformas_resumo, a.plataformas ?? []),
    criativo,
    permalinkUrl: a.link_anuncio || `https://www.facebook.com/ads/library/?id=${a.ad_id}`,
    investimento: sp,
    leads: ld,
    cliques: cl,
    impressoes: imp,
    alcance: rch,
    cpl, ctr, cpc, cpm, frequencia,
    indiceDesempenho: scoreAnuncio({ cpl, ctr, leads: ld, frequencia, status }),
    veiculacao,
    veiculacaoLabel: a.veiculacao_label || configVeiculacao(veiculacao).label,
    veiculacaoMotivo: a.veiculacao_motivo ?? null,
  }
}

function mapConjunto(adset: RawConjunto): ConjuntoAnuncios {
  const sp = adset.spend ?? 0; const ld = adset.leads ?? 0
  const imp = adset.impressions ?? 0; const rch = adset.reach ?? 0; const cl = adset.clicks ?? 0
  const anuncios: Anuncio[] = (adset.anuncios ?? []).map(mapAnuncio)
  const indiceDesempenho = anuncios.length > 0
    ? anuncios.reduce((s, a) => s + a.indiceDesempenho, 0) / anuncios.length
    : 0
  const veiculacao = mapVeiculacao(adset.veiculacao || adset.status)

  return {
    id: adset.adset_id,
    nome: adset.adset_name || adset.adset_id,
    status: mapStatusParaScore(adset.veiculacao || adset.status),
    plataformas: (adset.plataformas ?? []) as ConjuntoAnuncios['plataformas'],
    plataformasResumo: mapPlataformasResumo(adset.plataformas_resumo, adset.plataformas ?? []),
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
    veiculacao,
    veiculacaoLabel: adset.veiculacao_label || configVeiculacao(veiculacao).label,
    veiculacaoMotivo: adset.veiculacao_motivo ?? null,
    orcamentoDiario: adset.orcamento_diario ?? undefined,
    orcamentoLabel: adset.orcamento_label ?? null,
    anuncios,
  }
}

function mapCampanha(c: RawCampanha): Campanha {
  const sp = c.spend ?? 0; const ld = c.leads ?? 0
  const imp = c.impressions ?? 0; const rch = c.reach ?? 0; const cl = c.clicks ?? 0
  const conjuntos: ConjuntoAnuncios[] = (c.conjuntos ?? []).map(mapConjunto)
  const indiceDesempenho = conjuntos.length > 0
    ? conjuntos.reduce((s, cj) => s + cj.indiceDesempenho, 0) / conjuntos.length
    : 0
  const nome: string = c.nome || c.campaign_id
  const nomeAbreviado = nome.length > 35 ? nome.slice(0, 35) + '…' : nome
  const veiculacao = mapVeiculacao(c.veiculacao || c.status)
  const objetivo = mapObjetivoCampanha(
    c.objetivo_mapeado ?? c.objetivo,
    c.optimization_goal,
    c.billing_event,
  )
  const objetivoCfg = configObjetivoCampanha(objetivo)

  return {
    id: c.campaign_id,
    nome,
    nomeAbreviado,
    objetivo,
    objetivoOriginal: c.objetivo_original ?? c.objetivo ?? null,
    objetivoLabel: c.objetivo_label || objetivoCfg.label,
    objetivoDescricao: c.objetivo_descricao || objetivoCfg.descricao,
    status: mapStatusParaScore(c.veiculacao || c.status),
    plataformas: (c.plataformas ?? []) as Campanha['plataformas'],
    plataformasResumo: mapPlataformasResumo(c.plataformas_resumo, c.plataformas ?? []),
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
    veiculacaoResumo: c.veiculacao_resumo,
    veiculacao,
    veiculacaoLabel: c.veiculacao_label || configVeiculacao(veiculacao).label,
    veiculacaoMotivo: c.veiculacao_motivo ?? null,
    orcamentoDiario: c.orcamento_diario ?? undefined,
    orcamentoLabel: c.orcamento_label ?? null,
    qtdAnunciosAtivos: c.qtd_anuncios_ativos ?? 0,
    qtdAnunciosInativos: c.qtd_anuncios_inativos ?? 0,
    conjuntos,
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
    campanhasAtivas:   campanhas.filter(c => c.veiculacaoResumo === 'ATIVA').length,
    investimentoTotal,
    leadsTotal,
    cplMedio:          leadsTotal > 0 ? investimentoTotal / leadsTotal : 0,
    ctrMedio,
    melhorCpl:         melhor?.cpl ?? 0,
    melhorCplNome:     melhor?.nomeAbreviado ?? '',
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMetaCampanhas(
  filtros: FiltrosCampanhas,
  dataInicio: string,
  dataFim: string,
  contaIds: string[] = [],
  workspaceId: string | null = null
) {
  const { workspaceAtivo } = useWorkspace()
  const wsId = (workspaceId ?? workspaceAtivo) ?? undefined

  const contaIdsParam = contaIds.length
    ? `&conta_ids=${contaIds.join(',')}`
    : ''
  const veiculacaoParam = filtros.veiculacao && filtros.veiculacao !== 'todos'
    ? `&veiculacao=${filtros.veiculacao}`
    : ''
  const resultadoParam = `&resultado=${filtros.resultado ?? 'performance'}`

  const hierarquiaKey = wsId
    ? `/meta/catalogo/gerenciador?workspace_id=${wsId}&data_inicio=${dataInicio}&data_fim=${dataFim}${contaIdsParam}${veiculacaoParam}${resultadoParam}`
    : null

  const { data: rawHierarquia, isLoading, error } = useSWR(
    hierarquiaKey,
    () => api.get<RawCampanha[]>(hierarquiaKey!),
    { revalidateOnFocus: false }
  )

  const { data: iaRaw } = useSWR(
    wsId ? `/meta/insights/ia?workspace_id=${wsId}&data_inicio=${dataInicio}&data_fim=${dataFim}` : null,
    () => api.get<RawInsightIA[]>(`/meta/insights/ia?workspace_id=${wsId}&data_inicio=${dataInicio}&data_fim=${dataFim}`),
    { revalidateOnFocus: false }
  )

  const insightsIA = (iaRaw ?? []).map((item, i: number) => {
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
  const plataformasAtivas = filtros.plataformas.filter(Boolean)
  if (plataformasAtivas.length > 0 && plataformasAtivas.length < 3) {
    const selecionadas = new Set(plataformasAtivas)
    campanhas = campanhas.filter(c => {
      if (!c.plataformas || c.plataformas.length === 0) return true
      return c.plataformas.some(p => selecionadas.has(p))
    })
  }

  return {
    campanhas,
    resumo: computeResumo(campanhas),
    insightsIA,
    isLoading: !wsId || isLoading,
    error: error ?? null,
  }
}
