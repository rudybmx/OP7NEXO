'use client'

import useSWR from 'swr'
import api from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'
import { SWR_OPTS } from '@/lib/swr'
import type {
  FinanceiroConta,
  FinanceiroMetaAds,
  FinanceiroNota,
  FinanceiroResumo,
  FinanceiroTransacao,
  EstadoAlertaFinanceiro,
  EstadoListaFinanceira,
  EstadoSelecaoFinanceiro,
} from '@/types/meta-ads-financeiro'

interface FinanceiroContaApi {
  id?: string
  account_id?: string
  account_name?: string | null
  label?: string | null
  available_balance?: number | null
  display_balance_amount?: number | null
  display_balance_label?: string | null
  display_balance_kind?: string | null
  amount_spent?: number | null
  spend_cap?: number | null
  debt_amount?: number | null
  estimated_tax_amount?: number | null
  due_amount?: number | null
  reference_amount?: number | null
  reference_kind?: string | null
  reference_label?: string | null
  alert_state?: EstadoAlertaFinanceiro | string | null
  alert_ratio?: number | null
  alert_threshold?: number | null
  alert_message?: string | null
  funding_type?: string | null
  funding_type_label?: string | null
  funding_source_display?: string | null
  funding_source_id?: string | null
  funding_source_brand?: string | null
  is_prepay_account?: boolean | null
  currency?: string | null
  account_status?: number | null
  ativo?: boolean | null
  bm_id?: string | null
  bm_name?: string | null
  synced_at?: string | null
  updated_at?: string | null
}

interface FinanceiroResumoApi extends FinanceiroContaApi {}

interface FinanceiroTransacaoApi {
  id?: string
  data?: string
  descricao?: string
  valor?: number
  tipo?: string
  status?: string
  observacao?: string | null
}

interface FinanceiroNotaApi {
  id?: string
  data?: string
  titulo?: string
  corpo?: string
  categoria?: string | null
}

interface FinanceiroApiResponse {
  workspace_id?: string
  selection_state?: EstadoSelecaoFinanceiro
  selection_required?: boolean
  selection_message?: string
  accounts?: FinanceiroContaApi[]
  selected_account?: FinanceiroContaApi | null
  summary?: FinanceiroResumoApi | null
  transactions?: FinanceiroTransacaoApi[]
  notes?: FinanceiroNotaApi[]
  transactions_state?: EstadoListaFinanceira
  notes_state?: EstadoListaFinanceira
  updated_at?: string | null
}

function toNumber(valor: unknown, fallback = 0): number {
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : fallback
}

function mapResumo(item?: FinanceiroContaApi | FinanceiroResumoApi | null): FinanceiroResumo {
  return {
    availableBalance: toNumber(item?.available_balance),
    displayBalanceAmount: item?.display_balance_amount == null ? null : toNumber(item.display_balance_amount),
    displayBalanceLabel: item?.display_balance_label ?? null,
    displayBalanceKind: item?.display_balance_kind ?? null,
    amountSpent: toNumber(item?.amount_spent),
    spendCap: toNumber(item?.spend_cap),
    debtAmount: item?.debt_amount == null ? null : toNumber(item.debt_amount),
    estimatedTaxAmount: item?.estimated_tax_amount == null ? null : toNumber(item.estimated_tax_amount),
    dueAmount: item?.due_amount == null ? null : toNumber(item.due_amount),
    referenceAmount: item?.reference_amount == null ? null : toNumber(item.reference_amount),
    referenceKind: item?.reference_kind ?? 'unknown',
    referenceLabel: item?.reference_label ?? 'Sem referência',
    alertState: (item?.alert_state as EstadoAlertaFinanceiro) ?? 'indisponivel',
    alertRatio: item?.alert_ratio == null ? null : toNumber(item.alert_ratio),
    alertThreshold: item?.alert_threshold == null ? 0.1 : toNumber(item.alert_threshold, 0.1),
    alertMessage: item?.alert_message ?? '',
    fundingType: item?.funding_type ?? null,
    fundingTypeLabel: item?.funding_type_label ?? null,
    fundingSourceDisplay: item?.funding_source_display ?? null,
    fundingSourceId: item?.funding_source_id ?? null,
    fundingSourceBrand: item?.funding_source_brand ?? null,
    isPrepayAccount: item?.is_prepay_account ?? null,
    currency: item?.currency ?? null,
    accountStatus: item?.account_status ?? null,
    ativo: item?.ativo ?? null,
    bmId: item?.bm_id ?? null,
    bmName: item?.bm_name ?? null,
    syncedAt: item?.synced_at ?? null,
    updatedAt: item?.updated_at ?? null,
  }
}

function mapConta(item?: FinanceiroContaApi | null): FinanceiroConta {
  const resumo = mapResumo(item)
  return {
    id: item?.id ?? item?.account_id ?? item?.label ?? '',
    accountId: item?.account_id ?? '',
    accountName: item?.account_name ?? null,
    label: item?.label ?? item?.account_name ?? item?.account_id ?? 'Conta Meta',
    ...resumo,
  }
}

function mapTransacao(item: FinanceiroTransacaoApi, index: number): FinanceiroTransacao {
  return {
    id: item.id ?? item.data ?? `${item.descricao ?? 'transacao'}-${index}`,
    data: item.data ?? '',
    descricao: item.descricao ?? 'Transação financeira',
    valor: toNumber(item.valor),
    tipo: item.tipo ?? 'outro',
    status: item.status ?? 'ok',
    observacao: item.observacao ?? null,
  }
}

function mapNota(item: FinanceiroNotaApi, index: number): FinanceiroNota {
  return {
    id: item.id ?? item.data ?? `${item.titulo ?? 'nota'}-${index}`,
    data: item.data ?? '',
    titulo: item.titulo ?? 'Nota financeira',
    corpo: item.corpo ?? '',
    categoria: item.categoria ?? null,
  }
}

function buildKey(workspaceId: string | null, contaIds: string[]): string | null {
  if (!workspaceId) return null
  const params = new URLSearchParams({ workspace_id: workspaceId })
  if (contaIds.length > 0) {
    params.set('conta_ids', Array.from(new Set(contaIds)).sort().join(','))
  }
  return `/meta/financeiro?${params.toString()}`
}

export function useMetaFinanceiro(contaIds: string[] = [], workspaceId: string | null = null) {
  const { workspaceAtivo } = useWorkspace()
  const wsId = (workspaceId ?? workspaceAtivo) ?? undefined
  const key = buildKey(wsId ?? null, contaIds)

  const { data: raw, isLoading, error, mutate } = useSWR<FinanceiroApiResponse>(
    key,
    () => api.get<FinanceiroApiResponse>(key!),
    SWR_OPTS,
  )

  const data: FinanceiroMetaAds | null = raw
    ? {
        workspaceId: raw.workspace_id ?? wsId ?? '',
        selectionState: raw.selection_state ?? 'invalid',
        selectionRequired: raw.selection_required ?? true,
        selectionMessage: raw.selection_message ?? 'Selecione uma conta Meta.',
        accounts: (raw.accounts ?? []).map(mapConta),
        selectedAccount: raw.selected_account ? mapConta(raw.selected_account) : null,
        summary: mapResumo(raw.summary ?? raw.selected_account ?? null),
        transactions: (raw.transactions ?? []).map(mapTransacao),
        notes: (raw.notes ?? []).map(mapNota),
        transactionsState: raw.transactions_state ?? (raw.selected_account ? 'empty' : 'unavailable'),
        notesState: raw.notes_state ?? (raw.selected_account ? 'empty' : 'unavailable'),
        updatedAt: raw.updated_at ?? null,
      }
    : null

  return {
    data,
    isLoading: !wsId || isLoading,
    error,
    mutate,
  }
}
