'use client'

import React, { useState } from 'react'
import { Plus, X, Trash2, Clock, DollarSign } from 'lucide-react'
import { useAgendas } from '@/hooks/use-agendas'
import { useServicos } from '@/hooks/use-servicos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const DURACOES = [15, 30, 45, 60, 90, 120]

export function ConfigServicos() {
  const { agendas } = useAgendas()
  const { servicos, criarServico, removerServico } = useServicos()

  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [form, setForm] = useState({ agenda_id: 'global', nome: '', duracao_minutos: 30, preco: '' })

  const getAgendaColor = (id: string | null) => (!id ? '#6B7280' : agendas.find((a) => a.id === id)?.cor || '#6B7280')
  const getAgendaNome = (id: string | null) => (!id ? 'Todas as agendas' : agendas.find((a) => a.id === id)?.nome || 'Agenda removida')

  const handleAdd = async () => {
    if (!form.nome.trim()) return
    const ok = await criarServico({
      agenda_id: form.agenda_id === 'global' ? null : form.agenda_id,
      nome: form.nome.trim(),
      duracao_minutos: form.duracao_minutos,
      preco: form.preco ? Number(form.preco) : null,
    })
    if (ok) {
      setIsPanelOpen(false)
      setForm({ agenda_id: 'global', nome: '', duracao_minutos: 30, preco: '' })
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 relative min-h-[600px]">
      {/* Actions */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-white/50">Serviços/procedimentos do catálogo. A duração guia os horários disponíveis.</p>
        <Button
          onClick={() => setIsPanelOpen(true)}
          className="gap-2"
          style={{ background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))', borderRadius: 'var(--ws-radius-md)', border: 'none' }}
        >
          <Plus size={18} />
          Novo Serviço
        </Button>
      </div>

      {/* Table */}
      <div
        className="relative overflow-hidden"
        style={{ background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)', borderRadius: 'var(--ws-radius-lg)', backdropFilter: 'blur(16px)', boxShadow: 'var(--ws-glass-shadow)' }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)', pointerEvents: 'none' }} />
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Serviço</th>
                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Agenda</th>
                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest text-center">Duração</th>
                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest text-right">Preço</th>
                <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {servicos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-white/20 italic">Nenhum serviço cadastrado.</td>
                </tr>
              ) : (
                servicos.map((s) => (
                  <tr key={s.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4"><span className="text-sm font-medium text-white">{s.nome}</span></td>
                    <td className="px-6 py-4">
                      <Badge
                        variant="outline"
                        className="text-[10px] font-semibold border-white/10 px-2 py-0.5 whitespace-nowrap"
                        style={{ color: getAgendaColor(s.agenda_id), backgroundColor: `${getAgendaColor(s.agenda_id)}15` }}
                      >
                        {getAgendaNome(s.agenda_id)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-sm text-white/80">{s.duracao_minutos} min</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm text-white/80">{s.preco != null ? `R$ ${Number(s.preco).toFixed(2)}` : '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => removerServico(s.id)}
                          className="p-2 h-8 w-8 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sliding Panel */}
      {isPanelOpen && (
        <div className="absolute inset-0 z-50">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsPanelOpen(false)} />
          <div className="absolute top-0 left-0 bottom-0 w-[480px] bg-[#0E142A] border-r border-white/10 shadow-2xl animate-in slide-in-from-left duration-300 flex flex-col">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Novo Serviço</h2>
                <p className="text-xs text-white/40 mt-1 uppercase tracking-widest">Procedimento com duração e preço</p>
              </div>
              <button onClick={() => setIsPanelOpen(false)} className="p-2 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
              <div
                className="relative p-6 space-y-6"
                style={{ background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)', borderRadius: 'var(--ws-radius-lg)', backdropFilter: 'blur(16px)', boxShadow: 'var(--ws-glass-shadow)' }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)', pointerEvents: 'none' }} />

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Nome do serviço *</label>
                  <Input
                    placeholder="Ex: Avaliação, Limpeza, Consulta"
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    className="bg-black/20 border-white/10 text-white placeholder:text-white/20"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Agenda</label>
                  <Select value={form.agenda_id} onValueChange={(val) => setForm({ ...form, agenda_id: val })}>
                    <SelectTrigger className="bg-black/20 border-white/10 text-white">
                      <SelectValue placeholder="Selecione a agenda" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0E142A] border-white/10 text-white">
                      <SelectItem value="global" className="focus:bg-white/10 focus:text-white">Todas as agendas</SelectItem>
                      {agendas.map((a) => (
                        <SelectItem key={a.id} value={a.id} className="focus:bg-white/10 focus:text-white">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: a.cor }} />
                            <span>{a.nome}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1.5">
                      <Clock size={10} /> Duração
                    </label>
                    <Select value={String(form.duracao_minutos)} onValueChange={(val) => setForm({ ...form, duracao_minutos: Number(val) })}>
                      <SelectTrigger className="bg-black/20 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#0E142A] border-white/10 text-white">
                        {DURACOES.map((d) => (
                          <SelectItem key={d} value={String(d)}>{d} min</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1.5">
                      <DollarSign size={10} /> Preço (opcional)
                    </label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0,00"
                      value={form.preco}
                      onChange={(e) => setForm({ ...form, preco: e.target.value })}
                      className="bg-black/20 border-white/10 text-white placeholder:text-white/20"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-white/10">
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => setIsPanelOpen(false)} className="flex-1 bg-transparent border-white/10 text-white hover:bg-white/5">
                  Cancelar
                </Button>
                <Button
                  onClick={handleAdd}
                  className="flex-1 font-bold shadow-lg"
                  style={{ background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))', borderRadius: 'var(--ws-radius-md)', border: 'none' }}
                >
                  Salvar Serviço
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
