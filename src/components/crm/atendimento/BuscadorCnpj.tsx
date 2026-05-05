'use client'

import React, { useState, useMemo } from 'react'
import { 
  Search, 
  MapPin, 
  Briefcase, 
  Send, 
  Eye, 
  EyeOff, 
  Loader2, 
  CheckCircle2,
  ExternalLink,
  Filter,
  Users,
  Sparkles
} from 'lucide-react'

// --- Mock Data ---

const CIDADES = [
  'Londrina, PR',
  'Maringá, PR',
  'Curitiba, PR',
  'São Paulo, SP',
  'Campinas, SP',
  'São José dos Campos, SP',
  'Belo Horizonte, MG',
  'Uberlândia, MG',
]

const SEGMENTOS = [
  'Clínicas de Estética',
  'Clínicas Odontológicas',
  'Pet Shops',
  'Oficinas Mecânicas',
  'Escolas de Idiomas',
  'Academias',
  'Restaurantes e Cafés',
  'Lojas de Construção',
]

interface Lead {
  id: string
  nome: string
  segmento: string
  cidade: string
  telefone: string
  endereco: string
  visualizado: boolean
  status: 'pendente' | 'enviado'
}

const MOCK_LEADS: Lead[] = [
  { id: '1', nome: 'Sorriso Ideal Londrina', segmento: 'Clínicas Odontológicas', cidade: 'Londrina, PR', telefone: '(43) 3322-1100', endereco: 'Av. Higienópolis, 1200', visualizado: false, status: 'pendente' },
  { id: '2', nome: 'Odonto Master', segmento: 'Clínicas Odontológicas', cidade: 'Londrina, PR', telefone: '(43) 3025-4455', endereco: 'Rua Sergipe, 450', visualizado: true, status: 'pendente' },
  { id: '3', nome: 'Clínica Dr. Silva', segmento: 'Clínicas Odontológicas', cidade: 'Londrina, PR', telefone: '(43) 99988-7766', endereco: 'Rua Pernambuco, 880', visualizado: false, status: 'pendente' },
  { id: '4', nome: 'Estética & Saúde', segmento: 'Clínicas de Estética', cidade: 'Londrina, PR', telefone: '(43) 3344-5566', endereco: 'Rua Ayrton Senna, 150', visualizado: false, status: 'pendente' },
]

export function BuscadorCnpj() {
  const [cidade, setCidade] = useState('Londrina, PR')
  const [segmento, setSegmento] = useState('Clínicas Odontológicas')
  const [isSearching, setIsSearching] = useState(false)
  const [leads, setLeads] = useState<Lead[]>([])
  const [hasSearched, setHasSearched] = useState(false)

  const handleSearch = () => {
    setIsSearching(true)
    setHasSearched(true)
    
    // Simula scraping de 2 segundos
    setTimeout(() => {
      setLeads(MOCK_LEADS.filter(l => l.cidade === cidade || l.segmento === segmento))
      setIsSearching(false)
    }, 2000)
  }

  const toggleVisualizado = (id: string) => {
    setLeads(prev => prev.map(l => 
      l.id === id ? { ...l, visualizado: !l.visualizado } : l
    ))
  }

  const enviarParaAgente = (id: string) => {
    setLeads(prev => prev.map(l => 
      l.id === id ? { ...l, status: 'enviado' } : l
    ))
    // Aqui no futuro integraria com o backend
    alert('Lead enviado para o agente! Uma nova conversa será iniciada automaticamente.')
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ws-navy)] dark:text-white flex items-center gap-2">
            <Search className="w-6 h-6 text-[var(--ws-blue)]" />
            Buscador Inteligente de Leads (CNPJ/Maps)
          </h1>
          <p className="text-sm text-muted-foreground">
            Encontre novos parceiros e clientes através de inteligência geográfica e web scraping.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                AI
              </div>
            ))}
          </div>
          <span className="text-xs font-medium text-slate-500">Inteligência Ativa</span>
        </div>
      </div>

      {/* Form de Busca */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] p-6 rounded-[14px] backdrop-blur-[16px] shadow-[var(--ws-glass-shadow)]">
        <div className="space-y-2">
          <label className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground flex items-center gap-1.5">
            <MapPin className="w-3 h-3" />
            Cidade
          </label>
          <select 
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            className="w-full h-10 px-3 bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ws-blue)]"
          >
            {CIDADES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Briefcase className="w-3 h-3" />
            Segmento de Atuação
          </label>
          <select 
            value={segmento}
            onChange={(e) => setSegmento(e.target.value)}
            className="w-full h-10 px-3 bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ws-blue)]"
          >
            {SEGMENTOS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className="w-full h-10 bg-[var(--ws-blue)] hover:bg-[var(--ws-blue)]/90 disabled:opacity-50 text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
          >
            {isSearching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scraping em curso...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Pesquisar Agora
              </>
            )}
          </button>
        </div>
      </div>

      {/* Resultados */}
      {hasSearched && (
        <div className="bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[14px] backdrop-blur-[16px] overflow-hidden shadow-[var(--ws-glass-shadow)]">
          <div className="px-6 py-4 border-bottom border-[var(--ws-glass-border)] flex items-center justify-between bg-slate-50/50 dark:bg-white/5">
            <h3 className="text-sm font-bold text-[var(--ws-navy)] dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--ws-blue)]" />
              Empresas Encontradas ({leads.length})
            </h3>
            <div className="flex items-center gap-2">
               <button className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-md border border-slate-200 dark:border-white/10 hover:bg-white/10 transition-colors">
                  Exportar CSV
               </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/30 dark:bg-white/5 border-y border-[var(--ws-glass-border)]">
                  <th className="px-6 py-3 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Empresa</th>
                  <th className="px-6 py-3 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Contato / Endereço</th>
                  <th className="px-6 py-3 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Segmento</th>
                  <th className="px-6 py-3 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Status</th>
                  <th className="px-6 py-3 text-[10px] uppercase font-bold text-muted-foreground tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {leads.length > 0 ? leads.map((lead) => (
                  <tr 
                    key={lead.id} 
                    className={`hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors ${lead.visualizado ? 'opacity-60 bg-slate-50/20' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="font-semibold text-sm text-[var(--ws-navy)] dark:text-white">{lead.nome}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">CNPJ: Gerado pela Busca</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm flex items-center gap-1.5">
                        <span className="text-[var(--ws-blue)] font-medium">{lead.telefone}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {lead.endereco}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 font-medium">
                        {lead.segmento}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {lead.status === 'enviado' ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-[var(--ws-green)] uppercase tracking-wider">
                            <CheckCircle2 className="w-3 h-3" />
                            Com Agente
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Aguardando</span>
                        )}
                        {lead.visualizado && (
                          <span className="text-[9px] text-slate-400 font-medium italic">Visualizado</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => toggleVisualizado(lead.id)}
                          title={lead.visualizado ? "Marcar como não visto" : "Marcar como visto"}
                          className={`p-2 rounded-lg border transition-all ${
                            lead.visualizado 
                              ? 'bg-slate-100 border-slate-200 text-slate-400' 
                              : 'bg-white border-slate-200 text-slate-600 hover:border-[var(--ws-blue)] hover:text-[var(--ws-blue)]'
                          } dark:bg-white/5 dark:border-white/10`}
                        >
                          {lead.visualizado ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        
                        <button
                          onClick={() => enviarParaAgente(lead.id)}
                          disabled={lead.status === 'enviado'}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-xs transition-all ${
                            lead.status === 'enviado'
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                              : 'bg-[var(--ws-blue)] text-white hover:bg-[var(--ws-blue)]/90 shadow-sm'
                          }`}
                        >
                          {lead.status === 'enviado' ? (
                            <>Vincular</>
                          ) : (
                            <>
                              <Send size={14} />
                              Enviar p/ Agente
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground text-sm">
                      Nenhum resultado encontrado para os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dicas de IA */}
      {!hasSearched && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 p-4 rounded-xl flex gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-800/50 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-[var(--ws-blue)]" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100">Dica da IA Agente</h4>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1 leading-relaxed">
                Empresas em "Londrina" com o segmento "Clínicas Odontológicas" costumam ter maior taxa de conversão no período da manhã. Posso sugerir uma lista de contatos priorizada?
              </p>
            </div>
          </div>
          
          <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 p-4 rounded-xl flex gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-800/50 flex items-center justify-center flex-shrink-0">
              <Filter className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-900 dark:text-amber-100">Filtros Inteligentes</h4>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 leading-relaxed">
                Você já pesquisou este segmento em Londrina há 15 dias. Deseja filtrar apenas por novos estabelecimentos cadastrados no Google Maps desde então?
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
