import type { FinanceiroConta } from '@/types/meta-ads-financeiro'
import { formatCurrency, formatDateTime } from './utils'

export type SaldoDisplayKind = 'prepay_display' | 'card_remaining' | 'raw_balance' | 'unknown'

export interface SaldoDisplayPresentation {
  label: string
  amount: number
  note: string
  kind: SaldoDisplayKind
}

export interface SaldoDisplayDetail {
  label: string
  value: string
}

function parseDisplayAmount(value?: string | null): number | null {
  if (!value) return null
  const match = value.match(/[-+]?\d[\d\.,]*/)
  if (!match) return null
  let numero = match[0]
  if (numero.includes(',')) {
    numero = numero.replace(/\./g, '').replace(',', '.')
  } else {
    numero = numero.replace(/,/g, '')
  }
  const parsed = Number(numero)
  return Number.isFinite(parsed) ? parsed : null
}

export function getSaldoDisplay(conta?: FinanceiroConta | null): SaldoDisplayPresentation {
  if (!conta) {
    return {
      label: 'Saldo disponível',
      amount: 0,
      note: 'Sem referência financeira',
      kind: 'unknown',
    }
  }

  const kind = (conta.displayBalanceKind as SaldoDisplayKind | null) ?? 'unknown'
  const isPrepay = conta.isPrepayAccount === true || kind === 'prepay_display'
  const hasSpendCap = (conta.spendCap ?? 0) > 0

  if (isPrepay) {
    const amount = conta.displayBalanceAmount ?? parseDisplayAmount(conta.fundingSourceDisplay) ?? conta.availableBalance
    return {
      label: conta.displayBalanceLabel ?? 'Saldo disponível',
      amount,
      note: conta.fundingSourceDisplay ?? conta.fundingTypeLabel ?? 'Saldo pré-pago',
      kind: 'prepay_display',
    }
  }

  if (hasSpendCap) {
    const amount = conta.displayBalanceAmount ?? Math.max(0, (conta.spendCap ?? 0) - (conta.amountSpent ?? 0))
    return {
      label: conta.displayBalanceLabel ?? 'Valor restante',
      amount,
      note: `Valor gasto: ${formatCurrency(conta.amountSpent, conta.currency)} | ${formatCurrency(conta.spendCap, conta.currency)} limite de gastos`,
      kind: 'card_remaining',
    }
  }

  const amount = conta.displayBalanceAmount ?? conta.availableBalance
  return {
    label: conta.displayBalanceLabel ?? 'Saldo disponível',
    amount,
    note: conta.fundingTypeLabel ?? 'Sem referência financeira',
    kind: 'raw_balance',
  }
}

export function getSaldoDisplayDetails(conta?: FinanceiroConta | null): SaldoDisplayDetail[] {
  if (!conta) {
    return []
  }

  const presentation = getSaldoDisplay(conta)
  const details: SaldoDisplayDetail[] = []

  if (presentation.kind === 'prepay_display') {
    details.push(
      {
        label: 'Saldo disponível',
        value: conta.fundingSourceDisplay ?? formatCurrency(presentation.amount, conta.currency),
      },
      {
        label: 'Saldo bruto da conta',
        value: formatCurrency(conta.availableBalance, conta.currency),
      },
      {
        label: 'Limite de gastos',
        value: conta.referenceAmount ? formatCurrency(conta.referenceAmount, conta.currency) : 'Sem referência',
      },
      {
        label: 'Forma de pagamento',
        value: conta.fundingTypeLabel || 'Não informado',
      },
      {
        label: 'BM',
        value: conta.bmName || 'Não informado',
      },
      {
        label: 'Atualizado em',
        value: formatDateTime(conta.updatedAt),
      }
    )
    return details
  }

  if (presentation.kind === 'card_remaining') {
    details.push(
      {
        label: 'Saldo devedor',
        value: formatCurrency(conta.debtAmount ?? conta.availableBalance, conta.currency),
      },
      {
        label: 'Imposto estimado',
        value: conta.estimatedTaxAmount != null ? formatCurrency(conta.estimatedTaxAmount, conta.currency) : 'Não disponível',
      },
      {
        label: 'Saldo que deve chegar',
        value:
          conta.dueAmount != null
            ? formatCurrency(conta.dueAmount, conta.currency)
            : 'Não disponível',
      },
      {
        label: 'Valor restante',
        value: formatCurrency(presentation.amount, conta.currency),
      },
      {
        label: 'Valor gasto',
        value: formatCurrency(conta.amountSpent, conta.currency),
      },
      {
        label: 'Limite de gastos',
        value: formatCurrency(conta.spendCap, conta.currency),
      },
      {
        label: 'Forma de pagamento',
        value: conta.fundingTypeLabel || 'Não informado',
      },
      {
        label: 'BM',
        value: conta.bmName || 'Não informado',
      },
      {
        label: 'Atualizado em',
        value: formatDateTime(conta.updatedAt),
      }
    )
    return details
  }

  details.push(
    {
      label: 'Saldo disponível',
      value: formatCurrency(presentation.amount, conta.currency),
    },
    {
      label: 'Saldo bruto da conta',
      value: formatCurrency(conta.availableBalance, conta.currency),
    },
    {
      label: 'Referência',
      value: conta.referenceAmount ? formatCurrency(conta.referenceAmount, conta.currency) : 'Sem referência',
    },
    {
      label: 'Forma de pagamento',
      value: conta.fundingTypeLabel || 'Não informado',
    },
    {
      label: 'BM',
      value: conta.bmName || 'Não informado',
    },
    {
      label: 'Atualizado em',
      value: formatDateTime(conta.updatedAt),
    }
  )
  return details
}
