export function formatCurrency(valor: number, currency?: string | null): string {
  const moeda = (currency && currency.trim()) || 'BRL'
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: moeda,
    }).format(valor)
  } catch {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(valor)
  }
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

export function formatAccountId(accountId?: string | null): string {
  if (!accountId) return '—'
  const normalized = accountId.replace(/^act_/i, '')
  if (normalized.length <= 8) return normalized
  return `${normalized.slice(0, 4)}…${normalized.slice(-4)}`
}
