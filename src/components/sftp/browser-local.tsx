'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, X, FileIcon, FolderUp } from 'lucide-react'

interface Props {
  destinoRemoto: string
  onEnviar: (files: File[]) => Promise<void>
  disabled?: boolean
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function BrowserLocal({ destinoRemoto, onEnviar, disabled }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)

  const addFiles = (fs: FileList | File[]) => {
    const arr = Array.from(fs)
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name + ':' + f.size))
      return [...prev, ...arr.filter((f) => !seen.has(f.name + ':' + f.size))]
    })
  }

  const removerArquivo = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  const enviar = async () => {
    if (files.length === 0) return
    setEnviando(true)
    try {
      await onEnviar(files)
      setFiles([])
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-semibold">💻 Local (seu PC)</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          <FolderUp className="h-4 w-4" />
          Adicionar
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer.files) addFiles(e.dataTransfer.files)
        }}
        className={`flex-1 overflow-auto p-3 transition-colors ${dragOver ? 'bg-primary/10' : ''}`}
      >
        {files.length === 0 ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-center text-sm text-muted-foreground">
            <Upload className="h-8 w-8 opacity-50" />
            <div>Arraste arquivos aqui</div>
            <div className="text-xs">ou clique em "Adicionar"</div>
          </div>
        ) : (
          <ul className="space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
                <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{f.name}</div>
                  <div className="text-xs text-muted-foreground">{formatSize(f.size)}</div>
                </div>
                <Button variant="ghost" size="icon-xs" onClick={() => removerArquivo(i)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border p-3">
        <Button
          className="w-full"
          disabled={files.length === 0 || enviando || disabled}
          onClick={enviar}
        >
          <Upload className="h-4 w-4" />
          Enviar {files.length > 0 ? `(${files.length})` : ''} → {destinoRemoto || '/'}
        </Button>
      </div>
    </div>
  )
}
