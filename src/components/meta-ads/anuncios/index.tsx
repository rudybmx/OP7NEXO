'use client'

import { useEffect, useMemo, useState } from 'react'
import { LayoutGrid, LayoutList } from 'lucide-react'
import type { FiltrosAnuncios, VisualizacaoAnuncios } from '@/types/meta-ads-anuncios'
import { FiltrosAnunciosComp } from './filtros-anuncios'
import { KpiBarAnuncios } from './kpi-bar-anuncios'
import { ListaAnuncios, sortAnuncios } from './lista-anuncios'
import { GridAnuncios } from './grid-anuncios'
import { ModalAnuncioDs } from './modal-anuncio-ds'
import { useMetaAnuncios } from '@/hooks/use-meta-anuncios'

interface Props {
  workspaceId: string | null
  dataInicio: string
  dataFim: string
  contaIds?: string[]
  campaignIds: string[]
  campaignsReady?: boolean
}

function VisualizacaoToggle({
  modo,
  onChange,
}: {
  modo: VisualizacaoAnuncios
  onChange: (modo: VisualizacaoAnuncios) => void
}) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: 4,
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-md)',
      boxShadow: 'var(--ws-glass-shadow-sm)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
    }}>
      {([
        { value: 'linhas' as const, label: 'Linhas', Icon: LayoutList },
        { value: 'blocos' as const, label: 'Blocos', Icon: LayoutGrid },
      ] as const).map(({ value, label, Icon }) => {
        const ativo = modo === value
        return (
          <button
            key={value}
            type="button"
            aria-pressed={ativo}
            onClick={() => onChange(value)}
            style={{
              height: 28,
              padding: '0 10px',
              borderRadius: 'calc(var(--ws-radius-md) - 2px)',
              border: '1px solid transparent',
              background: ativo ? 'var(--ws-blue-soft)' : 'transparent',
              color: ativo ? 'var(--ws-blue)' : 'var(--ws-text-2)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'var(--ws-transition)',
            }}
          >
            <Icon size={13} />
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function AbaAnuncios({
  workspaceId,
  dataInicio,
  dataFim,
  contaIds = [],
  campaignIds,
  campaignsReady = true,
}: Props) {
  const [modoVisualizacao, setModoVisualizacao] = useState<VisualizacaoAnuncios>('linhas')
  const [pagina, setPagina] = useState(1)
  const [filtros, setFiltros] = useState<FiltrosAnuncios>({
    status: 'todos',
    plataforma: 'todas',
    tipo: 'todos',
    ordenarPor: 'campanha',
    resultado: 'performance',
  })
  const [anuncioAbertoId, setAnuncioAbertoId] = useState<string | null>(null)

  const {
    anuncios,
    plataformasDisponiveis,
    total,
    resumo,
    limit,
    isLoading,
    isValidating,
  } = useMetaAnuncios(
    filtros,
    dataInicio,
    dataFim,
    contaIds,
    workspaceId,
    campaignIds,
    campaignsReady,
    pagina,
  )

  const anuncioAberto = anuncios.find(a => a.id === anuncioAbertoId) ?? null
  const anunciosOrdenados = useMemo(
    () => sortAnuncios(anuncios, filtros.ordenarPor),
    [anuncios, filtros.ordenarPor],
  )
  const semCampanhasVisiveis = campaignsReady && campaignIds.length === 0
  const contaIdsKey = contaIds.join(',')
  const campaignIdsKey = [...campaignIds].sort().join(',')

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setPagina(1))
    return () => window.cancelAnimationFrame(frame)
  }, [
    dataInicio,
    dataFim,
    workspaceId,
    campaignsReady,
    contaIdsKey,
    campaignIdsKey,
  ])

  const atualizarFiltros = (proximo: FiltrosAnuncios) => {
    setPagina(1)
    setFiltros(proximo)
  }

  if (!campaignsReady) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 220,
        padding: '20px',
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)',
        color: 'var(--ws-text-2)',
        fontSize: 13,
      }}>
        Carregando campanhas visíveis...
      </div>
    )
  }

  if (semCampanhasVisiveis) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 220,
        padding: '20px',
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)',
        color: 'var(--ws-text-2)',
        fontSize: 13,
      }}>
        Nenhuma campanha visível no período e filtros selecionados.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <KpiBarAnuncios resumo={resumo} totalAnuncios={total} />

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        padding: '12px 14px',
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow-sm)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }} />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--ws-text-3)',
            marginBottom: 4,
          }}>
            Visualização
          </div>
          <div style={{ fontSize: 12, color: 'var(--ws-text-2)', lineHeight: 1.4 }}>
            Linhas para leitura operacional e blocos para comparação visual dos criativos.
          </div>
        </div>

        <VisualizacaoToggle modo={modoVisualizacao} onChange={setModoVisualizacao} />
      </div>

      <FiltrosAnunciosComp
        filtros={filtros}
        onChange={atualizarFiltros}
        plataformasDisponiveis={plataformasDisponiveis}
        campanhasVisiveisCount={campaignIds.length}
      />

      {modoVisualizacao === 'linhas' ? (
        <ListaAnuncios
          anuncios={anunciosOrdenados}
          onAbrirAnuncio={setAnuncioAbertoId}
          ordenarPor={filtros.ordenarPor}
          onOrdenarPorChange={(ordenarPor) => {
            setPagina(1)
            setFiltros(prev => ({ ...prev, ordenarPor }))
          }}
          isLoading={isLoading}
          total={total}
          page={pagina}
          limit={limit}
          onPageChange={setPagina}
          isBusy={isLoading || isValidating}
        />
      ) : (
        <GridAnuncios
          anuncios={anunciosOrdenados}
          onAbrirAnuncio={setAnuncioAbertoId}
          isLoading={isLoading}
          total={total}
          page={pagina}
          limit={limit}
          onPageChange={setPagina}
          isBusy={isLoading || isValidating}
        />
      )}

      <ModalAnuncioDs
        key={anuncioAberto?.id ?? 'anuncio-fechado'}
        anuncio={anuncioAberto}
        aberto={!!anuncioAbertoId}
        onFechar={() => setAnuncioAbertoId(null)}
        workspaceId={workspaceId}
        dataInicio={dataInicio}
        dataFim={dataFim}
        contaIds={contaIds}
      />
    </div>
  )
}
