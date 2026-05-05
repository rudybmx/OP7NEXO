'use client'

import useSWR from 'swr'
import type { FiltrosMeta, MetaInsightsVisaoGeral, ContaAnuncio, DadosDiarios, CriativoTop } from '@/types/meta-ads'
import { makeFetcher, SWR_OPTS } from '@/lib/swr'
import { MOCK_CONTAS_META, MOCK_DADOS_DIARIOS, MOCK_TOP_CRIATIVOS, MOCK_INSIGHTS_IA } from '@/lib/mock-meta-ads'

interface InsightRawRow {
  account_id: string
  account_name?: string
  date_start: string
  spend: string | number
  leads: number
  impressions?: number
  reach?: number
  clicks?: number
  leads_mensagem?: number
  leads_cadastro?: number
  frequency?: string | number
  cpc?: string | number
  cpm?: string | number
  ctr?: string | number
}

interface AccountRow {
  id: string              // UUID primary key — matches meta_ads_insights.account_id
  account_id: string      // Meta text ID (e.g. "act_394136101703780")
  account_name: string
  balance: string | number
  spend_cap: string | number
  amount_spent: string | number
  account_status: number
  is_prepay_account: boolean
  funding_source_type?: string
  ultimo_valor_recarga?: number
  currency?: string
}

interface AdsCompletoRow {
  ad_id: string
  ad_name: string
  creative_url?: string
  creative_type?: string
  leads: number
  ctr: string | number
  cpl: string | number
}

const fetchInsights = makeFetcher<InsightRawRow[]>()
const fetchAds = makeFetcher<AdsCompletoRow[]>()
const fetchAccounts = makeFetcher<AccountRow[]>()

/** PIX (prepay): balance is in cents → divide by 100. Cartão: limit minus spent. */
function calcSaldo(acct: AccountRow): number {
  if (acct.is_prepay_account) {
    return Number(acct.balance) / 100
  }
  return Math.max(0, Number(acct.spend_cap) - Number(acct.amount_spent))
}

function calcularKPIsGlobais(rows: InsightRawRow[], accountsMap: Record<string, AccountRow>): ContaAnuncio[] {
  if (!rows || rows.length === 0) return []
  
  const accounts: Record<string, ContaAnuncio> = {}

  for (const row of rows) {
    const accId = row.account_id || 'default'
    if (!accounts[accId]) {
      const acct = accountsMap[accId]
      accounts[accId] = {
        id: accId,
        nome: acct?.account_name || row.account_name || 'Conta Meta Ads',
        status: acct ? (acct.account_status === 1 ? 'ACTIVE' : 'DISABLED') : 'ACTIVE',
        investimento: 0,
        leads: 0,
        leadsMensagem: 0,
        leadsCadastro: 0,
        leadsCompra: 0,
        cpl: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        alcance: 0,
        impressoes: 0,
        frequencia: 0,
        saldo: acct ? calcSaldo(acct) : 0,
        saldoInicial: acct ? Number(acct.spend_cap) || 0 : 0,
        metaAccountId: acct?.account_id ?? undefined,
        isPrepay: acct?.is_prepay_account,
        limiteCartao: acct ? Number(acct.spend_cap) || 0 : undefined,
        ultimoValorRecarga: acct?.ultimo_valor_recarga ?? undefined,
        fundingSourceType: acct?.funding_source_type ?? undefined,
        leadsPorPlataforma: [],
      }
    }
    
    const acc = accounts[accId]
    acc.investimento += Number(row.spend ?? 0)
    acc.leads += Number(row.leads ?? 0)
    acc.leadsMensagem += Number(row.leads_mensagem ?? 0)
    acc.leadsCadastro += Number(row.leads_cadastro ?? 0)
    acc.alcance += Number(row.reach ?? 0)
    acc.impressoes += Number(row.impressions ?? 0)
    
    acc.ctr += Number(row.ctr ?? 0)
    acc.cpc += Number(row.cpc ?? 0)
    acc.cpm += Number(row.cpm ?? 0)
    acc.frequencia += Number(row.frequency ?? 0)
  }

  return Object.values(accounts).map(acc => {
    const rowCount = rows.filter(r => (r.account_id || 'default') === acc.id).length
    if (rowCount > 0) {
      acc.ctr = acc.ctr / rowCount
      acc.cpc = acc.cpc / rowCount
      acc.cpm = acc.cpm / rowCount
      acc.frequencia = acc.frequencia / rowCount
    }
    acc.cpl = acc.leads > 0 ? acc.investimento / acc.leads : 0
    return acc
  })
}

function mapDadosDiarios(rows: InsightRawRow[]): DadosDiarios[] {
  const diarios = rows.reduce((acc, row) => {
    const existente = acc.find(d => d.data === row.date_start)
    if (existente) {
      existente.investimento += Number(row.spend ?? 0)
      existente.leads += Number(row.leads ?? 0)
    } else {
      acc.push({
        data: row.date_start,
        investimento: Number(row.spend ?? 0),
        leads: Number(row.leads ?? 0)
      })
    }
    return acc
  }, [] as DadosDiarios[])

  return diarios.sort((a, b) => a.data.localeCompare(b.data))
}

function mapCriativo(row: AdsCompletoRow): CriativoTop {
  return {
    id:           row.ad_id,
    nome:         row.ad_name,
    tipo:         (row.creative_type as CriativoTop['tipo']) || 'IMAGE',
    thumbnailUrl: row.creative_url,
    leads:        row.leads,
    ctr:          Number(row.ctr ?? 0),
    cpl:          Number(row.cpl ?? 0),
  }
}

export function useMetaInsights(filtros: FiltrosMeta) {
  const insightParams = {
    date_start: [`gte.${filtros.dataInicio}`, `lte.${filtros.dataFim}`],
    select: 'account_id,date_start,spend,leads,impressions,reach,clicks,frequency,cpc,cpm,ctr',
    order:  'date_start.asc',
  }

  const topParams = {
    select: 'ad_id,ad_name,creative_url,creative_type,leads,ctr,cpl',
    order:  'leads.desc',
    limit:  '5',
  } as const

  const accountParams = {
    // id = UUID PK (matches meta_ads_insights.account_id FK for joining)
    select: 'id,account_id,account_name,balance,spend_cap,amount_spent,account_status,is_prepay_account,funding_source_type,ultimo_valor_recarga,currency',
  }

  const rInsights = useSWR(['meta_ads_insights', insightParams] as const, fetchInsights, SWR_OPTS)
  const rAds = useSWR(['vw_meta_ads_completo', topParams] as const, fetchAds, SWR_OPTS)
  const rAccounts = useSWR(['meta_ad_accounts', accountParams] as const, fetchAccounts, SWR_OPTS)

  const isLoading = rInsights.isLoading || rAds.isLoading || rAccounts.isLoading
  const error     = rInsights.error ?? rAds.error ?? rAccounts.error ?? null

  // Fallback para Mock Data (Odontocompany) se não houver dados ou houver erro
  // Em ambiente de desenvolvimento/demo, podemos preferir os dados mockados para exibição completa
  const useMock = !isLoading && (!rInsights.data || rInsights.data.length === 0)

  if (useMock) {
    return {
      data: {
        contas: MOCK_CONTAS_META,
        dadosDiarios: MOCK_DADOS_DIARIOS,
        topCriativos: MOCK_TOP_CRIATIVOS,
        insightsIA: MOCK_INSIGHTS_IA,
        periodo: { inicio: filtros.dataInicio, fim: filtros.dataFim },
      },
      isLoading: false,
      error: null
    }
  }

  // Key by UUID (id), not by Meta text account_id — insights FK references id
  const accountsMap: Record<string, AccountRow> = {}
  if (rAccounts.data) {
    for (const row of rAccounts.data) {
      accountsMap[row.id] = row
    }
  }

  let contas = calcularKPIsGlobais(rInsights.data ?? [], accountsMap)
  if (filtros.contaIds.length > 0) {
    contas = contas.filter(c => filtros.contaIds.includes(c.id))
  }

  const data: MetaInsightsVisaoGeral | null = (rInsights.data && rAds.data)
    ? {
        contas,
        dadosDiarios: mapDadosDiarios(rInsights.data),
        topCriativos: rAds.data.map(mapCriativo),
        periodo: { inicio: filtros.dataInicio, fim: filtros.dataFim },
      }
    : null

  return { data, isLoading, error }
}