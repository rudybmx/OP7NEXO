'use client'

import React from 'react'
import { Plus, Pencil, Users, Clock, CalendarDays } from 'lucide-react'
import { Agenda, AgendaTipo } from '@/types/agenda'

const TIPO_LABELS: Record<AgendaTipo, string> = {
  profissional: 'Profissional',
  sala: 'Sala',
  equipamento: 'Equipamento',
  outro: 'Outro',
}

const FUSO_CURTO: Record<string, string> = {
  'America/Sao_Paulo': 'Brasília (GMT-3)',
  'America/Rio_Branco': 'Acre (GMT-5)',
  'America/Noronha': 'Noronha (GMT-2)',
  'America/Manaus': 'Manaus (GMT-4)',
}

interface GestaoAgendasProps {
  agendas: Agenda[]
  onNova: () => void
  onEditar: (agenda: Agenda) => void
}

export function GestaoAgendas({ agendas, onNova, onEditar }: GestaoAgendasProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ws-text-1)', margin: 0 }}>
            Agendas
          </h1>
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
            Profissionais, salas e equipamentos que recebem agendamentos
          </p>
        </div>
        <button
          onClick={onNova}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            border: 'none',
            borderRadius: 'var(--ws-radius-md)',
            background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))',
            color: '#fff',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <Plus size={14} />
          Nova Agenda
        </button>
      </div>

      {/* Grid de cards */}
      {agendas.length === 0 ? (
        <div
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            background: 'var(--ws-glass-bg)',
            border: '1px dashed var(--ws-glass-border)',
            borderRadius: 'var(--ws-radius-lg)',
          }}
        >
          <CalendarDays size={28} color="var(--muted-foreground)" style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ws-text-1)', marginBottom: 4 }}>
            Nenhuma agenda ainda
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 16 }}>
            Crie a primeira agenda (um profissional, uma sala ou um equipamento) para começar a agendar.
          </div>
          <button
            onClick={onNova}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              border: 'none',
              borderRadius: 'var(--ws-radius-md)',
              background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))',
              color: '#fff',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Plus size={14} />
            Criar primeira agenda
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}
        >
          {agendas.map((agenda) => (
            <div
              key={agenda.id}
              style={{
                position: 'relative',
                background: 'var(--ws-glass-bg)',
                border: '1px solid var(--ws-glass-border)',
                borderRadius: 'var(--ws-radius-lg)',
                backdropFilter: 'blur(16px)',
                boxShadow: 'var(--ws-glass-shadow)',
                padding: 16,
                overflow: 'hidden',
              }}
            >
              {/* faixa de cor lateral */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 4,
                  bottom: 0,
                  background: agenda.cor,
                }}
              />

              {/* Topo: nome + editar */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: agenda.cor,
                      flexShrink: 0,
                      boxShadow: `0 0 6px ${typeof agenda.cor === 'string' && agenda.cor.startsWith('#') ? agenda.cor + '80' : 'transparent'}`,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--ws-text-1)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {agenda.nome}
                  </span>
                </div>
                <button
                  onClick={() => onEditar(agenda)}
                  title="Editar agenda"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--muted-foreground)',
                    display: 'flex',
                    padding: 4,
                    borderRadius: 6,
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                    e.currentTarget.style.color = 'var(--foreground)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--muted-foreground)'
                  }}
                >
                  <Pencil size={14} />
                </button>
              </div>

              {/* Badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '3px 8px',
                    borderRadius: 9999,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--ws-glass-border)',
                    color: 'var(--ws-text-2)',
                  }}
                >
                  {TIPO_LABELS[agenda.tipo]}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '3px 8px',
                    borderRadius: 9999,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--ws-glass-border)',
                    color: 'var(--ws-text-2)',
                  }}
                >
                  <Users size={11} />
                  {agenda.capacidade_simultanea} simultâneo{agenda.capacidade_simultanea > 1 ? 's' : ''}
                </span>
              </div>

              {/* Rodapé: fuso */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  marginTop: 12,
                  fontSize: 11,
                  color: 'var(--muted-foreground)',
                }}
              >
                <Clock size={11} />
                {FUSO_CURTO[agenda.fuso_horario] ?? agenda.fuso_horario}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
