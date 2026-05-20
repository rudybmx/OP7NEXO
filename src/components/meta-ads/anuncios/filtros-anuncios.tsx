'use client'

import type { CSSProperties } from 'react'
import { ChevronDown } from 'lucide-react'
import type {
  FiltrosAnuncios,
  PlataformaFiltroAnuncio,
} from '@/types/meta-ads-anuncios'
import { OPCOES_VEICULACAO } from '@/lib/veiculacao'
import { configPlataformaCampanha } from '@/lib/plataformas-meta'

interface Props {
  filtros: FiltrosAnuncios
  onChange: (filtros: FiltrosAnuncios) => void
  campanhasVisiveisCount: number
  plataformasDisponiveis?: Array<{ codigo: 'facebook' | 'instagram' | 'whatsapp'; label: string }>
}

const glassSelectStyle: CSSProperties = {
  height: '32px',
  fontSize: '12px',
  background: 'var(--ws-glass-bg)',
  border: '1px solid var(--ws-glass-border)',
  borderRadius: 'var(--ws-radius-md)',
  backdropFilter: 'blur(10px)',
  boxShadow: 'var(--ws-glass-shadow-sm)',
  padding: '0 10px',
  color: 'var(--ws-text-1)',
  cursor: 'pointer',
  outline: 'none',
  transition: 'var(--ws-transition)',
}

function PlatformChip({
  codigo,
  label,
  ativo,
  onClick,
}: {
  codigo: PlataformaFiltroAnuncio
  label: string
  ativo: boolean
  onClick: () => void
}) {
  const cfg = configPlataformaCampanha(codigo)
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Filtrar por ${label}`}
      style={{
        height: 32,
        padding: '0 12px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        border: `1px solid ${ativo ? cfg.border : 'var(--ws-divider)'}`,
        background: ativo ? cfg.bg : 'var(--ws-surface-2)',
        color: ativo ? cfg.cor : 'var(--ws-text-2)',
        cursor: 'pointer',
        transition: 'var(--ws-transition)',
        boxShadow: ativo ? 'var(--ws-glass-shadow-sm)' : 'none',
      }}
    >
      <span style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: ativo ? cfg.cor : 'var(--ws-text-3)',
        display: 'inline-block',
      }} />
      {label}
    </button>
  )
}

export function FiltrosAnunciosComp({
  filtros,
  onChange,
  campanhasVisiveisCount,
  plataformasDisponiveis = [],
}: Props) {
  const set = (patch: Partial<FiltrosAnuncios>) => onChange({ ...filtros, ...patch })
  const plataformaCount = plataformasDisponiveis.length

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{
          height: 32,
          padding: '0 12px',
          borderRadius: 9999,
          border: '1px solid var(--ws-divider)',
          background: 'var(--ws-surface-2)',
          color: 'var(--ws-text-2)',
          fontSize: 12,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: campanhasVisiveisCount > 0 ? 'var(--ws-gold)' : 'var(--ws-text-3)',
            display: 'inline-block',
          }} />
          Campanhas visíveis
          <span style={{
            padding: '0 8px',
            borderRadius: 9999,
            background: 'var(--ws-blue-soft)',
            color: 'var(--ws-blue)',
            fontSize: 11,
          }}>
            {campanhasVisiveisCount}
          </span>
        </div>

        <select
          style={{ ...glassSelectStyle, minWidth: 150 }}
          value={filtros.status}
          onChange={e => set({ status: e.target.value as FiltrosAnuncios['status'] })}
        >
          <option value="todos">Todos os status</option>
          {OPCOES_VEICULACAO.map(grupo => (
            <optgroup key={grupo.grupo} label={grupo.grupo}>
              {grupo.opcoes.map(opcao => (
                <option key={opcao.codigo} value={opcao.codigo}>
                  {opcao.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <select
          style={glassSelectStyle}
          value={filtros.tipo}
          onChange={e => set({ tipo: e.target.value as FiltrosAnuncios['tipo'] })}
        >
          <option value="todos">Todos os tipos</option>
          <option value="IMAGE">Imagem</option>
          <option value="VIDEO">Vídeo</option>
          <option value="CAROUSEL">Carrossel</option>
        </select>

        <select
          value={filtros.resultado}
          onChange={e => set({ resultado: e.target.value as FiltrosAnuncios['resultado'] })}
          style={{ ...glassSelectStyle, cursor: 'pointer' }}
        >
          <option value="performance">Com resultado</option>
          <option value="todos">Todos os itens</option>
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>Ordenar por</span>
          <select
            style={glassSelectStyle}
            value={filtros.ordenarPor}
            onChange={e => set({ ordenarPor: e.target.value as FiltrosAnuncios['ordenarPor'] })}
          >
            <option value="campanha">Campanha A-Z</option>
            <option value="conjunto">Conjunto A-Z</option>
            <option value="anuncio">Anúncio A-Z</option>
            <option value="score">Score IA</option>
            <option value="leads">Leads</option>
            <option value="cpl">CPL</option>
            <option value="ctr">CTR</option>
            <option value="spend">Spend</option>
            <option value="hookRate">Hook Rate</option>
            <option value="frequencia">Frequência</option>
          </select>
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        padding: '10px 12px',
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow-sm)',
      }}>
        <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginRight: 2 }}>
          Plataforma
        </div>

        <PlatformChip
          codigo="facebook"
          label="Facebook"
          ativo={filtros.plataforma === 'facebook'}
          onClick={() => set({ plataforma: filtros.plataforma === 'facebook' ? 'todas' : 'facebook' })}
        />
        <PlatformChip
          codigo="instagram"
          label="Instagram"
          ativo={filtros.plataforma === 'instagram'}
          onClick={() => set({ plataforma: filtros.plataforma === 'instagram' ? 'todas' : 'instagram' })}
        />
        <PlatformChip
          codigo="whatsapp"
          label="WhatsApp"
          ativo={filtros.plataforma === 'whatsapp'}
          onClick={() => set({ plataforma: filtros.plataforma === 'whatsapp' ? 'todas' : 'whatsapp' })}
        />

        <button
          type="button"
          onClick={() => set({ plataforma: 'todas' })}
          style={{
            height: 32,
            padding: '0 12px',
            borderRadius: 9999,
            border: '1px solid var(--ws-divider)',
            background: 'var(--ws-surface-2)',
            color: 'var(--ws-text-3)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          Todas
          <ChevronDown size={12} />
        </button>

        {plataformaCount > 0 && (
          <div style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: 'var(--ws-text-3)',
          }}>
            {plataformaCount} plataformas detectadas
          </div>
        )}
      </div>
    </div>
  )
}
