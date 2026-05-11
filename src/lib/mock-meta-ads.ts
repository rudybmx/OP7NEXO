import type { ContaAnuncio, DadosDiarios, CriativoTop, MetaInsightsVisaoGeral, InsightIA } from '@/types/meta-ads'

export const MOCK_CONTAS_META: ContaAnuncio[] = [
  {
    id: 'oc-rj-barra',
    nome: 'ODC RJ BARRA DA TIJUCA',
    status: 'ACTIVE',
    investimento: 12450.80,
    leads: 342,
    leadsWhatsapp: 85,
    leadsInstagram: 142,
    leadsMessenger: 47,
    leadsFormulario: 68,
    cpl: 36.40,
    ctr: 2.15,
    cpc: 0.85,
    cpm: 18.20,
    alcance: 125400,
    impressoes: 342000,
    frequencia: 2.73,
    saldo: 4520.50,
    saldoInicial: 15000.00,
    isPrepay: false,
    limiteCartao: 20000.00,
    fundingSourceType: 'VISA_1234',
    leadsPorPlataforma: [
      { platform: 'facebook_feed', label: 'FB Feed', count: 85, color: '#1877f2' },
      { platform: 'instagram_feed', label: 'IG Feed', count: 142, color: '#e1306c' },
      { platform: 'instagram_stories', label: 'IG Stories', count: 68, color: '#833ab4' },
      { platform: 'whatsapp', label: 'WhatsApp', count: 47, color: '#25d366' },
    ]
  },
  {
    id: 'oc-ribeirao',
    nome: 'ODC RIBEIRÃO PRETO',
    status: 'ACTIVE',
    investimento: 8900.50,
    leads: 215,
    leadsWhatsapp: 60,
    leadsInstagram: 98,
    leadsMessenger: 30,
    leadsFormulario: 27,
    cpl: 41.40,
    ctr: 1.85,
    cpc: 0.92,
    cpm: 16.50,
    alcance: 98000,
    impressoes: 185000,
    frequencia: 1.89,
    saldo: 120.40,
    saldoInicial: 500.00,
    isPrepay: true,
    ultimoValorRecarga: 1000.00,
    fundingSourceType: 'PIX',
    leadsPorPlataforma: [
      { platform: 'facebook_feed', label: 'FB Feed', count: 45, color: '#1877f2' },
      { platform: 'instagram_feed', label: 'IG Feed', count: 98, color: '#e1306c' },
      { platform: 'instagram_stories', label: 'IG Stories', count: 42, color: '#833ab4' },
      { platform: 'whatsapp', label: 'WhatsApp', count: 30, color: '#25d366' },
    ]
  },
  {
    id: 'oc-ararangua',
    nome: 'ODC ARARANGUÁ',
    status: 'ACTIVE',
    investimento: 15600.00,
    leads: 485,
    leadsWhatsapp: 120,
    leadsInstagram: 195,
    leadsMessenger: 75,
    leadsFormulario: 95,
    cpl: 32.16,
    ctr: 2.45,
    cpc: 0.78,
    cpm: 21.40,
    alcance: 156000,
    impressoes: 428000,
    frequencia: 2.74,
    saldo: 8400.00,
    saldoInicial: 15000.00,
    isPrepay: false,
    limiteCartao: 25000.00,
    fundingSourceType: 'MASTER_5678',
    leadsPorPlataforma: [
      { platform: 'facebook_feed', label: 'FB Feed', count: 120, color: '#1877f2' },
      { platform: 'instagram_feed', label: 'IG Feed', count: 195, color: '#e1306c' },
      { platform: 'instagram_stories', label: 'IG Stories', count: 95, color: '#833ab4' },
      { platform: 'whatsapp', label: 'WhatsApp', count: 75, color: '#25d366' },
    ]
  },
  {
    id: 'oc-jaguare',
    nome: 'ODC JAGUARÉ',
    status: 'ACTIVE',
    investimento: 6200.00,
    leads: 180,
    leadsWhatsapp: 50,
    leadsInstagram: 80,
    leadsMessenger: 20,
    leadsFormulario: 30,
    cpl: 34.44,
    ctr: 2.10,
    cpc: 0.88,
    cpm: 19.50,
    alcance: 85000,
    impressoes: 190000,
    frequencia: 2.23,
    saldo: 2100.00,
    saldoInicial: 10000.00,
    isPrepay: false,
    limiteCartao: 15000.00,
    fundingSourceType: 'VISA_9012',
    leadsPorPlataforma: [
      { platform: 'facebook_feed', label: 'FB Feed', count: 50, color: '#1877f2' },
      { platform: 'instagram_feed', label: 'IG Feed', count: 80, color: '#e1306c' },
      { platform: 'instagram_stories', label: 'IG Stories', count: 30, color: '#833ab4' },
      { platform: 'whatsapp', label: 'WhatsApp', count: 20, color: '#25d366' },
    ]
  },
  {
    id: 'oc-rio-negrinho',
    nome: 'ODC RIO NEGRINHO - SC',
    status: 'ACTIVE',
    investimento: 4800.00,
    leads: 145,
    leadsWhatsapp: 38,
    leadsInstagram: 70,
    leadsMessenger: 15,
    leadsFormulario: 22,
    cpl: 33.10,
    ctr: 1.95,
    cpc: 0.95,
    cpm: 17.80,
    alcance: 65000,
    impressoes: 140000,
    frequencia: 2.15,
    saldo: 800.00,
    saldoInicial: 5000.00,
    isPrepay: true,
    ultimoValorRecarga: 2000.00,
    fundingSourceType: 'PIX',
    leadsPorPlataforma: [
      { platform: 'facebook_feed', label: 'FB Feed', count: 35, color: '#1877f2' },
      { platform: 'instagram_feed', label: 'IG Feed', count: 70, color: '#e1306c' },
      { platform: 'instagram_stories', label: 'IG Stories', count: 25, color: '#833ab4' },
      { platform: 'whatsapp', label: 'WhatsApp', count: 15, color: '#25d366' },
    ]
  }
]

export const MOCK_DADOS_DIARIOS: DadosDiarios[] = Array.from({ length: 30 }).map((_, i) => {
  const data = new Date()
  data.setDate(data.getDate() - (29 - i))
  const dataStr = data.toISOString().split('T')[0]
  
  return {
    data: dataStr,
    investimento: 800 + Math.random() * 400,
    leads: 20 + Math.floor(Math.random() * 15)
  }
})

export const MOCK_TOP_CRIATIVOS: CriativoTop[] = [
  {
    id: 'ad-1',
    nome: '[IMPLANTE] Sorriso Renovado - Promoção Maio',
    tipo: 'IMAGE',
    thumbnailUrl: 'https://mir-s3-cdn-cf.behance.net/project_modules/fs/4d3b6b195440761.660d918114690.png',
    leads: 124,
    ctr: 3.42,
    cpl: 28.50
  },
  {
    id: 'ad-2',
    nome: '[ORTODONTIA] Aparelho Invisível - Estética e Conforto',
    tipo: 'VIDEO',
    thumbnailUrl: 'https://mir-s3-cdn-cf.behance.net/project_modules/max_1200/dab1f7178858467.64ef585bd9ce0.jpg',
    leads: 98,
    ctr: 2.85,
    cpl: 32.10
  },
  {
    id: 'ad-3',
    nome: '[ESTETICA] Clareamento Dental - Brilhe mais',
    tipo: 'IMAGE',
    thumbnailUrl: 'https://mir-s3-cdn-cf.behance.net/project_modules/disp/acf0ce178858467.64ef585abd025.jpg',
    leads: 65,
    ctr: 2.10,
    cpl: 45.30
  },
  {
    id: 'ad-4',
    nome: '[LIMPEZA] Saúde Bucal em Primeiro Lugar',
    tipo: 'IMAGE',
    thumbnailUrl: 'https://mir-s3-cdn-cf.behance.net/project_modules/max_1200/ea91b5178858467.64ef585c782bc.jpg',
    leads: 42,
    ctr: 1.75,
    cpl: 22.40
  },
  {
    id: 'ad-5',
    nome: '[INSTITUCIONAL] Odontocompany - Sua clínica de confiança',
    tipo: 'VIDEO',
    thumbnailUrl: 'https://mir-s3-cdn-cf.behance.net/project_modules/max_1200_webp/a46164201890701.667c614598de7.png',
    leads: 38,
    ctr: 1.45,
    cpl: 55.20
  }
]

export const MOCK_INSIGHTS_IA: InsightIA[] = [
  {
    id: 'in-1',
    anuncioId: 'ad-1',
    severidade: 'oportunidade',
    titulo: 'Alta Conversão em Implantes',
    mensagem: 'A campanha de Implantes está com um CPL 20% abaixo da média. Sugerimos aumentar o orçamento diário em R$ 150,00.',
    analiseCompleta: 'Análise detalhada mostra que o público de 35-55 anos está convertendo excepcionalmente bem neste criativo.',
    labelAcao: 'Aumentar Verba'
  },
  {
    id: 'in-2',
    anuncioId: 'oc-ribeirao',
    severidade: 'alerta',
    titulo: 'Saldo Crítico em Ribeirão Preto',
    mensagem: 'A conta de Ribeirão Preto está com apenas R$ 120,40 de saldo. As campanhas podem ser pausadas nas próximas 24h.',
    analiseCompleta: 'O consumo médio diário é de R$ 300,00, o que esgotará o saldo rapidamente.',
    labelAcao: 'Efetuar Recarga'
  },
  {
    id: 'in-3',
    anuncioId: 'ad-2',
    severidade: 'info',
    titulo: 'Performance Estável em Ortodontia',
    mensagem: 'O criativo de Aparelho Invisível mantém CTR estável de 2.85% nas últimas duas semanas.',
    analiseCompleta: 'O engajamento está acima da média do setor, indicando boa aceitação do vídeo.',
    labelAcao: 'Ver Detalhes'
  }
]

// ─── Raw Rows para useMetaCampanhas e useMetaAnuncios ─────────────────────────

export const MOCK_AD_ROWS = [
  {
    ad_id: 'ad-1', ad_name: '[IMPLANTE] Sorriso Renovado', campaign_id: 'c-1', campaign_name: '[CONVERSAO] Implantes', adset_id: 'as-1', adset_name: 'Público 35+ SP',
    objective: 'OUTCOME_LEADS', investimento: 4500, impressoes: 120000, alcance: 45000, cliques: 2500, leads: 124, score: 85, creative_type: 'IMAGE', creative_url: MOCK_TOP_CRIATIVOS[0].thumbnailUrl, ad_status_calc: 'ACTIVE', cpl: 36.29, ctr: 2.08, cpc: 1.80, cpm: 37.50, frequencia: 2.67, dias_ativo: 15, leads_mensagem: 80, leads_cadastro: 44
  },
  {
    ad_id: 'ad-2', ad_name: '[ORTODONTIA] Aparelho Invisível', campaign_id: 'c-2', campaign_name: '[CONVERSAO] Ortodontia', adset_id: 'as-2', adset_name: 'Interesses em Estética',
    objective: 'OUTCOME_LEADS', investimento: 3200, impressoes: 95000, alcance: 38000, cliques: 1800, leads: 98, score: 78, creative_type: 'VIDEO', creative_url: MOCK_TOP_CRIATIVOS[1].thumbnailUrl, ad_status_calc: 'ACTIVE', cpl: 32.65, ctr: 1.89, cpc: 1.77, cpm: 33.68, frequencia: 2.50, dias_ativo: 12, leads_mensagem: 60, leads_cadastro: 38
  },
  {
    ad_id: 'ad-3', ad_name: '[ESTETICA] Clareamento Promo', campaign_id: 'c-3', campaign_name: '[TRAFEGO] Estética', adset_id: 'as-3', adset_name: 'Lookalike 1% Clientes',
    objective: 'OUTCOME_TRAFFIC', investimento: 2100, impressoes: 65000, alcance: 28000, cliques: 1200, leads: 42, score: 92, creative_type: 'IMAGE', creative_url: MOCK_TOP_CRIATIVOS[2].thumbnailUrl, ad_status_calc: 'ACTIVE', cpl: 50.00, ctr: 1.85, cpc: 1.75, cpm: 32.31, frequencia: 2.32, dias_ativo: 10, leads_mensagem: 30, leads_cadastro: 12
  },
  {
    ad_id: 'ad-4', ad_name: '[LIMPEZA] Saúde em Dia', campaign_id: 'c-1', campaign_name: '[CONVERSAO] Implantes', adset_id: 'as-1', adset_name: 'Público 35+ SP',
    objective: 'OUTCOME_LEADS', investimento: 1500, impressoes: 45000, alcance: 18000, cliques: 850, leads: 42, score: 65, creative_type: 'IMAGE', creative_url: MOCK_TOP_CRIATIVOS[3].thumbnailUrl, ad_status_calc: 'ACTIVE', cpl: 35.71, ctr: 1.89, cpc: 1.76, cpm: 33.33, frequencia: 2.50, dias_ativo: 20, leads_mensagem: 25, leads_cadastro: 17
  }
]

// ─── Raw Rows para useMetaCriativos ──────────────────────────────────────────

export const MOCK_CRIATIVOS_ROWS = [
  { creative_id: 'ad-1', creative_type: 'IMAGE', status_criativo: 'evergreen', creative_url: MOCK_TOP_CRIATIVOS[0].thumbnailUrl, dias_ativo: 15, campanhas: 2, leads: 124, investimento: 4500, cpl: 36.29, ctr: 3.42, cpc: 0.85, cpm: 18.20, alcance: 45000, impressoes: 120000, frequencia: 2.67, score: 85 },
  { creative_id: 'ad-2', creative_type: 'VIDEO', status_criativo: 'novo', creative_url: MOCK_TOP_CRIATIVOS[1].thumbnailUrl, dias_ativo: 12, campanhas: 1, leads: 98, investimento: 3200, cpl: 32.65, ctr: 2.85, cpc: 0.92, cpm: 16.50, alcance: 38000, impressoes: 95000, frequencia: 2.50, score: 78 },
  { creative_id: 'ad-3', creative_type: 'IMAGE', status_criativo: 'novo', creative_url: MOCK_TOP_CRIATIVOS[2].thumbnailUrl, dias_ativo: 10, campanhas: 1, leads: 65, investimento: 2100, cpl: 32.30, ctr: 2.10, cpc: 0.78, cpm: 21.40, alcance: 28000, impressoes: 65000, frequencia: 2.32, score: 92 },
]

// ─── Raw Rows para useMetaPublicos ───────────────────────────────────────────

export const MOCK_DEMOGRAPHICS_ROWS = [
  { age: '18-24', gender: 'female', leads: 45, investimento: 1200, cpl: 26.60, ctr: 2.10, alcance: 15000, impressoes: 45000 },
  { age: '25-34', gender: 'female', leads: 125, investimento: 3500, cpl: 28.00, ctr: 2.45, alcance: 35000, impressoes: 98000 },
  { age: '35-44', gender: 'female', leads: 185, investimento: 5200, cpl: 28.10, ctr: 2.30, alcance: 42000, impressoes: 120000 },
  { age: '45-54', gender: 'female', leads: 95, investimento: 3100, cpl: 32.60, ctr: 1.95, alcance: 28000, impressoes: 85000 },
  { age: '25-34', gender: 'male', leads: 85, investimento: 2800, cpl: 32.90, ctr: 1.85, alcance: 25000, impressoes: 75000 },
  { age: '35-44', gender: 'male', leads: 110, investimento: 3900, cpl: 35.45, ctr: 1.75, alcance: 32000, impressoes: 92000 },
]

export const MOCK_GEO_ROWS = [
  { region: 'RJ - Barra da Tijuca', leads: 245, investimento: 8500, cpl: 34.69 },
  { region: 'Ribeirão Preto', leads: 112, investimento: 4200, cpl: 37.50 },
  { region: 'Araranguá', leads: 98, investimento: 3800, cpl: 38.77 },
  { region: 'Jaguaré', leads: 54, investimento: 1800, cpl: 33.33 },
  { region: 'Rio Negrinho - SC', leads: 42, investimento: 1500, cpl: 35.71 },
]

export const MOCK_ACCOUNT_SUMMARY_ROWS = [
  { alcance: 452000, frequencia_media: 2.45 }
]

export const MOCK_PLACEMENTS = [
  { nome: 'Instagram Stories', plataforma: 'instagram' as const, leads: 145, investimento: 4200, cpl: 28.96, ctr: 2.45, percentual: 45, cor: '#E1306C' },
  { nome: 'Instagram Feed',    plataforma: 'instagram' as const, leads: 98,  investimento: 3500, cpl: 35.71, ctr: 1.85, percentual: 25, cor: '#C13584' },
  { nome: 'Facebook Feed',     plataforma: 'facebook' as const,  leads: 112, investimento: 3800, cpl: 33.92, ctr: 1.65, percentual: 20, cor: '#1877F2' },
  { nome: 'Facebook Marketplace', plataforma: 'facebook' as const, leads: 42, investimento: 1500, cpl: 35.71, ctr: 1.20, percentual: 7, cor: '#4267B2' },
  { nome: 'Messenger Inbox',   plataforma: 'facebook' as const,  leads: 28,  investimento: 1200, cpl: 42.85, ctr: 0.95, percentual: 3, cor: '#00B2FF' },
]

export const MOCK_DISPOSITIVOS = [
  { tipo: 'mobile' as const,  percentual: 88, leads: 385, cpl: 32.40 },
  { tipo: 'desktop' as const, percentual: 10, leads: 35,  cpl: 45.20 },
  { tipo: 'tablet' as const,  percentual: 2,  leads: 5,   cpl: 62.10 },
]

export const MOCK_SO_ROWS = [
  { nome: 'Android', percentual: 72, cpl: 31.50 },
  { nome: 'iOS',     percentual: 26, cpl: 38.20 },
  { nome: 'Windows', percentual: 2,  cpl: 45.00 },
]

export const MOCK_HEATMAP: any[] = Array.from({ length: 7 * 24 }).map((_, i) => {
  const leads = (i % 24 >= 8 && i % 24 <= 20) ? Math.floor(Math.random() * 15) : Math.floor(Math.random() * 3)
  return {
    dia: Math.floor(i / 24),
    hora: i % 24,
    leads,
    intensidade: leads / 15
  }
})

export const getMockMetaOverview = (dataInicio: string, dataFim: string): MetaInsightsVisaoGeral => {
  return {
    contas: MOCK_CONTAS_META,
    dadosDiarios: MOCK_DADOS_DIARIOS,
    topCriativos: MOCK_TOP_CRIATIVOS,
    insightsIA: MOCK_INSIGHTS_IA,
    periodo: { inicio: dataInicio, fim: dataFim }
  }
}
