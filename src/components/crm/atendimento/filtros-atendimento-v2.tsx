'use client'

import type { CSSProperties } from 'react'
import type { WhatsappCanal } from '@/hooks/use-whatsapp-canais'
import type { AgenteApi } from '@/hooks/use-agentes-disponiveis'
import { getCanalProviderLabel } from '@/lib/whatsapp-canal'

/** Estado dos filtros V2 (server-side). Sentinelas 'todas'/'todos'/'' = sem filtro. */
export interface FiltrosV2State {
  escopo: string          // todas|novas|minhas|equipe
  acompanhamento: string  // ''(todos)|em_atendimento|sem_resposta
  tipo: string            // todos|grupos|diretas
  arquivadas: boolean
  naoLidas: boolean
  responsavelId: string   // ''(todos)|<userId>
}

export const FILTROS_V2_PADRAO: FiltrosV2State = {
  escopo: 'todas',
  acompanhamento: '',
  tipo: 'todos',
  arquivadas: false,
  naoLidas: false,
  responsavelId: '',
}

interface FiltrosAtendimentoV2Props {
  valor: FiltrosV2State
  onChange: (next: FiltrosV2State) => void
  canais: WhatsappCanal[]
  canalSelecionadoId: string
  onCanalChange: (id: string) => void
  agentes: AgenteApi[]
  isMobile?: boolean
}

const ESCOPOS = [
  { id: 'todas', label: 'Todas' },
  { id: 'novas', label: 'Novas' },
  { id: 'minhas', label: 'Minhas' },
  { id: 'equipe', label: 'Equipe' },
]

const TIPOS = [
  { id: 'todos', label: 'Todos' },
  { id: 'grupos', label: 'Grupos' },
  { id: 'diretas', label: 'Diretas' },
]

/** Barra de filtros V2 do CRM atendimento (3 dropdowns + 2 linhas de pills).
 *  Controlada; a persistência fica no orquestrador (usePersistedState). */
export function FiltrosAtendimentoV2({
  valor,
  onChange,
  canais,
  canalSelecionadoId,
  onCanalChange,
  agentes,
  isMobile = false,
}: FiltrosAtendimentoV2Props) {
  const set = (patch: Partial<FiltrosV2State>) => onChange({ ...valor, ...patch })

  const selectStyle: CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: isMobile ? '12px 14px' : '10px 14px',
    borderRadius: 14,
    background: 'var(--ws-glass-bg)',
    border: '1px solid var(--ws-glass-border)',
    color: 'var(--ws-text-1)',
    fontSize: isMobile ? 16 : 12,
  }

  const pill = (ativo: boolean): CSSProperties => ({
    padding: isMobile ? '9px 14px' : '6px 11px',
    minHeight: isMobile ? 36 : undefined,
    borderRadius: 999,
    fontSize: isMobile ? 13 : 11,
    fontWeight: 700,
    cursor: 'pointer',
    border: ativo ? '1px solid rgba(29, 158, 117, 0.24)' : '1px solid rgba(15, 23, 42, 0.08)',
    background: ativo ? 'rgba(37, 211, 102, 0.16)' : 'rgba(255, 255, 255, 0.88)',
    color: ativo ? '#1D9E75' : 'var(--ws-text-2)',
    boxShadow: ativo ? '0 4px 10px rgba(29, 158, 117, 0.10)' : 'none',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
      {/* Dropdowns: Canal · Responsável · Acompanhamento */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
        {canais.length > 0 && (
          <select
            value={canalSelecionadoId}
            onChange={e => onCanalChange(e.target.value)}
            style={selectStyle}
            aria-label="Filtrar por canal"
          >
            <option value="todos">Todos os números</option>
            {canais.map(canal => (
              <option key={canal.id} value={canal.id}>
                {canal.tipo === 'webhook'
                  ? `${getCanalProviderLabel(canal)} · ${canal.nome}`
                  : `${canal.nome}${canal.numero_telefone ? ` · ${canal.numero_telefone}` : ''}`}
              </option>
            ))}
          </select>
        )}
        <select
          value={valor.responsavelId}
          onChange={e => set({ responsavelId: e.target.value })}
          style={selectStyle}
          aria-label="Filtrar por responsável"
        >
          <option value="">Todos os responsáveis</option>
          {agentes.map(agente => (
            <option key={agente.id} value={agente.id}>{agente.nome}</option>
          ))}
        </select>
        <select
          value={valor.acompanhamento}
          onChange={e => set({ acompanhamento: e.target.value })}
          style={selectStyle}
          aria-label="Filtrar por acompanhamento"
        >
          <option value="">Acompanhamento: todos</option>
          <option value="em_atendimento">Em atendimento</option>
          <option value="sem_resposta">Sem resposta</option>
        </select>
      </div>

      {/* Linha 1 — escopo (inerte sob view de arquivadas) */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ESCOPOS.map(opcao => (
          <button
            key={opcao.id}
            type="button"
            disabled={valor.arquivadas}
            onClick={() => set({ escopo: opcao.id })}
            style={{ ...pill(valor.escopo === opcao.id && !valor.arquivadas), opacity: valor.arquivadas ? 0.5 : 1 }}
          >
            {opcao.label}
          </button>
        ))}
      </div>

      {/* Linha 2 — tipo (exclusivo) + estado (toggles) */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TIPOS.map(opcao => (
          <button
            key={opcao.id}
            type="button"
            onClick={() => set({ tipo: opcao.id })}
            style={pill(valor.tipo === opcao.id)}
          >
            {opcao.label}
          </button>
        ))}
        <button type="button" onClick={() => set({ naoLidas: !valor.naoLidas })} style={pill(valor.naoLidas)}>
          Não lidas
        </button>
        {/* Arquivadas = view terminal: ao ligar, reseta escopo p/ 'todas' (coerência c/ precedência do backend) */}
        <button
          type="button"
          onClick={() => set({ arquivadas: !valor.arquivadas, escopo: !valor.arquivadas ? 'todas' : valor.escopo })}
          style={pill(valor.arquivadas)}
        >
          Arquivadas
        </button>
      </div>
    </div>
  )
}
