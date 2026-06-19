'use client'

import React, { useState } from 'react'
import { NpsConfigCompleta } from '@/types/nps'
import { MOCK_AGENDAS } from '@/lib/mock-agenda'
import {
  Settings, MessageSquare, Mail, Smartphone, Zap, Clock, ToggleLeft, ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'

interface NpsConfigProps {
  configs: NpsConfigCompleta[]
  onAtualizar: (id: string, data: Partial<NpsConfigCompleta>) => Promise<boolean>
}

type Canal = 'whatsapp' | 'email' | 'sms' | 'push'

const CANAIS: { id: Canal; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp', icon: <MessageSquare size={16} />, color: '#25d366' },
  { id: 'email',    label: 'E-mail',   icon: <Mail size={16} />,          color: 'var(--ws-blue)' },
  { id: 'sms',      label: 'SMS',      icon: <Smartphone size={16} />,    color: 'var(--ws-gold)' },
  { id: 'push',     label: 'Push',     icon: <Zap size={16} />,           color: 'var(--ws-purple)' },
]

const HORAS = [1, 2, 3, 4, 6, 12, 24]

const VARIAVEIS = ['{{nome}}', '{{data}}', '{{hora}}', '{{servico}}', '{{profissional}}']

// ─── Glass Section ────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'relative',
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow)',
      padding: '20px 22px',
      overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.8),transparent)', pointerEvents: 'none' }} />
      <h3 style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--ws-text-3)',
        marginBottom: 16,
      }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function Label({ label }: { label: string }) {
  return <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--ws-text-2)', display: 'block', marginBottom: 6 }}>{label}</label>
}

function TextArea({ value, onChange, placeholder, rows = 4 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        minHeight: 100,
        background: 'rgba(14,20,42,0.03)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-md)',
        padding: '10px 14px',
        fontSize: 13,
        color: 'var(--ws-text-1)',
        resize: 'vertical',
        outline: 'none',
        fontFamily: 'var(--font-sans-base), sans-serif',
        lineHeight: 1.6,
      }}
      onFocus={e => (e.target.style.borderColor = 'var(--ws-blue)')}
      onBlur={e => (e.target.style.borderColor = 'var(--ws-glass-border)')}
    />
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function NpsConfig({ configs, onAtualizar }: NpsConfigProps) {
  const cfg = configs.find(c => c.agenda_id === null) ?? configs[0]
  const [form, setForm] = useState({ ...cfg })
  const [agendaId, setAgendaId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function patch<K extends keyof NpsConfigCompleta>(key: K, value: NpsConfigCompleta[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function insertVar(field: keyof NpsConfigCompleta, v: string) {
    const current = (form[field] as string) ?? ''
    patch(field, current + v)
  }

  async function handleSalvar() {
    setSaving(true)
    const ok = await onAtualizar(form.id, form)
    setSaving(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Cabeçalho de seleção de agenda */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(255,255,255,0.03)',
        border: '0.5px solid rgba(255,255,255,0.08)',
        borderRadius: 10, padding: '12px 16px',
      }}>
        <Settings size={16} color="var(--ws-text-3)" />
        <span style={{ fontSize: 13, color: 'var(--ws-text-2)', fontWeight: 600 }}>Configuração para:</span>
        <div style={{ position: 'relative' }}>
          <select
            value={agendaId ?? ''}
            onChange={e => setAgendaId(e.target.value || null)}
            style={{
              background: 'rgba(14,20,42,0.05)',
              border: '1px solid var(--ws-glass-border)',
              borderRadius: 6,
              padding: '6px 28px 6px 10px',
              color: 'var(--ws-text-1)',
              fontSize: 13,
              cursor: 'pointer',
              outline: 'none',
              appearance: 'none',
            }}
          >
            <option value="">🌐 Configuração Global</option>
            {MOCK_AGENDAS.map(a => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>
          <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
        </div>
        {/* Toggle ativo */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--ws-text-2)' }}>NPS Ativo</span>
          <button
            onClick={() => patch('ativo', !form.ativo)}
            style={{
              width: 44, height: 24, borderRadius: 9999,
              background: form.ativo ? 'var(--ws-green)' : 'rgba(255,255,255,0.1)',
              border: 'none', cursor: 'pointer', position: 'relative',
              transition: 'background 0.3s',
            }}
          >
            <div style={{
              position: 'absolute', top: 3, left: form.ativo ? 22 : 3,
              width: 18, height: 18, borderRadius: '50%', background: '#ffffff',
              transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </button>
        </div>
      </div>

      {/* 1. Trigger de Envio */}
      <Section title="Trigger de Envio">
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16,
        }}>
          {/* Botão Automático */}
          <button
            onClick={() => patch('trigger', 'automatico')}
            style={{
              padding: '14px 20px',
              background: form.trigger === 'automatico'
                ? 'rgba(62,91,255,0.08)'
                : 'rgba(14,20,42,0.03)',
              border: form.trigger === 'automatico'
                ? '1.5px solid var(--ws-blue)'
                : '1px solid var(--ws-divider)',
              borderRadius: 'var(--ws-radius-md)',
              color: form.trigger === 'automatico' ? 'var(--ws-blue)' : 'var(--ws-text-2)',
              fontWeight: form.trigger === 'automatico' ? 600 : 400,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            ⚡ Automático
          </button>

          {/* Botão Manual */}
          <button
            onClick={() => patch('trigger', 'manual')}
            style={{
              padding: '14px 20px',
              background: form.trigger === 'manual'
                ? 'rgba(201,168,76,0.08)'
                : 'rgba(14,20,42,0.03)',
              border: form.trigger === 'manual'
                ? '1.5px solid var(--ws-gold)'
                : '1px solid var(--ws-divider)',
              borderRadius: 'var(--ws-radius-md)',
              color: form.trigger === 'manual' ? 'var(--ws-gold)' : 'var(--ws-text-2)',
              fontWeight: form.trigger === 'manual' ? 600 : 400,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            🕐 Manual
          </button>
        </div>

        {form.trigger === 'automatico' ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--ws-text-2)' }}>Enviar</span>
              <select
                value={form.horas_apos_atendimento}
                onChange={e => patch('horas_apos_atendimento', parseInt(e.target.value))}
                style={{
                  background: 'rgba(14,20,42,0.04)',
                  border: '1px solid var(--ws-glass-border)',
                  borderRadius: 'var(--ws-radius-md)',
                  padding: '4px 10px',
                  color: 'var(--ws-text-1)',
                  fontSize: 13,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {HORAS.map(h => <option key={h} value={h}>{h}h</option>)}
              </select>
              <span style={{ fontSize: 12, color: 'var(--ws-text-2)' }}>após o atendimento</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 12 }}>
              💡 Recomendado: 2h após o atendimento (memória emocional no pico, cliente já voltou à rotina)
            </p>
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '14px 16px',
            background: 'rgba(201,168,76,0.08)',
            border: '1px solid rgba(201,168,76,0.25)',
            borderRadius: 'var(--ws-radius-md)',
            marginTop: 12,
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>🔔</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)', marginBottom: 2 }}>
                Modo Manual Ativo
              </p>
              <p style={{ fontSize: 12, color: 'var(--ws-text-2)', lineHeight: 1.5 }}>
                Você será <strong style={{ color: 'var(--ws-gold)' }}>notificado</strong> após cada atendimento marcado 
                como <strong style={{ color: 'var(--ws-gold)' }}>"Compareceu"</strong>. 
                Você decide quando enviar a pesquisa NPS para o cliente.
              </p>
            </div>
          </div>
        )}
      </Section>

      {/* 2. Canal */}
      <Section title="Canal de Envio">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 10 }}>
          {[
            { id: 'whatsapp', label: 'WhatsApp', icon: '💬', cor: '#25d366' },
            { id: 'email',    label: 'E-mail',   icon: '✉️',  cor: 'var(--ws-blue)' },
            { id: 'sms',      label: 'SMS',      icon: '📱',  cor: 'var(--ws-purple)' },
            { id: 'push',     label: 'Push',     icon: '🔔',  cor: 'var(--ws-coral)' },
          ].map(canal => (
            <button
              key={canal.id}
              onClick={() => patch('canal', canal.id as Canal)}
              style={{
                padding: '14px 10px',
                background: form.canal === canal.id
                  ? `${canal.cor}18`
                  : 'rgba(14,20,42,0.03)',
                border: form.canal === canal.id
                  ? `1.5px solid ${canal.cor}`
                  : '1px solid var(--ws-divider)',
                borderRadius: 'var(--ws-radius-md)',
                color: form.canal === canal.id ? canal.cor : 'var(--ws-text-2)',
                fontSize: 13,
                fontWeight: form.canal === canal.id ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.18s ease',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 6,
              }}
            >
              <span style={{ fontSize: 20 }}>{canal.icon}</span>
              {canal.label}
            </button>
          ))}
        </div>
      </Section>

      {/* 3. Template principal */}
      <Section title="Mensagem Principal">
        <Label label="Template da pergunta NPS (0-10)" />
        <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {VARIAVEIS.map(v => (
            <button
              key={v}
              onClick={() => insertVar('mensagem_template', v)}
              style={{
                fontSize: 11, fontWeight: 600,
                background: 'rgba(62,91,255,0.12)',
                color: 'var(--ws-blue)',
                border: '0.5px solid rgba(62,91,255,0.3)',
                borderRadius: 9999, padding: '3px 10px', cursor: 'pointer',
              }}
            >
              {v}
            </button>
          ))}
        </div>
        <TextArea
          value={form.mensagem_template}
          onChange={v => patch('mensagem_template', v)}
          placeholder="Mensagem enviada ao cliente..."
        />
      </Section>

      {/* 4. Mensagens de seguimento */}
      <Section title="Mensagens de Seguimento">
        <p style={{ fontSize: 12, color: 'var(--ws-text-3)', marginBottom: 16 }}>
          Mensagens enviadas automaticamente após receber o score do cliente.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            {
              categoria: 'promotor',
              emoji: '😊',
              label: 'Mensagem para Promotores (nota 9–10)',
              corLabel: 'var(--ws-green)',
              corBorder: 'rgba(15,168,86,0.25)',
              corBg: 'rgba(15,168,86,0.04)',
              placeholder: 'Ex: Que incrível, {{nome}}! 🌟 Fico muito feliz que tenha amado. Você toparia nos deixar um depoimento rápido? Sua opinião ajuda muitas pessoas!',
              stateKey: 'msg_promotor',
            },
            {
              categoria: 'neutro',
              emoji: '😐',
              label: 'Mensagem para Neutros (nota 7–8)',
              corLabel: 'var(--ws-gold)',
              corBorder: 'rgba(201,168,76,0.25)',
              corBg: 'rgba(201,168,76,0.04)',
              placeholder: 'Ex: Obrigado pelo seu tempo, {{nome}}! 🙏 Tem alguma sugestão do que poderíamos melhorar no seu próximo atendimento?',
              stateKey: 'msg_neutro',
            },
            {
              categoria: 'detrator',
              emoji: '😞',
              label: 'Mensagem para Detratores (nota 0–6)',
              corLabel: 'var(--ws-coral)',
              corBorder: 'rgba(255,92,141,0.25)',
              corBg: 'rgba(255,92,141,0.04)',
              placeholder: 'Ex: Sentimos muito pela sua experiênia, {{nome}}. 💙 Queremos resolver isso. Pode nos contar o que aconteceu para podermos melhorar?',
              stateKey: 'msg_detrator',
            },
          ].map(item => (
            <div key={item.categoria} style={{ marginBottom: 16 }}>
              {/* Label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{item.emoji}</span>
                <p style={{ fontSize: 12, fontWeight: 600, color: item.corLabel }}>
                  {item.label}
                </p>
              </div>
              {/* Chips de variáveis */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {['{{nome}}', '{{data}}', '{{hora}}', '{{servico}}', '{{profissional}}'].map(v => (
                  <button
                    key={v}
                    onClick={() => insertVar(item.stateKey as keyof NpsConfigCompleta, v)}
                    style={{
                      fontSize: 11, padding: '3px 10px',
                      background: `${item.corBg}`,
                      border: `1px solid ${item.corBorder}`,
                      borderRadius: 9999,
                      color: item.corLabel,
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {/* Textarea */}
              <textarea
                value={(form as any)[item.stateKey] || ''}
                onChange={e => patch(item.stateKey as keyof NpsConfigCompleta, e.target.value)}
                placeholder={item.placeholder}
                style={{
                  width: '100%',
                  minHeight: 100,
                  padding: '12px 14px',
                  background: item.corBg,
                  border: `1px solid ${item.corBorder}`,
                  borderRadius: 'var(--ws-radius-md)',
                  color: 'var(--ws-text-1)',
                  fontSize: 13,
                  lineHeight: 1.6,
                  resize: 'vertical',
                  fontFamily: 'var(--font-sans-base), sans-serif',
                  outline: 'none',
                }}
              />
            </div>
          ))}
        </div>
      </Section>

      {/* Botão salvar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={handleSalvar}
          disabled={saving}
          style={{
            background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))',
            color: '#ffffff',
            border: 'none',
            borderRadius: 'var(--ws-radius-md)',
            padding: '10px 24px',
            fontSize: 14,
            fontWeight: 500,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
            transition: 'opacity 0.2s',
            boxShadow: '0 4px 16px rgba(62,91,255,0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
          onMouseEnter={e => { if (!saving) e.currentTarget.style.opacity = '0.85' }}
          onMouseLeave={e => { if (!saving) e.currentTarget.style.opacity = '1' }}
        >
          {saving ? 'Salvando...' : <>💾 Salvar Configurações</>}
        </button>
      </div>
    </div>
  )
}
