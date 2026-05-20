export const OBJETIVO_RECONHECIMENTO = 'RECONHECIMENTO'
export const OBJETIVO_TRAFEGO = 'TRAFEGO'
export const OBJETIVO_ENGAJAMENTO = 'ENGAJAMENTO'
export const OBJETIVO_CADASTROS = 'CADASTROS'
export const OBJETIVO_VENDAS = 'VENDAS'
export const OBJETIVO_CONVERSOES = 'CONVERSOES'

export type ObjetivoCampanha =
  | typeof OBJETIVO_RECONHECIMENTO
  | typeof OBJETIVO_TRAFEGO
  | typeof OBJETIVO_ENGAJAMENTO
  | typeof OBJETIVO_CADASTROS
  | typeof OBJETIVO_VENDAS
  | typeof OBJETIVO_CONVERSOES

export interface ObjetivoOpcao {
  codigo: ObjetivoCampanha
  label: string
  descricao: string
}

export interface ObjetivoGrupo {
  grupo: string
  opcoes: ObjetivoOpcao[]
}

interface ObjetivoConfig {
  label: string
  descricao: string
  cor: string
  bg: string
}

export const OBJETIVO_CONFIG: Record<ObjetivoCampanha, ObjetivoConfig> = {
  [OBJETIVO_RECONHECIMENTO]: {
    label: 'Reconhecimento',
    descricao: 'Campanhas para ampliar alcance e lembrança da marca.',
    cor: 'var(--ws-blue)',
    bg: 'var(--ws-blue-soft)',
  },
  [OBJETIVO_TRAFEGO]: {
    label: 'Tráfego',
    descricao: 'Campanhas para direcionar visitas e cliques para um destino.',
    cor: 'var(--ws-gold)',
    bg: 'var(--ws-gold-soft)',
  },
  [OBJETIVO_ENGAJAMENTO]: {
    label: 'Engajamento',
    descricao: 'Campanhas para gerar interações, mensagens e consumo de conteúdo.',
    cor: 'var(--ws-green)',
    bg: 'var(--ws-green-soft)',
  },
  [OBJETIVO_CADASTROS]: {
    label: 'Cadastros',
    descricao: 'Campanhas para capturar leads, formulários e registros.',
    cor: 'var(--ws-purple)',
    bg: 'var(--ws-purple-soft)',
  },
  [OBJETIVO_VENDAS]: {
    label: 'Vendas',
    descricao: 'Campanhas para compras e conversões de venda.',
    cor: 'var(--ws-coral)',
    bg: 'var(--ws-coral-soft)',
  },
  [OBJETIVO_CONVERSOES]: {
    label: 'Conversões',
    descricao: 'Objetivo legado usado como fallback quando a Meta não permite separar vendas e cadastros com segurança.',
    cor: 'var(--ws-text-3)',
    bg: 'var(--ws-glass-bg)',
  },
}

export const OBJETIVOS_FILTRO: ObjetivoGrupo[] = [
  {
    grupo: 'ODAX',
    opcoes: [
      { codigo: OBJETIVO_RECONHECIMENTO, label: OBJETIVO_CONFIG[OBJETIVO_RECONHECIMENTO].label, descricao: OBJETIVO_CONFIG[OBJETIVO_RECONHECIMENTO].descricao },
      { codigo: OBJETIVO_TRAFEGO, label: OBJETIVO_CONFIG[OBJETIVO_TRAFEGO].label, descricao: OBJETIVO_CONFIG[OBJETIVO_TRAFEGO].descricao },
      { codigo: OBJETIVO_ENGAJAMENTO, label: OBJETIVO_CONFIG[OBJETIVO_ENGAJAMENTO].label, descricao: OBJETIVO_CONFIG[OBJETIVO_ENGAJAMENTO].descricao },
      { codigo: OBJETIVO_CADASTROS, label: OBJETIVO_CONFIG[OBJETIVO_CADASTROS].label, descricao: OBJETIVO_CONFIG[OBJETIVO_CADASTROS].descricao },
      { codigo: OBJETIVO_VENDAS, label: OBJETIVO_CONFIG[OBJETIVO_VENDAS].label, descricao: OBJETIVO_CONFIG[OBJETIVO_VENDAS].descricao },
    ],
  },
  {
    grupo: 'Legado',
    opcoes: [
      { codigo: OBJETIVO_CONVERSOES, label: OBJETIVO_CONFIG[OBJETIVO_CONVERSOES].label, descricao: OBJETIVO_CONFIG[OBJETIVO_CONVERSOES].descricao },
    ],
  },
]

const OBJETIVO_HINTS_LEAD = ['LEAD', 'REGISTRATION', 'SIGNUP', 'SIGN_UP', 'FORM']
const OBJETIVO_HINTS_SALES = ['PURCHASE', 'CHECKOUT', 'CART', 'SALE', 'VALUE']

function normalizarTexto(valor?: string | null): string {
  return (valor ?? '').trim().toUpperCase()
}

function combinarHints(...valores: Array<string | null | undefined>): string {
  return valores.map(normalizarTexto).filter(Boolean).join(' ')
}

export function mapObjetivoCampanha(
  raw?: string | null,
  optimizationGoal?: string | null,
  billingEvent?: string | null,
): ObjetivoCampanha {
  const codigo = normalizarTexto(raw)

  if (codigo === 'OUTCOME_AWARENESS' || codigo === 'REACH') {
    return OBJETIVO_RECONHECIMENTO
  }
  if (codigo === 'OUTCOME_TRAFFIC' || codigo === 'LINK_CLICKS') {
    return OBJETIVO_TRAFEGO
  }
  if (codigo === 'OUTCOME_ENGAGEMENT' || codigo === 'POST_ENGAGEMENT' || codigo === 'MESSAGES' || codigo === 'PAGE_LIKES' || codigo === 'VIDEO_VIEWS') {
    return OBJETIVO_ENGAJAMENTO
  }
  if (codigo === 'OUTCOME_LEADS' || codigo === 'LEAD_GENERATION') {
    return OBJETIVO_CADASTROS
  }
  if (codigo === 'OUTCOME_SALES') {
    return OBJETIVO_VENDAS
  }

  if (codigo === 'CONVERSIONS') {
    const hints = combinarHints(optimizationGoal, billingEvent)
    if (OBJETIVO_HINTS_SALES.some(hint => hints.includes(hint))) {
      return OBJETIVO_VENDAS
    }
    if (OBJETIVO_HINTS_LEAD.some(hint => hints.includes(hint))) {
      return OBJETIVO_CADASTROS
    }
    return OBJETIVO_CONVERSOES
  }

  return OBJETIVO_CONVERSOES
}

export function configObjetivoCampanha(codigo: string): ObjetivoConfig {
  const key = codigo as ObjetivoCampanha
  return OBJETIVO_CONFIG[key] || OBJETIVO_CONFIG[OBJETIVO_CONVERSOES]
}

export function resumoObjetivosTooltip(): string {
  return OBJETIVOS_FILTRO
    .flatMap(grupo => [
      `${grupo.grupo}:`,
      ...grupo.opcoes.map(opcao => `- ${opcao.label}: ${opcao.descricao}`),
      '',
    ])
    .join('\n')
    .trim()
}
