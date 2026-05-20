'use client'

import { useState } from 'react'
import { ImageIcon, Video, Layers, Play, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { proxyImagem } from '@/lib/imagem-proxy'
import { formatarNumero, formatarMoeda, formatarPorcentagem } from '@/lib/formatar'

export interface CardCriativoData {
  id: string
  nome: string
  tipo: 'IMAGE' | 'VIDEO' | 'CAROUSEL'
  thumbnailUrl?: string
  imageUrlHq?: string
  linkAnuncio?: string
  carouselItems?: Array<{ picture?: string; image_url_hq?: string; video_id?: string; link?: string }>
  leads: number
  ctr: number
  cpl: number
}

const TIPO_CONFIG: Record<string, { bg: string; Icon: typeof ImageIcon; label: string }> = {
  IMAGE:    { bg: '#e6f1fb', Icon: ImageIcon, label: 'Imagem' },
  VIDEO:    { bg: '#eaf3de', Icon: Video,     label: 'Vídeo' },
  CAROUSEL: { bg: '#faeeda', Icon: Layers,    label: 'Carrossel' },
}

function corCpl(v: number) {
  if (v <= 1) return '#3b6d11'
  if (v <= 5) return '#854f0b'
  return '#a32d2d'
}

interface Props {
  data: CardCriativoData
  onClick?: () => void
  onAbrirPreview?: () => void
  rank?: number
  badgeStatus?: { label: string; bg: string }
  mostrarFooter?: boolean
  footerExtra?: React.ReactNode
  renderFooter?: (data: CardCriativoData) => React.ReactNode
  selecionado?: boolean
  badgeTopLeft?: React.ReactNode
}

export function CardCriativo({
  data,
  onClick,
  onAbrirPreview,
  rank,
  badgeStatus,
  mostrarFooter = true,
  footerExtra,
  renderFooter,
  selecionado,
  badgeTopLeft,
}: Props) {
  const [carouselIdx, setCarouselIdx] = useState(0)
  const config = TIPO_CONFIG[data.tipo] ?? TIPO_CONFIG.IMAGE
  const IconComp = config.Icon

  const items = data.carouselItems ?? []
  const carouselLen = items.length
  const firstItemWithImage = items.find(item => item.image_url_hq || item.picture) ?? null

  const imgSrc =
    data.tipo === 'CAROUSEL' && carouselLen > 0
      ? (items[carouselIdx]?.image_url_hq
        || items[carouselIdx]?.picture
        || firstItemWithImage?.image_url_hq
        || firstItemWithImage?.picture
        || data.imageUrlHq
        || data.thumbnailUrl)
      : data.imageUrlHq ?? data.thumbnailUrl

  const prevSlide = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCarouselIdx((i) => (i - 1 + carouselLen) % carouselLen)
  }

  const nextSlide = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCarouselIdx((i) => (i + 1) % carouselLen)
  }

  const isVideo = data.tipo === 'VIDEO'

  return (
    <div
      className="group cursor-default"
      style={{
        border: selecionado ? '2px solid var(--foreground)' : '1px solid rgba(255,255,255,0.40)',
        borderRadius: 12,
        boxShadow: '0 4px 16px rgba(14,20,42,0.10)',
        overflow: 'hidden',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        if (!selecionado) {
          e.currentTarget.style.transform = 'translateY(-3px)'
          e.currentTarget.style.boxShadow = '0 12px 24px rgba(14,20,42,0.15)'
        }
      }}
      onMouseLeave={(e) => {
        if (!selecionado) {
          e.currentTarget.style.transform = ''
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(14,20,42,0.10)'
        }
      }}
    >
      {/* Área de mídia (clicável) */}
      <div onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
        <div style={{
          background: '#f5f5f5',
          aspectRatio: '9/16',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {/* Imagem */}
          {imgSrc ? (
            <img
              src={proxyImagem(imgSrc)}
              alt={data.nome}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          ) : (
            <IconComp style={{ width: 32, height: 32, color: 'var(--ws-text-3, #8892b0)', opacity: 0.5 }} />
          )}

          {/* Overlay play para vídeo */}
          {isVideo && imgSrc && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.18)',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'rgba(255,255,255,0.88)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Play size={16} style={{ color: '#0E142A', marginLeft: 2 }} />
              </div>
            </div>
          )}

          {/* Controles carousel */}
          {data.tipo === 'CAROUSEL' && carouselLen > 1 && (
            <>
              <button
                onClick={prevSlide}
                style={{
                  position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)',
                  background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: '50%',
                  width: 22, height: 22, cursor: 'pointer', zIndex: 3,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <ChevronLeft size={13} />
              </button>
              <button
                onClick={nextSlide}
                style={{
                  position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                  background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: '50%',
                  width: 22, height: 22, cursor: 'pointer', zIndex: 3,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <ChevronRight size={13} />
              </button>

              {/* Dots */}
              <div style={{
                position: 'absolute', bottom: 28, left: 0, right: 0,
                display: 'flex', justifyContent: 'center', gap: 4, zIndex: 3,
              }}>
                {items.map((_, di) => (
                  <div
                    key={di}
                    style={{
                      width: di === carouselIdx ? 12 : 5,
                      height: 5, borderRadius: 3,
                      background: di === carouselIdx ? '#fff' : 'rgba(255,255,255,0.55)',
                      transition: 'all 0.2s',
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {/* Badge top-left (rank custom) */}
          {badgeTopLeft ? (
            <span style={{ position: 'absolute', top: 8, left: 8, zIndex: 2 }}>
              {badgeTopLeft}
            </span>
          ) : rank !== undefined && (
            <span style={{
              position: 'absolute', top: 8, left: 8,
              background: '#0E142A', color: '#fff',
              fontSize: 10, fontWeight: 700,
              padding: '2px 8px', borderRadius: 10, zIndex: 2,
            }}>
              #{rank + 1}
            </span>
          )}

          {/* Badge tipo */}
          <span style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(0,0,0,0.45)', color: '#fff',
            fontSize: 10, padding: '2px 8px', borderRadius: 4, zIndex: 2,
          }}>
            {config.label}
          </span>

          {/* Badge status (opcional) */}
          {badgeStatus && (
            <span style={{
              position: 'absolute', bottom: 8, left: 8,
              background: badgeStatus.bg, color: '#fff',
              fontSize: 9, fontWeight: 600,
              padding: '2px 6px', borderRadius: 4, zIndex: 2,
            }}>
              {badgeStatus.label}
            </span>
          )}

          {/* Link externo */}
          {data.linkAnuncio && (
            <span style={{
              position: 'absolute', bottom: 8, right: 8,
              background: 'rgba(0,0,0,0.45)', borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 4, zIndex: 3,
            }}>
              <ExternalLink size={11} style={{ color: '#fff' }} />
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      {mostrarFooter && (
        <div style={{
          padding: '10px 12px',
          background: 'rgba(255,255,255,0.90)',
          borderTop: '1px solid rgba(14,20,42,0.06)',
        }}>
          {renderFooter ? renderFooter(data) : (
            <>
              <div style={{
                fontSize: 12, fontWeight: 500, color: '#0E142A',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {data.nome}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginTop: 6 }}>
                <div>
                  <div style={{ fontSize: 8, fontWeight: 600, color: '#8892b0', textTransform: 'uppercase' }}>Leads</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0E142A' }}>{formatarNumero(data.leads)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 8, fontWeight: 600, color: '#8892b0', textTransform: 'uppercase' }}>CTR</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0E142A' }}>{formatarPorcentagem(data.ctr)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 8, fontWeight: 600, color: '#8892b0', textTransform: 'uppercase' }}>CPL</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: data.cpl <= 5 ? '#0fa856' : '#FF5C8D' }}>
                    {formatarMoeda(data.cpl)}
                  </div>
                </div>
              </div>
            </>
          )}
          {footerExtra && <div style={{ marginTop: 6 }}>{footerExtra}</div>}
        </div>
      )}
    </div>
  )
}
