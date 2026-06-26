'use client'

import React, { useState, useMemo } from 'react'
import { Search, Plus, Calendar, Clock, Trash2, Pencil } from 'lucide-react'
import { Bloqueio } from '@/types/agenda'
import { useAgendas } from '@/hooks/use-agendas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { format, parseISO } from 'date-fns'

export function ConfigBloqueios() {
  const { agendas, bloqueios, adicionarBloqueio, removerBloqueio } = useAgendas()

  const [busca, setBusca] = useState('')
  const [isPanelOpen, setIsPanelOpen] = useState(false)

  const [form, setForm] = useState({
    agenda_id: 'global',
    inicio: '',
    fim: '',
    tipo: 'reuniao' as Bloqueio['tipo'],
    motivo: '',
    observacoes: '',
  })

  const filteredBloqueios = useMemo(() => {
    if (!busca) return bloqueios
    const q = busca.toLowerCase()
    return bloqueios.filter((b) => b.motivo.toLowerCase().includes(q))
  }, [bloqueios, busca])

  const handleAdd = async () => {
    if (!form.inicio || !form.fim || !form.motivo) return

    await adicionarBloqueio({
      agenda_id: form.agenda_id === 'global' ? null : form.agenda_id,
      inicio: new Date(form.inicio).toISOString(),
      fim: new Date(form.fim).toISOString(),
      tipo: form.tipo,
      motivo: form.motivo,
    })

    setIsPanelOpen(false)
    setForm({ agenda_id: 'global', inicio: '', fim: '', tipo: 'reuniao', motivo: '', observacoes: '' })
  }

  const getAgendaColor = (id: string | null) => (!id ? '#6B7280' : agendas.find((a) => a.id === id)?.cor || '#6B7280')
  const getAgendaNome = (id: string | null) => (!id ? 'Global da clínica' : agendas.find((a) => a.id === id)?.nome || 'Agenda removida')

  return (
    <div className="space-y-6">
      {/* Search & Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input
            placeholder="Buscar por motivo..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-10"
          />
        </div>

        <Button onClick={() => setIsPanelOpen(true)}>
          <Plus size={16} />
          Novo bloqueio
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Intervalo</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Agenda</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Motivo</th>
                <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Criado em</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredBloqueios.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center italic text-muted-foreground">
                    Nenhum bloqueio encontrado.
                  </td>
                </tr>
              ) : (
                filteredBloqueios.map((b) => (
                  <tr key={b.id} className="group transition-colors hover:bg-muted/40">
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-foreground">
                          {format(parseISO(b.inicio), 'dd/MM/yyyy HH:mm')}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          até {format(parseISO(b.fim), 'dd/MM/yyyy HH:mm')}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        variant="outline"
                        className="whitespace-nowrap border-transparent text-[10px] font-semibold"
                        style={{ color: getAgendaColor(b.agenda_id), backgroundColor: `${getAgendaColor(b.agenda_id)}1F` }}
                      >
                        {getAgendaNome(b.agenda_id)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-muted-foreground">{b.motivo}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-[11px] text-muted-foreground">{format(parseISO(b.created_at), 'dd/MM/yy')}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="icon-sm">
                          <Pencil size={14} />
                        </Button>
                        <Button variant="destructive" size="icon-sm" onClick={() => removerBloqueio(b.id)}>
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

      {/* Modal de novo bloqueio */}
      <Dialog open={isPanelOpen} onOpenChange={setIsPanelOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo bloqueio</DialogTitle>
            <DialogDescription>Impedir agendamentos em um período</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-4">
            {/* Agenda */}
            <div className="space-y-1.5">
              <label className="ds-label">Agenda</label>
              <Select value={form.agenda_id} onValueChange={(val) => setForm({ ...form, agenda_id: val })}>
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue placeholder="Selecione a agenda" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global da clínica</SelectItem>
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

            {/* Intervalo */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="ds-label flex items-center gap-1.5"><Calendar size={10} /> Início *</label>
                <Input
                  type="datetime-local"
                  value={form.inicio}
                  onChange={(e) => setForm({ ...form, inicio: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="ds-label flex items-center gap-1.5"><Clock size={10} /> Fim *</label>
                <Input
                  type="datetime-local"
                  value={form.fim}
                  onChange={(e) => setForm({ ...form, fim: e.target.value })}
                />
              </div>
            </div>

            {/* Tipo */}
            <div className="space-y-1.5">
              <label className="ds-label">Motivo principal *</label>
              <Select value={form.tipo} onValueChange={(val: Bloqueio['tipo']) => setForm({ ...form, tipo: val })}>
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reuniao">Reunião</SelectItem>
                  <SelectItem value="feriado">Feriado</SelectItem>
                  <SelectItem value="agenda_cheia">Agenda cheia</SelectItem>
                  <SelectItem value="manutencao">Manutenção</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <label className="ds-label">Descrição detalhada *</label>
              <Input
                placeholder="Ex: Reunião mensal de alinhamento..."
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              />
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <label className="ds-label">Observações adicionais</label>
              <Textarea
                rows={3}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                placeholder="Notas internas..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsPanelOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd}>Confirmar bloqueio</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
