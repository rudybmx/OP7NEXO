'use client'
import { useState, useMemo, type ReactNode } from 'react'
import { Table, Chip, Avatar, Button, Checkbox } from '@heroui/react'
import { DS2CodePreview } from '../ds2-code-preview'
import {
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
  Search,
  Trash2,
} from 'lucide-react'
import type { SortDescriptor } from 'react-aria-components'

// ─────────────────────────────────────────────────────────────
// DataGrid types — mirrors @heroui-pro/react DataGrid API
// ─────────────────────────────────────────────────────────────

export interface DataGridColumn<T> {
  id: string
  header: ReactNode | ((info: { sortDirection?: 'ascending' | 'descending' }) => ReactNode)
  accessorKey?: keyof T & string
  cell?: (item: T, column: DataGridColumn<T>) => ReactNode
  isRowHeader?: boolean
  allowsSorting?: boolean
  sortFn?: (a: T, b: T) => number
  allowsResizing?: boolean
  width?: number | string
  minWidth?: number
  align?: 'start' | 'center' | 'end'
  pinned?: 'start' | 'end'
}

type SelectionSet = Set<string | number>

interface DataGridProps<T extends object> {
  data: T[]
  columns: DataGridColumn<T>[]
  getRowId: (item: T) => string | number
  'aria-label': string
  selectionMode?: 'none' | 'single' | 'multiple'
  showSelectionCheckboxes?: boolean
  selectedKeys?: SelectionSet
  onSelectionChange?: (keys: SelectionSet) => void
  defaultSortDescriptor?: SortDescriptor
  sortDescriptor?: SortDescriptor
  onSortChange?: (descriptor: SortDescriptor) => void
  allowsColumnResize?: boolean
  renderEmptyState?: () => ReactNode
  onRowAction?: (key: string | number) => void
  className?: string
}

// ─────────────────────────────────────────────────────────────
// DataGrid implementation
// ─────────────────────────────────────────────────────────────

function DataGrid<T extends object>({
  data,
  columns,
  getRowId,
  'aria-label': ariaLabel,
  selectionMode = 'none',
  showSelectionCheckboxes = false,
  selectedKeys,
  onSelectionChange,
  defaultSortDescriptor,
  sortDescriptor: controlledSort,
  onSortChange,
  allowsColumnResize = false,
  renderEmptyState,
  onRowAction,
  className,
}: DataGridProps<T>) {
  const [internalSort, setInternalSort] = useState<SortDescriptor | undefined>(defaultSortDescriptor)
  const [internalSelected, setInternalSelected] = useState<SelectionSet>(new Set())

  const sort = controlledSort ?? internalSort
  const selected = selectedKeys ?? internalSelected

  function handleSortChange(desc: SortDescriptor) {
    if (!controlledSort) setInternalSort(desc)
    onSortChange?.(desc)
  }

  function handleSelectionChange(keys: SelectionSet) {
    if (!selectedKeys) setInternalSelected(keys)
    onSelectionChange?.(keys)
  }

  // Client-side sort
  const sortedData = useMemo(() => {
    if (!sort?.column) return data
    const col = columns.find(c => c.id === sort.column)
    if (!col) return data
    const dir = sort.direction === 'ascending' ? 1 : -1
    return [...data].sort((a, b) => {
      if (col.sortFn) return col.sortFn(a, b) * dir
      const ak = col.accessorKey
      if (!ak) return 0
      const av = String((a as Record<string, unknown>)[ak] ?? '')
      const bv = String((b as Record<string, unknown>)[ak] ?? '')
      return av.localeCompare(bv) * dir
    })
  }, [data, sort, columns])

  const renderHeader = (col: DataGridColumn<T>) => {
    if (typeof col.header === 'function') {
      const dir = sort?.column === col.id ? sort.direction : undefined
      return col.header({ sortDirection: dir })
    }
    return col.header
  }

  const renderCell = (item: T, col: DataGridColumn<T>): ReactNode => {
    if (col.cell) return col.cell(item, col)
    if (col.accessorKey) return String((item as Record<string, unknown>)[col.accessorKey] ?? '')
    return null
  }

  const alignStyle = (align?: string): React.CSSProperties =>
    align === 'end' ? { textAlign: 'right' } : align === 'center' ? { textAlign: 'center' } : {}

  return (
    <div className={className} style={{ width: '100%' }}>
      <Table.ScrollContainer>
        <Table.Content
          aria-label={ariaLabel}
          selectionMode={selectionMode !== 'none' ? selectionMode : undefined}
          sortDescriptor={sort}
          onSortChange={handleSortChange as (desc: SortDescriptor) => void}
        >
          <Table.Header>
            {showSelectionCheckboxes && selectionMode === 'multiple' && (
              <Table.Column style={{ width: 40 }}>
                <Checkbox
                  isSelected={selected.size === sortedData.length && sortedData.length > 0}
                  isIndeterminate={selected.size > 0 && selected.size < sortedData.length}
                  onChange={(v) => {
                    if (v) handleSelectionChange(new Set(sortedData.map(getRowId)))
                    else handleSelectionChange(new Set())
                  }}
                />
              </Table.Column>
            )}
            {columns.map(col => (
              <Table.Column
                key={col.id}
                id={col.id}
                isRowHeader={col.isRowHeader}
                allowsSorting={col.allowsSorting}
                minWidth={col.minWidth}
                width={typeof col.width === 'number' ? col.width : undefined}
                style={{ ...alignStyle(col.align) }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: col.align === 'end' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start' }}>
                  {renderHeader(col)}
                  {col.allowsSorting && (
                    sort?.column === col.id
                      ? sort.direction === 'ascending'
                        ? <ChevronUp size={12} />
                        : <ChevronDown size={12} />
                      : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />
                  )}
                </div>
              </Table.Column>
            ))}
          </Table.Header>
          <Table.Body
            items={sortedData}
            renderEmptyState={renderEmptyState ? () => (
              <Table.Cell style={{ textAlign: 'center', padding: '32px', color: 'var(--ws-text-3)' }}>
                {renderEmptyState()}
              </Table.Cell>
            ) : undefined}
          >
            {(item) => {
              const key = getRowId(item)
              return (
                <Table.Row
                  key={key}
                  id={key}
                  onAction={onRowAction ? () => onRowAction(key) : undefined}
                >
                  {showSelectionCheckboxes && selectionMode === 'multiple' && (
                    <Table.Cell style={{ width: 40 }}>
                      <Checkbox
                        isSelected={selected.has(key)}
                        onChange={(v) => {
                          const next = new Set(selected)
                          if (v) next.add(key)
                          else next.delete(key)
                          handleSelectionChange(next)
                        }}
                      />
                    </Table.Cell>
                  )}
                  {columns.map(col => (
                    <Table.Cell key={col.id} style={{ ...alignStyle(col.align) }}>
                      {renderCell(item, col)}
                    </Table.Cell>
                  ))}
                </Table.Row>
              )
            }}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Mock data
// ─────────────────────────────────────────────────────────────

type PayStatus = 'succeeded' | 'failed' | 'pending'

interface Payment {
  id: string
  customer: string
  email: string
  amount: number
  status: PayStatus
  date: string
  method: string
}

const PAYMENTS: Payment[] = [
  { id: 'p1', customer: 'Carlos Iglesias', email: 'carlos@op7.com',   amount: 1240.00, status: 'succeeded', date: '2026-06-07', method: 'Visa' },
  { id: 'p2', customer: 'Maya Okafor',     email: 'maya@studio.io',   amount:  320.50, status: 'succeeded', date: '2026-06-06', method: 'Pix'  },
  { id: 'p3', customer: 'Ravi Anand',      email: 'ravi@dev.co',      amount: 4800.00, status: 'pending',   date: '2026-06-05', method: 'Boleto' },
  { id: 'p4', customer: 'Stripe Inc.',     email: 'billing@stripe.com', amount: 990.00, status: 'failed',  date: '2026-06-04', method: 'Visa' },
  { id: 'p5', customer: 'Parker Wren',     email: 'parker@agency.io', amount: 2100.00, status: 'succeeded', date: '2026-06-03', method: 'Mastercard' },
  { id: 'p6', customer: 'Lena Kovač',      email: 'lena@design.eu',   amount:  670.00, status: 'succeeded', date: '2026-06-02', method: 'Pix' },
  { id: 'p7', customer: 'Ana Souza',       email: 'ana@nexo.com.br',  amount: 3200.00, status: 'pending',   date: '2026-06-01', method: 'Boleto' },
]

const STATUS_CHIP: Record<PayStatus, { label: string; color: 'success' | 'danger' | 'warning' }> = {
  succeeded: { label: 'Aprovado', color: 'success' },
  failed:    { label: 'Recusado', color: 'danger'  },
  pending:   { label: 'Pendente', color: 'warning' },
}

// ─────────────────────────────────────────────────────────────
// Column definitions
// ─────────────────────────────────────────────────────────────

const COLUMNS_BASIC: DataGridColumn<Payment>[] = [
  {
    id: 'customer',
    header: 'Cliente',
    accessorKey: 'customer',
    isRowHeader: true,
    allowsSorting: true,
    cell: (item) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar size="sm">
          <Avatar.Fallback>{item.customer.slice(0, 2).toUpperCase()}</Avatar.Fallback>
        </Avatar>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)' }}>{item.customer}</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>{item.email}</div>
        </div>
      </div>
    ),
  },
  {
    id: 'amount',
    header: 'Valor',
    accessorKey: 'amount',
    align: 'end',
    allowsSorting: true,
    cell: (item) => (
      <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
        {item.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    accessorKey: 'status',
    allowsSorting: true,
    cell: (item) => {
      const s = STATUS_CHIP[item.status]
      return <Chip size="sm" variant="soft" color={s.color}>{s.label}</Chip>
    },
  },
  {
    id: 'method',
    header: 'Método',
    accessorKey: 'method',
  },
  {
    id: 'date',
    header: 'Data',
    accessorKey: 'date',
    allowsSorting: true,
    cell: (item) => new Date(item.date).toLocaleDateString('pt-BR'),
  },
]

// ─────────────────────────────────────────────────────────────
// Demos
// ─────────────────────────────────────────────────────────────

function BasicDemo() {
  return (
    <DataGrid
      aria-label="Pagamentos"
      data={PAYMENTS}
      columns={COLUMNS_BASIC}
      getRowId={r => r.id}
      defaultSortDescriptor={{ column: 'date', direction: 'descending' }}
    />
  )
}

function SelectionDemo() {
  const [selected, setSelected] = useState<SelectionSet>(new Set())
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'oklch(0.6204 0.195 253.83 / 0.08)', borderRadius: 8, border: '1px solid oklch(0.6204 0.195 253.83 / 0.2)' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'oklch(0.6204 0.195 253.83)', flex: 1 }}>
            {selected.size} {selected.size === 1 ? 'linha selecionada' : 'linhas selecionadas'}
          </span>
          <Button size="sm" variant="ghost" style={{ gap: 4, color: 'var(--color-danger)' }}>
            <Trash2 size={13} />
            Excluir
          </Button>
        </div>
      )}
      <DataGrid
        aria-label="Pagamentos com seleção"
        data={PAYMENTS}
        columns={COLUMNS_BASIC}
        getRowId={r => r.id}
        selectionMode="multiple"
        showSelectionCheckboxes
        selectedKeys={selected}
        onSelectionChange={setSelected}
      />
    </div>
  )
}

function SearchDemo() {
  const [query, setQuery] = useState('')
  const filtered = PAYMENTS.filter(p =>
    p.customer.toLowerCase().includes(query.toLowerCase()) ||
    p.email.toLowerCase().includes(query.toLowerCase())
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ position: 'relative', maxWidth: 320 }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ws-text-3)', pointerEvents: 'none' }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar cliente..."
          style={{
            width: '100%',
            padding: '7px 10px 7px 30px',
            fontSize: 13,
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--bg)',
            color: 'var(--ws-text-1)',
            outline: 'none',
          }}
        />
      </div>
      <DataGrid
        aria-label="Pagamentos com busca"
        data={filtered}
        columns={COLUMNS_BASIC}
        getRowId={r => r.id}
        defaultSortDescriptor={{ column: 'customer', direction: 'ascending' }}
        renderEmptyState={() => (
          <span style={{ fontSize: 13 }}>Nenhum resultado para &quot;{query}&quot;</span>
        )}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// DS2 section export
// ─────────────────────────────────────────────────────────────

export function DS2DataGrid() {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--ws-text-1)', margin: '0 0 4px' }}>
        Data Grid
      </h2>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ws-text-2)', margin: '0 0 4px' }}>
        Tabela completa com sorting, seleção, custom cells, busca e empty state. Construída sobre <code style={{ fontSize: 12 }}>Table</code> do HeroUI.
      </p>
      <p style={{ fontSize: 11, color: 'var(--ws-text-3)', margin: '0 0 24px', fontFamily: 'monospace' }}>
        {'DataGrid<T> → columns: DataGridColumn<T>[] + data: T[] + getRowId'}
      </p>

      <DS2CodePreview
        title="Básico — sorting + custom cells"
        code={`import type { DataGridColumn } from './data-grid'

interface Payment {
  id: string
  customer: string
  amount: number
  status: 'succeeded' | 'failed' | 'pending'
  date: string
}

const columns: DataGridColumn<Payment>[] = [
  {
    id: 'customer',
    header: 'Cliente',
    accessorKey: 'customer',
    isRowHeader: true,
    allowsSorting: true,
    cell: (item) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Avatar size="sm"><Avatar.Fallback>{item.customer.slice(0,2)}</Avatar.Fallback></Avatar>
        <div>
          <div style={{ fontWeight: 500 }}>{item.customer}</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>{item.email}</div>
        </div>
      </div>
    ),
  },
  {
    id: 'amount',
    header: 'Valor',
    accessorKey: 'amount',
    align: 'end',
    allowsSorting: true,
    cell: (item) => item.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  },
  {
    id: 'status',
    header: 'Status',
    cell: (item) => (
      <Chip size="sm" variant="soft" color={item.status === 'succeeded' ? 'success' : item.status === 'failed' ? 'danger' : 'warning'}>
        {item.status}
      </Chip>
    ),
  },
]

<DataGrid
  aria-label="Pagamentos"
  data={payments}
  columns={columns}
  getRowId={r => r.id}
  defaultSortDescriptor={{ column: 'date', direction: 'descending' }}
/>`}
      >
        <BasicDemo />
      </DS2CodePreview>

      <DS2CodePreview
        title="Seleção múltipla + Action Bar"
        code={`const [selected, setSelected] = useState<Set<string | number>>(new Set())

<>
  {selected.size > 0 && (
    <ActionBar>
      {selected.size} selecionadas
      <Button size="sm" color="danger" variant="ghost">Excluir</Button>
    </ActionBar>
  )}

  <DataGrid
    aria-label="Pagamentos"
    data={payments}
    columns={columns}
    getRowId={r => r.id}
    selectionMode="multiple"
    showSelectionCheckboxes
    selectedKeys={selected}
    onSelectionChange={setSelected}
  />
</>`}
      >
        <SelectionDemo />
      </DS2CodePreview>

      <DS2CodePreview
        title="Busca + Empty State"
        code={`const [query, setQuery] = useState('')
const filtered = payments.filter(p =>
  p.customer.toLowerCase().includes(query.toLowerCase())
)

<DataGrid
  aria-label="Pagamentos"
  data={filtered}
  columns={columns}
  getRowId={r => r.id}
  defaultSortDescriptor={{ column: 'customer', direction: 'ascending' }}
  renderEmptyState={() => (
    <span>Nenhum resultado para &quot;{query}&quot;</span>
  )}
/>`}
      >
        <SearchDemo />
      </DS2CodePreview>

      <DS2CodePreview
        title="DataGridColumn — API de referência"
        code={`// Coluna com accessorKey (renderização automática)
{ id: 'name', header: 'Nome', accessorKey: 'name', isRowHeader: true, allowsSorting: true }

// Coluna com cell customizado
{ id: 'status', header: 'Status', cell: (item) => <Chip>{item.status}</Chip> }

// Coluna com header dinâmico (recebe sortDirection)
{
  id: 'amount',
  header: ({ sortDirection }) => (
    <span>Valor {sortDirection === 'ascending' ? '↑' : sortDirection === 'descending' ? '↓' : ''}</span>
  ),
  allowsSorting: true,
}

// Coluna com sortFn customizado
{
  id: 'priority',
  header: 'Prioridade',
  allowsSorting: true,
  sortFn: (a, b) => ORDER[a.priority] - ORDER[b.priority],
}

// Sorting controlado (server-side)
const [sort, setSort] = useState<SortDescriptor>({ column: 'date', direction: 'descending' })
<DataGrid sortDescriptor={sort} onSortChange={setSort} ... />`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { prop: 'data',                 type: 'T[]',                       desc: 'Array de dados' },
            { prop: 'columns',              type: 'DataGridColumn<T>[]',        desc: 'Definições de colunas' },
            { prop: 'getRowId',             type: '(item: T) => string|number', desc: 'Extrai chave única por linha' },
            { prop: 'selectionMode',        type: '"none"|"single"|"multiple"', desc: 'Modo de seleção de linhas' },
            { prop: 'showSelectionCheckboxes', type: 'boolean',                desc: 'Adiciona coluna de checkbox' },
            { prop: 'selectedKeys',         type: 'Set<string|number>',         desc: 'Seleção controlada' },
            { prop: 'defaultSortDescriptor', type: 'SortDescriptor',            desc: 'Sort inicial (client-side)' },
            { prop: 'sortDescriptor',       type: 'SortDescriptor',             desc: 'Sort controlado (server-side)' },
            { prop: 'onSortChange',         type: '(desc) => void',             desc: 'Callback de mudança de sort' },
            { prop: 'renderEmptyState',     type: '() => ReactNode',            desc: 'Conteúdo quando data = []' },
            { prop: 'onRowAction',          type: '(key) => void',              desc: 'Callback ao clicar/Enter na linha' },
          ].map(r => (
            <div key={r.prop} style={{ display: 'flex', gap: 12, fontSize: 12, alignItems: 'baseline' }}>
              <code style={{ fontFamily: 'monospace', color: 'oklch(0.6204 0.195 253.83)', minWidth: 220, flexShrink: 0 }}>{r.prop}</code>
              <code style={{ fontFamily: 'monospace', color: 'var(--ws-text-2)', minWidth: 200, flexShrink: 0, fontSize: 11 }}>{r.type}</code>
              <span style={{ color: 'var(--ws-text-3)' }}>{r.desc}</span>
            </div>
          ))}
        </div>
      </DS2CodePreview>
    </div>
  )
}
