'use client'

import { GitCommit } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDateBR } from '@/lib/gantt-utils'
import type { PmpVersion } from '@/types/pmp'

interface PmpVersionHistoryProps {
  versions: PmpVersion[]
  onRestore?: (versionId: string) => void
}

export default function PmpVersionHistory({ versions, onRestore }: PmpVersionHistoryProps) {
  return (
    <section className="rounded-lg border border-border/10 bg-card">
      <div className="relative px-6 py-2">
        <div className="absolute top-6 bottom-6 left-[35px] border-l-2 border-dashed border-[rgba(15,39,68,0.15)]" />
        <div className="space-y-0">
          {versions.map((version, index) => {
            const isCurrent = index === 0

            return (
              <article
                key={version.id}
                className="relative flex items-start gap-4 border-b border-border/10 py-4 last:border-b-0"
              >
                <div className="relative z-10 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/40 text-foreground">
                  <GitCommit className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-[13px] font-semibold text-foreground">{version.version}</div>
                    {isCurrent && (
                      <Badge className="rounded-full border border-[var(--ws-gold)]/30 bg-[var(--ws-gold)]/10 px-2 py-0.5 text-[11px] font-medium text-[#92722a]">
                        ATUAL
                      </Badge>
                    )}
                    <div className="ml-auto text-[12px] text-muted-foreground">{formatDateBR(version.createdAt)}</div>
                  </div>

                  <p className="mt-2 text-[13px] text-foreground/70">{version.changesSummary}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className="text-[12px] text-muted-foreground">Por: {version.createdBy}</span>
                    {!isCurrent && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onRestore?.(version.id)}
                        className="h-7 border-[#0f2744]/15 text-foreground hover:bg-muted/30"
                      >
                        Restaurar
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
