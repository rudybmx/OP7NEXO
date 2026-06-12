'use client'

import React from 'react'
import { Loader2, Sparkles, AlertTriangle, TrendingUp, Info } from 'lucide-react'
import { WSTable, WSTableShell } from '@/components/ui/ws-table'
import { useAiInsights } from '@/hooks/use-ai-settings'

const TH: React.CSSProperties = {
  padding: '8px 14px', fontSize: 10, fontWeight: 600, color: 'var(--ws-text-3)',
  textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.06em',
  whiteSpace: 'nowrap', background: 'rgba(62,91,255,0.04)', borderBottom: '1px solid var(--ws-divider)',
}
const TD: React.CSSProperties = { padding: '9px 14px', fontSize: 13, color: 'var(--ws-text-1)' }

function tipoBadge(tipo: string) {
  const t = (tipo || '').toUpperCase()
  const map: Record<string, { bg: string; color: string; Icon: typeof Info }> = {
    ALERTA: { bg: 'rgba(163,45,45,0.12)', color: '#a32d2d', Icon: AlertTriangle },
    OPORTUNIDADE: { bg: 'rgba(15,168,86,0.12)', color: 'var(--ws-green)', Icon: TrendingUp },
    INFO: { bg: 'rgba(62,91,255,0.10)', color: 'var(--ws-blue)', Icon: Info },
  }
  const cfg = map[t] ?? map.INFO
  const { Icon } = cfg
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6,
      background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 600,
    }}>
      <Icon size={12} /> {t}
    </span>
  )
}

/** Tabela (read-only) de insights de IA agregados. Reutilizada na Central de IA
 * (aba) e na página dedicada de Análises de IA. */
export function InsightsIaTabela({ workspaceId, limit = 50 }: { workspaceId?: string; limit?: number }) {
  const { insights, isLoading } = useAiInsights(workspaceId, limit)

  return (
    <WSTableShell>
      {isLoading ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--ws-blue)' }} />
        </div>
      ) : insights.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <Sparkles size={32} style={{ color: 'var(--ws-text-3)', marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: 'var(--ws-text-2)' }}>Nenhum insight de IA gerado ainda</p>
        </div>
      ) : (
        <WSTable minWidth={820}>
          <thead>
            <tr>{['Tipo', 'Insight', 'Workspace', 'Conta', 'Modelo', 'Gerado'].map(h => <th key={h} style={TH}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {insights.map(i => (
              <tr key={i.id} style={{ borderBottom: '1px solid var(--ws-divider)' }}>
                <td style={{ ...TD, whiteSpace: 'nowrap' }}>{tipoBadge(i.tipo)}</td>
                <td style={{ ...TD, maxWidth: 360 }}>
                  <div style={{ fontWeight: 600 }}>{i.titulo}</div>
                  <div style={{ fontSize: 12, color: 'var(--ws-text-2)', marginTop: 2 }}>{i.mensagem}</div>
                </td>
                <td style={{ ...TD, color: 'var(--ws-text-2)', whiteSpace: 'nowrap' }}>{i.workspace_nome || '—'}</td>
                <td style={{ ...TD, color: 'var(--ws-text-2)', whiteSpace: 'nowrap' }}>{i.account_name || '—'}</td>
                <td style={{ ...TD, whiteSpace: 'nowrap' }}><code style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--ws-text-3)' }}>{i.model_usado || '—'}</code></td>
                <td style={{ ...TD, color: 'var(--ws-text-3)', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {i.gerado_em ? new Date(i.gerado_em).toLocaleString('pt-BR') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </WSTable>
      )}
    </WSTableShell>
  )
}
