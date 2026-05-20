export type MetricaPublicos = 'leads' | 'cpl' | 'investimento' | 'ctr'
export type SeveridadeInsight = 'alerta' | 'oportunidade' | 'info'

export interface DadosDemograficos {
  faixa: string        // '18–24' | '25–34' | '35–44' | '45–54' | '55–64' | '65+'
  genero: 'masc' | 'fem'
  leads: number
  investimento: number
  cpl: number
  ctr: number
  alcance: number
  impressoes: number
}

export interface DadosPlacement {
  nome: string
  plataforma: 'facebook' | 'instagram' | 'whatsapp' | 'audience_network'
  leads: number
  percentual: number
  investimento: number
  cpl: number
  ctr: number
  cor: string
}

export interface DadosDispositivo {
  tipo: 'mobile' | 'desktop' | 'tablet'
  percentual: number
  leads: number
  cpl: number
}

export interface DadosSO {
  nome: string
  percentual: number
  cpl: number
}

export interface DadosHora {
  dia: number          // 0=Seg, 6=Dom
  hora: number         // 0–23
  leads: number
  intensidade: number  // 0–1 normalizado
}

export interface DadosCidade {
  nome: string
  leads: number
  investimento: number
  cpl: number
  percentualLeads: number
}

export interface KpiPublicos {
  alcanceTotal: number
  frequenciaMedia: number
  melhorFaixaCpl: string
  melhorFaixaValor: number
  melhorPlacement: string
  melhorPlacementCpl: number
  melhorHorario: string
  melhorDia: string
  melhorCidade: string
  melhorCidadeLeads: number
}

export interface InsightPublico {
  id: string
  segmentoId?: string
  severidade: SeveridadeInsight
  titulo: string
  mensagem: string
  analiseCompleta: string
  labelAcao: string
}

export interface FiltrosPublicos {
  campanha: string
  conjunto: string
  metrica: MetricaPublicos
  campaign_id?: string
}
