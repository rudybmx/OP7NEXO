'use client'
import { useState } from 'react'
import {
  GridList,
  GridListItem,
  DropIndicator,
  useDragAndDrop,
  type DropTarget,
} from 'react-aria-components'
import { useListData } from 'react-stately'
import { Button, Chip, Avatar, ScrollShadow } from '@heroui/react'
import { DS2CodePreview } from '../ds2-code-preview'
import { Plus, MoreHorizontal, GripVertical } from 'lucide-react'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Priority = 'high' | 'medium' | 'low'
type Status   = 'todo' | 'in_progress' | 'review' | 'done'

interface KanbanTask {
  id: string
  title: string
  description?: string
  priority: Priority
  assignee: string
  assigneeInitials: string
  tags: string[]
  status: Status
}

// ─────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────

const INITIAL_TASKS: KanbanTask[] = [
  { id: 't1', title: 'Redesign dashboard header', description: 'Update the nav layout for mobile', priority: 'high',   assignee: 'Ana Souza',     assigneeInitials: 'AS', tags: ['Design', 'Mobile'], status: 'todo' },
  { id: 't2', title: 'Fix login redirect bug',    description: 'Users are redirected to /404',    priority: 'high',   assignee: 'Ravi Anand',    assigneeInitials: 'RA', tags: ['Bug'],             status: 'todo' },
  { id: 't3', title: 'Write API docs',            description: 'Cover all public endpoints',      priority: 'medium', assignee: 'Parker Wren',   assigneeInitials: 'PW', tags: ['Docs'],            status: 'todo' },
  { id: 't4', title: 'Integrate Stripe billing',  description: 'Subscription + webhook handler',  priority: 'high',   assignee: 'Carlos M.',     assigneeInitials: 'CM', tags: ['Backend', 'Billing'], status: 'in_progress' },
  { id: 't5', title: 'Add dark mode support',                                                     priority: 'medium', assignee: 'Maya Okafor',   assigneeInitials: 'MO', tags: ['Frontend'],        status: 'in_progress' },
  { id: 't6', title: 'Audit accessibility',       description: 'WCAG 2.1 AA compliance check',   priority: 'low',    assignee: 'Lena Kovač',    assigneeInitials: 'LK', tags: ['A11y'],            status: 'review' },
  { id: 't7', title: 'Performance profiling',     description: 'Lighthouse CI + bundle analysis', priority: 'medium', assignee: 'Ravi Anand',    assigneeInitials: 'RA', tags: ['Perf'],            status: 'review' },
  { id: 't8', title: 'Deploy to production',      description: 'v2.4.0 release',                  priority: 'high',   assignee: 'Carlos M.',     assigneeInitials: 'CM', tags: ['DevOps'],          status: 'done' },
  { id: 't9', title: 'Set up error monitoring',                                                   priority: 'low',    assignee: 'Ana Souza',     assigneeInitials: 'AS', tags: ['Infra'],           status: 'done' },
]

const COLUMNS: { id: Status; label: string; color: string }[] = [
  { id: 'todo',        label: 'A Fazer',      color: 'var(--ws-text-3)' },
  { id: 'in_progress', label: 'Em Progresso', color: '#3E5BFF' },
  { id: 'review',      label: 'Revisão',      color: '#c9a84c' },
  { id: 'done',        label: 'Concluído',    color: '#0fa856' },
]

const PRIORITY_COLOR: Record<Priority, { label: string; color: 'default' | 'danger' | 'warning' | 'success' }> = {
  high:   { label: 'Alta',   color: 'danger'  },
  medium: { label: 'Média',  color: 'warning' },
  low:    { label: 'Baixa',  color: 'default' },
}

// ─────────────────────────────────────────────────────────────
// useKanban hook — manages shared list + column helpers
// ─────────────────────────────────────────────────────────────

const DRAG_TYPE = 'application/x-kanban-id'

function useKanban<T extends { id: string; status: string }>(initialItems: T[]) {
  const list = useListData({ initialItems, getKey: item => item.id })

  function getColumn(item: T) { return item.status }

  function setColumn(item: T, column: string): T { return { ...item, status: column } }

  function moveItem(key: string, toColumn: string) {
    const item = list.getItem(key)
    if (item) list.update(key, setColumn(item, toColumn))
  }

  return { list, getColumn, setColumn, moveItem, dragType: DRAG_TYPE }
}

// ─────────────────────────────────────────────────────────────
// useKanbanColumn — filtered items + DnD hooks for one column
// ─────────────────────────────────────────────────────────────

function useKanbanColumn<T extends { id: string; status: string }>(
  kanban: ReturnType<typeof useKanban<T>>,
  column: string,
) {
  const { list, dragType, moveItem } = kanban
  const items = list.items.filter(i => i.status === column)

  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) =>
      [...keys].map(key => ({ [dragType]: String(key) })),

    acceptedDragTypes: [dragType],

    async onInsert(e) {
      const first = e.items[0]
      if (first.kind !== 'text') return
      const id = await first.getText(dragType)
      moveItem(id, column)
    },

    onReorder(e) {
      const [key] = [...e.keys]
      if (key != null) moveItem(String(key), column)
    },

    renderDropIndicator: (target: DropTarget) => (
      <DropIndicator
        target={target}
        style={{
          display: 'block',
          height: 3,
          borderRadius: 2,
          background: 'oklch(0.6204 0.195 253.83)',
          margin: '2px 0',
          opacity: 0,
        }}
        className="kanban-drop-indicator"
      />
    ),
  })

  return { items, dragAndDropHooks }
}

// ─────────────────────────────────────────────────────────────
// KanbanCard
// ─────────────────────────────────────────────────────────────

function KanbanCard({ task }: { task: KanbanTask }) {
  const prio = PRIORITY_COLOR[task.priority]
  return (
    <div style={{
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      cursor: 'grab',
      transition: 'box-shadow 0.12s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)', lineHeight: 1.4 }}>
          {task.title}
        </span>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-3)', padding: 0, flexShrink: 0 }}>
          <MoreHorizontal size={14} />
        </button>
      </div>

      {/* Description */}
      {task.description && (
        <p style={{ fontSize: 12, color: 'var(--ws-text-2)', margin: 0, lineHeight: 1.5 }}>
          {task.description}
        </p>
      )}

      {/* Tags */}
      {task.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {task.tags.map(tag => (
            <Chip key={tag} size="sm" variant="soft" color="default" style={{ height: 18, fontSize: 10 }}>
              {tag}
            </Chip>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Avatar size="sm">
          <Avatar.Fallback>{task.assigneeInitials}</Avatar.Fallback>
        </Avatar>
        <Chip size="sm" variant="soft" color={prio.color} style={{ height: 18, fontSize: 10 }}>
          {prio.label}
        </Chip>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// KanbanColumn
// ─────────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  kanban,
}: {
  column: typeof COLUMNS[number]
  kanban: ReturnType<typeof useKanban<KanbanTask>>
}) {
  const { items, dragAndDropHooks } = useKanbanColumn(kanban, column.id)

  return (
    <div style={{
      width: 280,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      scrollSnapAlign: 'start',
    }}>
      {/* Column header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px' }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', background: column.color, flexShrink: 0,
        }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)', flex: 1 }}>
          {column.label}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--ws-text-3)',
          background: 'var(--bg2)', borderRadius: 10, padding: '1px 6px',
        }}>
          {items.length}
        </span>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-3)', padding: 0 }}>
          <MoreHorizontal size={14} />
        </button>
      </div>

      {/* Column body */}
      <div style={{
        background: 'var(--bg2)',
        borderRadius: 10,
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minHeight: 80,
      }}>
        <GridList
          aria-label={column.label}
          items={items}
          dragAndDropHooks={dragAndDropHooks}
          renderEmptyState={() => (
            <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12, color: 'var(--ws-text-3)' }}>
              Sem tarefas
            </div>
          )}
          style={{ display: 'flex', flexDirection: 'column', gap: 6, outline: 'none' }}
        >
          {(task) => (
            <GridListItem
              key={task.id}
              textValue={task.title}
              style={{ outline: 'none', listStyle: 'none' }}
            >
              {({ isDragging }) => (
                <div style={{ opacity: isDragging ? 0.4 : 1, transition: 'opacity 0.15s' }}>
                  <KanbanCard task={task} />
                </div>
              )}
            </GridListItem>
          )}
        </GridList>

        {/* Add button */}
        <Button
          variant="ghost"
          size="sm"
          style={{ justifyContent: 'flex-start', color: 'var(--ws-text-3)', fontSize: 12 }}
        >
          <Plus size={13} />
          Adicionar tarefa
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Full board component
// ─────────────────────────────────────────────────────────────

function KanbanBoard() {
  const kanban = useKanban<KanbanTask>(INITIAL_TASKS)

  return (
    <ScrollShadow
      orientation="horizontal"
      style={{
        display: 'flex',
        gap: 16,
        padding: '4px 2px 12px',
        overflowX: 'auto',
        scrollSnapType: 'x mandatory',
      }}
    >
      {COLUMNS.map(col => (
        <KanbanColumn key={col.id} column={col} kanban={kanban} />
      ))}
    </ScrollShadow>
  )
}

// ─────────────────────────────────────────────────────────────
// Simplified board (static, for code preview)
// ─────────────────────────────────────────────────────────────

function MiniKanban() {
  const [tasks, setTasks] = useState([
    { id: '1', title: 'Redesign header', status: 'todo' },
    { id: '2', title: 'Fix login bug',   status: 'in_progress' },
    { id: '3', title: 'Deploy v2.4.0',   status: 'done' },
  ])

  return (
    <div style={{ display: 'flex', gap: 12 }}>
      {(['todo', 'in_progress', 'done'] as const).map(col => {
        const colTasks = tasks.filter(t => t.status === col)
        const label = col === 'todo' ? 'A Fazer' : col === 'in_progress' ? 'Em Progresso' : 'Concluído'
        const dot   = col === 'todo' ? 'var(--ws-text-3)' : col === 'in_progress' ? '#3E5BFF' : '#0fa856'
        return (
          <div key={col} style={{ width: 180 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-1)' }}>{label}</span>
              <span style={{ fontSize: 11, color: 'var(--ws-text-3)', marginLeft: 'auto' }}>{colTasks.length}</span>
            </div>
            <div style={{ background: 'var(--bg2)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 60 }}>
              {colTasks.map(t => (
                <div key={t.id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: 'var(--ws-text-1)' }}>
                  {t.title}
                </div>
              ))}
              {colTasks.length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--ws-text-3)', textAlign: 'center', margin: 0, padding: '8px 0' }}>Sem tarefas</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// DS2 section export
// ─────────────────────────────────────────────────────────────

export function DS2Kanban() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ws-text-1)', margin: '0 0 4px' }}>
        Kanban
      </h2>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>
        Board drag-and-drop com colunas, cards e navegação por teclado. Construído sobre <code style={{ fontSize: 12 }}>react-aria-components</code> + <code style={{ fontSize: 12 }}>react-stately</code>.
      </p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'useKanban + useKanbanColumn → GridList (dragAndDropHooks) > GridListItem'}
      </p>

      <DS2CodePreview
        title="Coluna simples"
        code={`// Estrutura básica de uma coluna
const kanban = useKanban({ initialItems: tasks, getColumn, setColumn })

function Column({ id, label }) {
  const { items, dragAndDropHooks } = useKanbanColumn(kanban, id)
  return (
    <div>
      <h3>{label} <span>{items.length}</span></h3>
      <GridList
        items={items}
        dragAndDropHooks={dragAndDropHooks}
        renderEmptyState={() => <p>Sem tarefas</p>}
      >
        {task => (
          <GridListItem textValue={task.title}>
            {({ isDragging }) => (
              <div style={{ opacity: isDragging ? 0.4 : 1 }}>
                <KanbanCard task={task} />
              </div>
            )}
          </GridListItem>
        )}
      </GridList>
    </div>
  )
}`}
      >
        <MiniKanban />
      </DS2CodePreview>

      <DS2CodePreview
        title="Board completo (drag & drop)"
        code={`'use client'
import { GridList, GridListItem, DropIndicator, useDragAndDrop } from 'react-aria-components'
import { useListData } from 'react-stately'
import { ScrollShadow } from '@heroui/react'

const DRAG_TYPE = 'application/x-kanban-id'

// 1. useKanban — estado compartilhado do board
function useKanban(initialItems) {
  const list = useListData({ initialItems, getKey: item => item.id })

  function moveItem(key, toColumn) {
    const item = list.getItem(key)
    if (item) list.update(key, { ...item, status: toColumn })
  }

  return { list, moveItem, dragType: DRAG_TYPE }
}

// 2. useKanbanColumn — items filtrados + DnD hooks para uma coluna
function useKanbanColumn(kanban, column) {
  const items = kanban.list.items.filter(i => i.status === column)

  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) =>
      [...keys].map(key => ({ [kanban.dragType]: String(key) })),
    acceptedDragTypes: [kanban.dragType],
    async onInsert(e) {
      const id = await e.items[0].getText(kanban.dragType)
      kanban.moveItem(id, column)
    },
    async onReorder(e) {
      const id = await e.items[0].getText(kanban.dragType)
      kanban.moveItem(id, column)
    },
    renderDropIndicator: (target) => (
      <DropIndicator target={target} style={{ height: 3, borderRadius: 2, background: 'var(--accent)' }} />
    ),
  })

  return { items, dragAndDropHooks }
}

// 3. Board
export function KanbanBoard() {
  const kanban = useKanban(INITIAL_TASKS)

  return (
    <ScrollShadow orientation="horizontal" style={{ display: 'flex', gap: 16, overflowX: 'auto' }}>
      {COLUMNS.map(col => {
        const { items, dragAndDropHooks } = useKanbanColumn(kanban, col.id)
        return (
          <div key={col.id} style={{ width: 280, flexShrink: 0 }}>
            <header>{col.label} ({items.length})</header>
            <GridList
              items={items}
              dragAndDropHooks={dragAndDropHooks}
              renderEmptyState={() => <p>Sem tarefas</p>}
            >
              {task => (
                <GridListItem textValue={task.title}>
                  {({ isDragging }) => (
                    <div style={{ opacity: isDragging ? 0.4 : 1 }}>
                      <KanbanCard task={task} />
                    </div>
                  )}
                </GridListItem>
              )}
            </GridList>
          </div>
        )
      })}
    </ScrollShadow>
  )
}`}
      >
        <KanbanBoard />
      </DS2CodePreview>

      <DS2CodePreview
        title="useKanban — API de referência"
        code={`// Estrutura de dados sugerida
interface KanbanTask {
  id: string
  title: string
  description?: string
  priority: 'high' | 'medium' | 'low'
  status: 'todo' | 'in_progress' | 'review' | 'done'
  assignee: string
  tags: string[]
}

// useKanban retorna:
const {
  list,        // ListData<T> — acesso direto ao react-stately
  moveItem,    // (id, toColumn) => void
  dragType,    // string — MIME-like type para DnD
} = useKanban(initialItems)

// useKanbanColumn retorna:
const {
  items,             // T[] filtrados por coluna
  dragAndDropHooks,  // → passar para <GridList dragAndDropHooks={...}>
} = useKanbanColumn(kanban, 'in_progress')

// Operações diretas no list:
list.update(id, { ...task, priority: 'high' })
list.remove(id)
list.append({ id: 'new', title: 'Nova tarefa', status: 'todo' })`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: 0 }}>
            <strong style={{ color: 'var(--ws-text-1)' }}>useKanban</strong> — gerencia o estado compartilhado do board com <code>useListData</code> do react-stately.
          </p>
          <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: 0 }}>
            <strong style={{ color: 'var(--ws-text-1)' }}>useKanbanColumn</strong> — filtra items por coluna e retorna <code>dragAndDropHooks</code> para o <code>GridList</code> de cada coluna.
          </p>
          <p style={{ fontSize: 13, color: 'var(--ws-text-2)', margin: 0 }}>
            Drag-and-drop funciona entre colunas <em>e</em> reordena dentro da mesma coluna. Teclado suportado nativamente via react-aria.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['todo', 'in_progress', 'review', 'done'] as const).map(s => {
              const dot = { todo: 'var(--ws-text-3)', in_progress: '#3E5BFF', review: '#c9a84c', done: '#0fa856' }[s]
              const label = { todo: 'A Fazer', in_progress: 'Em Progresso', review: 'Revisão', done: 'Concluído' }[s]
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg2)', borderRadius: 6, padding: '6px 10px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ws-text-1)' }}>{label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </DS2CodePreview>
    </div>
  )
}
