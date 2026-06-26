'use client'

import React, { useState } from 'react'
import { Plus, Trash2, Clock, DollarSign } from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

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
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Serviços/procedimentos do catálogo. A duração guia os horários disponíveis.
        </p>
        <Button onClick={() => setIsPanelOpen(true)}>
          <Plus size={16} />
          Novo serviço
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Serviço</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Agenda</th>
                <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Duração</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Preço</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {servicos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center italic text-muted-foreground">
                    Nenhum serviço cadastrado.
                  </td>
                </tr>
              ) : (
                servicos.map((s) => (
                  <tr key={s.id} className="group transition-colors hover:bg-muted/40">
                    <td className="px-6 py-4"><span className="text-sm font-medium text-foreground">{s.nome}</span></td>
                    <td className="px-6 py-4">
                      <Badge
                        variant="outline"
                        className="whitespace-nowrap border-transparent text-[10px] font-semibold"
                        style={{ color: getAgendaColor(s.agenda_id), backgroundColor: `${getAgendaColor(s.agenda_id)}1F` }}
                      >
                        {getAgendaNome(s.agenda_id)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-sm text-muted-foreground">{s.duracao_minutos} min</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm text-muted-foreground">{s.preco != null ? `R$ ${Number(s.preco).toFixed(2)}` : '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="destructive" size="icon-sm" onClick={() => removerServico(s.id)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de novo serviço */}
      <Dialog open={isPanelOpen} onOpenChange={setIsPanelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo serviço</DialogTitle>
            <DialogDescription>Procedimento com duração e preço</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-4">
            <div className="space-y-1.5">
              <label className="ds-label">Nome do serviço *</label>
              <Input
                placeholder="Ex: Avaliação, Limpeza, Consulta"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="ds-label">Agenda</label>
              <Select value={form.agenda_id} onValueChange={(val) => setForm({ ...form, agenda_id: val })}>
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue placeholder="Selecione a agenda" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Todas as agendas</SelectItem>
                  {agendas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ backgroundColor: a.cor }} />
                        {a.nome}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="ds-label flex items-center gap-1.5"><Clock size={10} /> Duração</label>
                <Select value={String(form.duracao_minutos)} onValueChange={(val) => setForm({ ...form, duracao_minutos: Number(val) })}>
                  <SelectTrigger className="h-8 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURACOES.map((d) => (
                      <SelectItem key={d} value={String(d)}>{d} min</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="ds-label flex items-center gap-1.5"><DollarSign size={10} /> Preço (opcional)</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0,00"
                  value={form.preco}
                  onChange={(e) => setForm({ ...form, preco: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsPanelOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd}>Salvar serviço</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
