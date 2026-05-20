'use client'

import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FASES_LABELS, CATEGORIAS_LABELS } from '@/types/pmp'
import type { TaskPhase, TaskCategory } from '@/types/pmp'

interface PmpTaskCreateModalProps {
  open: boolean
  onClose: () => void
  onSalvar: (data: {
    title: string
    phase: TaskPhase
    category: TaskCategory
    start_date: string
    end_date: string
    description?: string
    responsible_email?: string
  }) => Promise<void>
}

const FASE_OPTIONS = Object.entries(FASES_LABELS) as [TaskPhase, string][]
const CATEGORIA_OPTIONS = Object.entries(CATEGORIAS_LABELS) as [TaskCategory, string][]

export default function PmpTaskCreateModal({ open, onClose, onSalvar }: PmpTaskCreateModalProps) {
  const [title, setTitle] = useState('')
  const [phase, setPhase] = useState<TaskPhase>('diagnostico')
  const [category, setCategory] = useState<TaskCategory>('OUTRO')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [description, setDescription] = useState('')
  const [responsibleEmail, setResponsibleEmail] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setTitle('')
      setPhase('diagnostico')
      setCategory('OUTRO')
      setStartDate('')
      setEndDate('')
      setDescription('')
      setResponsibleEmail('')
    }
  }, [open])

  if (!open) return null

  async function handleSalvar() {
    if (!title.trim()) {
      toast.error('Título é obrigatório')
      return
    }
    if (!startDate || !endDate) {
      toast.error('Data de início e fim são obrigatórias')
      return
    }
    if (endDate < startDate) {
      toast.error('Data de fim deve ser após a data de início')
      return
    }
    setSaving(true)
    try {
      await onSalvar({
        title: title.trim(),
        phase,
        category,
        start_date: startDate,
        end_date: endDate,
        description: description.trim() || undefined,
        responsible_email: responsibleEmail.trim() || undefined,
      })
      toast.success('Tarefa criada com sucesso!')
      onClose()
    } catch {
      toast.error('Erro ao criar tarefa')
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

      <div
        className="relative z-10 w-full max-w-lg rounded-2xl p-6 shadow-2xl"
        style={glassStyle}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-foreground">Nova Tarefa</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/30"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">
              Título *
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Criar calendário editorial de maio"
              className="bg-transparent"
              style={{ border: '1px solid var(--ws-glass-border)' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">
                Fase *
              </label>
              <Select value={phase} onValueChange={(v) => setPhase(v as TaskPhase)}>
                <SelectTrigger className="bg-transparent" style={{ border: '1px solid var(--ws-glass-border)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ ...glassStyle, borderRadius: 10 }}>
                  {FASE_OPTIONS.map(([id, label]) => (
                    <SelectItem key={id} value={id}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">
                Categoria *
              </label>
              <Select value={category} onValueChange={(v) => setCategory(v as TaskCategory)}>
                <SelectTrigger className="bg-transparent" style={{ border: '1px solid var(--ws-glass-border)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ ...glassStyle, borderRadius: 10 }}>
                  {CATEGORIA_OPTIONS.map(([id, label]) => (
                    <SelectItem key={id} value={id}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">
                Início *
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent"
                style={{ border: '1px solid var(--ws-glass-border)' }}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">
                Fim *
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent"
                style={{ border: '1px solid var(--ws-glass-border)' }}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">
              Responsável (e-mail)
            </label>
            <Input
              type="email"
              value={responsibleEmail}
              onChange={(e) => setResponsibleEmail(e.target.value)}
              placeholder="usuario@exemplo.com"
              className="bg-transparent"
              style={{ border: '1px solid var(--ws-glass-border)' }}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">
              Descrição
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Detalhe o escopo ou objetivo da tarefa..."
              className="w-full resize-none rounded-md bg-transparent px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[var(--ws-gold)]"
              style={{ border: '1px solid var(--ws-glass-border)' }}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="text-foreground hover:bg-muted/30"
            style={{ border: '1px solid var(--ws-glass-border-strong)' }}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={handleSalvar}
            className="border-[var(--ws-gold)] bg-[var(--ws-gold)] text-white hover:bg-[#b8943d]"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar tarefa
          </Button>
        </div>
      </div>
    </div>
  )
}
