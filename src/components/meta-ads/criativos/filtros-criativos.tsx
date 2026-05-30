'use client'

import { useEffect } from 'react'
import useSWR from 'swr'
import api from '@/lib/api-client'
import type { FiltrosCriativos } from '@/types/meta-ads-criativos'
import { useWorkspace } from '@/lib/workspace-context'

const LS_KEY = 'op7-nexo-criativos-cols'

interface CampanhaRow { campaign_id: string; nome: string }
interface AdsetRow { adset_id: string; nome: string }

interface Props {
  filtros: FiltrosCriativos
  onChange: (f: FiltrosCriativos) => void
  comparadorAtivo: boolean
  onToggleComparador: () => void
  workspaceId: string | null
  dataInicio: string
  dataFim: string
  contaIds?: string[]
}

const selectStyle: React.CSSProperties = {
  fontSize: '12px',
  padding: '5px 8px',
  border: '0.5px solid var(--border)',
  borderRadius: '6px',
  background: 'var(--card)',
  color: 'var(--text)',
  cursor: 'pointer',
  outline: 'none',
}

export function FiltrosCriativos({
  filtros,
  onChange,
  comparadorAtivo,
  onToggleComparador,
  workspaceId,
  dataInicio,
  dataFim,
  contaIds = [],
}: Props) {
  const { workspaceAtivo } = useWorkspace()
  const wsId = (workspaceId ?? workspaceAtivo) ?? undefined

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY)
    if (saved) {
      const cols = parseInt(saved, 10)
      if ([3, 4, 5, 6, 8].includes(cols)) {
        onChange({ ...filtros, colunas: cols })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    localStorage.setItem(LS_KEY, String(filtros.colunas))
  }, [filtros.colunas])

  const contaIdsParam = contaIds.length ? `&conta_ids=${contaIds.join(',')}` : ''
  const campanhasKey = wsId
    ? `/meta/insights/campanhas?workspace_id=${wsId}&data_inicio=${dataInicio}&data_fim=${dataFim}&limit=5000${contaIdsParam}`
    : null

  const { data: campanhasData } = useSWR<CampanhaRow[]>(
    campanhasKey,
    () => api.get<CampanhaRow[]>(campanhasKey!),
    { revalidateOnFocus: false }
  )

  const adsetsKey = wsId && filtros.campaign_id && filtros.campaign_id !== 'todas'
    ? `/meta/catalogo/conjuntos?workspace_id=${wsId}&campaign_id=${filtros.campaign_id}&limit=5000${contaIdsParam}`
    : null

  const { data: adsetsData } = useSWR<AdsetRow[]>(
    adsetsKey,
    () => api.get<AdsetRow[]>(adsetsKey!),
    { revalidateOnFocus: false }
  )

  const adsets: AdsetRow[] = adsetsData ?? []

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
      {/* Campanha */}
      <select
        style={selectStyle}
        value={filtros.campaign_id ?? 'todas'}
        onChange={e => onChange({
          ...filtros,
          campaign_id: e.target.value === 'todas' ? undefined : e.target.value,
          adset_id: undefined,
        })}
      >
        <option value="todas">Todas as campanhas</option>
        {(campanhasData ?? []).map(c => (
          <option key={c.campaign_id} value={c.campaign_id}>{c.nome}</option>
        ))}
      </select>

      {/* Conjunto — só aparece se campanha selecionada */}
      {filtros.campaign_id && adsets.length > 0 && (
        <select
          style={selectStyle}
          value={filtros.adset_id ?? 'todos'}
          onChange={e => onChange({
            ...filtros,
            adset_id: e.target.value === 'todos' ? undefined : e.target.value,
          })}
        >
          <option value="todos">Todos os conjuntos</option>
          {adsets.map(a => (
            <option key={a.adset_id} value={a.adset_id}>{a.nome}</option>
          ))}
        </select>
      )}

      <select
        style={selectStyle}
        value={filtros.tipo}
        onChange={e => onChange({ ...filtros, tipo: e.target.value })}
      >
        <option value="todos">Todos os tipos</option>
        <option value="IMAGE">Imagem</option>
        <option value="VIDEO">Vídeo</option>
        <option value="CAROUSEL">Carrossel</option>
      </select>

      <select
        style={selectStyle}
        value={filtros.status}
        onChange={e => onChange({ ...filtros, status: e.target.value })}
      >
        <option value="todos">Todos os status</option>
        <option value="evergreen">Evergreen</option>
        <option value="novo">Novo</option>
        <option value="atencao">Atenção</option>
        <option value="fadiga">Fadiga</option>
      </select>

      <select
        style={selectStyle}
        value={filtros.ordenarPor}
        onChange={e => onChange({ ...filtros, ordenarPor: e.target.value as FiltrosCriativos['ordenarPor'] })}
      >
        <option value="score">Ordenar: Score IA</option>
        <option value="hookRate">Taxa de abertura (indisponível)</option>
        <option value="holdRate">Taxa de retenção (indisponível)</option>
        <option value="cpl">CPL</option>
        <option value="leads">Leads</option>
        <option value="diasAtivo">Mais antigo</option>
      </select>

      <div style={{ marginLeft: 'auto' }}>
        <button
          onClick={onToggleComparador}
          style={{
            fontSize: '12px',
            padding: '5px 12px',
            borderRadius: '6px',
            border: comparadorAtivo ? '0.5px solid var(--foreground)' : '0.5px solid var(--border)',
            background: comparadorAtivo ? 'color-mix(in srgb, var(--foreground) 8%, transparent)' : 'var(--card)',
            color: comparadorAtivo ? 'var(--foreground)' : 'var(--text2)',
            cursor: 'pointer',
            fontWeight: comparadorAtivo ? 500 : 400,
            transition: 'all 150ms',
          }}
        >
          Comparar selecionados
        </button>
      </div>
    </div>
  )
}
