'use client'

import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface PmpPlanCreateModalProps {
  open: boolean
  onClose: () => void
  onSalvar: (data: {
    client_name: string
    title: string
    start_date: string
    end_date: string
  }) => Promise<void>
}

export default function PmpPlanCreateModal({ open, onClose, onSalvar }: PmpPlanCreateModalProps) {
  const [clientName, setClientName] = useState('')
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setClientName('')
      setTitle('')
      setStartDate('')
      setEndDate('')
    }
  }, [open])

  if (!open) return null

  async function handleSalvar() {
    if (!clientName.trim()) { toast.error('Nome do cliente é obrigatório'); return }
    if (!title.trim()) { toast.error('Título é obrigatório'); return }
    if (!startDate || !endDate) { toast.error('Datas são obrigatórias'); return }
    if (endDate < startDate) { toast.error('Data de fim deve ser após o início'); return }
    setSaving(true)
    try {
      await onSalvar({ client_name: clientName.trim(), title: title.trim(), start_date: startDate, end_date: endDate })
      toast.success('Plano criado!')
      onClose()
    } catch {
      toast.error('Erro ao criar plano')
    } finally {
      setSaving(false)
    }
  }

  const glassStyle = {
    background: 'var(--ws-glass-bg)',
    border: '1px solid var(--ws-glass-border)',
    backdropFilter: 'blur(20px)',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl p-6 shadow-2xl" style={glassStyle}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-foreground">Novo Plano PMP</h2>
          <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/30">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">Nome do Cliente *</label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Ex: OdontoCompany RJ Barra"
              className="bg-transparent"
              style={{ border: '1px solid var(--ws-glass-border)' }}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">Título do Plano *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: PMP 2026 — Campanha Implantes"
              className="bg-transparent"
              style={{ border: '1px solid var(--ws-glass-border)' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">Início *</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent" style={{ border: '1px solid var(--ws-glass-border)' }} />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">Fim *</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent" style={{ border: '1px solid var(--ws-glass-border)' }} />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} className="text-foreground hover:bg-muted/30" style={{ border: '1px solid var(--ws-glass-border-strong)' }}>
            Cancelar
          </Button>
          <Button type="button" disabled={saving} onClick={handleSalvar} className="border-[var(--ws-gold)] bg-[var(--ws-gold)] text-white hover:bg-[#b8943d]">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar plano
          </Button>
        </div>
      </div>
    </div>
  )
}
