'use client'

import { useMemo } from 'react'
import { useMetaVideos } from '@/hooks/use-meta-videos'

interface Props { workspaceId: string | null; dataInicio: string; dataFim: string; contaIds?: string[] }

export function AbaVideos({ workspaceId, dataInicio, dataFim, contaIds = [] }: Props) {
  const { rows, isLoading } = useMetaVideos({ workspaceId, dataInicio, dataFim, contaIds })
  const items = useMemo(() => rows, [rows])

  if (isLoading) return <div style={{ padding: 16, fontSize: 12 }}>Carregando vídeos...</div>
  if (!items.length) return <div style={{ padding: 16, fontSize: 12 }}>Sem vídeos para o período.</div>

  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--ws-divider)', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--ws-bg-subtle)' }}>
            <th style={{ padding: 8, textAlign: 'left' }}>Vídeo</th>
            <th style={{ padding: 8, textAlign: 'left' }}>Status</th>
            <th style={{ padding: 8, textAlign: 'right' }}>Views</th>
            <th style={{ padding: 8, textAlign: 'right' }}>P25</th>
            <th style={{ padding: 8, textAlign: 'right' }}>P50</th>
            <th style={{ padding: 8, textAlign: 'right' }}>P75</th>
            <th style={{ padding: 8, textAlign: 'right' }}>P95</th>
            <th style={{ padding: 8, textAlign: 'right' }}>P100</th>
            <th style={{ padding: 8, textAlign: 'right' }}>Thruplay</th>
            <th style={{ padding: 8, textAlign: 'right' }}>Custo/Thruplay</th>
          </tr>
        </thead>
        <tbody>
          {items.map((v) => (
            <tr key={`${v.video_id}-${v.ad_id}`} style={{ borderTop: '1px solid var(--ws-divider)' }}>
              <td style={{ padding: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {v.thumbnail_url ? <img src={v.thumbnail_url} alt={v.video_id} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} /> : null}
                  <div>
                    <div>{v.anuncio_nome ?? v.video_id}</div>
                    {v.source_url ? <a href={v.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>Abrir source</a> : null}
                  </div>
                </div>
              </td>
              <td style={{ padding: 8 }}>{v.status ?? 'PAUSED'}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{v.video_views ?? 0}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{v.video_p25 ?? 0}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{v.video_p50 ?? 0}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{v.video_p75 ?? 0}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{v.video_p95 ?? 0}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{v.video_p100 ?? 0}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{v.thruplay ?? 0}</td>
              <td style={{ padding: 8, textAlign: 'right' }}>{v.cost_per_thruplay ? `R$ ${v.cost_per_thruplay.toFixed(2)}` : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
