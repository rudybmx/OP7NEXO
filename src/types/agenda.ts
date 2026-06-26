// ===== AGENDAS (as "salas" ou "profissionais") =====
export type AgendaCor =
  | '#006EFF' | '#3E5BFF' | '#0fa856' | '#FF5C8D' | '#7A5AF8'
  | '#00b8c8' | 'var(--ws-gold)' | '#F5A623' | '#FF8C00' | '#6B7280'

export type AgendaTipo = 'profissional' | 'sala' | 'equipamento' | 'outro'

export interface Agenda {
  id: string
  nome: string
  tipo: AgendaTipo
  cor: AgendaCor
  capacidade_simultanea: number // 1 a 10
  fuso_horario: string // ex: 'America/Sao_Paulo'
  webhook_url?: string
  ativo: boolean
  created_at: string
  updated_at: string
}

// ===== HORÁRIOS DA AGENDA =====
export type DiaSemana = 'dom' | 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab'

export interface HorarioAgenda {
  id: string
  agenda_id: string
  dia_semana: DiaSemana
  ativo: boolean
  hora_inicio: string // 'HH:mm'
  hora_fim: string    // 'HH:mm'
  duracao_slot_minutos: number // 15 | 30 | 45 | 60 | 90 | 120
  tem_almoco: boolean
  almoco_inicio?: string // 'HH:mm'
  almoco_fim?: string    // 'HH:mm'
}

// ===== BLOQUEIOS =====
export interface Bloqueio {
  id: string
  agenda_id: string | null // null = bloqueio global da clínica
  motivo: string
  inicio: string // ISO datetime
  fim: string    // ISO datetime
  tipo: 'reuniao' | 'feriado' | 'agenda_cheia' | 'manutencao' | 'outro'
  created_at: string
}

// ===== AGENDAMENTOS =====
export type AgendamentoStatus =
  | 'agendado'       // confirmado, aguardando
  | 'confirmado'     // cliente confirmou presença
  | 'em_atendimento'
  | 'compareceu'     // atendido com sucesso
  | 'falta'          // não compareceu
  | 'cancelado'      // cancelado (por quem?)
  | 'bloqueado'      // slot bloqueado manualmente
  | 'reagendado'     // substituído por outro agendamento

export type AgendamentoOrigem =
  | 'manual'   // criado pela equipe via painel
  | 'agente'   // criado pelo agente AI via API
  | 'api'      // criado via integração externa
  | 'paciente' // criado pelo próprio cliente (self-scheduling futuro)

export interface Agendamento {
  id: string
  agenda_id: string
  agenda?: Agenda // populated
  // Cliente
  cliente_nome: string
  cliente_telefone: string // apenas números
  cliente_email?: string
  // Horário
  data_hora_inicio: string // ISO datetime
  data_hora_fim: string    // ISO datetime
  // Classificação
  servico?: string
  servico_id?: string
  observacoes?: string
  // Controle
  status: AgendamentoStatus
  origem: AgendamentoOrigem
  criado_por?: string // user_id ou 'agente'
  // Cancelamento
  cancelamento_motivo?: string
  cancelado_por?: string
  cancelado_em?: string
  // Reagendamento
  reagendado_de?: string // id do agendamento original
  // NPS
  nps_enviado: boolean
  nps_enviado_em?: string
  nps_score?: number // 0-10
  // Timestamps
  created_at: string
  updated_at: string
}

// ===== LEMBRETES =====
export type LembreteCanal = 'whatsapp' | 'email' | 'sms' | 'push'

export interface LembreteConfig {
  id: string
  agenda_id: string | null // null = padrão global
  ativo: boolean
  canal: LembreteCanal
  // Quando enviar
  dias_antes: number   // 0 = no dia, 1 = 1 dia antes, etc.
  hora_envio?: string  // 'HH:mm' — para lembretes de dias_antes > 0
  horas_antes?: number // para lembretes no mesmo dia (dias_antes = 0)
  // Conteúdo
  mensagem_template: string // suporta variáveis: {{nome}}, {{data}}, {{hora}}, {{servico}}, {{profissional}}
  tem_midia: boolean
  midia_url?: string
  midia_tipo?: 'imagem' | 'video' | 'documento'
  // Ordem na sequência
  ordem: number
}

// ===== NPS CONFIG =====
export type NpsTrigger = 'automatico' | 'manual'

export interface NpsConfig {
  id: string
  agenda_id: string | null
  ativo: boolean
  trigger: NpsTrigger
  // Se automático:
  horas_apos_atendimento?: number // ex: 2 = 2h após horário do agendamento
  canal: LembreteCanal
  mensagem_template: string
}

// ===== VIEW HELPERS =====
export type CalendarioView = 'semana' | 'mes' | 'lista'

export interface FiltrosAgendamento {
  agenda_ids: string[]
  status: AgendamentoStatus[]
  origem: AgendamentoOrigem[]
  data_inicio: string
  data_fim: string
  busca: string
}

// ===== LABEL HELPERS =====
export const STATUS_LABELS: Record<AgendamentoStatus, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  em_atendimento: 'Em Atendimento',
  compareceu: 'Compareceu',
  falta: 'Falta',
  cancelado: 'Cancelado',
  bloqueado: 'Bloqueado',
  reagendado: 'Reagendado',
}

export const STATUS_COLORS: Record<AgendamentoStatus, string> = {
  agendado: 'var(--ws-blue)',
  confirmado: 'var(--ws-green)',
  em_atendimento: 'var(--ws-purple)',
  compareceu: '#3b6d11',
  falta: '#a32d2d',
  cancelado: '#6B7280',
  bloqueado: '#854f0b',
  reagendado: 'var(--ws-cyan)',
}

export const ORIGEM_LABELS: Record<AgendamentoOrigem, string> = {
  manual: 'Manual',
  agente: 'Agente IA',
  api: 'API',
  paciente: 'Cliente',
}

export const DIAS_SEMANA_LABELS: Record<DiaSemana, string> = {
  dom: 'Domingo',
  seg: 'Segunda',
  ter: 'Terça',
  qua: 'Quarta',
  qui: 'Quinta',
  sex: 'Sexta',
  sab: 'Sábado',
}
