'use client'

import { useState } from 'react'
import { CalendarClock, Phone, User, Users, MessageSquare, X } from 'lucide-react'
import type { ConversaApi } from '@/hooks/use-conversas'
import { useCrmFollowups } from '@/hooks/use-crm-followups'

interface PainelContatoProps {
  conversa: ConversaApi
  workspaceId?: string
  onAtualizar?: () => void
  onTogglePainel?: () => void
}

function InfoRow({ label, valor, icon }: { label: string; valor?: string | null; icon?: React.ReactNode }) {
  if (!valor) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <div style={{
        width: 24,
        height: 24,
        borderRadius: 8,
        background: 'rgba(62,91,255,0.08)',
        color: 'var(--ws-blue)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon || <User size={12} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--ws-text-1)', wordBreak: 'break-word' }}>{valor}</div>
      </div>
    </div>
  )
}

function formatDateTimeLocal(value: Date) {
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`
}

export function PainelContato({ conversa, workspaceId, onAtualizar, onTogglePainel }: PainelContatoProps) {
  const [expandido, setExpandido] = useState(true)
  const [followupNota, setFollowupNota] = useState('')
  const [followupDueAt, setFollowupDueAt] = useState(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0)
    return formatDateTimeLocal(tomorrow)
  })
  const { followups, isSaving, error, createFollowup, updateFollowup } = useCrmFollowups(
    workspaceId,
    conversa.id,
    Boolean(workspaceId && conversa.id),
  )

  const proximoFollowup = followups.find(item => item.status === 'pendente' || item.status === 'adiado')

  async function salvarFollowup() {
    if (!workspaceId || !followupDueAt) return
    const ok = await createFollowup({
      workspace_id: workspaceId,
      canal_id: conversa.canalId || null,
      contato_id: conversa.contato.id,
      conversa_id: conversa.id,
      responsavel_id: conversa.responsavelId || null,
      due_at: new Date(followupDueAt).toISOString(),
      tipo: 'retorno',
      nota: followupNota.trim() || null,
    })
    if (ok) {
      setFollowupNota('')
      onAtualizar?.()
    }
  }

  return (
    <aside style={{
      width: '100%',
      height: '100%',
      minWidth: 0,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'rgba(255, 255, 255, 0.74)',
      backdropFilter: 'blur(12px)',
      boxSizing: 'border-box',
    }}>
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,252,0.92) 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ws-text-1)', letterSpacing: '0.02em' }}>
            Informações do contato
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--ws-text-3)', marginTop: 2 }}>
            Follow-up, tags, campanha e contexto
          </div>
        </div>

        {onTogglePainel && (
          <button
            type="button"
            onClick={onTogglePainel}
            title="Fechar painel do contato"
            aria-label="Fechar painel do contato"
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.92)',
              border: '1px solid rgba(15, 23, 42, 0.08)',
              color: 'var(--ws-text-3)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
              flexShrink: 0,
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'thin',
        padding: 16,
        boxSizing: 'border-box',
      }}>
        {/* Header do contato */}
        <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--ws-divider)', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700,
              color: 'white',
              flexShrink: 0,
            }}>
              {conversa.contato.nome.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ws-text-1)', lineHeight: 1.2 }}>
                {conversa.contato.nome}
              </div>
              <div style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 3 }}>
                {conversa.contato.telefone}
              </div>
            </div>
          </div>

          {/* Tags de status */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            <span style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 999,
              background: 'rgba(37,211,102,0.12)',
              color: '#25D366',
              border: '1px solid rgba(37,211,102,0.18)',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}>WhatsApp</span>
            <span style={{
              fontSize: 10,
              padding: '2px 8px',
              borderRadius: 999,
              background: conversa.status === 'em_atendimento' ? 'rgba(62,91,255,0.10)' : 'rgba(255,255,255,0.05)',
              color: conversa.status === 'em_atendimento' ? 'var(--ws-blue)' : 'var(--ws-text-3)',
              border: '1px solid var(--ws-glass-border)',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}>{conversa.status.replace('_', ' ')}</span>
            {conversa.leadStatus && (
              <span style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'rgba(201,168,76,0.12)',
                color: '#c9a84c',
                border: '1px solid rgba(201,168,76,0.28)',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}>{conversa.leadStatus}</span>
            )}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <InfoRow label="Telefone" valor={conversa.contato.numeroEvo || conversa.contato.telefone} icon={<Phone size={12} />} />
            <InfoRow label="Remote JID" valor={conversa.contato.remoteJid} icon={<MessageSquare size={12} />} />
            <InfoRow label={conversa.canalTipo === 'webhook' ? 'Canal' : 'Número conectado'} valor={conversa.canalNumero || conversa.canalNome} icon={<MessageSquare size={12} />} />
            <InfoRow label="Próximo follow-up" valor={conversa.followupDueAt ? new Date(conversa.followupDueAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null} icon={<CalendarClock size={12} />} />
          </div>
        </div>

        {/* Tags */}
        <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--ws-divider)', marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Tags</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {conversa.tags.length ? conversa.tags.map(tag => (
              <span key={tag} style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--ws-text-2)',
                border: '1px solid var(--ws-glass-border)',
              }}>{tag}</span>
            )) : (
              <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>Sem tags</span>
            )}
          </div>
        </div>

        {/* Equipe */}
        {conversa.equipe && (
          <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--ws-divider)', marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Equipe</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={14} color="var(--ws-blue)" />
              <span style={{ fontSize: 12, color: 'var(--ws-text-1)' }}>{conversa.equipe.nome}</span>
              <span style={{ fontSize: 10, color: 'var(--ws-text-3)' }}>({conversa.equipe.membrosCount} membros)</span>
            </div>
          </div>
        )}

        {/* Follow-up */}
        <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--ws-divider)', marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Follow-up</div>
          {proximoFollowup && (
            <div style={{
              padding: 10,
              borderRadius: 10,
              border: '1px solid rgba(201,168,76,0.24)',
              background: 'rgba(201,168,76,0.10)',
              marginBottom: 10,
            }}>
              <div style={{ fontSize: 11, color: '#c9a84c', fontWeight: 700 }}>
                {new Date(proximoFollowup.due_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
              {proximoFollowup.nota && (
                <div style={{ fontSize: 11, color: 'var(--ws-text-2)', marginTop: 4, lineHeight: 1.4 }}>{proximoFollowup.nota}</div>
              )}
              <button
                onClick={async () => {
                  const ok = await updateFollowup(proximoFollowup.id, { status: 'feito' })
                  if (ok) onAtualizar?.()
                }}
                disabled={isSaving}
                style={{
                  marginTop: 8,
                  border: '1px solid rgba(15,168,86,0.28)',
                  background: 'rgba(15,168,86,0.10)',
                  color: '#0fa856',
                  borderRadius: 8,
                  padding: '5px 8px',
                  fontSize: 11,
                  cursor: isSaving ? 'wait' : 'pointer',
                }}
              >
                Marcar como feito
              </button>
            </div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            <input
              type="datetime-local"
              value={followupDueAt}
              onChange={event => setFollowupDueAt(event.target.value)}
              style={fieldStyle}
            />
            <textarea
              value={followupNota}
              onChange={event => setFollowupNota(event.target.value)}
              placeholder="Nota do próximo contato"
              rows={2}
              style={{ ...fieldStyle, resize: 'none' }}
            />
            {error && <div style={{ fontSize: 11, color: '#a32d2d' }}>{error}</div>}
            <button
              onClick={salvarFollowup}
              disabled={isSaving || !workspaceId}
              style={{
                border: '1px solid rgba(62,91,255,0.28)',
                background: 'rgba(62,91,255,0.12)',
                color: 'var(--ws-blue)',
                borderRadius: 8,
                padding: '7px 10px',
                fontSize: 12,
                fontWeight: 700,
                cursor: isSaving ? 'wait' : 'pointer',
              }}
            >
              Criar follow-up
            </button>
          </div>
        </div>

        {/* Campanha */}
        {conversa.campanha && (
          <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--ws-divider)', marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Campanha</div>
            <span style={{ fontSize: 12, color: 'var(--ws-text-1)' }}>{conversa.campanha}</span>
          </div>
        )}

        {/* Análise IA */}
        <div>
          <div
            onClick={() => setExpandido(!expandido)}
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--ws-text-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 10,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>🤖 Análise IA</span>
            <span style={{ fontSize: 12 }}>{expandido ? '−' : '+'}</span>
          </div>
          {expandido && (
            <div style={{
              background: 'rgba(62,91,255,0.08)',
              border: '1px solid rgba(62,91,255,0.15)',
              borderRadius: 12,
              padding: 12,
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#3E5BFF', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Resumo</div>
              <p style={{ fontSize: 11, color: 'var(--ws-text-2)', lineHeight: 1.5, margin: 0 }}>
                Lead interagindo via WhatsApp. Aguardando próxima ação do atendente.
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid var(--ws-glass-border)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.04)',
  color: 'var(--ws-text-1)',
  padding: '7px 9px',
  fontSize: 12,
  outline: 'none',
}
