'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Copy, Flag, Loader2, Pencil, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  calcDeadlineTag,
  daysBetween,
  formatDateBR,
  getDeadlineTagClasses,
  getPriorityLabel,
  getStatusColor,
  getStatusLabel,
  hashColor,
} from '@/lib/gantt-utils'
import { cn } from '@/lib/utils'
import { CATEGORIAS_LABELS, FASES_LABELS } from '@/types/pmp'
import type { PmpTask, TaskCategory, TaskPhase, TaskStatus } from '@/types/pmp'
import type { TaskEditBody } from '@/hooks/use-pmp-tasks'

interface PmpTaskModalProps {
  task: PmpTask | null
  open: boolean
  onClose: () => void
  onStatusChange?: (taskId: string, update: { status: TaskStatus; completed_at?: string; blocked_reason?: string }) => Promise<void>
  onEdit?: (taskId: string, body: TaskEditBody) => Promise<void>
  onDuplicate?: (task: PmpTask) => Promise<void>
  onDelete?: (taskId: string) => Promise<void>
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'A fazer' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'done', label: 'Concluída' },
  { value: 'blocked', label: 'Bloqueada' },
]

const PRIORIDADE_OPTIONS = [
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
] as const

const FASE_OPTIONS = Object.entries(FASES_LABELS) as [TaskPhase, string][]
const CATEGORIA_OPTIONS = Object.entries(CATEGORIAS_LABELS) as [TaskCategory, string][]

export default function PmpTaskModal({
  task,
  open,
  onClose,
  onStatusChange,
  onEdit,
  onDuplicate,
  onDelete,
}: PmpTaskModalProps) {
  const [editMode, setEditMode] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // View mode: status change
  const [editingStatus, setEditingStatus] = useState<TaskStatus | null>(null)
  const [completedAt, setCompletedAt] = useState('')
  const [blockedReason, setBlockedReason] = useState('')
  const [savingStatus, setSavingStatus] = useState(false)

  // Edit mode: form fields
  const [editTitle, setEditTitle] = useState('')
  const [editPhase, setEditPhase] = useState<TaskPhase>('diagnostico')
  const [editCategory, setEditCategory] = useState<TaskCategory>('OUTRO')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [editResponsibleEmail, setEditResponsibleEmail] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPrioridade, setEditPrioridade] = useState<'baixa' | 'media' | 'alta'>('media')

  function populateEditForm(t: PmpTask) {
    setEditTitle(t.title)
    setEditPhase(t.phase)
    setEditCategory(t.category ?? 'OUTRO')
    setEditStartDate(t.startDate)
    setEditEndDate(t.endDate)
    setEditResponsibleEmail(t.responsibleEmail ?? '')
    setEditDescription(t.description ?? '')
    setEditPrioridade(t.priority)
  }

  useEffect(() => {
    if (task) {
      setEditMode(false)
      setConfirmDelete(false)
      setEditingStatus(null)
      setCompletedAt('')
      setBlockedReason('')
      populateEditForm(task)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id])

  function handleClose() {
    if (editMode) { setEditMode(false); return }
    onClose()
  }

  function handleStatusSelect(value: TaskStatus) {
    setEditingStatus(value)
    setCompletedAt(value === 'done' ? new Date().toISOString().slice(0, 10) : '')
    setBlockedReason('')
  }

  async function handleConfirmStatus() {
    if (!task || !editingStatus || !onStatusChange) return
    if (editingStatus === 'blocked' && !blockedReason.trim()) {
      toast.error('Informe o motivo do bloqueio')
      return
    }
    setSavingStatus(true)
    try {
      await onStatusChange(task.id, {
        status: editingStatus,
        completed_at: editingStatus === 'done' ? (completedAt || undefined) : undefined,
        blocked_reason: editingStatus === 'blocked' ? blockedReason.trim() : undefined,
      })
      toast.success('Status atualizado!')
      setEditingStatus(null)
    } catch {
      toast.error('Erro ao atualizar status')
    } finally {
      setSavingStatus(false)
    }
  }

  async function handleEditSave() {
    if (!task) return
    if (!editTitle.trim()) { toast.error('Título é obrigatório'); return }
    if (!editStartDate || !editEndDate) { toast.error('Datas são obrigatórias'); return }
    if (editEndDate < editStartDate) { toast.error('Data de fim deve ser após o início'); return }
    setSaving(true)
    try {
      await onEdit?.(task.id, {
        title: editTitle.trim(),
        phase: editPhase,
        category: editCategory,
        start_date: editStartDate,
        end_date: editEndDate,
        responsible_email: editResponsibleEmail.trim() || null,
        description: editDescription.trim() || null,
        prioridade: editPrioridade,
      })
      toast.success('Tarefa atualizada!')
      setEditMode(false)
    } catch {
      toast.error('Erro ao salvar tarefa')
    } finally {
      setSaving(false)
    }
  }

  async function handleDuplicate() {
    if (!task) return
    setDuplicating(true)
    try {
      await onDuplicate?.(task)
      toast.success('Tarefa duplicada!')
      onClose()
    } catch {
      toast.error('Erro ao duplicar tarefa')
    } finally {
      setDuplicating(false)
    }
  }

  async function handleDelete() {
    if (!task) return
    setDeleting(true)
    try {
      await onDelete?.(task.id)
      toast.success('Tarefa excluída')
      onClose()
    } catch {
      toast.error('Erro ao excluir tarefa')
    } finally {
      setDeleting(false)
    }
  }

  if (!open || !task) return null

  const statusColor = getStatusColor(task.statusDerived)
  const deadlineTag = calcDeadlineTag(task.endDate, task.statusDerived)

  const glassStyle = {
    background: 'var(--ws-glass-bg)',
    border: '1px solid var(--ws-glass-border)',
    backdropFilter: 'blur(20px)',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative z-10 flex w-full max-w-lg flex-col rounded-2xl shadow-2xl"
        style={{ ...glassStyle, maxHeight: '90vh' }}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-start justify-between gap-3 px-6 py-5"
          style={{ borderBottom: '1px solid var(--ws-glass-border)', background: 'var(--ws-glass-bg-hover)' }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', statusColor.bg, statusColor.text, statusColor.border)}
              >
                {getStatusLabel(task.statusDerived)}
              </Badge>
              <Badge className="rounded-full border border-border/10 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {FASES_LABELS[task.phase] ?? task.phase}
              </Badge>
              {deadlineTag && (
                <Badge className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', getDeadlineTagClasses(deadlineTag.variant))}>
                  {deadlineTag.label}
                </Badge>
              )}
            </div>
            <h2 className="mt-2 text-[15px] font-semibold text-foreground leading-snug">
              {task.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/30"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Action bar */}
        {!confirmDelete ? (
          <div
            className="flex shrink-0 items-center justify-between gap-2 px-6 py-3"
            style={{ borderBottom: '1px solid var(--ws-glass-border)' }}
          >
            {editMode ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { setEditMode(false); if (task) populateEditForm(task) }}
                  className="text-foreground hover:bg-muted/30"
                  style={{ border: '1px solid var(--ws-glass-border-strong)' }}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={saving}
                  onClick={handleEditSave}
                  className="border-[var(--ws-gold)] bg-[var(--ws-gold)] text-white hover:bg-[#b8943d]"
                >
                  {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Salvar alterações
                </Button>
              </>
            ) : (
              <div className="flex gap-2">
                {onEdit && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditMode(true)}
                    className="gap-1.5 text-foreground hover:bg-muted/30"
                    style={{ border: '1px solid var(--ws-glass-border-strong)' }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                )}
                {onDuplicate && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={duplicating}
                    onClick={handleDuplicate}
                    className="gap-1.5 text-foreground hover:bg-muted/30"
                    style={{ border: '1px solid var(--ws-glass-border-strong)' }}
                  >
                    {duplicating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                    Duplicar
                  </Button>
                )}
                {onDelete && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                    className="gap-1.5 text-[#a32d2d] hover:bg-[#a32d2d]/10"
                    style={{ border: '1px solid rgba(163,45,45,0.3)' }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div
            className="flex shrink-0 items-center justify-between gap-3 px-6 py-3"
            style={{ borderBottom: '1px solid var(--ws-glass-border)', background: 'rgba(163,45,45,0.06)' }}
          >
            <span className="text-[13px] text-[#a32d2d]">Confirmar exclusão desta tarefa?</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(false)}
                className="text-foreground hover:bg-muted/30"
                style={{ border: '1px solid var(--ws-glass-border-strong)' }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={deleting}
                onClick={handleDelete}
                className="bg-[#a32d2d] text-white hover:bg-[#8b2525]"
              >
                {deleting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Excluir
              </Button>
            </div>
          </div>
        )}

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {editMode ? (
            /* ─── EDIT MODE ─── */
            <div className="space-y-4 px-6 py-5">
              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">Título *</label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="bg-transparent"
                  style={{ border: '1px solid var(--ws-glass-border)' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">Fase *</label>
                  <Select value={editPhase} onValueChange={(v) => setEditPhase(v as TaskPhase)}>
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
                  <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">Categoria *</label>
                  <Select value={editCategory} onValueChange={(v) => setEditCategory(v as TaskCategory)}>
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
                  <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">Início *</label>
                  <Input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} className="bg-transparent" style={{ border: '1px solid var(--ws-glass-border)' }} />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">Fim *</label>
                  <Input type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} className="bg-transparent" style={{ border: '1px solid var(--ws-glass-border)' }} />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">Prioridade</label>
                <Select value={editPrioridade} onValueChange={(v) => setEditPrioridade(v as 'baixa' | 'media' | 'alta')}>
                  <SelectTrigger className="bg-transparent" style={{ border: '1px solid var(--ws-glass-border)' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ ...glassStyle, borderRadius: 10 }}>
                    {PRIORIDADE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">Responsável (e-mail)</label>
                <Input
                  type="email"
                  value={editResponsibleEmail}
                  onChange={(e) => setEditResponsibleEmail(e.target.value)}
                  placeholder="usuario@exemplo.com"
                  className="bg-transparent"
                  style={{ border: '1px solid var(--ws-glass-border)' }}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">Descrição</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  placeholder="Detalhe o escopo ou objetivo da tarefa..."
                  className="w-full resize-none rounded-md bg-transparent px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[var(--ws-gold)]"
                  style={{ border: '1px solid var(--ws-glass-border)' }}
                />
              </div>
            </div>
          ) : (
            /* ─── VIEW MODE ─── */
            <div>
              {/* Progress */}
              <div className="px-6 py-5">
                <div className="mb-2 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70">Progresso</div>
                <div className="flex items-center gap-3">
                  <Progress value={task.progress} className="h-2.5" indicatorClassName="bg-[var(--ws-gold)]" />
                  <span className="text-[14px] font-medium text-foreground">{task.progress}%</span>
                </div>
              </div>

              <Separator className="bg-border/10" />

              {/* Status change */}
              {onStatusChange && (
                <>
                  <div className="px-6 py-5">
                    <div className="mb-2 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70">Alterar status</div>
                    <Select
                      value={editingStatus ?? task.status}
                      onValueChange={(v) => handleStatusSelect(v as TaskStatus)}
                    >
                      <SelectTrigger className="bg-transparent" style={{ border: '1px solid var(--ws-glass-border)' }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent style={{ ...glassStyle, borderRadius: 10 }}>
                        {STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {editingStatus === 'done' && (
                      <div className="mt-3">
                        <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">Data de conclusão</label>
                        <Input
                          type="date"
                          value={completedAt}
                          onChange={(e) => setCompletedAt(e.target.value)}
                          className="bg-transparent"
                          style={{ border: '1px solid var(--ws-glass-border)' }}
                        />
                      </div>
                    )}

                    {editingStatus === 'blocked' && (
                      <div className="mt-3">
                        <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">Motivo do bloqueio *</label>
                        <textarea
                          value={blockedReason}
                          onChange={(e) => setBlockedReason(e.target.value)}
                          rows={2}
                          placeholder="Descreva o impedimento..."
                          className="w-full resize-none rounded-md bg-transparent px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[var(--ws-gold)]"
                          style={{ border: '1px solid var(--ws-glass-border)' }}
                        />
                      </div>
                    )}

                    {editingStatus && editingStatus !== task.status && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={savingStatus}
                          onClick={handleConfirmStatus}
                          className="border-[var(--ws-gold)] bg-[var(--ws-gold)] text-white hover:bg-[#b8943d]"
                        >
                          {savingStatus && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          Salvar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => { setEditingStatus(null); setCompletedAt(''); setBlockedReason('') }}
                          className="text-foreground hover:bg-muted/30"
                          style={{ border: '1px solid var(--ws-glass-border-strong)' }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </div>
                  <Separator className="bg-border/10" />
                </>
              )}

              {/* Details */}
              <div className="space-y-5 px-6 py-5">
                <section>
                  <div className="mb-2 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70">Período</div>
                  <div className="flex items-start gap-3">
                    <CalendarDays className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-[13px] text-foreground/70">
                        {formatDateBR(task.startDate)} → {formatDateBR(task.endDate)}
                      </div>
                      <div className="text-[12px] text-muted-foreground">
                        {daysBetween(task.startDate, task.endDate)} dias
                      </div>
                    </div>
                  </div>
                </section>

                <Separator className="bg-border/10" />

                <section>
                  <div className="mb-2 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70">Responsável</div>
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-semibold text-white"
                      style={{ background: `linear-gradient(135deg, ${hashColor(task.assignee)} 0%, #0f2744 100%)` }}
                    >
                      {task.assigneeInitials}
                    </div>
                    <div>
                      <div className="text-[13px] font-medium text-foreground">{task.assignee}</div>
                      <div className="text-[12px] text-muted-foreground">Estrategista responsável</div>
                    </div>
                  </div>
                </section>

                <Separator className="bg-border/10" />

                <section>
                  <div className="mb-2 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70">Prioridade</div>
                  <div className="flex items-center gap-2 text-[13px] text-foreground/70">
                    <Flag
                      className={cn(
                        'h-4 w-4',
                        task.priority === 'alta' ? 'text-[#a32d2d]' : task.priority === 'media' ? 'text-[#854f0b]' : 'text-[#3b6d11]'
                      )}
                    />
                    {getPriorityLabel(task.priority)}
                  </div>
                </section>

                <Separator className="bg-border/10" />

                <section>
                  <div className="mb-2 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70">Descrição</div>
                  <p className="text-[13px] leading-6 text-foreground/70">
                    {task.description ?? <span className="italic text-muted-foreground/50">Sem descrição</span>}
                  </p>
                </section>

                {task.blockedReason && (
                  <>
                    <Separator className="bg-border/10" />
                    <section>
                      <div className="mb-2 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70">Motivo do bloqueio</div>
                      <p className="rounded-lg bg-[#3d1a1a]/40 px-3 py-2 text-[13px] leading-6 text-[#e07070]">
                        {task.blockedReason}
                      </p>
                    </section>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
