export type Prioridade = 'baixa' | 'media' | 'alta' | 'urgente'
export type TipoCampo = 'texto' | 'numero' | 'data' | 'select' | 'usuario' | 'checkbox' | 'url'

export interface CampoCustom {
  id: string
  nome: string
  tipo: TipoCampo
  opcoes?: string[] // para tipo select
  valor?: string | number | boolean
}

export interface Comentario {
  id: string
  autor: string
  avatarInitials: string
  texto: string
  criadoEm: string
}

export interface KanbanCard {
  id: string
  titulo: string
  descricao?: string
  status: string // id da fase (= coluna)
  responsavel?: string // nome de exibição
  responsavelUserId?: string | null // id para PUT
  responsavelInitials?: string
  prioridade?: Prioridade
  dataVencimento?: string
  tags?: string[]
  comentarios?: Comentario[]
  camposCustom?: CampoCustom[]
  criadoEm: string
  atualizadoEm: string
  ordem: number
  // Campos de origem CRM (read-only na UI; usados pelos painéis-sistema)
  nome?: string | null
  telefone?: string | null
  conversaId?: string | null
  contatoId?: string | null
  resumoConversa?: string | null
  origemAgente?: boolean | null
}

export interface KanbanColuna {
  id: string
  nome: string
  cor: string
  limite?: number | null // WIP limit (limite_wip)
  ordem: number
  fixa?: boolean // fase fixa não pode ser renomeada/excluída
}

export interface KanbanBoard {
  id: string
  nome: string
  colunas: KanbanColuna[]
  cards: KanbanCard[]
  campos?: CampoCustom[] // definições de campos custom do painel
  // Flags do painel
  tipo?: string
  sistema?: boolean
  automacaoAtiva?: boolean
  bloqueado?: boolean
}

// ─── Shapes crus da API (snake_case) ──────────────────────────────────────────

export interface PainelResumoApi {
  id: string
  nome: string
  tipo: string
  sistema: boolean
  automacao_ativa: boolean
  bloqueado: boolean
  ordem: number
}

export interface FaseApi {
  id: string
  painel_id: string
  nome: string
  cor: string
  ordem: number
  limite_wip: number | null
  fixa: boolean
}

export interface CampoApi {
  id: string
  painel_id: string
  nome: string
  tipo: string
  opcoes: string[]
  ordem: number
}

export interface ComentarioApi {
  id: string
  autor_user_id: string | null
  autor_nome: string | null
  texto: string
  criado_em: string
}

export interface CardApi {
  id: string
  painel_id: string
  fase_id: string
  titulo: string
  descricao: string | null
  prioridade: string | null
  responsavel_user_id: string | null
  responsavel_nome: string | null
  origem_agente: boolean | null
  data_vencimento: string | null
  nome: string | null
  telefone: string | null
  canal_entrada_id: string | null
  resumo_conversa: string | null
  conversa_id: string | null
  contato_id: string | null
  ordem: number
  criado_em: string
  atualizado_em: string
  valores: Record<string, unknown>
  comentarios?: ComentarioApi[]
}

export interface PainelDetalheApi extends PainelResumoApi {
  fases: FaseApi[]
  campos: CampoApi[]
  cards: CardApi[]
}

export interface ResponsavelApi {
  id: string
  nome: string
  email: string
}
