'use client'

import { useState } from 'react'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import type { CriativoTop } from '@/types/meta-ads'
import { CardCriativo, buildCardCriativoSignature, type CardCriativoData } from '@/components/meta-ads/card-criativo'
import { resolveCreativeType } from '@/components/meta-ads/carousel-media'
import { ModalAnaliseCriativoOverview } from './modal-analise-criativo-overview'

interface TopCriativosProps {
  criativos: CriativoTop[]
  filtros?: { dataInicio: string; dataFim: string; contaIds: string[] }
  workspaceId?: string | null
}

const TOTAL_SLOTS = 5
const TOP_CRIATIVOS_DIAGRAM = `
  <div style="font-size:10px;color:#666">
    <div style="background:#f0f0f0;border-radius:4px;padding:6px 8px;margin-bottom:4px">
      <div style="font-size:9px;color:#999;margin-bottom:2px">SCORE IA = </div>
      <div style="color:#333">CPL (40%) + CTR (25%) + Leads (20%) + Freq. (15%)</div>
    </div>
  </div>
`

export function TopCriativos({ criativos, filtros, workspaceId }: TopCriativosProps) {
  const [criativoSelecionado, setCriativoSelecionado] = useState<CriativoTop | null>(null)
  const vagas = TOTAL_SLOTS - criativos.length

  return (
    <>
      <ModalAnaliseCriativoOverview
        criativo={criativoSelecionado}
        aberto={!!criativoSelecionado}
        onFechar={() => setCriativoSelecionado(null)}
        filtros={filtros}
        workspaceId={workspaceId}
      />
      <div style={{
      background: 'var(--ws-glass-bg, rgba(255,255,255,0.72))',
      border: '1px solid var(--ws-glass-border, rgba(255,255,255,0.35))',
      borderRadius: 14,
      padding: '16px 20px',
      backdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow, 0 8px 32px rgba(14,20,42,0.12), 0 2px 8px rgba(14,20,42,0.08))',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)', zIndex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1, #0E142A)' }}>Top criativos do período</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-3, #8892b0)', marginTop: 2 }}>Os 5 criativos com maior geração de leads</div>
        </div>
        <InfoTooltip
          title="Top criativos do período"
          description="Os 5 anúncios com melhor Score IA no período."
          diagram={TOP_CRIATIVOS_DIAGRAM}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, overflowX: 'auto', paddingBottom: 4 }}>
        {criativos.map((cr, indice) => {
          const cardData: CardCriativoData = {
            id: cr.id,
            nome: cr.nome,
            tipo: resolveCreativeType(cr.tipo, cr.carouselItems ?? []),
            thumbnailUrl: cr.thumbnailUrl,
            imageUrlHq: cr.imageUrlHq,
            linkAnuncio: cr.linkAnuncio,
            carouselItems: cr.carouselItems,
            leads: cr.leads,
            ctr: cr.ctr,
            cpl: cr.cpl,
          }

          return (
            <CardCriativo
              key={`${cr.id}-${indice}:${buildCardCriativoSignature(cardData)}`}
              data={cardData}
              rank={indice}
              onClick={() => setCriativoSelecionado(cr)}
            />
          )
        })}
        {Array.from({ length: Math.max(0, vagas) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            style={{
              border: '1px dashed var(--ws-glass-border, rgba(255,255,255,0.35))',
              borderRadius: 12,
              overflow: 'hidden',
              opacity: 0.5,
            }}
          >
            <div style={{
              aspectRatio: '9/16',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ws-text-3, #8892b0)',
              fontSize: 11,
            }}>
              Sem dados
            </div>
          </div>
        ))}
      </div>
    </div>
    </>
  )
}
