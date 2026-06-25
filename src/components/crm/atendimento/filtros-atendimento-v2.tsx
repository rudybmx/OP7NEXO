'use client'

import type { CSSProperties } from 'react'
import { Phone, User, Eye, ChevronDown, Archive } from 'lucide-react'
import type { WhatsappCanal } from '@/hooks/use-whatsapp-canais'
import type { AgenteApi } from '@/hooks/use-agentes-disponiveis'
import { getCanalProviderLabel } from '@/lib/whatsapp-canal'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'

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

const ACOMPANHAMENTOS = [
  { id: '', label: 'Acompanhamento: todos' },
  { id: 'em_atendimento', label: 'Em atendimento' },
  { id: 'sem_resposta', label: 'Sem resposta' },
]

const dropIconBtn = (ativo: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  padding: '6px 8px',
  borderRadius: 10,
  cursor: 'pointer',
  border: ativo ? '1px solid rgba(29, 158, 117, 0.24)' : '1px solid rgba(15, 23, 42, 0.08)',
  background: ativo ? 'rgba(37, 211, 102, 0.16)' : 'rgba(255, 255, 255, 0.88)',
  color: ativo ? '#1D9E75' : 'var(--ws-text-2)',
  boxShadow: ativo ? '0 4px 10px rgba(29, 158, 117, 0.10)' : 'none',
})

interface FiltrosDropdownsV2Props {
  valor: FiltrosV2State
  onChange: (next: FiltrosV2State) => void
  canais: WhatsappCanal[]
  canalSelecionadoId: string
  onCanalChange: (id: string) => void
  agentes: AgenteApi[]
}

/** Os 3 filtros (número · responsável · acompanhamento) como botões-ícone com popover (desktop).
 *  Vivem na icon-row do header; mesma lógica/handlers dos selects (que ficam só no mobile, em
 *  FiltrosAtendimentoV2). Fica verde quando o filtro está ativo (≠ valor padrão). */
export function FiltrosDropdownsV2({
  valor,
  onChange,
  canais,
  canalSelecionadoId,
  onCanalChange,
  agentes,
}: FiltrosDropdownsV2Props) {
  const set = (patch: Partial<FiltrosV2State>) => onChange({ ...valor, ...patch })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {canais.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              style={dropIconBtn(canalSelecionadoId !== 'todos')}
              title="Filtrar por número"
              aria-label="Filtrar por número"
            >
              <Phone size={15} />
              <ChevronDown size={9} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-auto min-w-56 max-w-[min(92vw,30rem)] whitespace-nowrap">
            <DropdownMenuLabel>Número</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={canalSelecionadoId} onValueChange={onCanalChange}>
              <DropdownMenuRadioItem value="todos">Todos os números</DropdownMenuRadioItem>
              {canais.map(canal => (
                <DropdownMenuRadioItem key={canal.id} value={canal.id}>
                  {canal.tipo === 'webhook'
                    ? `${getCanalProviderLabel(canal)} · ${canal.nome}`
                    : `${canal.nome}${canal.numero_telefone ? ` · ${canal.numero_telefone}` : ''}`}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            style={dropIconBtn(valor.responsavelId !== '')}
            title="Filtrar por responsável"
            aria-label="Filtrar por responsável"
          >
            <User size={15} />
            <ChevronDown size={9} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto min-w-56 max-w-[min(92vw,30rem)] whitespace-nowrap">
          <DropdownMenuLabel>Responsável</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={valor.responsavelId} onValueChange={v => set({ responsavelId: v })}>
            <DropdownMenuRadioItem value="">Todos os responsáveis</DropdownMenuRadioItem>
            {agentes.map(agente => (
              <DropdownMenuRadioItem key={agente.id} value={agente.id}>{agente.nome}</DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            style={dropIconBtn(valor.acompanhamento !== '')}
            title="Filtrar por acompanhamento"
            aria-label="Filtrar por acompanhamento"
          >
            <Eye size={15} />
            <ChevronDown size={9} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto min-w-56 max-w-[min(92vw,30rem)] whitespace-nowrap">
          <DropdownMenuLabel>Acompanhamento</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={valor.acompanhamento} onValueChange={v => set({ acompanhamento: v })}>
            {ACOMPANHAMENTOS.map(o => (
              <DropdownMenuRadioItem key={o.id || 'todos'} value={o.id}>{o.label}</DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Barra de filtros V2 do CRM atendimento.
 *  Desktop: só as 2 linhas de pills (os dropdowns vão p/ o header via FiltrosDropdownsV2).
 *  Mobile: selects nativos + pills (inalterado — melhor UX touch). */
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
      {/* Dropdowns (mobile-only): no desktop vão p/ a icon-row do header via <FiltrosDropdownsV2 /> */}
      {isMobile && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
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
      )}

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
        {/* Arquivadas = view terminal: ao ligar, reseta escopo p/ 'todas' (coerência c/ precedência do backend).
            Desktop: botão-ícone ancorado à direita. Mobile: pill de texto (inalterado). */}
        {isMobile ? (
          <button
            type="button"
            onClick={() => set({ arquivadas: !valor.arquivadas, escopo: !valor.arquivadas ? 'todas' : valor.escopo })}
            style={pill(valor.arquivadas)}
          >
            Arquivadas
          </button>
        ) : (
          <button
            type="button"
            title="Arquivadas"
            aria-label="Arquivadas"
            onClick={() => set({ arquivadas: !valor.arquivadas, escopo: !valor.arquivadas ? 'todas' : valor.escopo })}
            style={{
              ...pill(valor.arquivadas),
              marginLeft: 'auto',
              width: 26,
              height: 26,
              minHeight: 26,
              padding: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Archive size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
