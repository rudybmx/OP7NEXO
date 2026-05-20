'use client'

import { memo } from 'react'
import { Video } from 'lucide-react'
import type { AnuncioPerformance } from '@/types/meta-ads-anuncios'
import { CardCriativo, type CardCriativoData } from '@/components/meta-ads/card-criativo'
import { configPlataformaCampanha } from '@/lib/plataformas-meta'
import { configVeiculacao } from '@/lib/veiculacao'
import { formatarMoeda, formatarNumero, formatarPorcentagem } from '@/lib/formatar'
import { PaginacaoAnuncios } from './paginacao-anuncios'

interface Props {
  anuncios: AnuncioPerformance[]
  onAbrirAnuncio: (id: string) => void
  isLoading?: boolean
  total?: number
  page: number
  limit: number
  onPageChange: (page: number) => void
  isBusy?: boolean
}

function corScore(s: number) {
  if (s >= 75) return 'var(--ws-green)'
  if (s >= 40) return 'var(--ws-gold)'
  return 'var(--ws-coral)'
}

function corHook(v: number | null | undefined) {
  if (v === null || v === undefined) return 'var(--ws-text-3)'
  if (v >= 25) return 'var(--ws-green)'
  if (v >= 15) return 'var(--ws-gold)'
  return 'var(--ws-coral)'
}

function mapAnuncioToCardData(a: AnuncioPerformance): CardCriativoData {
  return {
    id: a.id,
    nome: a.nome,
    tipo: a.creativeType,
    thumbnailUrl: a.imageUrlHq ?? a.thumbnailUrl ?? undefined,
    imageUrlHq: a.imageUrlHq ?? a.thumbnailUrl ?? undefined,
    linkAnuncio: a.linkAnuncio ?? a.permalinkUrl ?? undefined,
    carouselItems: a.carouselItems ?? [],
    leads: a.leads,
    ctr: a.ctr,
    cpl: a.cpl,
  }
}

function PlatformPills({ anuncio }: { anuncio: AnuncioPerformance }) {
  if (!anuncio.plataformasResumo || anuncio.plataformasResumo.length === 0) {
    return (
      <span style={{
        fontSize: 10,
        color: 'var(--ws-text-3)',
        background: 'var(--ws-surface-2)',
        border: '1px solid var(--ws-divider)',
        borderRadius: 9999,
        padding: '2px 8px',
      }}>
        Não identificado
      </span>
    )
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {anuncio.plataformasResumo.slice(0, 2).map((pl) => {
        const cfg = configPlataformaCampanha(pl.codigo)
        return (
          <span
            key={pl.codigo}
            title={pl.detalhes.length > 0 ? `${pl.label} · ${pl.detalhes.join(' · ')}` : pl.label}
            style={{
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 9999,
              padding: '2px 8px',
              border: `1px solid ${cfg.border}`,
              background: cfg.bg,
              color: cfg.cor,
              whiteSpace: 'nowrap',
            }}
          >
            {pl.label}
          </span>
        )
      })}
      {anuncio.plataformasResumo.length > 2 && (
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          borderRadius: 9999,
          padding: '2px 8px',
          border: '1px solid var(--ws-divider)',
          background: 'var(--ws-surface-2)',
          color: 'var(--ws-text-3)',
        }}>
          +{anuncio.plataformasResumo.length - 2}
        </span>
      )}
    </div>
  )
}

function CardFooter({ anuncio }: { anuncio: AnuncioPerformance }) {
  const hookRate = anuncio.hookRate ?? null
  const totalSpend = anuncio.investimento ?? 0
  const config = configVeiculacao(anuncio.veiculacao)

  const metricas = [
    { label: 'Leads', valor: formatarNumero(anuncio.leads), cor: 'var(--ws-gold)' },
    { label: 'CPL', valor: formatarMoeda(anuncio.cpl), cor: anuncio.cpl <= 5 ? 'var(--ws-green)' : 'var(--ws-coral)' },
    { label: 'CTR', valor: formatarPorcentagem(anuncio.ctr), cor: 'var(--ws-text-1)' },
    { label: 'Gasto', valor: formatarMoeda(totalSpend), cor: 'var(--ws-blue)' },
    { label: 'Hook Rate', valor: hookRate !== null ? formatarPorcentagem(hookRate) : '—', cor: corHook(hookRate) },
    { label: 'Score', valor: String(anuncio.score), cor: corScore(anuncio.score) },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ws-text-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginBottom: 2,
          }}>
            {anuncio.nome}
          </div>
          <div style={{ fontSize: 10, color: 'var(--ws-text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {anuncio.campaignName} · {anuncio.adsetName}
          </div>
        </div>
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          borderRadius: 9999,
          padding: '2px 8px',
          border: `1px solid ${config.corBorder}`,
          background: config.corBg,
          color: config.cor,
          flexShrink: 0,
        }}>
          {anuncio.veiculacaoLabel}
        </span>
      </div>

      <PlatformPills anuncio={anuncio} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 6,
      }}>
        {metricas.map((metrica) => (
          <div
            key={metrica.label}
            style={{
              background: 'var(--ws-surface-2)',
              border: '1px solid var(--ws-divider)',
              borderRadius: 'var(--ws-radius-md)',
              padding: '8px 9px',
              minWidth: 0,
            }}
          >
            <div style={{
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--ws-text-3)',
              marginBottom: 3,
            }}>
              {metrica.label}
            </div>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: metrica.cor,
              lineHeight: 1.15,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {metrica.valor}
            </div>
          </div>
        ))}
      </div>

      {anuncio.creativeType === 'VIDEO' && anuncio.videoRetentionData && anuncio.videoRetentionData.length > 0 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          borderRadius: 'var(--ws-radius-md)',
          background: 'var(--ws-blue-soft)',
          border: '1px solid rgba(62,91,255,0.16)',
          color: 'var(--ws-blue)',
          fontSize: 10,
          fontWeight: 600,
          flexWrap: 'wrap',
        }}>
          <Video size={11} />
          Retenção de vídeo
          {anuncio.videoRetentionData.slice(0, 4).map((p, idx) => (
            <span key={p.label} style={{ color: 'var(--ws-text-2)', fontWeight: 500 }}>
              {idx > 0 ? '·' : ''} {p.label} {p.percentage.toFixed(0)}%
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ isLoading }: { isLoading?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '64px 24px',
      gap: 16,
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ws-text-1)', marginBottom: 6 }}>
          {isLoading ? 'Carregando anúncios' : 'Nenhum anúncio encontrado'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ws-text-3)', lineHeight: 1.6, maxWidth: 320 }}>
          {isLoading
            ? 'Aguarde enquanto buscamos os anúncios com performance e criativos do período selecionado.'
            : 'Tente ajustar os filtros ou aguarde a sincronização dos dados da conta Meta Ads.'}
        </div>
      </div>
    </div>
  )
}

function GridAnunciosBase({
  anuncios,
  onAbrirAnuncio,
  isLoading,
  total,
  page,
  limit,
  onPageChange,
  isBusy,
}: Props) {
  if (anuncios.length === 0) {
    return <EmptyState isLoading={isLoading} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PaginacaoAnuncios
        page={page}
        limit={limit}
        total={total ?? 0}
        onPageChange={onPageChange}
        isBusy={isBusy}
      />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: 14,
      }}>
        {anuncios.map((anuncio, idx) => {
          const badge = anuncio.veiculacaoCorBg
            ? { label: anuncio.veiculacaoLabel, bg: anuncio.veiculacaoCorBg }
            : {
                label: anuncio.veiculacaoLabel,
                bg: configVeiculacao(anuncio.veiculacao).corBg,
              }

          return (
            <CardCriativo
              key={anuncio.id}
              data={mapAnuncioToCardData(anuncio)}
              onClick={() => onAbrirAnuncio(anuncio.id)}
              badgeTopLeft={(
                <div style={{
                  background: 'var(--ws-blue)',
                  color: 'white',
                  fontSize: 9,
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: 9999,
                }}>
                  #{idx + 1}
                </div>
              )}
              badgeStatus={badge}
              renderFooter={() => <CardFooter anuncio={anuncio} />}
            />
          )
        })}
      </div>
    </div>
  )
}

export const GridAnuncios = memo(GridAnunciosBase)
