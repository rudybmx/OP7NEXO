// Paleta de cores das etiquetas — 9 colunas × 6 linhas = 54 opções.
// Colunas (esquerda→direita): marrom, roxo, rosa, vermelho, amarelo/laranja,
// verde, azul-acinzentado, azul-vivo, cinza/preto. Cada coluna vai do tom
// mais claro (topo) ao mais escuro (base). Renderizar ROW-MAJOR.

// Colunas como gradientes verticais (6 tons cada).
const COLUNAS: string[][] = [
  ['#EFE0D0', '#D9B38C', '#C68A4E', '#A9692F', '#7E4A1E', '#4A2A12'], // marrom
  ['#E6DAF5', '#C9B0EC', '#A77FE0', '#8453D6', '#5E2FA8', '#3A1A6E'], // roxo
  ['#FBD9EC', '#F4A8D2', '#EE74B6', '#E63F97', '#C71E78', '#8E1455'], // rosa
  ['#F6C9BE', '#EE9A88', '#E26450', '#D13B27', '#A52818', '#6E180E'], // vermelho
  ['#FBF3D0', '#F6E08A', '#F2C94C', '#EBA724', '#E07B16', '#C85A0E'], // amarelo/laranja
  ['#CDEFD8', '#92DBA9', '#4FC178', '#22A85A', '#15803D', '#0C5028'], // verde
  ['#D7E0E8', '#AEC0CE', '#8099AE', '#5B7488', '#3E5060', '#283440'], // azul acinzentado
  ['#D2E7FB', '#9CC8F6', '#5BA3F0', '#2E7BE0', '#1857B0', '#0E3A78'], // azul vivo
  ['#F2F2F2', '#D0D0D0', '#A0A0A0', '#6E6E6E', '#3A3A3A', '#000000'], // cinza/preto
]

export const ETIQUETA_NUM_COLUNAS = COLUNAS.length // 9
export const ETIQUETA_NUM_LINHAS = COLUNAS[0].length // 6

// Achatado em ordem row-major (linha 0 = topo de cada coluna), 54 cores.
export const ETIQUETA_CORES: string[] = Array.from({ length: ETIQUETA_NUM_LINHAS }, (_, linha) =>
  COLUNAS.map((coluna) => coluna[linha]),
).flat()

// Cor pré-selecionada por padrão ao criar (preto, último item).
export const ETIQUETA_COR_PADRAO = '#000000'

// Decide a cor do ícone de check (branco em fundo escuro, escuro em fundo claro).
export function corDoCheck(hex: string): string {
  const h = hex.replace('#', '')
  if (h.length !== 6) return '#FFFFFF'
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  // luminância relativa aproximada
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#1F2937' : '#FFFFFF'
}
