export type Prioridade = 'baixa' | 'media' | 'alta' | 'urgente'
export type TipoCampo = 'texto' | 'numero' | 'data' | 'select' | 'usuario' | 'checkbox' | 'url'

// Definição de campo custom no nível do painel (board-level).
export interface CampoDef {
  id: string
  nome: string
  tipo: TipoCampo
  opcoes?: string[]
  ordem: number
}

// Campo custom já com o valor do card (deriva de CampoDef + valores do card).
export interface CampoCustom {
  id: string
  nome: string
  tipo: TipoCampo
  opcoes?: string[]
  valor?: string | number | boolean
}

export interface Comentario {
  id: string
  autor: string
  avatarInitials: string
  texto: string
  criadoEm: string
}

export interface Responsavel {
  id: string
  nome: string
  email?: string
}

export interface KanbanCard {
  id: string
  titulo: string
  descricao?: string
  status: string // id da fase (coluna)
  responsavel?: string // nome do responsável (exibição)
  responsavelInitials?: string
  responsavelUserId?: string
  prioridade?: Prioridade
  dataVencimento?: string // YYYY-MM-DD
  tags?: string[]
  comentarios?: Comentario[]
  camposCustom?: CampoCustom[]
  criadoEm: string
  atualizadoEm: string
  ordem: number
  // Campos de lead (preenchidos pelas automações dos canais).
  nome?: string
  telefone?: string
  canalEntradaId?: string
  resumoConversa?: string
  conversaId?: string
  contatoId?: string
  origemAgente?: string
}

export interface KanbanColuna {
  id: string
  nome: string
  cor: string
  limite?: number // WIP limit
  ordem: number
  fixa?: boolean
}

export interface KanbanBoard {
  id: string
  nome: string
  tipo?: string
  sistema?: boolean
  automacaoAtiva?: boolean
  bloqueado?: boolean
  colunas: KanbanColuna[]
  campos: CampoDef[]
  cards: KanbanCard[]
}

// Resumo de painel para o seletor (lista).
export interface PainelResumo {
  id: string
  nome: string
  tipo: string
  sistema: boolean
  automacaoAtiva: boolean
  bloqueado: boolean
  ordem: number
}
