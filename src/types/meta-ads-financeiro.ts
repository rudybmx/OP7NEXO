export type EstadoSelecaoFinanceiro = 'ready' | 'multiple' | 'empty' | 'invalid'
export type EstadoAlertaFinanceiro = 'ok' | 'warning' | 'critical' | 'indisponivel'
export type EstadoListaFinanceira = 'empty' | 'ready' | 'unavailable'

export interface FinanceiroResumo {
  availableBalance: number
  displayBalanceAmount: number | null
  displayBalanceLabel: string | null
  displayBalanceKind: string | null
  amountSpent: number
  spendCap: number
  debtAmount: number | null
  estimatedTaxAmount: number | null
  dueAmount: number | null
  referenceAmount: number | null
  referenceKind: string
  referenceLabel: string
  alertState: EstadoAlertaFinanceiro
  alertRatio: number | null
  alertThreshold: number
  alertMessage: string
  fundingType: string | null
  fundingTypeLabel: string | null
  fundingSourceDisplay: string | null
  fundingSourceId: string | null
  fundingSourceBrand: string | null
  isPrepayAccount: boolean | null
  currency: string | null
  accountStatus: number | null
  ativo: boolean | null
  bmId: string | null
  bmName: string | null
  syncedAt: string | null
  updatedAt: string | null
}

export interface FinanceiroConta extends FinanceiroResumo {
  id: string
  accountId: string
  accountName: string | null
  label: string
}

export interface FinanceiroTransacao {
  id: string
  data: string
  descricao: string
  valor: number
  tipo: string
  status: string
  observacao?: string | null
}

export interface FinanceiroNota {
  id: string
  data: string
  titulo: string
  corpo: string
  categoria?: string | null
}

export interface FinanceiroMetaAds {
  workspaceId: string
  selectionState: EstadoSelecaoFinanceiro
  selectionRequired: boolean
  selectionMessage: string
  accounts: FinanceiroConta[]
  selectedAccount: FinanceiroConta | null
  summary: FinanceiroResumo
  transactions: FinanceiroTransacao[]
  notes: FinanceiroNota[]
  transactionsState: EstadoListaFinanceira
  notesState: EstadoListaFinanceira
  updatedAt: string | null
}
