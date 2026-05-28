'use client'

import { memo, type CSSProperties } from 'react'
import {
  ChevronDown,
  ChevronUp,
  ImageIcon,
  Layers,
  Pause,
  Play,
  Video,
} from 'lucide-react'
import type { AnuncioPerformance, OrdenacaoAnuncio } from '@/types/meta-ads-anuncios'
import { formatarMoeda, formatarNumero, formatarPorcentagem } from '@/lib/formatar'
import { proxyImagem } from '@/lib/imagem-proxy'
import { useResilientImageSource } from '@/components/meta-ads/carousel-media'
import { configPlataformaCampanha, ordenarPlataformasResumo } from '@/lib/plataformas-meta'
import { configVeiculacao } from '@/lib/veiculacao'
import { PaginacaoAnuncios } from './paginacao-anuncios'

interface Props {
  anuncios: AnuncioPerformance[]
  onAbrirAnuncio: (id: string) => void
  ordenarPor: OrdenacaoAnuncio
  onOrdenarPorChange: (valor: OrdenacaoAnuncio) => void
  isLoading?: boolean
  total?: number
  page: number
  limit: number
  onPageChange: (page: number) => void
  isBusy?: boolean
}

const TIPO_LABEL: Record<AnuncioPerformance['creativeType'], string> = {
  IMAGE: 'Imagem',
  VIDEO: 'Vídeo',
  CAROUSEL: 'Carrossel',
}

function corCpl(v: number) {
  if (v <= 1) return 'var(--ws-green)'
  if (v <= 5) return 'var(--ws-gold)'
  return 'var(--ws-coral)'
}

function corCtr(v: number) {
  if (v >= 3) return 'var(--ws-green)'
  if (v >= 1.5) return 'var(--ws-gold)'
  return 'var(--ws-coral)'
}

function corSpend() {
  return 'var(--ws-blue)'
}

function corHook(v: number | null | undefined) {
  if (v === null || v === undefined) return 'var(--ws-text-3)'
  if (v >= 25) return 'var(--ws-green)'
  if (v >= 15) return 'var(--ws-gold)'
  return 'var(--ws-coral)'
}

export function defaultOrderAsc(col: OrdenacaoAnuncio) {
  return col === 'campanha' || col === 'conjunto' || col === 'anuncio' || col === 'cpl'
}

function normalizarTexto(valor?: string | null) {
  return (valor ?? '').trim().toLocaleLowerCase('pt-BR')
}

function compareTexto(a: string, b: string) {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true })
}

function compareChain(
  left: Array<string | number>,
  right: Array<string | number>,
  comparador: (a: string, b: string) => number,
) {
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    const valueA = left[i]
    const valueB = right[i]

    if (typeof valueA === 'number' && typeof valueB === 'number') {
      const diff = valueA - valueB
      if (diff !== 0) return diff
      continue
    }

    const diff = comparador(String(valueA), String(valueB))
    if (diff !== 0) return diff
  }
  return 0
}

export function sortAnuncios(anuncios: AnuncioPerformance[], ordenarPor: OrdenacaoAnuncio) {
  const asc = defaultOrderAsc(ordenarPor)
  return [...anuncios].sort((a, b) => {
    let diff = 0

    switch (ordenarPor) {
      case 'campanha':
        diff = compareChain(
          [normalizarTexto(a.campaignName || a.campaignId), normalizarTexto(a.adsetName || a.adsetId), normalizarTexto(a.nome || a.id)],
          [normalizarTexto(b.campaignName || b.campaignId), normalizarTexto(b.adsetName || b.adsetId), normalizarTexto(b.nome || b.id)],
          compareTexto,
        )
        break
      case 'conjunto':
        diff = compareChain(
          [normalizarTexto(a.adsetName || a.adsetId), normalizarTexto(a.campaignName || a.campaignId), normalizarTexto(a.nome || a.id)],
          [normalizarTexto(b.adsetName || b.adsetId), normalizarTexto(b.campaignName || b.campaignId), normalizarTexto(b.nome || b.id)],
          compareTexto,
        )
        break
      case 'anuncio':
        diff = compareChain(
          [normalizarTexto(a.nome || a.id), normalizarTexto(a.campaignName || a.campaignId), normalizarTexto(a.adsetName || a.adsetId)],
          [normalizarTexto(b.nome || b.id), normalizarTexto(b.campaignName || b.campaignId), normalizarTexto(b.adsetName || b.adsetId)],
          compareTexto,
        )
        break
      case 'leads':
        diff = a.leads - b.leads
        break
      case 'cpl':
        diff = a.cpl - b.cpl
        break
      case 'ctr':
        diff = a.ctr - b.ctr
        break
      case 'spend':
        diff = a.investimento - b.investimento
        break
      case 'hookRate':
        diff = (a.hookRate ?? Number.NEGATIVE_INFINITY) - (b.hookRate ?? Number.NEGATIVE_INFINITY)
        break
      case 'frequencia':
        diff = a.frequencia - b.frequencia
        break
      case 'score':
      default:
        diff = a.score - b.score
        break
    }

    if (diff === 0) {
      diff = compareChain(
        [normalizarTexto(a.campaignName || a.campaignId), normalizarTexto(a.adsetName || a.adsetId), normalizarTexto(a.nome || a.id)],
        [normalizarTexto(b.campaignName || b.campaignId), normalizarTexto(b.adsetName || b.adsetId), normalizarTexto(b.nome || b.id)],
        compareTexto,
      )
    }

    return asc ? diff : -diff
  })
}

function PlatformPills({ anuncio }: { anuncio: AnuncioPerformance }) {
  const plataformas = ordenarPlataformasResumo(anuncio.plataformasResumo ?? [])

  if (!plataformas.length) {
    return (
      <span style={{
        fontSize: 10,
        color: 'var(--ws-text-3)',
        background: 'var(--ws-surface-2)',
        border: '1px solid var(--ws-divider)',
        borderRadius: 9999,
        padding: '3px 8px',
        whiteSpace: 'nowrap',
      }}>
        Não identificado
      </span>
    )
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
      {plataformas.slice(0, 2).map((pl) => {
        const cfg = configPlataformaCampanha(pl.codigo)
        return (
          <span
            key={pl.codigo}
            title={pl.detalhes.length > 0 ? `${pl.label} · ${pl.detalhes.join(' · ')}` : pl.label}
            style={{
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 9999,
              padding: '3px 8px',
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
      {plataformas.length > 2 && (
        <span style={{
          fontSize: 10,
          fontWeight: 600,
          borderRadius: 9999,
          padding: '3px 8px',
          border: '1px solid var(--ws-divider)',
          background: 'var(--ws-surface-2)',
          color: 'var(--ws-text-3)',
          whiteSpace: 'nowrap',
        }}>
          +{plataformas.length - 2}
        </span>
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
        <div style={{ fontSize: 12, color: 'var(--ws-text-3)', lineHeight: 1.6, maxWidth: 340 }}>
          {isLoading
            ? 'Aguarde enquanto buscamos os anúncios com performance e criativos do período selecionado.'
            : 'Tente ajustar os filtros ou aguarde a sincronização dos dados da conta Meta Ads.'}
        </div>
      </div>
    </div>
  )
}

function SortHeader({
  col,
  label,
  atual,
  onChange,
  align = 'right',
  minWidth,
}: {
  col: OrdenacaoAnuncio
  label: string
  atual: OrdenacaoAnuncio
  onChange: (valor: OrdenacaoAnuncio) => void
  align?: CSSProperties['textAlign']
  minWidth?: number
}) {
  const ativo = atual === col
  const asc = defaultOrderAsc(col)
  const Icon = asc ? ChevronUp : ChevronDown

  return (
    <th
      onClick={() => onChange(col)}
      style={{
        padding: '10px 8px',
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: ativo ? 'var(--ws-text-1)' : 'var(--ws-text-3)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        background: 'rgba(14,20,42,0.02)',
        cursor: 'pointer',
        userSelect: 'none',
        textAlign: align,
        minWidth,
      }}
    >
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
      }}>
        {label}
        <Icon size={11} style={{ opacity: ativo ? 0.9 : 0.25 }} />
      </span>
    </th>
  )
}

function RowAnuncio({
  anuncio,
  onAbrirAnuncio,
}: {
  anuncio: AnuncioPerformance
  onAbrirAnuncio: (id: string) => void
}) {
  const statusCfg = configVeiculacao(anuncio.veiculacao)
  const isVideo = anuncio.creativeType === 'VIDEO'
  const carouselItems = Array.isArray(anuncio.carouselItems) ? anuncio.carouselItems : []
  const isCarousel = anuncio.creativeType === 'CAROUSEL' || carouselItems.length > 0
  const imageState = useResilientImageSource(
    isCarousel
      ? [carouselItems[0]?.image_url_hq, carouselItems[0]?.picture, anuncio.imageUrlHq, anuncio.thumbnailUrl]
      : [anuncio.imageUrlHq, anuncio.thumbnailUrl],
    `${anuncio.id}:${carouselItems.length}`,
  )
  const mediaSrc = imageState.src ? (proxyImagem(imageState.src) ?? imageState.src) : null
  const hookRate = anuncio.hookRate ?? null
  const acoesIcon = ['ATIVO', 'APRENDIZADO', 'APRENDIZADO_LIMITADO'].includes(anuncio.veiculacao) ? Pause : Play
  const AcoesIcon = acoesIcon

  return (
    <tr
      onClick={() => onAbrirAnuncio(anuncio.id)}
      style={{
        borderBottom: '1px solid var(--ws-divider)',
        cursor: 'pointer',
        transition: 'background 150ms ease',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(62,91,255,0.03)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <td style={{ padding: '8px 10px 8px 14px', width: 84 }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAbrirAnuncio(anuncio.id)
          }}
          title={isCarousel ? `${carouselItems.length} itens` : anuncio.nome}
          style={{
            position: 'relative',
            width: 52,
            aspectRatio: '9/16',
            padding: 0,
            border: '1px solid var(--ws-divider)',
            borderRadius: 10,
            overflow: 'hidden',
            background: 'rgba(14,20,42,0.04)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {mediaSrc ? (
            <img
              src={mediaSrc}
              alt={anuncio.nome}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              referrerPolicy="no-referrer"
              loading="lazy"
              onError={imageState.onError}
            />
          ) : (
            <span style={{ color: 'var(--ws-text-3)', opacity: 0.7 }}>
                {anuncio.creativeType === 'VIDEO' ? (
                  <Video size={16} />
                ) : isCarousel ? (
                <Layers size={16} />
              ) : (
                <ImageIcon size={16} />
              )}
            </span>
          )}

          <span style={{
            position: 'absolute',
            top: 4,
            right: 4,
            fontSize: 8,
            fontWeight: 600,
            padding: '2px 5px',
            borderRadius: 9999,
            background: 'rgba(0,0,0,0.45)',
            color: 'white',
            lineHeight: 1,
          }}>
            {TIPO_LABEL[anuncio.creativeType]}
          </span>

          {isVideo && mediaSrc && (
            <span style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.12)',
            }}>
              <span style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.88)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--ws-glass-shadow-sm)',
              }}>
                <Play size={11} style={{ color: 'var(--ws-text-1)', marginLeft: 1 }} />
              </span>
            </span>
          )}
        </button>
      </td>

      <td style={{ padding: '8px 10px 8px 0', minWidth: 180 }} title={`${anuncio.nome} · ${anuncio.id}`}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ws-text-1)',
            lineHeight: 1.24,
          }}>
            {anuncio.nome}
          </div>
        </div>
      </td>

      <td style={{ padding: '8px 10px', minWidth: 170 }} title={`${anuncio.campaignName} · ${anuncio.campaignId}`}>
        <div style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--ws-text-1)',
          lineHeight: 1.24,
        }}>
          {anuncio.campaignName}
        </div>
      </td>

      <td style={{ padding: '8px 10px', minWidth: 170 }} title={`${anuncio.adsetName} · ${anuncio.adsetId}`}>
        <div style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          fontSize: 11,
          fontWeight: 500,
          color: 'var(--ws-text-1)',
          lineHeight: 1.24,
        }}>
          {anuncio.adsetName}
        </div>
      </td>

      <td style={{ padding: '8px 8px', whiteSpace: 'nowrap', textAlign: 'center' }}>
        <span
          title={anuncio.veiculacaoMotivo || anuncio.veiculacaoLabel}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            fontWeight: 600,
            padding: '3px 7px',
            borderRadius: 9999,
            background: statusCfg.corBg,
            border: `1px solid ${statusCfg.corBorder}`,
            color: statusCfg.cor,
          }}
        >
          {anuncio.veiculacaoLabel}
        </span>
      </td>

      <td style={{ padding: '8px 8px', minWidth: 120, textAlign: 'center' }}>
        <PlatformPills anuncio={anuncio} />
      </td>

      <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap', minWidth: 74 }}>
        <span style={{ fontWeight: 600, color: 'var(--ws-gold)' }}>
          {formatarNumero(anuncio.leads)}
        </span>
      </td>

      <td style={{ padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        <span style={{ fontWeight: 600, color: corCpl(anuncio.cpl) }}>
          {formatarMoeda(anuncio.cpl)}
        </span>
      </td>

      <td style={{ padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        <span style={{ fontWeight: 600, color: corCtr(anuncio.ctr) }}>
          {formatarPorcentagem(anuncio.ctr)}
        </span>
      </td>

      <td style={{ padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        <span style={{ fontWeight: 600, color: corSpend() }}>
          {formatarMoeda(anuncio.investimento)}
        </span>
      </td>

      <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap' }}>
        <span style={{ fontWeight: 600, color: corHook(hookRate) }}>
          {hookRate === null ? '—' : formatarPorcentagem(hookRate)}
        </span>
      </td>

      <td style={{ padding: '8px 6px', textAlign: 'center', whiteSpace: 'nowrap' }}>
        <button
          type="button"
          title="Ação rápida em breve"
          disabled
          style={{
            width: 30,
            height: 30,
            borderRadius: 9999,
            border: `1px solid ${statusCfg.corBorder}`,
            background: statusCfg.corBg,
            color: statusCfg.cor,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'not-allowed',
            opacity: 0.75,
          }}
        >
          <AcoesIcon size={13} />
        </button>
      </td>
    </tr>
  )
}

function ListaAnunciosBase({
  anuncios,
  onAbrirAnuncio,
  ordenarPor,
  onOrdenarPorChange,
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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    }}>
      <PaginacaoAnuncios
        page={page}
        limit={limit}
        total={total ?? 0}
        onPageChange={onPageChange}
        isBusy={isBusy}
      />

      <div style={{
        overflowX: 'auto',
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)',
        position: 'relative',
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }} />

        <table style={{ width: '100%', minWidth: 1240, borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--ws-divider)' }}>
              <th style={{ padding: '10px 8px 10px 14px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ws-text-3)', fontWeight: 600, background: 'rgba(14,20,42,0.02)', whiteSpace: 'nowrap', width: 84 }}>
                Criativo
              </th>
              <SortHeader col="anuncio" label="Anúncio" atual={ordenarPor} onChange={onOrdenarPorChange} align="left" minWidth={180} />
              <SortHeader col="campanha" label="Campanha" atual={ordenarPor} onChange={onOrdenarPorChange} align="left" minWidth={170} />
              <SortHeader col="conjunto" label="Conjunto" atual={ordenarPor} onChange={onOrdenarPorChange} align="left" minWidth={170} />
              <th style={{ padding: '10px 8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ws-text-3)', fontWeight: 600, background: 'rgba(14,20,42,0.02)', whiteSpace: 'nowrap', textAlign: 'center', minWidth: 108 }}>
                Status efetivo
              </th>
              <th style={{ padding: '10px 8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ws-text-3)', fontWeight: 600, background: 'rgba(14,20,42,0.02)', whiteSpace: 'nowrap', textAlign: 'center', minWidth: 120 }}>
                Plataformas
              </th>
              <SortHeader col="leads" label="Leads" atual={ordenarPor} onChange={onOrdenarPorChange} align="center" minWidth={74} />
              <SortHeader col="cpl" label="CPL" atual={ordenarPor} onChange={onOrdenarPorChange} align="right" minWidth={88} />
              <SortHeader col="ctr" label="CTR" atual={ordenarPor} onChange={onOrdenarPorChange} align="right" minWidth={88} />
              <SortHeader col="spend" label="Spend" atual={ordenarPor} onChange={onOrdenarPorChange} align="right" minWidth={92} />
              <SortHeader col="hookRate" label="Hook Rate" atual={ordenarPor} onChange={onOrdenarPorChange} align="center" minWidth={96} />
              <th style={{ padding: '10px 8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ws-text-3)', fontWeight: 600, background: 'rgba(14,20,42,0.02)', whiteSpace: 'nowrap', textAlign: 'center', minWidth: 64 }}>
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {anuncios.map((anuncio) => (
              <RowAnuncio
                key={anuncio.id}
                anuncio={anuncio}
                onAbrirAnuncio={onAbrirAnuncio}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export const ListaAnuncios = memo(ListaAnunciosBase)
