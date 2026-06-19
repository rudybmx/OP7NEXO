'use client'

import React, { useState, useEffect } from 'react'
import { 
  X, 
  Save, 
  Plus, 
  Trash2, 
  ChevronUp, 
  ChevronDown,
  Info,
  Calendar,
  MessageSquare,
  Clock,
  Sparkles
} from 'lucide-react'
import { RecorrenciaConfig, FollowupMensagem } from '@/types/followup'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Sheet, SheetContent } from '@/components/ui/sheet'

interface RecorrenciaPainelProps {
  isOpen: boolean
  onClose: () => void
  configInit?: RecorrenciaConfig | null
  onSave: (config: Partial<RecorrenciaConfig>) => void
}

export function RecorrenciaPainel({ isOpen, onClose, configInit, onSave }: RecorrenciaPainelProps) {
  const [form, setForm] = useState<Partial<RecorrenciaConfig>>({
    nome: '',
    ativo: true,
    trigger: 'pos_comparecimento',
    dias_apos_trigger: 180,
    cadencia: {
      tipo: 'semanal',
      horario_envio: '09:00',
      max_tentativas: 5,
      canal: 'whatsapp'
    },
    mensagens: [
      { id: 'm1', followup_config_id: '', ordem: 1, conteudo: '', tem_midia: false }
    ]
  })

  useEffect(() => {
    if (configInit) {
      setForm(configInit)
    } else {
      setForm({
        nome: '',
        ativo: true,
        trigger: 'pos_comparecimento',
        dias_apos_trigger: 180,
        cadencia: {
          tipo: 'semanal',
          horario_envio: '09:00',
          max_tentativas: 5,
          canal: 'whatsapp'
        },
        mensagens: [
          { id: 'm1', followup_config_id: '', ordem: 1, conteudo: '', tem_midia: false }
        ]
      })
    }
  }, [configInit, isOpen])

  const addMensagem = () => {
    const nova: FollowupMensagem = {
      id: `m_${Math.random().toString(36).substr(2, 9)}`,
      followup_config_id: form.id || '',
      ordem: (form.mensagens?.length || 0) + 1,
      conteudo: '',
      tem_midia: false
    }
    setForm(prev => ({ ...prev, mensagens: [...(prev.mensagens || []), nova] }))
  }

  const removeMensagem = (id: string) => {
    setForm(prev => ({
      ...prev,
      mensagens: prev.mensagens?.filter(m => m.id !== id).map((m, i) => ({ ...m, ordem: i + 1 }))
    }))
  }

  const handleMsgChange = (id: string, val: string) => {
    setForm(prev => ({
      ...prev,
      mensagens: prev.mensagens?.map(m => m.id === id ? { ...m, conteudo: val } : m)
    }))
  }

  const moverMsg = (idx: number, direcao: 'up' | 'down') => {
    if (!form.mensagens) return
    const novas = [...form.mensagens]
    const targetIdx = direcao === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= novas.length) return

    const temp = novas[idx]
    novas[idx] = novas[targetIdx]
    novas[targetIdx] = temp

    setForm(prev => ({
      ...prev,
      mensagens: novas.map((m, i) => ({ ...m, ordem: i + 1 }))
    }))
  }

  const inserirVariavel = (id: string, variavel: string) => {
    const msg = form.mensagens?.find(m => m.id === id)
    if (!msg) return
    const text = msg.conteudo + ` {{${variavel}}}`
    handleMsgChange(id, text)
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        style={{
          width: 520,
          background: 'var(--ws-glass-bg)',
          backdropFilter: 'blur(24px)',
          borderLeft: '1px solid var(--ws-glass-border)',
          padding: 0,
        }}
        className="overflow-y-auto flex flex-col"
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--ws-divider)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.02)'
        }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ws-text-1)' }}>
              {configInit ? 'Editar Configuração' : 'Nova Configuração'}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--ws-text-3)', marginTop: 2 }}>Remarketing e recorrência automática</p>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--ws-text-3)', padding: 4, borderRadius: 6,
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }} className="space-y-8 custom-scrollbar">
          
          {/* IDENTIFICAÇÃO */}
          <section className="space-y-4">
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ws-text-3)',
              marginBottom: 12,
              paddingBottom: 8,
              borderBottom: '1px solid var(--ws-divider)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              Identificação
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ws-text-2)' }}>Nome da configuração *</label>
                <Input 
                  value={form.nome} 
                  onChange={e => setForm(prev => ({ ...prev, nome: e.target.value }))}
                  placeholder="Ex: Retorno Implante — 6 meses"
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: 'rgba(14,20,42,0.04)',
                    border: '1px solid var(--ws-glass-border)',
                    borderRadius: 'var(--ws-radius-md)',
                    color: 'var(--ws-text-1)',
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'var(--font-sans-base), sans-serif',
                  }}
                />
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'between',
                padding: '12px 14px',
                background: 'rgba(14,20,42,0.02)',
                borderRadius: 'var(--ws-radius-md)',
                border: '1px solid var(--ws-divider)'
              }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)', display: 'block' }}>Status da Configuração</span>
                  <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>Disparar recorrência para novos leads qualificados</span>
                </div>
                <Switch 
                  checked={form.ativo} 
                  onCheckedChange={val => setForm(prev => ({ ...prev, ativo: val }))}
                />
              </div>
            </div>
          </section>

          {/* QUANDO DISPARAR */}
          <section className="space-y-4">
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ws-text-3)',
              marginBottom: 12,
              paddingBottom: 8,
              borderBottom: '1px solid var(--ws-divider)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              Quando Disparar (Trigger)
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ws-text-2)' }}>Trigger Principal</label>
                <Select 
                  value={form.trigger} 
                  onValueChange={val => setForm(prev => ({ ...prev, trigger: val as any }))}
                >
                  <SelectTrigger style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: 'rgba(14,20,42,0.04)',
                    border: '1px solid var(--ws-glass-border)',
                    borderRadius: 'var(--ws-radius-md)',
                    color: 'var(--ws-text-1)',
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'var(--font-sans-base), sans-serif',
                  }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pos_comparecimento">Após comparecimento</SelectItem>
                    <SelectItem value="pos_procedimento">Após procedimento específico</SelectItem>
                    <SelectItem value="aniversario">Aniversário</SelectItem>
                    <SelectItem value="data_fixa">Data fixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.trigger === 'pos_comparecimento' && (
                <div className="space-y-1.5">
                  <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ws-text-2)' }}>Quantos dias após?</label>
                  <div className="relative">
                    <Input 
                      type="number"
                      value={form.dias_apos_trigger} 
                      onChange={e => setForm(prev => ({ ...prev, dias_apos_trigger: Number(e.target.value) }))}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        background: 'rgba(14,20,42,0.04)',
                        border: '1px solid var(--ws-glass-border)',
                        borderRadius: 'var(--ws-radius-md)',
                        color: 'var(--ws-text-1)',
                        fontSize: 13,
                        outline: 'none',
                        fontFamily: 'var(--font-sans-base), sans-serif',
                        paddingRight: '40px'
                      }}
                    />
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--ws-text-3)', fontWeight: 600 }}>DIAS</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* FILTROS */}
          <section className="space-y-4">
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ws-text-3)',
              marginBottom: 12,
              paddingBottom: 8,
              borderBottom: '1px solid var(--ws-divider)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              Filtros (Opcional)
            </div>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ws-text-2)' }}>Serviço/Procedimento</label>
                <Input 
                  value={form.filtro_servico} 
                  onChange={e => setForm(prev => ({ ...prev, filtro_servico: e.target.value }))}
                  placeholder="Ex: Implante, Prótese..."
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: 'rgba(14,20,42,0.04)',
                    border: '1px solid var(--ws-glass-border)',
                    borderRadius: 'var(--ws-radius-md)',
                    color: 'var(--ws-text-1)',
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'var(--font-sans-base), sans-serif',
                  }}
                />
              </div>
            </div>
          </section>

          {/* CADÊNCIA */}
          <section className="space-y-4">
            <div style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ws-text-3)',
              marginBottom: 12,
              paddingBottom: 8,
              borderBottom: '1px solid var(--ws-divider)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              Cadência
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ws-text-2)' }}>Frequência</label>
                <Select 
                  value={form.cadencia?.tipo} 
                  onValueChange={val => setForm(prev => ({ ...prev, cadencia: { ...prev.cadencia!, tipo: val as any } }))}
                >
                  <SelectTrigger style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: 'rgba(14,20,42,0.04)',
                    border: '1px solid var(--ws-glass-border)',
                    borderRadius: 'var(--ws-radius-md)',
                    color: 'var(--ws-text-1)',
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'var(--font-sans-base), sans-serif',
                  }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="diario">Diário</SelectItem>
                    <SelectItem value="dias_alternados">Dias Alternados</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="personalizado">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ws-text-2)' }}>Horário de Envio</label>
                <Input 
                  type="time"
                  value={form.cadencia?.horario_envio} 
                  onChange={e => setForm(prev => ({ ...prev, cadencia: { ...prev.cadencia!, horario_envio: e.target.value } }))}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: 'rgba(14,20,42,0.04)',
                    border: '1px solid var(--ws-glass-border)',
                    borderRadius: 'var(--ws-radius-md)',
                    color: 'var(--ws-text-1)',
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'var(--font-sans-base), sans-serif',
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ws-text-2)' }}>Máx. Tentativas</label>
                <Input 
                  type="number"
                  min={1}
                  max={10}
                  value={form.cadencia?.max_tentativas} 
                  onChange={e => setForm(prev => ({ ...prev, cadencia: { ...prev.cadencia!, max_tentativas: Number(e.target.value) } }))}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: 'rgba(14,20,42,0.04)',
                    border: '1px solid var(--ws-glass-border)',
                    borderRadius: 'var(--ws-radius-md)',
                    color: 'var(--ws-text-1)',
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'var(--font-sans-base), sans-serif',
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--ws-text-2)' }}>Canal</label>
                <Select 
                  value={form.cadencia?.canal} 
                  onValueChange={val => setForm(prev => ({ ...prev, cadencia: { ...prev.cadencia!, canal: val as any } }))}
                >
                  <SelectTrigger style={{
                    width: '100%',
                    padding: '9px 12px',
                    background: 'rgba(14,20,42,0.04)',
                    border: '1px solid var(--ws-glass-border)',
                    borderRadius: 'var(--ws-radius-md)',
                    color: 'var(--ws-text-1)',
                    fontSize: 13,
                    outline: 'none',
                    fontFamily: 'var(--font-sans-base), sans-serif',
                  }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* MENSAGENS */}
          <section className="space-y-4">
            <div className="flex items-center justify-between" style={{
              marginBottom: 12,
              paddingBottom: 8,
              borderBottom: '1px solid var(--ws-divider)',
            }}>
              <div style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ws-text-3)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                Mensagens
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={addMensagem}
                className="text-[10px] uppercase font-bold text-[var(--ws-blue)] hover:bg-[var(--ws-blue-soft)] h-7"
              >
                <Plus size={14} className="mr-1" /> Adicionar Mensagem
              </Button>
            </div>

            <div className="space-y-4">
              {form.mensagens?.map((msg, idx) => (
                <div 
                  key={msg.id}
                  style={{
                    padding: '16px',
                    borderRadius: 'var(--ws-radius-lg)',
                    border: '1px solid var(--ws-glass-border)',
                    background: 'rgba(14,20,42,0.02)',
                    position: 'relative',
                  }}
                  className="space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ws-text-3)', uppercase: true, letterSpacing: '0.06em' }}>
                      MENSAGEM {msg.ordem}
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moverMsg(idx, 'up')} style={{ p: 4, background: 'transparent', border: 'none', color: 'var(--ws-text-3)', cursor: 'pointer' }}><ChevronUp size={14} /></button>
                      <button onClick={() => moverMsg(idx, 'down')} style={{ p: 4, background: 'transparent', border: 'none', color: 'var(--ws-text-3)', cursor: 'pointer' }}><ChevronDown size={14} /></button>
                      <button onClick={() => removeMensagem(msg.id)} style={{ p: 4, background: 'transparent', border: 'none', color: 'var(--ws-coral)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                    </div>
                  </div>

                  <Textarea 
                    value={msg.conteudo}
                    onChange={e => handleMsgChange(msg.id, e.target.value)}
                    placeholder="Olá {{nome}}, quanto tempo..."
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'rgba(14,20,42,0.04)',
                      border: '1px solid var(--ws-glass-border)',
                      borderRadius: 'var(--ws-radius-md)',
                      color: 'var(--ws-text-1)',
                      fontSize: 13,
                      minHeight: '100px',
                      outline: 'none',
                      fontFamily: 'var(--font-sans-base), sans-serif',
                    }}
                  />

                  <div className="flex flex-wrap gap-1.5">
                    {['nome', 'servico', 'profissional', 'dias_desde_atendimento'].map(v => (
                      <button 
                        key={v}
                        onClick={() => inserirVariavel(msg.id, v)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: 'rgba(62,91,255,0.06)',
                          border: '1px solid rgba(62,91,255,0.1)',
                          fontSize: 10,
                          color: 'var(--ws-blue)',
                          fontWeight: 600,
                          cursor: 'pointer',
                          textTransform: 'uppercase'
                        }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--ws-divider)',
          display: 'flex',
          gap: 10,
          justifyContent: 'flex-end',
          background: 'var(--ws-glass-bg)',
          backdropFilter: 'blur(16px)',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 20px',
              background: 'transparent',
              border: '1px solid var(--ws-glass-border)',
              borderRadius: 'var(--ws-radius-md)',
              color: 'var(--ws-text-2)',
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              onSave(form)
              onClose()
            }}
            style={{
              padding: '9px 24px',
              background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))',
              border: 'none',
              borderRadius: 'var(--ws-radius-md)',
              color: '#ffffff',
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(62,91,255,0.35)',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Save size={18} /> Salvar Configuração
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
