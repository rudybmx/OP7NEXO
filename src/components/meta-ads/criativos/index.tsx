'use client'

import { useState } from 'react'
import { FiltrosCriativos as FiltrosCriativosType, Criativo } from '@/types/meta-ads-criativos'
import type { CriativoTop } from '@/types/meta-ads'
import { useMetaCriativos } from '@/hooks/use-meta-criativos'
import { useInsightsCriativos } from '@/hooks/use-insights-criativos'
import { FiltrosCriativos } from './filtros-criativos'
import { InsightsCriativos } from './insights-criativos'
import { FunilAtencao } from './funil-atencao'
import { GridCriativos } from './grid-criativos'
import { ModalPreview } from './modal-preview'
import { ModalAnaliseCriativoOverview } from '@/components/meta-ads/visao-geral/modal-analise-criativo-overview'
import { Comparador } from './comparador'

function criativoParaTop(c: Criativo): CriativoTop {
  return {
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    thumbnailUrl: c.thumbnailUrl,
    imageUrlHq: c.imageUrlHq ?? c.thumbnailUrl ?? undefined,
    linkAnuncio: c.linkAnuncio ?? undefined,
    headline: c.headline ?? undefined,
    destinationUrl: c.destinationUrl ?? undefined,
    urlTags: c.urlTags ?? undefined,
    utmSource: c.utmSource ?? undefined,
    utmCampaign: c.utmCampaign ?? undefined,
    utmMedium: c.utmMedium ?? undefined,
    utmContent: c.utmContent ?? undefined,
    utmTerm: c.utmTerm ?? undefined,
    carouselItems: c.carouselCards?.map(card => ({
      picture: card.picture ?? undefined,
      image_url_hq: card.image_url_hq ?? undefined,
    })),
    leads: c.leads,
    ctr: c.ctr,
    cpl: c.cpl,
    linkClicks: c.linkClicks,
    cpm: c.cpm,
    frequencia: c.frequencia,
    videoMetrics: c.videoMetrics,
  }
}

interface Props { workspaceId: string | null; dataInicio: string; dataFim: string; contaIds?: string[] }

export function AbaCriativos({ workspaceId, dataInicio, dataFim, contaIds = [] }: Props) {
  const [filtros, setFiltros] = useState<FiltrosCriativosType>({
    tipo: 'todos',
    status: 'todos',
    ordenarPor: 'score',
    colunas: 5,
  })
  const [comparadorAtivo, setComparadorAtivo] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [criativoSelecionado, setCriativoSelecionado] = useState<CriativoTop | null>(null)
  const [criativoPreviewId, setCriativoPreviewId] = useState<string | null>(null)

  const { criativos, isLoading, error } = useMetaCriativos(filtros, dataInicio, dataFim, contaIds, workspaceId)
  const insights = useInsightsCriativos(criativos)

  const criativoPreview = criativos.find(c => c.id === criativoPreviewId) ?? null

  function handleCardClick(id: string) {
    if (comparadorAtivo) {
      setSelecionados(prev => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else if (next.size < 3) next.add(id)
        return next
      })
    } else {
      const c = criativos.find(cr => cr.id === id)
      if (c) setCriativoSelecionado(criativoParaTop(c))
    }
  }

  return (
    <div>
      <FiltrosCriativos
        filtros={filtros}
        onChange={setFiltros}
        comparadorAtivo={comparadorAtivo}
        onToggleComparador={() => {
          setComparadorAtivo(v => !v)
          setSelecionados(new Set())
        }}
        workspaceId={workspaceId}
        dataInicio={dataInicio}
        dataFim={dataFim}
        contaIds={contaIds}
      />

      {/* Insights — só aparece se tiver dados */}
      <InsightsCriativos
        insights={insights}
        onAbrirDetalhe={(id) => {
          const c = criativos.find(cr => cr.id === id)
          if (c) setCriativoSelecionado(criativoParaTop(c))
        }}
      />

      {/* Funil — só aparece se tiver vídeos */}
      <FunilAtencao criativos={criativos} />

      {/* Comparador */}
      {comparadorAtivo && selecionados.size >= 2 && (
        <Comparador
          criativos={criativos.filter(c => selecionados.has(c.id))}
          onFechar={() => { setComparadorAtivo(false); setSelecionados(new Set()) }}
        />
      )}

      {/* Banner âmbar quando comparador ativo e menos de 2 selecionados */}
      {comparadorAtivo && selecionados.size < 2 && criativos.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px', marginBottom: 16,
          background: 'rgba(239,159,39,0.08)',
          border: '1px solid rgba(239,159,39,0.25)',
          borderRadius: 'var(--ws-radius-md)',
          fontSize: 12, color: '#854f0b', fontWeight: 500,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Selecione ao menos 2 criativos para comparar
          ({selecionados.size} de 2 selecionados)
        </div>
      )}

      {/* Grid — sempre renderiza, mostra estado vazio internamente */}
      <GridCriativos
        criativos={criativos}
        colunas={filtros.colunas}
        comparadorAtivo={comparadorAtivo}
        selecionados={selecionados}
        onCardClick={handleCardClick}
        onAbrirPreview={setCriativoPreviewId}
        onColunasChange={(n) => setFiltros(f => ({ ...f, colunas: n }))}
        isLoading={isLoading}
        error={error}
      />

      <ModalPreview
        criativo={criativoPreview}
        aberto={!!criativoPreviewId}
        onFechar={() => setCriativoPreviewId(null)}
        onAbrirDetalhe={(id) => {
          setCriativoPreviewId(null)
          const c = criativos.find(cr => cr.id === id)
          if (c) setCriativoSelecionado(criativoParaTop(c))
        }}
      />

      <ModalAnaliseCriativoOverview
        criativo={criativoSelecionado}
        aberto={!!criativoSelecionado}
        onFechar={() => setCriativoSelecionado(null)}
        filtros={{ dataInicio, dataFim, contaIds }}
        workspaceId={workspaceId}
      />
    </div>
  )
}
