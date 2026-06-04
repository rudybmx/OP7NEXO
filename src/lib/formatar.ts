export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatarNumero(valor: number): string {
  return valor.toLocaleString('pt-BR')
}

export function formatarNumeroCompacto(valor: number): string {
  if (valor >= 1000000) {
    return (valor / 1000000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M'
  }
  if (valor >= 1000) {
    return (valor / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'K'
  }
  return valor.toLocaleString('pt-BR')
}

export function formatarPorcentagem(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'
}

export function formatarTelefoneBR(valor?: string | null): string | null {
  if (!valor) return null

  const digits = valor.replace(/\D/g, '')
  if (!digits) return null

  const national = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits
  if (national.length === 11) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`
  }
  if (national.length === 10) {
    return `(${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`
  }
  if (national.length > 2) {
    return `(${national.slice(0, 2)}) ${national.slice(2)}`
  }
  return national
}
