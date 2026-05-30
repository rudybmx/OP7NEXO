'use client'

import { type ReactNode } from 'react'
import { useMetaVideos } from '@/hooks/use-meta-videos'
import { AlertTriangle, Loader2, Video } from 'lucide-react'

interface Props { workspaceId: string | null; dataInicio: string; dataFim: string; contaIds?: string[] }

function EstadoVideos({
  titulo,
  descricao,
  icone,
  cor,
}: {
  titulo: string
  descricao: string
  icone: ReactNode
  cor: string
}) {
  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow)',
      padding: '20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 220,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, width: 'min(560px, 100%)' }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 16,
          background: 'var(--ws-surface-2)',
          border: '1px solid var(--ws-glass-border)',
          color: cor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          {icone}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ws-text-1)', lineHeight: 1.25, marginBottom: 6 }}>
            {titulo}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ws-text-2)' }}>
            {descricao}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatarStatus(status: string | null): string {
  if (!status) return 'Sem status'
  switch (status.toUpperCase()) {
    case 'ACTIVE':
      return 'Ativo'
    case 'PAUSED':
      return 'Pausado'
    case 'ARCHIVED':
      return 'Arquivado'
    case 'DELETED':
      return 'Excluído'
    case 'IN_PROCESS':
      return 'Em processamento'
    default:
      return status.replace(/_/g, ' ')
  }
}

export function AbaVideos({ workspaceId, dataInicio, dataFim, contaIds = [] }: Props) {
  const { rows, isLoading, error } = useMetaVideos({ workspaceId, dataInicio, dataFim, contaIds })
  const items = rows

  if (isLoading) {
    return (
      <EstadoVideos
        titulo="Carregando dados de vídeo..."
        descricao="Buscando apenas anúncios e criativos que tenham métricas de vídeo no período selecionado."
        cor="var(--ws-blue)"
        icone={<Loader2 size={18} className="animate-spin" />}
      />
    )
  }

  if (error) {
    return (
      <EstadoVideos
        titulo="Não foi possível carregar os dados de vídeo"
        descricao="A API não respondeu com os dados de vídeo desta conta e período. Ajuste os filtros ou tente novamente mais tarde."
        cor="#a32d2d"
        icone={<AlertTriangle size={18} />}
      />
    )
  }

  if (!items.length) {
    return (
      <EstadoVideos
        titulo="Nenhum criativo de vídeo encontrado para a conta e período selecionados."
        descricao="Esta aba considera somente anúncios e criativos com métricas de vídeo retornadas pela API."
        cor="var(--ws-gold)"
        icone={<Video size={18} />}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)',
        padding: '14px 16px',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)', marginBottom: 4 }}>
          Vídeo
        </div>
        <div style={{ fontSize: 12, color: 'var(--ws-text-2)', lineHeight: 1.5 }}>
          Esta aba mostra apenas peças com métricas de vídeo registradas. Use os quartis para comparar retenção e custo por visualização.
        </div>
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--ws-divider)', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--ws-bg-subtle)' }}>
              <th style={{ padding: 8, textAlign: 'left' }}>Vídeo</th>
              <th style={{ padding: 8, textAlign: 'left' }}>Status</th>
              <th style={{ padding: 8, textAlign: 'right' }}>Visualizações</th>
              <th style={{ padding: 8, textAlign: 'right' }}>Retenção 25%</th>
              <th style={{ padding: 8, textAlign: 'right' }}>Retenção 50%</th>
              <th style={{ padding: 8, textAlign: 'right' }}>Retenção 75%</th>
              <th style={{ padding: 8, textAlign: 'right' }}>Retenção 95%</th>
              <th style={{ padding: 8, textAlign: 'right' }}>Retenção 100%</th>
              <th style={{ padding: 8, textAlign: 'right' }}>ThruPlays</th>
              <th style={{ padding: 8, textAlign: 'right' }}>Custo por ThruPlay</th>
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
                      {v.source_url ? <a href={v.source_url} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>Abrir original</a> : null}
                    </div>
                  </div>
                </td>
                <td style={{ padding: 8 }}>{formatarStatus(v.status)}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{v.video_views ?? 0}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{v.video_p25 ?? 0}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{v.video_p50 ?? 0}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{v.video_p75 ?? 0}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{v.video_p95 ?? 0}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{v.video_p100 ?? 0}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>{v.thruplay ?? 0}</td>
                <td style={{ padding: 8, textAlign: 'right' }}>
                  {v.cost_per_thruplay !== null
                    ? `R$ ${v.cost_per_thruplay.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
