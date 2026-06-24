// Motor de paleta de cores (Criativos 2.0 — Estúdio de Paleta).
// Harmonias na roda de cores + aleatório + contraste WCAG. Cor é texto no prompt
// de imagem; aqui controlamos hex/papel/peso (fonte de verdade da cor).

export type Papel = 'dominante' | 'apoio' | 'destaque' | 'livre'
export type Modo = 'analoga' | 'mono' | 'complementar' | 'split' | 'triade' | 'tetrade' | 'custom'
export type Cor = { hex: string; papel: Papel; peso: number }
// Aceita a forma nova (cores/modo) e as antigas (papéis nomeados / chaves do diretor).
export type PaletaT = {
  cores?: Cor[]; modo?: Modo
  dominante?: string; apoio?: string; destaque?: string
  tensao?: string; resolucao?: string; pivo?: string
}

export const NOMES_HEX: Record<string, string> = {
  vermelho: '#cc0000', verde: '#1ca84c', amarelo: '#ffd400', azul: '#1450a0', preto: '#111111',
  branco: '#ffffff', laranja: '#ff6a00', roxo: '#7a5af8', rosa: '#ff5c8d', cinza: '#888888',
}

export const toHex = (c?: string): string => {
  if (!c) return '#cccccc'
  const s = c.trim().toLowerCase()
  return s.startsWith('#') ? s.slice(0, 7) : (NOMES_HEX[s] || '#cccccc')
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function hexToHsl(hex: string): [number, number, number] {
  const h = toHex(hex).replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  let hh = 0, ss = 0; const ll = (mx + mn) / 2
  if (mx !== mn) {
    const d = mx - mn
    ss = ll > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    hh *= 60
  }
  return [hh, ss, ll]
}

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x]
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

// Offsets de matiz canônicos por harmonia (graus a partir da base).
const OFFSETS: Record<'analoga' | 'complementar' | 'split' | 'triade' | 'tetrade', number[]> = {
  analoga: [0, 30, -30, 60, -60],
  complementar: [0, 180],
  split: [0, 150, -150],
  triade: [0, 120, -120],
  tetrade: [0, 90, 180, 270],
}

/** Gera `n` hexes a partir de uma cor-base segundo a harmonia. Mono varia L. */
export function gerarHexes(base: string, modo: Modo, n = 5): string[] {
  const [h, s, l] = hexToHsl(base)
  if (modo === 'custom') return [toHex(base)]
  if (modo === 'mono') {
    const deltas = [0, 0.16, -0.16, 0.30, -0.30, 0.08, -0.08]
    return deltas.slice(0, Math.max(1, n)).map(d => hslToHex(h, Math.max(0.15, s), clamp(l + d, 0.12, 0.92)))
  }
  const offs = OFFSETS[modo]
  const out: string[] = []
  for (const o of offs) { if (out.length >= n) break; out.push(hslToHex(h + o, s, l)) }
  const lSteps = [0.16, -0.16, 0.30, -0.30]
  let i = 0
  while (out.length < n) {
    const o = offs[i % offs.length]
    const dl = lSteps[Math.floor(i / offs.length) % lSteps.length]
    out.push(hslToHex(h + o, s, clamp(l + dl, 0.12, 0.92)))
    i++
  }
  return out.slice(0, n)
}

const PAPEIS: Papel[] = ['dominante', 'apoio', 'destaque']

/** Pesos padrão 60/30/10 (e resto distribuído) para `n` cores. */
export function pesosPadrao(n: number): number[] {
  if (n <= 1) return [100]
  if (n === 2) return [70, 30]
  if (n === 3) return [60, 30, 10]
  const extra = n - 3
  const each = Math.max(1, Math.round(5 / extra))
  return [60, 25, 10, ...Array(extra).fill(each)].slice(0, n)
}

export function gerarPaleta(base: string, modo: Modo, n = 5): Cor[] {
  const hexes = gerarHexes(base, modo, n)
  const pesos = pesosPadrao(hexes.length)
  return hexes.map((hex, i) => ({ hex, papel: PAPEIS[i] ?? 'livre', peso: pesos[i] ?? 0 }))
}

export function aleatorio(n = 5): Cor[] {
  const base = hslToHex(Math.random() * 360, 0.5 + Math.random() * 0.35, 0.42 + Math.random() * 0.16)
  const modos: Modo[] = ['analoga', 'complementar', 'triade', 'tetrade', 'split']
  return gerarPaleta(base, modos[Math.floor(Math.random() * modos.length)], n)
}

/** Constrói Cor[] a partir das cores extraídas do modelo reverso (hex ou nomes). */
export function coresDeSpec(cores: string[]): Cor[] {
  const lista = cores.filter(Boolean).slice(0, 8)
  const pesos = pesosPadrao(lista.length || 1)
  return lista.map((c, i) => ({ hex: toHex(c), papel: PAPEIS[i] ?? 'livre', peso: pesos[i] ?? 0 }))
}

/** Normaliza a paleta vinda do estado (nova ou legada) para exibição. */
export function normalizarPaleta(p?: PaletaT): { cores: Cor[]; modo: Modo } {
  if (p?.cores?.length) return { cores: p.cores, modo: p.modo || 'custom' }
  const seeds = [p?.dominante ?? p?.tensao, p?.apoio ?? p?.resolucao, p?.destaque ?? p?.pivo].filter(Boolean) as string[]
  if (!seeds.length) return { cores: [], modo: p?.modo || 'custom' }
  const pesos = pesosPadrao(seeds.length)
  return { cores: seeds.map((c, i) => ({ hex: toHex(c), papel: PAPEIS[i] ?? 'livre', peso: pesos[i] ?? 0 })), modo: p?.modo || 'custom' }
}

// ── Contraste WCAG (texto sobre fundo) ──
function lumin(hex: string): number {
  const h = toHex(hex).replace('#', '')
  const ch = [0, 2, 4].map(i => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

export function contraste(a: string, b: string): number {
  const la = lumin(a), lb = lumin(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export function rotuloContraste(r: number): { label: string; ok: boolean } {
  if (r >= 7) return { label: `AAA ${r.toFixed(1)}:1`, ok: true }
  if (r >= 4.5) return { label: `AA ${r.toFixed(1)}:1`, ok: true }
  if (r >= 3) return { label: `AA grande ${r.toFixed(1)}:1`, ok: false }
  return { label: `baixo ${r.toFixed(1)}:1`, ok: false }
}
