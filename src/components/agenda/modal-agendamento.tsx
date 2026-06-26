'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { X, Calendar, Clock, User, Phone, Mail, Trash2, Check, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { format, parseISO, addMinutes, startOfDay, isBefore, isValid, setHours, setMinutes, parse } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  Agenda,
  Agendamento,
  AgendamentoStatus,
  STATUS_LABELS,
  STATUS_COLORS
} from '@/types/agenda'
import { useServicos } from '@/hooks/use-servicos'

interface ModalAgendamentoProps {
  aberto: boolean
  onFechar: () => void
  agendas?: Agenda[]
  agendamentoInicial?: Agendamento | null // null = criação, objeto = edição
  dataInicial?: string  // pré-preenche data se veio de clique no slot
  horaInicial?: string  // pré-preenche hora se veio de clique no slot
  agendaIdInicial?: string // pré-preenche agenda
  onSalvar: (agendamento: Partial<Agendamento>) => void
}

// Estilo comum para labels de seção
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-2 mt-6 mb-3">
    <span style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {children}
    </span>
    <div className="flex-1 h-[1px]" style={{ background: 'var(--ws-glass-border)' }} />
  </div>
)

// Estilo comum para inputs
const InputWrapper = ({ label, required, children, icon: Icon }: { label: string, required?: boolean, children: React.ReactNode, icon?: any }) => (
  <div className="flex flex-col gap-1.5 mb-4">
    <label style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.6)' }}>
      {label} {required && <span className="text-red-400">*</span>}
    </label>
    <div className="relative flex items-center">
      {Icon && (
        <Icon size={14} className="absolute left-3" style={{ color: 'rgba(255,255,255,0.3)' }} />
      )}
      {children}
    </div>
  </div>
)

export function ModalAgendamento({
  aberto,
  onFechar,
  agendas = [],
  agendamentoInicial,
  dataInicial,
  horaInicial,
  agendaIdInicial,
  onSalvar,
}: ModalAgendamentoProps) {
  // Estados do formulário
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [agendaId, setAgendaId] = useState('')
  const [data, setData] = useState('')
  const [hora, setHora] = useState('')
  const [duracao, setDuracao] = useState(30)
  const [servico, setServico] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [status, setStatus] = useState<AgendamentoStatus>('agendado')
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [controleAberto, setControleAberto] = useState(false)
  const [servicoId, setServicoId] = useState('')

  // Serviços do catálogo da agenda selecionada (+ os do workspace, agenda_id null)
  const { servicos } = useServicos(agendaId)

  // Sincroniza estados com agendamentoInicial ao abrir
  useEffect(() => {
    if (aberto) {
      if (agendamentoInicial) {
        const d = parseISO(agendamentoInicial.data_hora_inicio)
        setNome(agendamentoInicial.cliente_nome)
        setTelefone(agendamentoInicial.cliente_telefone)
        setEmail(agendamentoInicial.cliente_email || '')
        setAgendaId(agendamentoInicial.agenda_id)
        setData(format(d, 'yyyy-MM-dd'))
        setHora(format(d, 'HH:mm'))
        
        const fim = parseISO(agendamentoInicial.data_hora_fim)
        const diff = (fim.getTime() - d.getTime()) / (1000 * 60)
        setDuracao(diff)
        
        setServico(agendamentoInicial.servico || '')
        setServicoId(agendamentoInicial.servico_id || '')
        setObservacoes(agendamentoInicial.observacoes || '')
        setStatus(agendamentoInicial.status)
        setMotivoCancelamento(agendamentoInicial.cancelamento_motivo || '')
        setControleAberto(true)
      } else {
        // Reset para novo agendamento
        setNome('')
        setTelefone('')
        setEmail('')
        setAgendaId(agendaIdInicial || agendas[0]?.id || '')
        setData(dataInicial || format(new Date(), 'yyyy-MM-dd'))
        setHora(horaInicial || '09:00')
        setDuracao(30)
        setServico('')
        setServicoId('')
        setObservacoes('')
        setStatus('agendado')
        setMotivoCancelamento('')
        setControleAberto(false)
      }
    }
  }, [aberto, agendamentoInicial, dataInicial, horaInicial, agendas])

  // Máscara de telefone (5511999999999)
  const handleTelefoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '')
    if (value.length <= 13) {
      setTelefone(value)
    }
  }

  // Gera slots de horários (mock simplificado para o exemplo)
  const slots = useMemo(() => {
    const s = []
    for (let h = 7; h <= 21; h++) {
      for (let m = 0; m < 60; m += 30) {
        const hh = h.toString().padStart(2, '0')
        const mm = m.toString().padStart(2, '0')
        s.push(`${hh}:${mm}`)
      }
    }
    return s
  }, [])

  const handleSalvar = () => {
    // Validações
    if (nome.trim().length < 3) {
      toast.error('O nome deve ter pelo menos 3 caracteres')
      return
    }
    if (telefone.length < 10) {
      toast.error('Telefone inválido (mínimo 10 dígitos)')
      return
    }
    if (!agendaId) {
      toast.error('Selecione uma agenda')
      return
    }
    if (!data || !hora) {
      toast.error('Data e horário são obrigatórios')
      return
    }

    const dataHoraInicio = parse(`${data} ${hora}`, 'yyyy-MM-dd HH:mm', new Date())
    const dataHoraFim = addMinutes(dataHoraInicio, duracao)

    if (isBefore(dataHoraInicio, startOfDay(new Date()))) {
      toast.warning('Atenção: O agendamento está sendo criado em uma data passada.')
    }

    const payload: Partial<Agendamento> = {
      id: agendamentoInicial?.id,
      agenda_id: agendaId,
      cliente_nome: nome,
      cliente_telefone: telefone,
      cliente_email: email || undefined,
      data_hora_inicio: dataHoraInicio.toISOString(),
      data_hora_fim: dataHoraFim.toISOString(),
      servico,
      servico_id: servicoId || undefined,
      observacoes,
      status,
      cancelamento_motivo: status === 'cancelado' ? motivoCancelamento : undefined,
    }

    onSalvar(payload)
    toast.success(agendamentoInicial ? 'Agendamento atualizado' : 'Agendamento criado com sucesso')
    onFechar()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    paddingLeft: '36px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--ws-glass-border)',
    borderRadius: 'var(--ws-radius-md)',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 0.2s',
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none',
    cursor: 'pointer'
  }

  const iconLeftStyle = { paddingLeft: '36px' }

  return (
    <div 
      style={{ 
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: '100%',
        zIndex: 100,
        pointerEvents: aberto ? 'auto' : 'none',
        overflow: 'hidden',
        display: aberto ? 'block' : 'none'
      }}
    >
      {/* Overlay */}
      <div 
        onClick={onFechar}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          opacity: aberto ? 1 : 0,
          transition: 'opacity 0.28s ease',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Painel Deslizante */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          maxWidth: 480,
          height: '100%',
          background: 'var(--ws-glass-bg)',
          borderRight: '1px solid var(--ws-glass-border)',
          backdropFilter: 'blur(24px)',
          transform: aberto ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--ws-glass-shadow)',
          fontFamily: 'var(--font-sans-base), sans-serif'
        }}
        className="text-white"
      >
        {/* Linha de brilho no topo */}
        <div style={{ position:'absolute',top:0,left:0,right:0,height:1, background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)', pointerEvents:'none', zIndex: 10 }} />

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: 'var(--ws-glass-border)' }}>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {agendamentoInicial ? 'Editar Agendamento' : 'Novo Agendamento'}
            </h2>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
              {agendamentoInicial ? `ID: ${agendamentoInicial.id.slice(0,8)}` : 'Preencha os dados abaixo'}
            </p>
          </div>
          <button 
            onClick={onFechar}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          {/* SEÇÃO: CLIENTE */}
          <SectionTitle>Cliente</SectionTitle>
          
          <InputWrapper label="Nome do Cliente" required icon={User}>
            <input 
              type="text" 
              placeholder="Nome completo"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              style={inputStyle}
              className="focus:border-[var(--ws-blue)]"
            />
          </InputWrapper>

          <InputWrapper label="Telefone / WhatsApp" required icon={Phone}>
            <input 
              type="tel" 
              placeholder="5511999999999"
              value={telefone}
              onChange={handleTelefoneChange}
              style={inputStyle}
              className="focus:border-[var(--ws-blue)]"
            />
          </InputWrapper>

          <InputWrapper label="E-mail" icon={Mail}>
            <input 
              type="email" 
              placeholder="cliente@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              className="focus:border-[var(--ws-blue)]"
            />
          </InputWrapper>

          {/* SEÇÃO: AGENDAMENTO */}
          <SectionTitle>Agendamento</SectionTitle>

          <InputWrapper label="Agenda" required icon={Calendar}>
            <select 
              value={agendaId}
              onChange={(e) => setAgendaId(e.target.value)}
              style={selectStyle}
              className="focus:border-[var(--ws-blue)]"
            >
              <option value="" disabled style={{ background: '#1a1a1a' }}>Selecione uma agenda</option>
              {agendas?.map(agenda => (
                <option key={agenda.id} value={agenda.id} style={{ background: '#1a1a1a' }}>
                  {agenda.nome}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 pointer-events-none opacity-50" />
            
            {/* Indicador de cor da agenda selecionada */}
            {agendaId && (
              <div 
                className="absolute left-[36px] bottom-[-4px] w-4 h-[2px]" 
                style={{ background: agendas.find(a => a.id === agendaId)?.cor || 'var(--ws-blue)' }} 
              />
            )}
          </InputWrapper>

          <div className="grid grid-cols-2 gap-4">
            <InputWrapper label="Data" required icon={Calendar}>
              <input 
                type="date" 
                value={data}
                onChange={(e) => setData(e.target.value)}
                style={{ ...inputStyle, paddingLeft: '36px' }}
                className="focus:border-[var(--ws-blue)] [color-scheme:dark]"
              />
            </InputWrapper>

            <InputWrapper label="Horário" required icon={Clock}>
              <select 
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                style={selectStyle}
                className="focus:border-[var(--ws-blue)]"
              >
                {slots.map(s => (
                  <option key={s} value={s} style={{ background: '#1a1a1a' }}>
                    {s}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 pointer-events-none opacity-50" />
            </InputWrapper>
          </div>

          {servicos.length > 0 && (
            <InputWrapper label="Serviço (catálogo)">
              <select
                value={servicoId}
                onChange={(e) => {
                  const sv = servicos.find((s) => s.id === e.target.value)
                  setServicoId(e.target.value)
                  if (sv) {
                    setServico(sv.nome)
                    setDuracao(sv.duracao_minutos)
                  }
                }}
                style={selectStyle}
                className="focus:border-[var(--ws-blue)]"
              >
                <option value="" style={{ background: '#1a1a1a' }}>— escolher do catálogo —</option>
                {servicos.map((s) => (
                  <option key={s.id} value={s.id} style={{ background: '#1a1a1a' }}>
                    {s.nome} ({s.duracao_minutos} min{s.preco != null ? ` · R$ ${Number(s.preco).toFixed(2)}` : ''})
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 pointer-events-none opacity-50" />
            </InputWrapper>
          )}

          <div className="grid grid-cols-2 gap-4">
            <InputWrapper label="Duração" icon={Clock}>
              <select 
                value={duracao}
                onChange={(e) => setDuracao(Number(e.target.value))}
                style={selectStyle}
                className="focus:border-[var(--ws-blue)]"
              >
                {[15, 30, 45, 60, 90, 120].map(m => (
                  <option key={m} value={m} style={{ background: '#1a1a1a' }}>
                    {m < 60 ? `${m} min` : `${m/60}h${m%60 !== 0 ? ` ${m%60}min` : ''}`}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 pointer-events-none opacity-50" />
            </InputWrapper>

            <InputWrapper label="Serviço / Interesse">
              <input 
                type="text" 
                placeholder="Ex: Avaliação"
                value={servico}
                onChange={(e) => { setServico(e.target.value); setServicoId('') }}
                style={{ ...inputStyle, paddingLeft: '12px' }}
                className="focus:border-[var(--ws-blue)]"
              />
            </InputWrapper>
          </div>

          {/* SEÇÃO: OBSERVAÇÕES */}
          <SectionTitle>Observações</SectionTitle>
          <textarea 
            placeholder="Detalhes adicionais..."
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={3}
            style={{ 
              width: '100%', 
              padding: '12px', 
              background: 'rgba(255,255,255,0.05)', 
              border: '1px solid var(--ws-glass-border)', 
              borderRadius: 'var(--ws-radius-md)',
              color: '#fff',
              fontSize: '14px',
              outline: 'none',
              resize: 'none'
            }}
            className="focus:border-[var(--ws-blue)]"
          />

          {/* SEÇÃO: CONTROLE (Apenas Edição) */}
          {agendamentoInicial && (
            <div className="mt-8">
              <button 
                onClick={() => setControleAberto(!controleAberto)}
                className="flex items-center justify-between w-full p-3 rounded-lg hover:bg-white/5 transition-colors"
                style={{ border: '1px solid var(--ws-glass-border)' }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[status] }} />
                  <span className="text-xs font-semibold uppercase tracking-wider opacity-70">Controle do Status</span>
                </div>
                {controleAberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {controleAberto && (
                <div className="mt-4 p-4 rounded-lg bg-white/5 space-y-4 border border-[var(--ws-glass-border)]">
                  <InputWrapper label="Status Atual">
                    <select 
                      value={status}
                      onChange={(e) => setStatus(e.target.value as AgendamentoStatus)}
                      style={selectStyle}
                      className="focus:border-[var(--ws-blue)]"
                    >
                      {Object.entries(STATUS_LABELS).map(([val, label]) => (
                        <option key={val} value={val} style={{ background: '#1a1a1a' }}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 pointer-events-none opacity-50" />
                  </InputWrapper>

                  {status === 'cancelado' && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                      <label style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.6)' }} className="mb-1.5 block">
                        Motivo do Cancelamento
                      </label>
                      <textarea 
                        placeholder="Por que está sendo cancelado?"
                        value={motivoCancelamento}
                        onChange={(e) => setMotivoCancelamento(e.target.value)}
                        rows={2}
                        style={{ 
                          width: '100%', 
                          padding: '12px', 
                          background: 'rgba(255,255,255,0.05)', 
                          border: '1px solid var(--ws-glass-border)', 
                          borderRadius: 'var(--ws-radius-md)',
                          color: '#fff',
                          fontSize: '13px',
                          outline: 'none',
                          resize: 'none'
                        }}
                        className="focus:border-[var(--ws-blue)]"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex items-center justify-between gap-4" style={{ borderColor: 'var(--ws-glass-border)', background: 'rgba(255,255,255,0.02)' }}>
          {agendamentoInicial ? (
            <button 
              className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors text-sm font-medium"
              onClick={() => {
                if(confirm('Tem certeza que deseja excluir este agendamento?')) {
                  toast.success('Agendamento excluído')
                  onFechar()
                }
              }}
            >
              <Trash2 size={16} />
              Excluir
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            <button 
              onClick={onFechar}
              className="px-5 py-2.5 rounded-md text-sm font-medium hover:bg-white/10 transition-colors"
              style={{ color: 'rgba(255,255,255,0.7)' }}
            >
              Cancelar
            </button>
            <button 
              onClick={handleSalvar}
              className="px-6 py-2.5 rounded-md text-sm font-semibold shadow-lg hover:brightness-110 active:scale-95 transition-all"
              style={{ 
                background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))',
                color: '#fff'
              }}
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
