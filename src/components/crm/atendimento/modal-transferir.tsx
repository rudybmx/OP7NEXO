'use client'

import { useState, useMemo } from 'react'
import type { ConversaApi } from '@/hooks/use-conversas'
import type { EquipeApi } from '@/hooks/use-equipes'
import type { AgenteApi } from '@/hooks/use-agentes-disponiveis'

interface ModalTransferirProps {
  conversa: ConversaApi
  equipes: EquipeApi[]
  agentes: AgenteApi[]
  onConfirmar: (novoResponsavelId: string, novaEquipeId?: string) => void
  onCancelar: () => void
  isTransferindo: boolean
  erro?: string | null
}

export function ModalTransferir({ conversa, equipes, agentes, onConfirmar, onCancelar, isTransferindo, erro }: ModalTransferirProps) {
  const [equipeSelecionada, setEquipeSelecionada] = useState<string>('')
  const [agenteSelecionado, setAgenteSelecionado] = useState<string>('')

  const agentesFiltrados = useMemo(() => {
    if (!equipeSelecionada) return agentes
    // Se tivermos um endpoint que retorna agentes por equipe no futuro, usamos aqui.
    // Por enquanto, mostra todos os agentes do workspace.
    return agentes
  }, [agentes, equipeSelecionada])

  const podeConfirmar = agenteSelecionado && !isTransferindo

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 16,
        padding: 24,
        maxWidth: 420,
        width: '90%',
        boxSizing: 'border-box',
        boxShadow: 'var(--ws-glass-shadow)',
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ws-text-1)', marginBottom: 8 }}>
          Transferir conversa
        </h3>
        <p style={{ fontSize: 13, color: 'var(--ws-text-2)', lineHeight: 1.5, marginBottom: 20 }}>
          Transferir a conversa com <strong>{conversa.contato.nome}</strong> para outro agente ou equipe.
        </p>
        {erro && (
          <div style={{
            marginBottom: 16,
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid rgba(239,68,68,0.25)',
            background: 'rgba(239,68,68,0.08)',
            color: '#ef4444',
            fontSize: 12,
            lineHeight: 1.4,
          }}>
            {erro}
          </div>
        )}

        {/* Equipe */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ws-text-2)', marginBottom: 6 }}>
            Equipe (opcional)
          </label>
          <select
            value={equipeSelecionada}
            onChange={(e) => {
              setEquipeSelecionada(e.target.value)
              setAgenteSelecionado('')
            }}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--ws-glass-border)',
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--ws-text-1)',
              fontSize: 13,
              outline: 'none',
            }}
          >
            <option value="">Manter equipe atual</option>
            {equipes.map(eq => (
              <option key={eq.id} value={eq.id}>{eq.nome}</option>
            ))}
          </select>
        </div>

        {/* Agente */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ws-text-2)', marginBottom: 6 }}>
            Novo responsável *
          </label>
          <select
            value={agenteSelecionado}
            onChange={(e) => setAgenteSelecionado(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid var(--ws-glass-border)',
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--ws-text-1)',
              fontSize: 13,
              outline: 'none',
            }}
          >
            <option value="">Selecione um agente</option>
            {agentesFiltrados.map(ag => (
              <option key={ag.id} value={ag.id}>{ag.nome} {ag.cargo ? `(${ag.cargo})` : ''}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancelar}
            disabled={isTransferindo}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid var(--ws-glass-border)',
              background: 'transparent',
              color: 'var(--ws-text-2)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirmar(agenteSelecionado, equipeSelecionada || undefined)}
            disabled={!podeConfirmar}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, var(--ws-blue) 0%, var(--ws-purple) 100%)',
              color: 'white',
              cursor: !podeConfirmar ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              opacity: !podeConfirmar ? 0.6 : 1,
            }}
          >
            {isTransferindo ? 'Transferindo...' : 'Transferir'}
          </button>
        </div>
      </div>
    </div>
  )
}
