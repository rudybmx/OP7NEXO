// Cor determinística (HSL) a partir de uma string — para colorir nomes/avatares por
// pessoa de forma estável (estilo Telegram/WhatsApp-grupo). Mesmo input → mesma cor.
export function hashColor(str: string): string {
  const s = str || ''
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 55%, 45%)`
}
