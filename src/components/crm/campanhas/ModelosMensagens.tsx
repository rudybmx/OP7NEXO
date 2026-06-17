'use client'

import React, { useState } from 'react'
import { 
  Plus, 
  Search, 
  MessageSquare, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Filter, 
  RefreshCw,
  Archive,
  MoreVertical,
  FileText,
  Smartphone,
  Info
} from 'lucide-react'

// --- Mock Data ---

interface Modelo {
  id: string
  nome: string
  corpo: string
  tipo: 'Marketing' | 'Utilidade' | 'Atendimento'
  canal: 'WhatsApp' | 'SMS'
  disponibilidade: string
  status: 'EM ANÁLISE' | 'APROVADO' | 'REPROVADO'
}

const MODELOS_MOCK: Modelo[] = [
  { 
    id: '1', 
    nome: 'Promoção Clareamento 2026', 
    corpo: 'Olá, {{pnome}}! ✨ Que tal renovar seu sorriso na BMK Marketing? Ganhe 20% de desconto em nosso clareamento a laser este mês. Vamos agendar uma avaliação?', 
    tipo: 'Marketing', 
    canal: 'WhatsApp',
    disponibilidade: 'Toda a empresa',
    status: 'EM ANÁLISE'
  },
  { 
    id: '2', 
    nome: 'Check-up Kids Preventivo', 
    corpo: 'Oi, {{pnome}}! 🦷 A saúde bucal dos pequenos é prioridade. Traga seu filho para um check-up preventivo e ganhe um kit de higiene exclusivo.', 
    tipo: 'Marketing', 
    canal: 'WhatsApp',
    disponibilidade: 'Toda a empresa',
    status: 'APROVADO'
  },
  { 
    id: '3', 
    nome: 'Lembrete de Agendamento', 
    corpo: 'Olá, {{pnome}}! Passando para lembrar da sua consulta amanhã às {{hora}} na unidade {{unidade}}. Confirma sua presença?', 
    tipo: 'Utilidade', 
    canal: 'WhatsApp',
    disponibilidade: 'Unidade Londrina',
    status: 'APROVADO'
  },
  { 
    id: '4', 
    nome: 'Campanha Implante 24x', 
    corpo: '{{pnome}}, volte a sorrir com confiança! 😁 Realize seu sonho do implante com parcelas que cabem no seu bolso. Em até 24x fixas. Quer saber mais?', 
    tipo: 'Marketing', 
    canal: 'WhatsApp',
    disponibilidade: 'Toda a empresa',
    status: 'REPROVADO'
  },
]

export function ModelosMensagens() {
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('Todos os tipos')

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ws-navy)] dark:text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-[var(--ws-blue)]" />
            Modelos de mensagem
          </h1>
          <p className="text-sm text-muted-foreground">
            {MODELOS_MOCK.length} modelos encontrados para aprovação da Meta.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
            <RefreshCw className="w-3.5 h-3.5" />
            Sincronizar
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-[var(--ws-blue)] text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-[var(--ws-blue)]/90 transition-all shadow-lg shadow-blue-500/20">
            <Plus className="w-3.5 h-3.5" />
            Novo Modelo
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
            placeholder="Digite para pesquisar..."
            className="w-full h-10 pl-9 pr-4 bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ws-blue)]/20 transition-all"
          />
        </div>
        <select className="h-10 px-4 bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-lg text-sm outline-none min-w-[160px]">
          <option>Todos os tipos</option>
          <option>Marketing</option>
          <option>Utilidade</option>
          <option>Atendimento</option>
        </select>
        <select className="h-10 px-4 bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-lg text-sm outline-none min-w-[160px]">
          <option>Todos os canais</option>
          <option>WhatsApp</option>
          <option>SMS</option>
        </select>
        <div className="flex items-center gap-2 px-2">
          <input type="checkbox" id="arquivados" className="w-4 h-4 rounded border-slate-300 text-[var(--ws-blue)] focus:ring-[var(--ws-blue)]" />
          <label htmlFor="arquivados" className="text-xs font-medium text-slate-500">Arquivados</label>
        </div>
      </div>

      {/* Tabela de Modelos */}
      <div className="bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[14px] backdrop-blur-[16px] overflow-hidden shadow-[var(--ws-glass-shadow)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-white/5 border-b border-[var(--ws-glass-border)]">
                <th className="px-6 py-4 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Modelo</th>
                <th className="px-6 py-4 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Tipo</th>
                <th className="px-6 py-4 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Disponibilidade</th>
                <th className="px-6 py-4 text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {MODELOS_MOCK.map((modelo) => (
                <tr key={modelo.id} className="hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="w-5 h-5 text-slate-400" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[var(--ws-navy)] dark:text-white">{modelo.nome}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-slate-500 font-bold uppercase tracking-wider">
                            {modelo.tipo}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed max-w-lg">
                          {modelo.corpo}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 align-top">
                    <span className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">Atendimento</span>
                  </td>
                  <td className="px-6 py-5 align-top">
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Smartphone className="w-3.5 h-3.5" />
                        +55 11 9999-0000
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400">
                        {modelo.disponibilidade}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 align-top">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider ${
                        modelo.status === 'APROVADO' ? 'bg-green-100 text-green-700' :
                        modelo.status === 'REPROVADO' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {modelo.status}
                      </span>
                      <button className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg">
                        <MoreVertical size={16} className="text-slate-400" />
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
