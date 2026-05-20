export type PlataformaCampanha = 'facebook' | 'instagram' | 'whatsapp'

export interface PlataformaResumo {
  codigo: PlataformaCampanha
  label: string
  detalhes: string[]
}

interface ConfigPlataforma {
  label: string
  descricao: string
  cor: string
  bg: string
  border: string
}

const ORDEM_PLATAFORMA: Record<PlataformaCampanha, number> = {
  whatsapp: 0,
  instagram: 1,
  facebook: 2,
}

export function normalizarPlataformaCampanha(codigo: string): PlataformaCampanha | null {
  const valor = (codigo || '').trim().toLowerCase()
  if (!valor) return null
  if (valor === 'whatsapp') return 'whatsapp'
  if (valor === 'instagram') return 'instagram'
  if (valor === 'facebook' || valor === 'messenger' || valor === 'audience_network' || valor === 'threads') {
    return 'facebook'
  }
  return null
}

export const CONFIG_PLATAFORMA: Record<PlataformaCampanha, ConfigPlataforma> = {
  facebook: {
    label: 'Facebook',
    descricao: 'Inclui Facebook, Messenger, Audience Network e Threads.',
    cor: 'var(--ws-blue)',
    bg: 'var(--ws-blue-soft)',
    border: 'rgba(62,91,255,0.18)',
  },
  instagram: {
    label: 'Instagram',
    descricao: 'Inclui Feed, Stories e Reels do Instagram.',
    cor: 'var(--ws-coral)',
    bg: 'rgba(225,48,108,0.10)',
    border: 'rgba(225,48,108,0.20)',
  },
  whatsapp: {
    label: 'WhatsApp',
    descricao: 'Usado quando o destino da campanha é WhatsApp.',
    cor: 'var(--ws-green)',
    bg: 'var(--ws-green-soft)',
    border: 'rgba(15,168,86,0.20)',
  },
}

export const OPCOES_PLATAFORMAS_FILTRO: Array<{ codigo: PlataformaCampanha; label: string; descricao: string }> = [
  {
    codigo: 'facebook',
    label: CONFIG_PLATAFORMA.facebook.label,
    descricao: CONFIG_PLATAFORMA.facebook.descricao,
  },
  {
    codigo: 'instagram',
    label: CONFIG_PLATAFORMA.instagram.label,
    descricao: CONFIG_PLATAFORMA.instagram.descricao,
  },
  {
    codigo: 'whatsapp',
    label: CONFIG_PLATAFORMA.whatsapp.label,
    descricao: CONFIG_PLATAFORMA.whatsapp.descricao,
  },
]

export function configPlataformaCampanha(codigo: string): ConfigPlataforma {
  const key = normalizarPlataformaCampanha(codigo)
  return key ? CONFIG_PLATAFORMA[key] : CONFIG_PLATAFORMA.facebook
}

export function ordenarPlataformasResumo(plataformas: PlataformaResumo[]): PlataformaResumo[] {
  return [...plataformas]
    .map(plataforma => {
      const codigo = normalizarPlataformaCampanha(plataforma.codigo)
      return codigo ? { ...plataforma, codigo } : null
    })
    .filter((item): item is PlataformaResumo => item !== null)
    .sort((a, b) => (ORDEM_PLATAFORMA[a.codigo] ?? 99) - (ORDEM_PLATAFORMA[b.codigo] ?? 99))
}

export function tituloPlataformaResumo(resumo: PlataformaResumo): string {
  const detalhes = resumo.detalhes.filter(Boolean)
  return detalhes.length > 0
    ? `${resumo.label} · ${detalhes.join(' · ')}`
    : resumo.label
}

export function resumoPlataformasTooltip(): string {
  return [
    'WhatsApp tem prioridade quando o destino da campanha/conjunto aponta para mensageria.',
    'Facebook agrupa Facebook, Messenger, Audience Network e Threads.',
    'Instagram agrupa Feed, Stories e Reels.',
    'Os chips mostram a família principal; o hover traz a origem exata detectada nos breakdowns.',
  ].join('\n')
}
