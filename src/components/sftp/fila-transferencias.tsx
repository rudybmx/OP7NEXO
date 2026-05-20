'use client'

import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Upload, Download, X, CheckCircle2, AlertCircle } from 'lucide-react'
import type { Transfer } from '@/hooks/use-sftp'

interface Props {
  transfers: Transfer[]
  onLimpar: () => void
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function FilaTransferencias({ transfers, onLimpar }: Props) {
  if (transfers.length === 0) return null
  const concluidas = transfers.filter((t) => t.status === 'done' || t.status === 'error').length

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h3 className="text-sm font-semibold">
          Transferências <span className="text-muted-foreground">({transfers.length})</span>
        </h3>
        {concluidas > 0 && (
          <Button variant="ghost" size="xs" onClick={onLimpar}>
            <X className="h-3.5 w-3.5" />
            Limpar concluídas
          </Button>
        )}
      </div>
      <ul className="max-h-48 space-y-1.5 overflow-auto p-3">
        {transfers.map((t) => {
          const pct = t.total > 0 ? (t.loaded / t.total) * 100 : t.status === 'done' ? 100 : 0
          return (
            <li key={t.id} className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                {t.kind === 'upload' ? (
                  <Upload className="h-3.5 w-3.5 text-blue-500" />
                ) : (
                  <Download className="h-3.5 w-3.5 text-green-500" />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                {t.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                {t.status === 'error' && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                <span className="shrink-0 text-muted-foreground">
                  {formatSize(t.loaded)}
                  {t.total > 0 && ` / ${formatSize(t.total)}`}
                </span>
              </div>
              <Progress value={pct} className="h-1.5" />
              {t.error && <div className="text-xs text-destructive">{t.error}</div>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
