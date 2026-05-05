import type { 
  CampanhaGoogle, 
  DadosDiarios, 
  BreakdownTipo, 
  DistribuicaoQS, 
  InsightGoogle,
  GrupoAnuncios
} from '@/types/google-ads'

export const MOCK_CAMPANHAS_GOOGLE: CampanhaGoogle[] = [
  {
    id: 'g-sp-centro-search',
    nome: '[SEARCH] Odontocompany SP Centro - Implantes',
    tipo: 'SEARCH', status: 'ENABLED',
    orcamentoDiario: 150,
    investimento: 4500.80,
    cliques: 8240, impressoes: 76800, conversoes: 372,
    valorConversoes: 186000,
    ctr: 10.7, cpcMedio: 0.54, cpm: 58.6,
    roas: 41.3, taxaConversao: 4.5, custoConversao: 12.10,
    impressionShare: 0.68, isPeridoBudget: 0.05, isPerdidoRank: 0.27,
    absoluteTopIS: 0.45, qualityScoreMedio: 8.2,
  },
  {
    id: 'g-santo-andre-pmax',
    nome: '[PMAX] Odontocompany Santo André - Geral',
    tipo: 'PERFORMANCE_MAX', status: 'ENABLED',
    orcamentoDiario: 120,
    investimento: 3601.00,
    cliques: 5240, impressoes: 142000, conversoes: 241,
    valorConversoes: 120500,
    ctr: 3.7, cpcMedio: 0.69, cpm: 25.4,
    roas: 33.5, taxaConversao: 4.6, custoConversao: 14.94,
    impressionShare: 0.0, isPeridoBudget: 0.0, isPerdidoRank: 0.0,
    absoluteTopIS: 0.0, qualityScoreMedio: 0,
  },
  {
    id: 'g-sbc-search',
    nome: '[SEARCH] Odontocompany SBC - Ortodontia',
    tipo: 'SEARCH', status: 'ENABLED',
    orcamentoDiario: 100,
    investimento: 3100.50,
    cliques: 5800, impressoes: 48000, conversoes: 196,
    valorConversoes: 98000,
    ctr: 12.1, cpcMedio: 0.53, cpm: 64.5,
    roas: 31.6, taxaConversao: 3.4, custoConversao: 15.82,
    impressionShare: 0.58, isPeridoBudget: 0.10, isPerdidoRank: 0.32,
    absoluteTopIS: 0.35, qualityScoreMedio: 7.5,
  },
  {
    id: 'g-remarketing-display',
    nome: '[DISPLAY] Remarketing Geral - São Paulo',
    tipo: 'DISPLAY', status: 'ENABLED',
    orcamentoDiario: 40,
    investimento: 1200.50,
    cliques: 1840, impressoes: 215000, conversoes: 45,
    valorConversoes: 22000,
    ctr: 0.85, cpcMedio: 0.65, cpm: 5.5,
    roas: 18.3, taxaConversao: 2.4, custoConversao: 26.68,
    impressionShare: 0.0, isPeridoBudget: 0.0, isPerdidoRank: 0.0,
    absoluteTopIS: 0.0, qualityScoreMedio: 0,
  }
]

export const MOCK_GRUPOS_DETALHE_GOOGLE: GrupoAnunciosDetalhe[] = [
  {
    id: 'gr-1', campanhaId: 'g-sp-centro-search',
    campanhaNome: '[SEARCH] Odontocompany SP Centro - Implantes',
    tipoCampanha: 'SEARCH', nome: '[IMPLANTE] Palavras-chave Marca',
    status: 'ENABLED',
    estrategiaLance: 'TARGET_CPA', targetCpaMicros: 15000000, targetRoas: null,
    cpcMaximoMicros: null, emAprendizado: false, diasAprendizado: 0,
    investimento: 2100, cliques: 3820, impressoes: 32000, conversoes: 182,
    valorConversoes: 82000, ctr: 11.9, cpcMedio: 0.55, cpm: 65.6,
    roas: 39.0, taxaConversao: 4.8, custoConversao: 11.54,
    qualityScoreMedio: 8.8, keywordsAtivas: 12, keywordsTotal: 15,
    adStrength: null, anunciosAtivos: 3,
    impressionShare: 0.75, isPerdidoBudget: 0.05, isPerdidoRank: 0.20,
  },
  {
    id: 'gr-2', campanhaId: 'g-sp-centro-search',
    campanhaNome: '[SEARCH] Odontocompany SP Centro - Implantes',
    tipoCampanha: 'SEARCH', nome: '[IMPLANTE] Genéricas SP',
    status: 'ENABLED',
    estrategiaLance: 'TARGET_CPA', targetCpaMicros: 18000000, targetRoas: null,
    cpcMaximoMicros: null, emAprendizado: false, diasAprendizado: 0,
    investimento: 2400.80, cliques: 4420, impressoes: 44800, conversoes: 190,
    valorConversoes: 104000, ctr: 9.8, cpcMedio: 0.54, cpm: 53.6,
    roas: 43.3, taxaConversao: 4.3, custoConversao: 12.63,
    qualityScoreMedio: 7.6, keywordsAtivas: 25, keywordsTotal: 30,
    adStrength: null, anunciosAtivos: 2,
    impressionShare: 0.62, isPerdidoBudget: 0.05, isPerdidoRank: 0.33,
  },
  {
    id: 'gr-3', campanhaId: 'g-santo-andre-pmax',
    campanhaNome: '[PMAX] Odontocompany Santo André - Geral',
    tipoCampanha: 'PERFORMANCE_MAX', nome: 'Grupo de Recursos — All Products',
    status: 'ENABLED',
    estrategiaLance: 'MAXIMIZE_CONVERSION_VALUE', targetCpaMicros: null, targetRoas: 3500,
    cpcMaximoMicros: null, emAprendizado: false, diasAprendizado: 0,
    investimento: 3601, cliques: 5240, impressoes: 142000, conversoes: 241,
    valorConversoes: 120500, ctr: 3.7, cpcMedio: 0.69, cpm: 25.4,
    roas: 33.5, taxaConversao: 4.6, custoConversao: 14.94,
    qualityScoreMedio: 0, keywordsAtivas: 0, keywordsTotal: 0,
    adStrength: 'EXCELLENT', anunciosAtivos: 1,
    impressionShare: null, isPerdidoBudget: null, isPerdidoRank: null,
  },
]

export const MOCK_DADOS_DIARIOS_GOOGLE: DadosDiarios[] = Array.from({ length: 30 }).map((_, i) => {
  const data = new Date()
  data.setDate(data.getDate() - (29 - i))
  const dataStr = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  
  return {
    data: dataStr,
    cliques: 400 + Math.floor(Math.random() * 200),
    impressoes: 10000 + Math.floor(Math.random() * 5000),
    conversoes: 15 + Math.floor(Math.random() * 10),
    custo: 250 + Math.random() * 150,
    ctr: 3.5 + Math.random() * 2
  }
})

export const MOCK_KEYWORDS_GOOGLE: KeywordGoogle[] = [
  { id: 'k-1', adGroupId: 'gr-1', campanhaId: 'g-sp-centro-search', texto: 'implante dentario odontocompany', matchType: 'EXACT', status: 'ENABLED', qualityScore: 10, investimento: 450, cliques: 820, impressoes: 4500, conversoes: 42, ctr: 18.2, cpcMedio: 0.55, custoConversao: 10.71 },
  { id: 'k-2', adGroupId: 'gr-1', campanhaId: 'g-sp-centro-search', texto: 'clinica dentaria centro sp', matchType: 'PHRASE', status: 'ENABLED', qualityScore: 8, investimento: 320, cliques: 540, impressoes: 6200, conversoes: 22, ctr: 8.7, cpcMedio: 0.59, custoConversao: 14.54 },
  { id: 'k-3', adGroupId: 'gr-2', campanhaId: 'g-sp-centro-search', texto: 'preço implante dentario', matchType: 'BROAD', status: 'ENABLED', qualityScore: 6, investimento: 580, cliques: 1100, impressoes: 12500, conversoes: 35, ctr: 8.8, cpcMedio: 0.53, custoConversao: 16.57 },
]

export const MOCK_ADS_GOOGLE: AdGoogle[] = [
  { 
    id: 'a-1', adGroupId: 'gr-1', campanhaId: 'g-sp-centro-search', 
    titulo: 'Implantes Dentários Odontocompany | SP Centro | Agende Agora', 
    desc: 'Recupere seu sorriso com quem é especialista. Condições facilitadas e atendimento premium.',
    status: 'ENABLED', adStrength: 'EXCELLENT', 
    investimento: 1200, cliques: 2100, impressoes: 18000, conversoes: 98, ctr: 11.6, cpcMedio: 0.57, custoConversao: 12.24 
  },
  { 
    id: 'a-2', adGroupId: 'gr-2', campanhaId: 'g-sp-centro-search', 
    titulo: 'Transforme seu Sorriso | SP Centro | Odontocompany', 
    desc: 'Melhores especialistas em implantes e ortodontia de São Paulo. Agende sua avaliação.',
    status: 'ENABLED', adStrength: 'GOOD', 
    investimento: 900, cliques: 1540, impressoes: 14500, conversoes: 64, ctr: 10.6, cpcMedio: 0.58, custoConversao: 14.06 
  },
]

export const MOCK_PUBLICOS_GOOGLE: PublicoGoogle[] = [
  { id: 'p-1', nome: 'Remarketing Site 30D', leads: 145, investimento: 2100, cpl: 14.48, ctr: 2.45, percentual: 45 },
  { id: 'p-2', nome: 'Lista de Clientes Antigos', leads: 98, investimento: 1800, cpl: 18.36, ctr: 1.85, percentual: 25 },
  { id: 'p-3', nome: 'Interesses em Saúde Bucal', leads: 112, investimento: 3200, cpl: 28.57, ctr: 1.65, percentual: 20 },
  { id: 'p-4', nome: 'In-market: Dental Services', leads: 42, investimento: 1500, cpl: 35.71, ctr: 1.20, percentual: 10 },
]

export const MOCK_BREAKDOWN_TIPOS: BreakdownTipo[] = [
  { tipo:'SEARCH',          label:'Pesquisa',        investimento:7601, cliques:14040, conversoes:568, ctr:11.4, roas:36.4, cor:'#0f2744' },
  { tipo:'PERFORMANCE_MAX', label:'PMax',            investimento:3601, cliques:5240, conversoes:241, ctr:3.7,  roas:33.5, cor:'var(--ws-gold)' },
  { tipo:'DISPLAY',         label:'Display',         investimento:1200, cliques:1840, conversoes:45,  ctr:0.85, roas:18.3, cor:'#185fa5' },
  { tipo:'VIDEO',           label:'Vídeo',           investimento:420,  cliques:380,  conversoes:8,   ctr:0.61, roas:9.5,  cor:'#854f0b' },
]

export const MOCK_DISTRIBUICAO_QS_GOOGLE: DistribuicaoQS[] = [
  { faixa:'1–3 (Ruim)',    quantidade: 2,  cor:'#a32d2d' },
  { faixa:'4–6 (Regular)', quantidade: 8,  cor:'#854f0b' },
  { faixa:'7–10 (Bom)',    quantidade: 32, cor:'#3b6d11' },
]

export const MOCK_INSIGHTS_GOOGLE: InsightGoogle[] = [
  {
    id: 'ig-1',
    severidade: 'oportunidade',
    titulo: 'Otimizar CPC em Implantes',
    mensagem: 'A campanha de SP Centro está com um CPC 15% acima do benchmark para palavras-chave de marca.',
    analiseCompleta: 'Sugerimos revisar as correspondências de frase para evitar cliques irrelevantes e reduzir o CPC médio para R$ 0,45.',
    labelAcao: 'Ajustar Lances'
  },
  {
    id: 'ig-2',
    severidade: 'alerta',
    titulo: 'Quality Score em Queda',
    mensagem: '3 grupos de anúncios na campanha de SBC tiveram queda no QS de 8 para 6.',
    analiseCompleta: 'A relevância do anúncio para a página de destino diminuiu. Recomendamos ajustar o texto dos anúncios para incluir os termos principais.',
    labelAcao: 'Melhorar Anúncios'
  },
  {
    id: 'ig-3',
    severidade: 'info',
    titulo: 'PMax Performando Acima da Média',
    mensagem: 'A campanha PMax de Santo André atingiu ROAS de 33.5x esta semana.',
    analiseCompleta: 'Excelente performance de ativos de vídeo. Considere aumentar a verba diária em 10% para escala.',
    labelAcao: 'Ver Relatório'
  }
]
