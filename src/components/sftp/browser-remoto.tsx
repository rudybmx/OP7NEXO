'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { SftpEntry } from '@/hooks/use-sftp'
import {
  ArrowUp,
  RefreshCw,
  FolderPlus,
  Trash2,
  Download,
  Folder,
  File as FileIco,
  Link as LinkIco,
  Pencil,
} from 'lucide-react'

interface Props {
  path: string
  onPathChange: (p: string) => void
  entries: SftpEntry[]
  loading: boolean
  erro: string | null
  onRecarregar: () => void
  onCriarPasta: (nome: string) => Promise<void>
  onRemover: (entry: SftpEntry) => Promise<void>
  onBaixar: (entry: SftpEntry) => Promise<void>
  onRenomear: (entry: SftpEntry, novoNome: string) => Promise<void>
  disabled?: boolean
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function pathParent(p: string): string {
  if (!p || p === '/') return '/'
  const trimmed = p.replace(/\/+$/, '')
  const idx = trimmed.lastIndexOf('/')
  if (idx <= 0) return '/'
  return trimmed.slice(0, idx)
}

export function BrowserRemoto(props: Props) {
  const {
    path,
    onPathChange,
    entries,
    loading,
    erro,
    onRecarregar,
    onCriarPasta,
    onRemover,
    onBaixar,
    onRenomear,
    disabled,
  } = props
  const [pathInput, setPathInput] = useState(path)
  const [novaPasta, setNovaPasta] = useState('')
  const [criando, setCriando] = useState(false)

  useEffect(() => {
    setPathInput(path)
  }, [path])

  const submitPath = (e: React.FormEvent) => {
    e.preventDefault()
    onPathChange(pathInput.trim() || '/')
  }

  const criarPasta = async () => {
    if (!novaPasta.trim()) return
    const nome = novaPasta.trim()
    const full = path.endsWith('/') ? path + nome : path + '/' + nome
    await onCriarPasta(full)
    setNovaPasta('')
    setCriando(false)
    onRecarregar()
  }

  const iconePara = (type: SftpEntry['type']) => {
    if (type === 'dir') return <Folder className="h-4 w-4 text-blue-500" />
    if (type === 'link') return <LinkIco className="h-4 w-4 text-purple-500" />
    return <FileIco className="h-4 w-4 text-muted-foreground" />
  }

  const navegar = (entry: SftpEntry) => {
    if (entry.type === 'dir') onPathChange(entry.path)
  }

  const promptRenomear = async (entry: SftpEntry) => {
    const novo = window.prompt('Novo nome:', entry.name)
    if (!novo || novo === entry.name) return
    await onRenomear(entry, novo)
  }

  const promptRemover = async (entry: SftpEntry) => {
    const tipo = entry.type === 'dir' ? 'pasta (e tudo dentro)' : 'arquivo'
    if (!window.confirm(`Remover ${tipo} "${entry.name}"?`)) return
    await onRemover(entry)
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card">
      <div className="space-y-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">🌐 Remoto (servidor)</h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onPathChange(pathParent(path))}
              disabled={path === '/' || disabled}
              title="Pasta acima"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={onRecarregar} disabled={disabled} title="Recarregar">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setCriando((v) => !v)}
              disabled={disabled}
              title="Nova pasta"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <form onSubmit={submitPath} className="flex gap-1">
          <Input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder="/"
            className="font-mono text-xs"
          />
          <Button type="submit" size="sm" variant="outline" disabled={disabled}>
            Ir
          </Button>
        </form>
        {criando && (
          <div className="flex gap-1">
            <Input
              value={novaPasta}
              onChange={(e) => setNovaPasta(e.target.value)}
              placeholder="nome-da-pasta"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  criarPasta()
                }
                if (e.key === 'Escape') setCriando(false)
              }}
            />
            <Button size="sm" onClick={criarPasta}>
              Criar
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-2">
        {erro ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {erro}
          </div>
        ) : loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : entries.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Pasta vazia</div>
        ) : (
          <ul className="space-y-0.5">
            {entries.map((e) => (
              <li
                key={e.path}
                className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <button
                  onClick={() => navegar(e)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  disabled={e.type !== 'dir'}
                  title={e.path}
                >
                  {iconePara(e.type)}
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {e.type === 'dir' ? '' : formatSize(e.size)}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  {e.type === 'file' && (
                    <Button variant="ghost" size="icon-xs" onClick={() => onBaixar(e)} title="Baixar">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-xs" onClick={() => promptRenomear(e)} title="Renomear">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => promptRemover(e)} title="Remover">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
