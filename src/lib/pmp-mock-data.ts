import { calcularStatusDerived } from '@/types/pmp'
import type { PmpPhase, PmpPlan, PmpTask, PmpVersion, TaskPriority, TaskStatus } from '@/types/pmp'

const PHASES = [
  { id: 'diagnostico', name: 'Diagnóstico e Estratégia', color: '#4f6bed' },
  { id: 'identidade', name: 'Identidade e Posicionamento', color: 'var(--ws-gold)' },
  { id: 'conteudo', name: 'Criação de Conteúdo', color: '#3b8f6d' },
  { id: 'midia-paga', name: 'Mídia Paga', color: '#7c4dbd' },
  { id: 'analise', name: 'Análise e Otimização', color: '#bf5a2f' },
] as const

const PEOPLE = [
  { name: 'Ana Lima', initials: 'AL' },
  { name: 'Leo Costa', initials: 'LC' },
  { name: 'Fernanda Reis', initials: 'FR' },
  { name: 'Marcos Dutra', initials: 'MD' },
  { name: 'Juliana Park', initials: 'JP' },
] as const

const CLIENTS = [
  {
    id: 'oc-rj-barra',
    name: 'ODC RJ BARRA DA TIJUCA',
    version: '3.2',
    updatedAt: '2026-03-15',
    createdAt: '2026-01-08',
    createdBy: 'Fernanda Reis',
    status: 'in_progress' as const,
    phaseTasks: [
      [
        ['Mapear jornada das pacientes de implante', '2026-01-08', '2026-01-24', 'done', 100, 'alta'],
        ['Diagnóstico de concorrência regional (clínicas)', '2026-01-15', '2026-02-02', 'done', 100, 'alta'],
        ['Plano de diferenciação OdontoCompany', '2026-01-27', '2026-02-14', 'in_progress', 78, 'alta'],
      ],
      [
        ['Refinar proposta de valor da unidade', '2026-02-10', '2026-03-04', 'done', 100, 'alta'],
        ['Manual visual OdontoCompany local', '2026-02-20', '2026-03-18', 'in_progress', 62, 'media'],
        ['Ajuste de discurso comercial para avaliação', '2026-03-01', '2026-03-21', 'in_progress', 44, 'media'],
      ],
      [
        ['Calendário editorial Odonto (Q2)', '2026-03-15', '2026-04-18', 'in_progress', 58, 'alta'],
        ['Produção de reels sobre implantes', '2026-03-28', '2026-04-30', 'in_progress', 36, 'alta'],
        ['Sequência de e-mails para nutrição de leads', '2026-04-03', '2026-05-20', 'todo', 0, 'media'],
        ['Biblioteca de provas sociais (Sorrisos)', '2026-04-10', '2026-05-02', 'in_progress', 54, 'baixa'],
      ],
      [
        ['Estrutura de campanhas Meta Ads (Always-on)', '2026-04-15', '2026-05-10', 'in_progress', 41, 'alta'],
        ['Campanha "Mês do Implante"', '2026-05-20', '2026-07-12', 'in_progress', 49, 'alta'],
        ['Teste criativo de captação local (WhatsApp)', '2026-06-01', '2026-07-05', 'in_progress', 31, 'media'],
        ['Retargeting para leads inativos no CRM', '2026-06-15', '2026-07-25', 'todo', 0, 'media'],
      ],
      [
        ['Painel de CAC por procedimento (Implante vs Orto)', '2026-08-01', '2026-09-05', 'todo', 0, 'alta'],
        ['Rotina quinzenal de otimização de anúncios', '2026-09-08', '2026-11-28', 'todo', 0, 'media'],
        ['Revisão anual de performance da unidade', '2026-12-01', '2026-12-19', 'todo', 0, 'media'],
      ],
    ],
    versions: [
      ['3.2', '2026-03-15', 'Fernanda Reis', 'Adição de fase de Mídia Paga focada em Implantes e ajuste de prazos críticos.'],
      ['3.1', '2026-03-02', 'Marcos Dutra', 'Revisão de responsáveis, dependências e entregas da fase 2.'],
      ['3.0', '2026-02-18', 'Ana Lima', 'Versão inicial consolidando estratégia, branding da unidade e conteúdo.'],
    ],
  },
  {
    id: 'oc-ribeirao',
    name: 'ODC RIBEIRÃO PRETO',
    version: '2.8',
    updatedAt: '2026-04-08',
    createdAt: '2026-01-10',
    createdBy: 'Marcos Dutra',
    status: 'in_progress' as const,
    phaseTasks: [
      [
        ['Auditoria de mix de tratamentos', '2026-01-10', '2026-01-31', 'done', 100, 'alta'],
        ['Mapa de canais por especialidade', '2026-01-20', '2026-02-07', 'done', 100, 'media'],
        ['Planejamento promocional odontológico (Semestre)', '2026-02-01', '2026-02-28', 'in_progress', 84, 'alta'],
      ],
      [
        ['Arquitetura de comunicação da clínica', '2026-02-18', '2026-03-17', 'in_progress', 59, 'alta'],
        ['Key visual de campanhas de Ortodontia', '2026-03-01', '2026-04-10', 'in_progress', 39, 'alta'],
        ['Ajuste de copy por tratamento', '2026-03-05', '2026-05-17', 'in_progress', 47, 'media'],
      ],
      [
        ['Calendário de ofertas e avaliações', '2026-03-24', '2026-05-16', 'in_progress', 52, 'alta'],
        ['Conteúdo educativo sobre saúde bucal', '2026-04-01', '2026-05-30', 'in_progress', 44, 'media'],
        ['Série de criativos por especialidade', '2026-04-07', '2026-04-30', 'in_progress', 29, 'alta'],
      ],
      [
        ['Campanhas de avaliação rápida', '2026-05-12', '2026-07-04', 'in_progress', 33, 'alta'],
        ['Promoções de inverno (Clareamento)', '2026-06-02', '2026-07-18', 'todo', 0, 'media'],
        ['Captação focada em Alinhadores Invisíveis', '2026-06-16', '2026-08-01', 'todo', 0, 'media'],
      ],
      [
        ['Modelo de dashboard da clínica no Meta', '2026-08-11', '2026-09-19', 'todo', 0, 'media'],
        ['Ciclo de otimização trimestral de leads', '2026-09-22', '2026-11-21', 'todo', 0, 'baixa'],
        ['Fechamento de aprendizados CPL', '2026-12-01', '2026-12-22', 'todo', 0, 'baixa'],
      ],
    ],
    versions: [
      ['2.8', '2026-04-08', 'Marcos Dutra', 'Ajuste do cronograma de conteúdo e antecipação da fase de captação.'],
      ['2.7', '2026-03-19', 'Juliana Park', 'Revisão da linha de campanhas ortodônticas e refinamento de targets.'],
      ['2.6', '2026-02-25', 'Ana Lima', 'Versão inicial após alinhamento com os dentistas responsáveis.'],
    ],
  },
  {
    id: 'oc-ararangua',
    name: 'ODC ARARANGUÁ',
    version: '4.1',
    updatedAt: '2026-05-06',
    createdAt: '2026-01-06',
    createdBy: 'Ana Lima',
    status: 'in_progress' as const,
    phaseTasks: [
      [
        ['Pesquisa de satisfação com pacientes ativos', '2026-01-06', '2026-01-29', 'done', 100, 'alta'],
        ['Diagnóstico de clínicas concorrentes na região', '2026-01-20', '2026-02-12', 'done', 100, 'alta'],
        ['Plano de diferenciação do atendimento OdontoCompany', '2026-02-03', '2026-02-25', 'done', 100, 'alta'],
        ['Estratégia de captação de avaliações (2º Semestre)', '2026-02-12', '2026-03-05', 'in_progress', 77, 'alta'],
      ],
      [
        ['Refino do discurso institucional da clínica', '2026-03-01', '2026-03-28', 'done', 100, 'media'],
        ['Sistema visual de campanha de avaliações gratuitas', '2026-03-08', '2026-04-09', 'in_progress', 71, 'alta'],
        ['Guia de tom para atendimento via WhatsApp', '2026-03-20', '2026-04-10', 'in_progress', 63, 'media'],
      ],
      [
        ['Calendário de conteúdo de autoridade (Dentistas)', '2026-04-07', '2026-05-23', 'in_progress', 56, 'alta'],
        ['Cobertura audiovisual do espaço da clínica', '2026-04-14', '2026-06-06', 'in_progress', 42, 'media'],
        ['Série de depoimentos de pacientes satisfeitos', '2026-04-28', '2026-06-20', 'in_progress', 38, 'media'],
        ['Fluxo de nutrição para agendamentos não comparecidos', '2026-05-05', '2026-06-27', 'todo', 0, 'media'],
      ],
      [
        ['Campanha de captação de implantes', '2026-06-02', '2026-08-01', 'todo', 0, 'alta'],
        ['Campanha de prevenção e limpeza segmentadas', '2026-06-16', '2026-08-15', 'todo', 0, 'media'],
        ['Retargeting para lista de pacientes inativos', '2026-07-01', '2026-08-29', 'todo', 0, 'media'],
      ],
      [
        ['Monitor de origem das avaliações agendadas', '2026-09-01', '2026-10-03', 'todo', 0, 'alta'],
        ['Ritual mensal de otimização de CPL e agendamentos', '2026-10-06', '2026-11-28', 'todo', 0, 'media'],
        ['Retrospectiva de captação odontológica 2026', '2026-12-01', '2026-12-18', 'todo', 0, 'baixa'],
      ],
    ],
    versions: [
      ['4.1', '2026-05-06', 'Ana Lima', 'Ampliação da frente de conteúdo e ajustes para calendário de agendamentos.'],
      ['4.0', '2026-04-12', 'Leo Costa', 'Inclusão de automações de nutrição (WhatsApp) e revisão de dependências.'],
      ['3.9', '2026-03-18', 'Fernanda Reis', 'Versão inicial do plano anual com foco em retenção de pacientes.'],
    ],
  },
] as const

const descriptionTemplates: Record<string, string> = {
  'Diagnóstico e Estratégia': 'Levantamento de contexto, análise competitiva e definição de direcionadores estratégicos do plano.',
  'Identidade e Posicionamento': 'Ajuste de narrativa, visual e diferenciais para elevar clareza e percepção de valor da marca.',
  'Criação de Conteúdo': 'Produção e organização de ativos editoriais, criativos e rotinas de publicação.',
  'Mídia Paga': 'Estruturação de campanhas, públicos, testes criativos e monitoramento de aquisição.',
  'Análise e Otimização': 'Rituais de revisão, leitura de indicadores e otimização contínua do plano.',
}

function getPerson(index: number) {
  return PEOPLE[index % PEOPLE.length]
}

function buildTask(
  clientId: string,
  phase: (typeof PHASES)[number],
  phaseOrder: number,
  taskIndex: number,
  task: readonly [string, string, string, TaskStatus, number, TaskPriority]
): PmpTask {
  const assignee = getPerson(phaseOrder + taskIndex)
  const status = task[3]
  const endDate = task[2]

  return {
    id: `${clientId}-${phase.id}-task-${taskIndex + 1}`,
    phase: phase.id as PmpTask['phase'],
    phaseOrder,
    title: task[0],
    assignee: assignee.name,
    assigneeInitials: assignee.initials,
    startDate: task[1],
    endDate,
    status,
    statusDerived: calcularStatusDerived({ status, endDate }),
    priority: task[5],
    progress: task[4],
    description: `${descriptionTemplates[phase.name]} Esta frente cobre ${task[0].toLowerCase()} com acompanhamento semanal e checkpoints da agência.`,
    deliverables: [
      `Briefing de ${task[0].toLowerCase()}`,
      'Aprovação do cliente',
      'Publicação e validação operacional',
    ],
    tags: [phase.name.split(' ')[0].toLowerCase(), assignee.initials.toLowerCase(), task[5]],
    color: phase.color,
  }
}

function buildPhase(clientId: string, phase: (typeof PHASES)[number], order: number, tasks: readonly (readonly [string, string, string, TaskStatus, number, TaskPriority])[]): PmpPhase {
  return {
    id: `${clientId}-${phase.id}`,
    name: phase.name,
    order,
    color: phase.color,
    tasks: tasks.map((task, index) => buildTask(clientId, phase, order, index, task)),
  }
}

function buildVersion(clientId: string, version: readonly [string, string, string, string], index: number): PmpVersion {
  return {
    id: `${clientId}-version-${index + 1}`,
    version: `v${version[0]}`,
    createdAt: version[1],
    createdBy: version[2],
    changesSummary: version[3],
  }
}

export const pmpPlans: PmpPlan[] = CLIENTS.map((client) => ({
  id: `plan-${client.id}`,
  clientId: client.id,
  clientName: client.name,
  version: client.version,
  title: 'Plano de Marketing Personalizado',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  status: client.status,
  createdAt: client.createdAt,
  updatedAt: client.updatedAt,
  createdBy: client.createdBy,
  phases: client.phaseTasks.map((tasks, index) => buildPhase(client.id, PHASES[index], index + 1, tasks)),
  versions: client.versions.map((version, index) => buildVersion(client.id, version, index)),
}))

export const pmpClients = pmpPlans.map((plan) => ({
  id: plan.clientId,
  name: plan.clientName,
}))

export function getPmpPlanByClientId(clientId: string): PmpPlan | undefined {
  return pmpPlans.find((plan) => plan.clientId === clientId)
}
