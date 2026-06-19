'use client'

import React, { useState } from 'react'
import { NpsResposta, NpsCategoria, CATEGORIA_COLOR, CATEGORIA_EMOJI, CATEGORIA_LABEL } from '@/types/nps'
import {
  MessageSquare, Phone, Mail, Smartphone, ChevronDown, ChevronUp,
  Send, CheckCircle2, Clock, Zap, FileText,
} from 'lucide-react'
import { formatDistanceToNow, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface NpsListaRespostasProps {
  respostas: NpsResposta[]
  loading: boolean
  onRegistrarAcao: (id: string, acao: string) => Promise<boolean>
}

function canalIcon(canal: string) {
  const props = { size: 14 }
  if (canal === 'whatsapp') return <MessageSquare {...props} color="#25d366" />
  if (canal === 'email') return <Mail {...props} color="var(--ws-blue)" />
  if (canal === 'sms') return <Smartphone {...props} color="var(--ws-gold)" />
  return <Send {...props} color="var(--ws-text-3)" />
}

function ScoreBadge({ score, categoria }: { score: number; categoria: NpsCategoria }) {
  const colors: Record<NpsCategoria, { bg: string; text: string }> = {
    promotor: { bg: 'rgba(15,168,86,0.2)', text: 'var(--ws-green)' },
    neutro:   { bg: 'rgba(201,168,76,0.2)', text: 'var(--ws-gold)' },
    detrator: { bg: 'rgba(255,92,141,0.2)', text: 'var(--ws-coral)' },
  }
  const c = colors[categoria]
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      background: c.bg,
      border: `1px solid ${c.text}40`,
      borderRadius: 9999,
      padding: '4px 12px',
      minWidth: 62,
      justifyContent: 'center',
    }}>
      <span style={{ fontSize: 15, fontWeight: 800, color: c.text }}>{score}</span>
      <span style={{ fontSize: 14 }}>{CATEGORIA_EMOJI[categoria]}</span>
    </div>
  )
}

function ExpandedRow({ resposta, onRegistrarAcao }: { resposta: NpsResposta; onRegistrarAcao: (id: string, acao: string) => Promise<boolean> }) {
  const [acao, setAcao] = useState(resposta.acao_tomada ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSalvar() {
    if (!acao.trim()) return
    setSaving(true)
    await onRegistrarAcao(resposta.id, acao)
    setSaving(false)
  }

  return (
    <div style={{
      background: 'rgba(14,20,42,0.02)',
      borderTop: '1px solid var(--ws-divider)',
      borderBottom: '1px solid var(--ws-divider)',
      padding: '20px 24px',
    }}>
      {/* Feedback completo */}
      <div style={{ marginBottom: 16 }}>
        <p style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'var(--ws-text-3)',
          marginBottom: 8,
        }}>
          FEEDBACK COMPLETO
        </p>
        <p style={{
          fontSize: 13, color: 'var(--ws-text-1)',
          lineHeight: 1.6,
          padding: '10px 14px',
          background: 'rgba(14,20,42,0.03)',
          border: '1px solid var(--ws-divider)',
          borderRadius: 'var(--ws-radius-md)',
        }}>
          {resposta.feedback_texto || 'Nenhum feedback textual fornecido.'}
        </p>
      </div>

      {/* Dados do agendamento vinculado */}
      <div style={{
        display: 'flex', gap: 24, marginBottom: 16,
        padding: '10px 14px',
        background: 'rgba(14,20,42,0.02)',
        border: '1px solid var(--ws-divider)',
        borderRadius: 'var(--ws-radius-md)',
      }}>
        {resposta.agendamento && (
          <>
            <div>
              <p style={{ fontSize: 10, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Data</p>
              <p style={{ fontSize: 13, color: 'var(--ws-text-1)', marginTop: 2 }}>
                {format(parseISO(resposta.agendamento.data_hora_inicio), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 10, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Serviço</p>
              <p style={{ fontSize: 13, color: 'var(--ws-text-1)', marginTop: 2 }}>
                {resposta.agendamento.servico || '—'}
              </p>
            </div>
          </>
        )}
        <div>
          <p style={{ fontSize: 10, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Profissional</p>
          <p style={{ fontSize: 13, color: 'var(--ws-text-1)', marginTop: 2 }}>
            {resposta.agenda?.nome || '—'}
          </p>
        </div>
      </div>

      {/* Campo de ação tomada (só para detratores) */}
      {resposta.categoria === 'detrator' && (
        <div style={{ marginBottom: 12 }}>
          <p style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: 'var(--ws-coral)',
            marginBottom: 8,
          }}>
            AÇÃO TOMADA
          </p>
          <textarea
            placeholder="Descreva o que foi feito para resolver a situação deste cliente..."
            value={acao}
            onChange={(e) => setAcao(e.target.value)}
            style={{
              width: '100%', minHeight: 80,
              padding: '10px 14px',
              background: 'rgba(255,92,141,0.04)',
              border: '1px solid rgba(255,92,141,0.20)',
              borderRadius: 'var(--ws-radius-md)',
              color: 'var(--ws-text-1)',
              fontSize: 13,
              resize: 'vertical',
              fontFamily: 'var(--font-sans-base), sans-serif',
              outline: 'none',
            }}
          />
          {/* Botão salvar — ALINHADO À DIREITA, não centralizado */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              onClick={handleSalvar}
              disabled={saving}
              style={{
                background: 'linear-gradient(135deg, var(--ws-coral), #c2185b)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--ws-radius-md)',
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 500,
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 4px 14px rgba(255,92,141,0.35)',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Salvando...' : '✓ Salvar Ação'}
            </button>
          </div>
        </div>
      )}

      {/* Campo de observações (para promotores e neutros) */}
      {resposta.categoria !== 'detrator' && (
        <div style={{ marginBottom: 12 }}>
          <p style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: 'var(--ws-text-3)',
            marginBottom: 8,
          }}>
            OBSERVAÇÕES INTERNAS
          </p>
          <textarea
            placeholder="Anote observações sobre o cliente..."
            value={acao}
            onChange={(e) => setAcao(e.target.value)}
            style={{
              width: '100%', minHeight: 80,
              padding: '10px 14px',
              background: 'rgba(14,20,42,0.03)',
              border: '1px solid var(--ws-divider)',
              borderRadius: 'var(--ws-radius-md)',
              color: 'var(--ws-text-1)',
              fontSize: 13,
              resize: 'vertical',
              fontFamily: 'var(--font-sans-base), sans-serif',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              onClick={handleSalvar}
              disabled={saving}
              style={{
                background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))',
                color: '#ffffff',
                border: 'none',
                borderRadius: 'var(--ws-radius-md)',
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 500,
                cursor: saving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 4px 14px rgba(62,91,255,0.25)',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Salvando...' : '✓ Salvar Observação'}
            </button>
          </div>
        </div>
      )}

      {/* Histórico de ações resolvidas */}
      {resposta.acao_tomada && resposta.acao_tomada_em && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px',
          background: 'rgba(15,168,86,0.06)',
          border: '1px solid rgba(15,168,86,0.20)',
          borderRadius: 'var(--ws-radius-md)',
          marginTop: 8,
        }}>
          <span style={{ color: 'var(--ws-green)', fontSize: 14 }}>✓</span>
          <p style={{ fontSize: 12, color: 'var(--ws-green)' }}>
            Resolvido em {format(parseISO(resposta.acao_tomada_em), "dd/MM/yyyy", { locale: ptBR })}
          </p>
        </div>
      )}

    </div>
  )
}


// ─── Linha da tabela ──────────────────────────────────────────────────────────
function RespostaRow({ resposta, onRegistrarAcao }: { resposta: NpsResposta; onRegistrarAcao: (id: string, acao: string) => Promise<boolean> }) {
  const [expanded, setExpanded] = useState(false)
  const dataRelativa = formatDistanceToNow(parseISO(resposta.enviado_em), { locale: ptBR, addSuffix: true })
  const dataAbsoluta = format(parseISO(resposta.enviado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  const agendaCor = resposta.agenda?.cor ?? '#6B7280'
  const agendaNome = resposta.agenda?.nome ?? resposta.agenda_id

  // Botão de ação por categoria
  const ActionBtn = () => {
    if (resposta.categoria === 'promotor') return (
      <button style={{
        fontSize: 11, fontWeight: 600, color: 'var(--ws-blue)',
        background: 'rgba(62,91,255,0.1)', border: '0.5px solid rgba(62,91,255,0.3)',
        borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
      }}>
        Pedir Depoimento
      </button>
    )
    if (resposta.categoria === 'neutro') return (
      <button style={{
        fontSize: 11, fontWeight: 600, color: 'var(--ws-text-2)',
        background: 'rgba(14,20,42,0.04)', border: '0.5px solid var(--ws-divider)',
        borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
      }}>
        Responder
      </button>
    )
    // Detrator
    if (resposta.acao_tomada) return (
      <span style={{ fontSize: 11, color: 'var(--ws-green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
        <CheckCircle2 size={12} /> Resolvido
      </span>
    )
    return (
      <button
        onClick={e => { e.stopPropagation(); setExpanded(true) }}
        style={{
          fontSize: 11, fontWeight: 700, color: '#ffffff',
          background: 'var(--ws-coral)', border: 'none',
          borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
        Resolver ⚡
      </button>
    )
  }

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        style={{
          cursor: 'pointer',
          transition: 'background 0.15s',
          background: expanded ? 'rgba(62,91,255,0.06)' : 'transparent',
        }}
        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(15,39,68,0.04)' }}
        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
      >
        {/* Cliente */}
        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--ws-divider)' }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ws-text-1)' }}>{resposta.cliente_nome}</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-3)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Phone size={10} />
            {resposta.cliente_telefone}
          </div>
        </td>

        {/* Agenda */}
        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--ws-divider)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: agendaCor, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--ws-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 130 }}>
              {agendaNome}
            </span>
          </div>
        </td>

        {/* Score */}
        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--ws-divider)' }}>
          <ScoreBadge score={resposta.score} categoria={resposta.categoria} />
        </td>

        {/* Feedback */}
        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--ws-divider)', maxWidth: 240 }}>
          {resposta.feedback_texto ? (
            <span style={{
              fontSize: 12,
              color: 'var(--ws-text-2)',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              lineHeight: 1.4,
            }}>
              "{resposta.feedback_texto}"
            </span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--ws-text-3)', fontStyle: 'italic' }}>Sem feedback</span>
          )}
        </td>

        {/* Data */}
        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--ws-divider)' }}>
          <div style={{ fontSize: 12, color: 'var(--ws-text-2)' }}>{dataRelativa}</div>
          <div style={{ fontSize: 10, color: 'var(--ws-text-3)', marginTop: 2 }}>{dataAbsoluta}</div>
        </td>

        {/* Canal */}
        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--ws-divider)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {canalIcon(resposta.canal)}
            <span style={{ fontSize: 11, color: 'var(--ws-text-3)', textTransform: 'capitalize' }}>{resposta.canal}</span>
          </div>
        </td>

        {/* Ação */}
        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--ws-divider)' }} onClick={e => e.stopPropagation()}>
          <ActionBtn />
        </td>

        {/* Expand */}
        <td style={{ padding: '12px 12px', borderBottom: '1px solid var(--ws-divider)', color: 'var(--ws-text-3)' }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </td>
      </tr>

      {/* Linha expandida */}
      {expanded && (
        <tr>
          <td colSpan={8} style={{ padding: 0 }}>
            <ExpandedRow resposta={resposta} onRegistrarAcao={onRegistrarAcao} />
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function NpsListaRespostas({ respostas, loading, onRegistrarAcao }: NpsListaRespostasProps) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: 'var(--ws-text-3)' }}>
        Carregando respostas...
      </div>
    )
  }
  if (respostas.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: 48, color: 'var(--ws-text-3)',
        background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)', backdropFilter: 'blur(16px)',
      }}>
        <MessageSquare size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
        <p>Nenhuma resposta encontrada para os filtros atuais.</p>
      </div>
    )
  }

  return (
    <div style={{
      position: 'relative',
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow)',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.8),transparent)', pointerEvents: 'none' }} />

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(14,20,42,0.03)', borderBottom: '1px solid var(--ws-divider)' }}>
              {['CLIENTE', 'AGENDA', 'SCORE', 'FEEDBACK', 'DATA', 'CANAL', 'AÇÃO', ''].map((h) => (
                <th key={h} style={{
                  padding: '10px 16px',
                  textAlign: 'left',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: 'var(--ws-text-3)',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {respostas.map((r) => (
              <RespostaRow key={r.id} resposta={r} onRegistrarAcao={onRegistrarAcao} />
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--ws-divider)', fontSize: 12, color: 'var(--ws-text-3)' }}>
        {respostas.length} resposta{respostas.length !== 1 ? 's' : ''} encontrada{respostas.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
