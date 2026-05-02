import useSWR from 'swr'
import { apiGet } from '@/lib/api'

interface SummaryResponse {
  total_spend: number
  total_leads: number
  total_impressions: number
  total_reach: number
  total_clicks: number
  avg_ctr: number
  avg_cpc: number
  avg_cpm: number
  avg_cpl: number
}

interface FinanceiroResponse {
  is_prepay_account: boolean
  balance: number
  amount_spent: number
  spend_cap: number
  funding_source_type: string
  funding_source_details: string
  bm_name: string
}

interface MetaOverview {
  kpis: {
    spend: number
    leads: number
    impressions: number
    reach: number
    clicks: number
    ctr: number
    cpc: number
    cpm: number
    cpl: number
  }
  financeiro: {
    saldo: number
    limite: number
    formaPagamento: string
    nomeBm: string
  }
  isLoading: boolean
  error: any
}

/**
 * Hook to fetch overview data from Meta Ads account.
 * Fetches summary KPIs and financial details in parallel.
 */
export function useMetaOverview(): MetaOverview {
  // SWR calls in parallel
  const { 
    data: summaryData, 
    error: errorSummary, 
    isLoading: isLoadingSummary 
  } = useSWR<SummaryResponse>('/meta/overview', apiGet)

  const { 
    data: financeiroData, 
    error: errorFinanceiro, 
    isLoading: isLoadingFinanceiro 
  } = useSWR<FinanceiroResponse[]>('/vw_meta_account_financeiro', apiGet)

  // PostgREST typically returns an array for views
  const summary = summaryData?.[0]
  const financeiro = financeiroData?.[0]

  const isLoading = isLoadingSummary || isLoadingFinanceiro
  const error = errorSummary || errorFinanceiro

  // Logic for Balance (Saldo)
  // if (is_prepay_account) saldo = balance / 100
  // else saldo = spend_cap - amount_spent
  let saldo = 0
  if (financeiro) {
    if (financeiro.is_prepay_account) {
      saldo = (financeiro.balance || 0) / 100
    } else {
      saldo = (financeiro.spend_cap || 0) - (financeiro.amount_spent || 0)
    }
  }

  return {
    kpis: {
      spend: summary?.total_spend ?? 0,
      leads: summary?.total_leads ?? 0,
      impressions: summary?.total_impressions ?? 0,
      reach: summary?.total_reach ?? 0,
      clicks: summary?.total_clicks ?? 0,
      ctr: summary?.avg_ctr ?? 0,
      cpc: summary?.avg_cpc ?? 0,
      cpm: summary?.avg_cpm ?? 0,
      cpl: summary?.avg_cpl ?? 0,
    },
    financeiro: {
      saldo,
      limite: financeiro?.spend_cap ?? 0,
      formaPagamento: financeiro?.funding_source_details || financeiro?.funding_source_type || '-',
      nomeBm: financeiro?.bm_name ?? '-',
    },
    isLoading,
    error,
  }
}
