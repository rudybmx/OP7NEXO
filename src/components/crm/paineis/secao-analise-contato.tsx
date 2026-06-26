'use client'

import useSWR from 'swr'
import { Sparkles, Loader2 } from 'lucide-react'
import api from '@/lib/api-client'

interface ContatoAnalise {
  id: string
  nome: string | null
  resumo_ia: string | null
  sentimento_ia: string | null
  score_lead_ia: number | null
  lead_score: number | null
  perfil_json: Record<string, unknown> | null
}

const SENTIMENTO_CLASSE: Record<string, string> = {
  positivo: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  neutro: 'bg-muted/70 text-muted-foreground',
  negativo: 'bg-destructive/12 text-destructive',
}

/**
 * Análise IA do contato (resumo, sentimento, score), dado real de GET /contatos/{id}.
 * `ativo` liga o polling enquanto o modal está aberto ("sempre atualizando").
 */
export function SecaoAnaliseContato({
  contatoId,
  ativo = true,
}: {
  contatoId?: string | null
  ativo?: boolean
}) {
  const { data, isLoading } = useSWR<ContatoAnalise>(
    contatoId ? `/contatos/${contatoId}` : null,
    (k: string) => api.get(k),
    { refreshInterval: ativo ? 20000 : 0, revalidateOnFocus: false },
  )

  const score = data?.score_lead_ia ?? data?.lead_score ?? null
  const sentimento = data?.sentimento_ia?.toLowerCase()
  const perfilEntradas = data?.perfil_json
    ? Object.entries(data.perfil_json).filter(([, v]) => v != null && v !== '').slice(0, 6)
    : []
  const temConteudo = Boolean(data?.resumo_ia || sentimento || score != null || perfilEntradas.length)

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="size-3.5 text-primary" />
        <span className="ds-kpi-label text-primary">Análise IA</span>
        {isLoading && !data && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        <div className="ml-auto flex items-center gap-1.5">
          {sentimento && (
            <span
              className={`rounded-full px-1.5 py-0.5 text-micro font-semibold capitalize ${
                SENTIMENTO_CLASSE[sentimento] ?? 'bg-muted/70 text-muted-foreground'
              }`}
            >
              {sentimento}
            </span>
          )}
          {score != null && (
            <span className="rounded-full bg-primary/12 px-1.5 py-0.5 text-micro font-semibold text-primary">
              Score {score}
            </span>
          )}
        </div>
      </div>

      {!contatoId ? (
        <p className="text-xs text-muted-foreground">Card sem contato vinculado.</p>
      ) : !temConteudo ? (
        <p className="text-xs text-muted-foreground">Sem análise ainda — atualiza conforme a conversa avança.</p>
      ) : (
        <div className="space-y-2">
          {data?.resumo_ia && (
            <p className="text-sm leading-relaxed text-foreground">{data.resumo_ia}</p>
          )}
          {perfilEntradas.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
              {perfilEntradas.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="truncate text-micro uppercase text-muted-foreground">{k.replace(/_/g, ' ')}</dt>
                  <dd className="truncate text-xs text-foreground">{String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </div>
  )
}
