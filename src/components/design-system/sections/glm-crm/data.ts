// ─── Mock data para CRM - Odontocompany ─────────────────────────────────────
// Cenários: Agendamento de avaliações, implantes, ortodontia e urgências.

import type {
  Mensagem,
  ContatoDetalhes,
  CardConversaData,
  UsuarioAtual,
  AvatarVariant,
  Canal,
  StageId,
} from './types'

// ─── Usuario atual ───────────────────────────────────────────────────
export const USUARIO_ATUAL: UsuarioAtual = {
  id: 'ana-lima',
  nome: 'Dra. Ana Lima',
  nivel: 'atendente',
  equipeIds: ['comercial', 'clinica'],
}

// ─── Mensagens Realistas (Odontocompany) ──────────────────────────────────────────────────
export const MENSAGENS: Record<string, Mensagem[]> = {
  'conv-1': [
    { id: 'm1-1', tipo: 'inbound', texto: 'Boa tarde! Vi o anúncio de vocês sobre implantes. Gostaria de saber como funciona a primeira avaliação.', hora: '14:20' },
    { id: 'm1-2', tipo: 'ia', texto: 'Olá, Ricardo! 😊 Que bom ter você por aqui na Odontocompany. Na nossa avaliação, fazemos um planejamento completo e o dentista explica todo o passo a passo. A primeira consulta é cortesia para novos pacientes! Quer agendar um horário?', hora: '14:21', remetente: 'OdontoIA' },
    { id: 'm1-3', tipo: 'inbound', texto: 'Ah, legal! E vocês atendem aos sábados? Trabalho em outra cidade durante a semana.', hora: '14:23' },
    { id: 'm1-4', tipo: 'humano', texto: 'Oi Ricardo, tudo bem? Atendemos sim! Temos horários disponíveis neste sábado às 09:30 ou 11:00. Algum desses ficaria bom para você?', hora: '14:26', remetente: 'Dra. Ana Lima' },
  ],
  'conv-2': [
    { id: 'm2-1', tipo: 'inbound', texto: 'Bom dia, gostaria de saber o valor do clareamento a laser.', hora: '09:10' },
    { id: 'm2-2', tipo: 'ia', texto: 'Olá, Juliana! 😊 O clareamento é um dos nossos procedimentos favoritos! O valor varia de acordo com a técnica. Temos planos a partir de 10x de R$ 89,00. Gostaria de agendar uma avaliação de estética sem custo?', hora: '09:12', remetente: 'OdontoIA' },
    { id: 'm2-3', tipo: 'inbound', texto: 'Sim, por favor! Pode ser para quarta-feira à tarde?', hora: '09:15' },
    { id: 'm2-4', tipo: 'ia', texto: 'Claro! Tenho 14:30 ou 16:00 na quarta. Qual prefere?', hora: '09:16', remetente: 'OdontoIA' },
  ],
  'conv-3': [
    { id: 'm3-1', tipo: 'inbound', texto: 'Meu filho está com o dente da frente mole porque caiu na escola. Vocês atendem crianças agora?', hora: '11:45' },
    { id: 'm3-2', tipo: 'humano', texto: 'Olá, Sra. Patrícia! Sim, atendemos odontopediatria de urgência. Pode trazê-lo agora mesmo para a unidade Centro. Já avisei a Dra. Fernanda que vocês estão a caminho!', hora: '11:48', remetente: 'Juliana (Recepção)' },
    { id: 'm3-3', tipo: 'inbound', texto: 'Obrigada! Estamos chegando em 10 minutos.', hora: '11:50' },
  ],
  'conv-4': [
    { id: 'm4-1', tipo: 'inbound', texto: 'Quero colocar aparelho invisível, aquele transparente. Vocês trabalham com ele?', hora: '16:00' },
    { id: 'm4-2', tipo: 'ia', texto: 'Olá, Marcos! Trabalhamos sim! Utilizamos os alinhadores Smart Aligner, que são super discretos. Quer que eu agende uma conversa com nosso ortodontista para você ver como ficaria seu sorriso?', hora: '16:01', remetente: 'OdontoIA' },
    { id: 'm4-3', tipo: 'inbound', texto: 'Quero sim, mas só posso depois das 18h.', hora: '16:05' },
    { id: 'm4-4', tipo: 'ia', texto: 'Perfeito! Temos horários estendidos nas terças e quintas. Posso marcar para quinta às 18:30?', hora: '16:06', remetente: 'OdontoIA' },
  ],
  'conv-5': [
    { id: 'm5-1', tipo: 'inbound', texto: 'Olá, preciso desmarcar minha consulta de amanhã.', hora: '10:00' },
    { id: 'm5-2', tipo: 'humano', texto: 'Olá, Sr. Wilson! Sem problemas. Gostaria de já deixar reagendado para a próxima semana? Temos vaga na terça às 14h.', hora: '10:15', remetente: 'Dra. Ana Lima' },
    { id: 'm5-3', tipo: 'inbound', texto: 'Pode ser sim, obrigado pela atenção!', hora: '10:20' },
  ],
  'conv-6': [
    { id: 'm6-1', tipo: 'inbound', texto: 'Oi, a prótese do meu pai ficou pronta?', hora: '15:20' },
    { id: 'm6-2', tipo: 'humano', texto: 'Oi, Camila! Acabou de chegar do laboratório. Ficou excelente! Pode trazer ele amanhã para o ajuste final?', hora: '15:45', remetente: 'Dr. Carlos' },
  ],
  'conv-7': [
    { id: 'm7-1', tipo: 'inbound', texto: 'Estou sentindo muita dor depois que tirei o siso ontem. É normal?', hora: '20:10' },
    { id: 'm7-2', tipo: 'ia', texto: 'Olá, Gabriel! Sinto muito pelo desconforto. Um pouco de inchaço e dor leve é esperado. Vou te passar as orientações de repouso agora. Se a dor for intensa, prefere que o dentista te ligue?', hora: '20:12', remetente: 'OdontoIA (Plantão)' },
  ],
}

// ─── Contatos por conversa ──────────────────────────────────────────────────
export const CONTATOS: Record<string, ContatoDetalhes> = {
  'conv-1': {
    nome: 'Ricardo Silva', nomeCompleto: 'Ricardo Oliveira Silva', iniciais: 'RS',
    avatarBg: '#B5D4F4', avatarColor: '#0C447C',
    telefone: '+55 11 99422-3344', email: 'ricardo.silva@gmail.com',
    canal: 'whatsapp', canalLabel: 'WhatsApp', canalColor: '#1D9E75', online: true,
    primeiroContato: '05/05/2026',
    etiquetas: [
      { label: 'Lead Implante', bg: '#EAF3DE', color: '#3B6D11' },
      { label: 'Aguardando Sábado', bg: '#E6F1FB', color: '#185FA5' },
    ],
    equipe: { nome: 'Comercial', iniciais: 'C', bg: '#E6F1FB', color: '#185FA5' },
    responsavel: { nome: 'Dra. Ana Lima', iniciais: 'AL', bg: '#FAC775', color: '#633806' },
    stageAtual: 'qualificado',
    origem: { campanha: 'Implantes SP', cpl: 'R$ 0,84' },
    ia: { status: 'Ativa', statusColor: '#1D9E75', msgsRespondidas: 2, assumidoEm: '14:21' },
    analiseIA: {
      resumoConversa: 'Lead interessado em implantes, atraído pelo anúncio. Perguntou sobre funcionamento da avaliação e disponibilidade aos sábados. Dra. Ana assumiu para fechar o agendamento.',
      temperaturaLead: 'quente',
      estagioFollowup: 'agendamento',
      statusResgate: 'nao-aplicavel',
      qualidadeAtendimento: 'excelente',
      scoreAtendimento: 95,
    },
  },
  'conv-2': {
    nome: 'Juliana Costa', nomeCompleto: 'Juliana Meireles Costa', iniciais: 'JC',
    avatarBg: '#CECBF6', avatarColor: '#3C3489',
    telefone: '+55 11 98765-1122', email: 'ju.costa@outlook.com',
    canal: 'instagram', canalLabel: 'Instagram', canalColor: '#993556', online: true,
    primeiroContato: '05/05/2026',
    etiquetas: [{ label: 'Estética', bg: '#EEEDFE', color: '#3C3489' }],
    equipe: { nome: 'Comercial', iniciais: 'C', bg: '#E6F1FB', color: '#185FA5' },
    responsavel: { nome: 'Não atribuído', iniciais: '—', bg: '#D1D5DB', color: '#6B7280' },
    stageAtual: 'novo',
    origem: { campanha: 'Clareamento Flash', cpl: 'R$ 1,20' },
    ia: { status: 'Ativa', statusColor: '#1D9E75', msgsRespondidas: 1, assumidoEm: '09:12' },
    analiseIA: {
      resumoConversa: 'Interesse em clareamento. Perguntou sobre preços e demonstrou interesse em agendar para quarta-feira.',
      temperaturaLead: 'quente',
      estagioFollowup: 'primeiro-contato',
      statusResgate: 'nao-aplicavel',
      qualidadeAtendimento: 'bom',
      scoreAtendimento: 88,
    },
  },
  'conv-3': {
    nome: 'Patrícia Lima', nomeCompleto: 'Patrícia de Souza Lima', iniciais: 'PL',
    avatarBg: '#FAC775', avatarColor: '#633806',
    telefone: '+55 11 91234-8877', email: 'patty.lima@gmail.com',
    canal: 'whatsapp', canalLabel: 'WhatsApp', canalColor: '#1D9E75', online: true,
    primeiroContato: '05/05/2026',
    etiquetas: [{ label: 'Urgência', bg: '#FCEBEB', color: '#A32D2D' }],
    equipe: { nome: 'Clínica', iniciais: 'CL', bg: '#FAEEDA', color: '#633806' },
    responsavel: { nome: 'Juliana (Recepção)', iniciais: 'JR', bg: '#C0DD97', color: '#27500A' },
    stageAtual: 'contato',
    origem: { campanha: 'Orgânico', cpl: '—' },
    ia: { status: 'Pausada', statusColor: '#F59E0B', msgsRespondidas: 0, assumidoEm: '—' },
    analiseIA: {
      resumoConversa: 'Urgência pediátrica (trauma dental). Atendimento humano imediato para recepção.',
      temperaturaLead: 'muito-quente',
      estagioFollowup: 'primeiro-contato',
      statusResgate: 'nao-aplicavel',
      qualidadeAtendimento: 'excelente',
      scoreAtendimento: 100,
    },
  },
  'conv-4': {
    nome: 'Marcos Oliveira', nomeCompleto: 'Marcos de Oliveira Júnior', iniciais: 'MO',
    avatarBg: '#C0DD97', avatarColor: '#27500A',
    telefone: '+55 31 99654-3210', email: 'marcos.oj@gmail.com',
    canal: 'facebook', canalLabel: 'Facebook', canalColor: '#185FA5', online: false,
    primeiroContato: '05/05/2026',
    etiquetas: [{ label: 'Ortodontia', bg: '#E6F1FB', color: '#185FA5' }],
    equipe: { nome: 'Comercial', iniciais: 'C', bg: '#E6F1FB', color: '#185FA5' },
    responsavel: { nome: 'Não atribuído', iniciais: '—', bg: '#D1D5DB', color: '#6B7280' },
    stageAtual: 'novo',
    origem: { campanha: 'Aparelho Invisível', cpl: 'R$ 2,10' },
    ia: { status: 'Ativa', statusColor: '#1D9E75', msgsRespondidas: 2, assumidoEm: '16:01' },
    analiseIA: {
      resumoConversa: 'Interesse em alinhadores invisíveis. Perguntou sobre horários após às 18h.',
      temperaturaLead: 'morno',
      estagioFollowup: 'aguardando-resposta',
      statusResgate: 'nao-aplicavel',
      qualidadeAtendimento: 'bom',
      scoreAtendimento: 80,
    },
  },
}

// ─── Cards de conversa (inbox) ──────────────────────────────────────────────
export const CARDS_INBOX: CardConversaData[] = [
  {
    id: 'conv-1', nome: 'Ricardo Silva', iniciais: 'RS', avatarVariant: 'azul', canal: 'whatsapp',
    timestamp: '14:26', preview: 'Oi Ricardo, tudo bem? Atend...', badgeCount: 0,
    etiquetas: [{ label: 'Lead Implante', variant: 'indicacoes' }],
    equipe: 'Comercial', equipeVariant: 'comercial', ativo: true,
    agenteAtual: 'humano', agenteLabel: 'Dra. Ana Lima',
    status: 'em-atendimento', responsavelId: 'ana-lima', responsavelNome: 'Dra. Ana Lima', equipeIds: ['comercial'],
  },
  {
    id: 'conv-2', nome: 'Juliana Costa', iniciais: 'JC', avatarVariant: 'roxo', canal: 'instagram',
    timestamp: '09:16', preview: 'Tenho 14:30 ou 16:00 na qua...', badgeCount: 1,
    etiquetas: [{ label: 'Estética', variant: 'vip' }],
    equipe: 'Comercial', equipeVariant: 'comercial',
    agenteAtual: 'ia-comercial', status: 'novo', responsavelId: undefined, equipeIds: ['comercial'],
  },
  {
    id: 'conv-3', nome: 'Patrícia Lima', iniciais: 'PL', avatarVariant: 'ambar', canal: 'whatsapp',
    timestamp: '11:50', preview: 'Obrigada! Estamos chegando...',
    etiquetas: [{ label: 'Urgência', variant: 'urgente' }],
    equipe: 'Clínica', equipeVariant: 'suporte',
    agenteAtual: 'humano', agenteLabel: 'Juliana (Rec)',
    status: 'em-atendimento', responsavelId: 'juliana-rec', responsavelNome: 'Juliana (Recepção)', equipeIds: ['clinica'],
  },
  {
    id: 'conv-4', nome: 'Marcos Oliveira', iniciais: 'MO', avatarVariant: 'verde', canal: 'facebook',
    timestamp: '16:06', preview: 'Perfeito! Temos horários est...', badgeCount: 2,
    etiquetas: [{ label: 'Ortodontia', variant: 'primeiro-atendimento' }],
    equipe: 'Comercial', equipeVariant: 'comercial',
    agenteAtual: 'ia-sdr', status: 'novo', responsavelId: undefined, equipeIds: ['comercial'],
  },
  {
    id: 'conv-5', nome: 'Wilson Ferreira', iniciais: 'WF', avatarVariant: 'verde', canal: 'whatsapp',
    timestamp: '10:20', preview: 'Pode ser sim, obrigado pela...',
    etiquetas: [{ label: 'Reagendamento', variant: 'follow-up' }],
    equipe: 'Comercial', equipeVariant: 'comercial',
    agenteAtual: 'humano', agenteLabel: 'Dra. Ana Lima',
    status: 'em-atendimento', responsavelId: 'ana-lima', responsavelNome: 'Dra. Ana Lima', equipeIds: ['comercial'],
  },
  {
    id: 'conv-6', nome: 'Camila Santos', iniciais: 'CS', avatarVariant: 'roxo', canal: 'whatsapp',
    timestamp: '15:45', preview: 'Oi, Camila! Acabou de chegar...',
    etiquetas: [{ label: 'Pós-Venda', variant: 'vip' }],
    equipe: 'Clínica', equipeVariant: 'suporte',
    agenteAtual: 'humano', agenteLabel: 'Dr. Carlos',
    status: 'em-atendimento', responsavelId: 'carlos-doc', responsavelNome: 'Dr. Carlos', equipeIds: ['clinica'],
  },
  {
    id: 'conv-7', nome: 'Gabriel Mendes', iniciais: 'GM', avatarVariant: 'azul', canal: 'whatsapp',
    timestamp: '20:12', preview: 'Olá, Gabriel! Sinto muito pe...',
    etiquetas: [{ label: 'Pós-Cirúrgico', variant: 'urgente' }],
    equipe: 'Clínica', equipeVariant: 'suporte',
    agenteAtual: 'ia-suporte', status: 'novo', responsavelId: undefined, equipeIds: ['clinica'],
  },
]

// ─── Cards de contatos (tabela) ──────────────────────────────────────────────
export type ContatoTabelaData = {
  nome: string
  iniciais: string
  avatarVariant: AvatarVariant
  telefone: string
  canais: Canal[]
  campanha?: string
  campanhaLabel?: string
  stage: StageId
  atribuidoA?: string
  primeiroContato: string
}

export const CONTATOS_TABELA: ContatoTabelaData[] = [
  { nome: 'Ricardo Silva', iniciais: 'RS', avatarVariant: 'azul', telefone: '+55 11 99422-3344', canais: ['whatsapp'], campanha: 'Implantes SP', campanhaLabel: 'Implantes SP', stage: 'qualificado', atribuidoA: 'Dra. Ana Lima', primeiroContato: 'Hoje' },
  { nome: 'Juliana Costa', iniciais: 'JC', avatarVariant: 'roxo', telefone: '+55 11 98765-1122', canais: ['instagram'], campanha: 'Clareamento Flash', campanhaLabel: 'Clareamento Flash', stage: 'novo', primeiroContato: 'Hoje' },
  { nome: 'Wilson Ferreira', iniciais: 'WF', avatarVariant: 'verde', telefone: '+55 11 97654-1234', canais: ['whatsapp'], stage: 'contato', atribuidoA: 'Dra. Ana Lima', primeiroContato: 'Ontem' },
  { nome: 'Marcos Oliveira', iniciais: 'MO', avatarVariant: 'ambar', telefone: '+55 31 99654-3210', canais: ['facebook'], campanha: 'Aparelho Invisível', campanhaLabel: 'Aparelho Invisível', stage: 'novo', primeiroContato: 'Hoje' },
  { nome: 'Camila Santos', iniciais: 'CS', avatarVariant: 'roxo', telefone: '+55 11 91111-2222', canais: ['whatsapp'], stage: 'fechado', atribuidoA: 'Dr. Carlos', primeiroContato: '5 dias' },
]

export const CONTATOS_STATS = [
  { label: 'Total de contatos', valor: '2.450', sub: '+120 esta semana', cor: 'var(--ws-text-1)' },
  { label: 'Leads ativos', valor: '584', sub: 'em acompanhamento', cor: '#185FA5' },
  { label: 'Aguardando avaliação', valor: '32', sub: 'nas próximas 48h', cor: '#BA7517' },
  { label: 'Conversão final', valor: '14,2%', sub: 'meta: 15%', cor: '#3B6D11' },
]