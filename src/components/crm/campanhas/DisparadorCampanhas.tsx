'use client'

import React, { useState } from 'react'
import { 
  Plus, 
  Search, 
  Send, 
  CheckCircle2, 
  XCircle, 
  PauseCircle, 
  Clock, 
  BarChart3, 
  MoreVertical,
  Calendar,
  Users,
  MessageCircle,
  RefreshCw
} from 'lucide-react'

// --- Mock Data ---

interface Campanha {
  id: string
  nome: string
  dataDisparo: string
  destinatarios: number
  canal: 'WhatsApp' | 'SMS'
  status: 'Concluída' | 'Cancelada' | 'Pausada' | 'Agendada'
}

const CAMPANHAS_MOCK: Campanha[] = [
  { id: '1', nome: 'Disparo Clareamento Londrina', dataDisparo: '29/04/2026 15:35', destinatarios: 1147, canal: 'WhatsApp', status: 'Concluída' },
  { id: '2', nome: 'Reativação Leads Inativos', dataDisparo: '29/04/2026 10:50', destinatarios: 1911, canal: 'WhatsApp', status: 'Cancelada' },
  { id: '3', nome: 'Check-up Kids - Maço 2026', dataDisparo: '28/04/2026 23:22', destinatarios: 1911, canal: 'WhatsApp', status: 'Cancelada' },
  { id: '4', nome: 'Aviso Feriado Unidades', dataDisparo: '28/04/2026 20:49', destinatarios: 1, canal: 'WhatsApp', status: 'Pausada' },
  { id: '5', nome: 'Promoção Implante 24x', dataDisparo: '28/04/2026 20:43', destinatarios: 1250, canal: 'WhatsApp', status: 'Concluída' },
  { id: '6', nome: 'Lembrete Limpeza Semestral', dataDisparo: '28/04/2026 20:36', destinatarios: 850, canal: 'WhatsApp', status: 'Concluída' },
  { id: '7', nome: 'Teste Fluxo IA Agente', dataDisparo: '28/04/2026 20:19', destinatarios: 10, canal: 'WhatsApp', status: 'Concluída' },
  { id: '8', nome: 'Agendamento Campanha SP', dataDisparo: '05/05/2026 14:00', destinatarios: 500, canal: 'WhatsApp', status: 'Agendada' },
]

export function DisparadorCampanhas() {
  const [busca, setBusca] = useState('')

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ws-navy)] dark:text-white flex items-center gap-2">
            <Send className="w-6 h-6 text-[var(--ws-blue)]" />
            Campanhas
          </h1>
          <p className="text-sm text-muted-foreground">
            {CAMPANHAS_MOCK.length} campanhas encontradas na sua conta.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-all text-slate-500">
            <RefreshCw size={18} />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-[var(--ws-blue)] text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-[var(--ws-blue)]/90 transition-all shadow-lg shadow-blue-500/20">
            <Plus className="w-3.5 h-3.5" />
            Nova Campanha
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input 
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Pesquisar..."
            className="w-full h-10 pl-9 pr-4 bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ws-blue)]/20 transition-all"
          />
        </div>
        <select className="h-10 px-4 bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-lg text-sm outline-none min-w-[200px]">
          <option>Situação: Todas</option>
          <option>Concluída</option>
          <option>Cancelada</option>
          <option>Pausada</option>
          <option>Agendada</option>
        </select>
        <div className="relative">
          <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input 
            type="text"
            placeholder="Período: Início - Fim"
            className="h-10 pl-9 pr-4 bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-lg text-sm outline-none min-w-[240px]"
          />
        </div>
        <div className="flex items-center gap-2 px-2">
          <input type="checkbox" id="arquivadas-camp" className="w-4 h-4 rounded border-slate-300 text-[var(--ws-blue)] focus:ring-[var(--ws-blue)]" />
          <label htmlFor="arquivadas-camp" className="text-xs font-medium text-slate-500">Arquivadas</label>
        </div>
      </div>

      {/* Tabela de Campanhas */}
      <div className="bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[14px] backdrop-blur-[16px] overflow-hidden shadow-[var(--ws-glass-shadow)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-white/5 border-b border-[var(--ws-glass-border)]">
                <th className="px-6 py-4 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Nome</th>
                <th className="px-6 py-4 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Data de disparo</th>
                <th className="px-6 py-4 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Destinatários</th>
                <th className="px-6 py-4 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Canal</th>
                <th className="px-6 py-4 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Status</th>
                <th className="px-6 py-4 text-[10px] uppercase font-bold text-muted-foreground tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {CAMPANHAS_MOCK.map((campanha) => (
                <tr key={campanha.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-400">
                        <BarChart3 size={16} />
                      </div>
                      <span className="font-bold text-sm text-[var(--ws-navy)] dark:text-white">{campanha.nome}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                      <Clock size={12} className="text-slate-400" />
                      {campanha.dataDisparo}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                      <Users size={12} className="text-slate-400" />
                      {campanha.destinatarios.toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <MessageCircle size={14} className="text-[var(--ws-blue)]" />
                      {campanha.canal}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                      campanha.status === 'Concluída' ? 'bg-green-100 text-green-700' :
                      campanha.status === 'Cancelada' ? 'bg-orange-100 text-orange-700' :
                      campanha.status === 'Pausada' ? 'bg-slate-200 text-slate-600' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {campanha.status === 'Concluída' && <CheckCircle2 size={12} />}
                      {campanha.status === 'Cancelada' && <XCircle size={12} />}
                      {campanha.status === 'Pausada' && <PauseCircle size={12} />}
                      {campanha.status === 'Agendada' && <Clock size={12} />}
                      {campanha.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-white/5 transition-all text-slate-600 dark:text-slate-400">
                        <BarChart3 size={14} />
                        Visualizar relatório
                      </button>
                      <button className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-all text-slate-400">
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
