'use client'

import useSWR from 'swr'
import api from '@/lib/api-client'
import type { FiltrosMeta, MetaInsightsVisaoGeral, ContaAnuncio, DadosDiarios, CriativoTop } from '@/types/meta-ads'
import { calcularScore } from '@/components/meta-ads/anuncios/score-anuncio'

interface Workspace { id: string; nome: string }

function buildParams(wsId: string, filtros: FiltrosMeta): string {
  const p = new URLSearchParams({
    workspace_id: wsId,
    data_inicio: filtros.dataInicio,
    data_fim: filtros.dataFim,
  })
  if (filtros.contaIds.length > 0) {
    p.set('conta_ids', filtros.contaIds.join(','))
  }
  return p.toString()
}

export function useMetaInsights(filtros: FiltrosMeta) {
  const { data: workspaces } = useSWR<Workspace[]>(
    '/workspaces',
    () => api.get<Workspace[]>('/workspaces'),
    { revalidateOnFocus: false }
  )
  const wsId = workspaces?.[0]?.id

  const params = wsId ? buildParams(wsId, filtros) : null

  const { data: raw, isLoading, error } = useSWR(
    params ? `/meta/insights/visao-geral?${params}` : null,
    () => api.get<any>(`/meta/insights/visao-geral?${params}`),
    { revalidateOnFocus: false }
  )

  const { data: iaRaw } = useSWR(
    wsId
      ? `/meta/insights/ia?workspace_id=${wsId}&data_inicio=${filtros.dataInicio}&data_fim=${filtros.dataFim}`
      : null,
    () =>
      api.get<any[]>(
        `/meta/insights/ia?workspace_id=${wsId}&data_inicio=${filtros.dataInicio}&data_fim=${filtros.dataFim}`
      ),
    { revalidateOnFocus: false }
  )

  const iaData = (iaRaw ?? []).map((item: any, i: number) => {
    const tipoRaw: string = item.severidade ?? item.tipo ?? 'info'
    const severidade = tipoRaw.toLowerCase() as 'alerta' | 'oportunidade' | 'info'
    return {
      id: item.id ?? `ia-${i}`,
      anuncioId: item.anuncio_id ?? item.anuncioId ?? '',
      severidade: ['alerta', 'oportunidade', 'info'].includes(severidade) ? severidade : 'info',
      titulo: item.titulo ?? '',
      mensagem: item.mensagem ?? '',
      analiseCompleta: item.analise_completa ?? item.analiseCompleta ?? '',
      labelAcao: item.labelAcao ?? item.label_acao ?? item.acao ?? '',
    }
  })

  const data: MetaInsightsVisaoGeral | null = raw
    ? {
        contas: (raw.contas ?? []).map(
          (c: any): ContaAnuncio => ({
            id: c.id,
            nome: c.account_name || c.account_id,
            status: 'ACTIVE',
            investimento: c.spend,
            leads: c.leads,
            leadsWhatsapp: c.leads_whatsapp ?? 0,
            leadsInstagram: c.leads_instagram ?? 0,
            leadsMessenger: c.leads_messenger ?? 0,
            leadsFormulario: c.leads_formulario ?? 0,
            cpl: c.cpl,
            ctr: c.ctr,
            cpc: c.cpc,
            cpm: c.cpm,
            alcance: c.reach,
            impressoes: c.impressions,
            frequencia: c.frequencia,
            saldo: c.saldo ?? 0,
            saldoInicial: 0,
            metaAccountId: c.account_id,
            leadsPorPlataforma: (raw.leads_por_canal ?? []).slice(0, 5).map((lpc: any) => ({
              platform: lpc.canal as any,
              label: lpc.canal,
              count: lpc.leads,
              color: '#3E5BFF',
            })),
          })
        ),
        dadosDiarios: (raw.dados_diarios ?? []).map(
          (d: any): DadosDiarios => ({
            data: d.data,
            investimento: d.spend,
            leads: d.leads,
          })
        ),
        topCriativos: (raw.top_criativos ?? []).map((c: any): CriativoTop => ({
          id: c.id,
          nome: c.nome ?? '',
          tipo: (c.tipo as 'IMAGE' | 'VIDEO' | 'CAROUSEL') ?? 'IMAGE',
          thumbnailUrl: c.image_url_hq ?? c.thumbnail_url ?? undefined,
          imageUrlHq: c.image_url_hq ?? undefined,
          linkAnuncio: c.link_anuncio ?? undefined,
          carouselItems: c.carousel_items ?? [],
          leads: c.leads ?? 0,
          ctr: c.ctr ?? 0,
          cpl: c.cpl ?? 0,
        })),
        insightsIA: iaData ?? [],
        periodo: raw.periodo ?? { inicio: filtros.dataInicio, fim: filtros.dataFim },
      }
    : null

  return { data, isLoading: !wsId || isLoading, error }
}
