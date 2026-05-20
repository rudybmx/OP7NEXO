'use client'

import { useState } from 'react'
import { CalendarDays, CircleDot, Flag, Loader2, User2 } from 'lucide-react'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { daysBetween, formatDateBR, getPriorityLabel, getStatusColor, getStatusLabel, hashColor } from '@/lib/gantt-utils'
import { cn } from '@/lib/utils'
import type { PmpTask, TaskStatus } from '@/types/pmp'

interface PmpTaskDrawerProps {
  task: PmpTask | null
  open: boolean
  onClose: () => void
  onStatusChange?: (taskId: string, update: { status: TaskStatus; completed_at?: string; blocked_reason?: string }) => Promise<void>
}

function renderDeliverableState(progress: number, index: number, total: number) {
  const threshold = ((index + 1) / total) * 100
  return progress >= threshold
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'A fazer' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'done', label: 'Concluída' },
  { value: 'blocked', label: 'Bloqueada' },
]

export default function PmpTaskDrawer({ task, open, onClose, onStatusChange }: PmpTaskDrawerProps) {
  const statusColor = task ? getStatusColor(task.statusDerived) : null
  const [editingStatus, setEditingStatus] = useState<TaskStatus | null>(null)
  const [completedAt, setCompletedAt] = useState('')
  const [blockedReason, setBlockedReason] = useState('')
  const [saving, setSaving] = useState(false)

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
    setSaving(true)
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
      setSaving(false)
    }
  }

  function handleCancelStatus() {
    setEditingStatus(null)
    setCompletedAt('')
    setBlockedReason('')
  }

  const glassStyle = {
    background: 'var(--ws-glass-bg)',
    borderColor: 'var(--ws-glass-border)',
    backdropFilter: 'blur(20px)',
  }

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) { handleCancelStatus(); onClose() } }}>
      <SheetContent
        side="right"
        className="w-[420px] max-w-[420px] gap-0 overflow-y-auto p-0"
        style={{
          background: 'var(--ws-glass-bg)',
          borderLeft: '1px solid var(--ws-glass-border)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {task ? (
          <>
            <SheetHeader
              className="gap-2 px-6 py-5"
              style={{ borderBottom: '1px solid var(--ws-glass-border)', background: 'var(--ws-glass-bg-hover)' }}
            >
              <SheetTitle className="pr-10 text-[20px] font-semibold text-foreground">{task.title}</SheetTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-medium',
                    statusColor?.bg,
                    statusColor?.text,
                    statusColor?.border
                  )}
                >
                  {getStatusLabel(task.statusDerived)}
                </Badge>
                <Badge className="rounded-full border border-border/10 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {task.phase}
                </Badge>
              </div>
              <SheetDescription className="text-[13px] text-muted-foreground">
                Acompanhamento detalhado da entrega, período e responsável.
              </SheetDescription>
            </SheetHeader>

            <div className="px-6 py-5">
              <div className="mb-2 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70">Progresso</div>
              <div className="flex items-center gap-3">
                <Progress value={task.progress} className="h-2.5" indicatorClassName="bg-[var(--ws-gold)]" />
                <span className="text-[14px] font-medium text-foreground">{task.progress}%</span>
              </div>
            </div>

            <Separator className="bg-border/10" />

            {/* Status update section */}
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
                      <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">
                        Data de conclusão
                      </label>
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
                      <label className="mb-1.5 block text-[11px] uppercase tracking-[0.05em] text-muted-foreground/70">
                        Motivo do bloqueio *
                      </label>
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
                        disabled={saving}
                        onClick={handleConfirmStatus}
                        className="border-[var(--ws-gold)] bg-[var(--ws-gold)] text-white hover:bg-[#b8943d]"
                      >
                        {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        Salvar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleCancelStatus}
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
                      task.priority === 'alta'
                        ? 'text-[#a32d2d]'
                        : task.priority === 'media'
                          ? 'text-[#854f0b]'
                          : 'text-[#3b6d11]'
                    )}
                  />
                  {getPriorityLabel(task.priority)}
                </div>
              </section>

              <Separator className="bg-border/10" />

              <section>
                <div className="mb-2 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70">Descrição</div>
                <p className="text-[13px] leading-6 text-foreground/70">
                  {task.description || <span className="italic text-muted-foreground/50">Sem descrição</span>}
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

              {!!task.deliverables?.length && (
                <>
                  <Separator className="bg-border/10" />
                  <section>
                    <div className="mb-2 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70">Entregas</div>
                    <div className="space-y-2">
                      {task.deliverables.map((deliverable, index) => {
                        const complete = renderDeliverableState(task.progress, index, task.deliverables?.length ?? 1)
                        return (
                          <div key={deliverable} className="flex items-center gap-2 text-[13px] text-foreground/70">
                            <CircleDot className={cn('h-4 w-4', complete ? 'text-[#3b6d11]' : 'text-muted-foreground/70')} />
                            {deliverable}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                </>
              )}

              {!!task.tags?.length && (
                <>
                  <Separator className="bg-border/10" />
                  <section>
                    <div className="mb-2 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/70">Tags</div>
                    <div className="flex flex-wrap gap-2">
                      {task.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <User2 className="mr-2 h-4 w-4" />
            Nenhuma tarefa selecionada
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
