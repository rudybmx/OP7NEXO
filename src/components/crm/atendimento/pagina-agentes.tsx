'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { 
  Plus, 
  Edit2, 
  X, 
  User, 
  Mail, 
  MessageSquare, 
  Layers, 
  Power,
  Smartphone,
  MessageCircle as Instagram,
  MessageSquare as Facebook,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react'

// ─── Tipos Internos ───────────────────────────────────────────────────────────

interface Agente {
  id: string
  nome: string
  email: string
  avatarInitials: string
  cor: string
  ativo: boolean
  canal: 'whatsapp' | 'messenger' | 'instagram_dm' | 'todos'
  conversasAtivas: number
  totalAtendimentos: number
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const AGENTES_MOCK: Agente[] = []

const CORES_PRESET = ['#3E5BFF', '#7A5AF8', '#0fa856', '#FF5C8D', '#EF9F27', '#FF3B3B']

const CANAL_CONFIG = {
  whatsapp: { label: 'WhatsApp', cor: '#0fa856', Icon: Smartphone },
  messenger: { label: 'Messenger', cor: '#3E5BFF', Icon: Facebook },
  instagram_dm: { label: 'Instagram', cor: '#FF5C8D', Icon: Instagram },
  todos: { label: 'Todos', cor: '#7A5AF8', Icon: Layers },
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

const getInitials = (nome: string) => {
  if (!nome) return '?'
  const partes = nome.trim().split(' ')
  if (partes.length >= 2) {
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
  }
  return partes[0].substring(0, 2).toUpperCase()
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function PaginaAgentes() {
  const [agentes, setAgentes] = useState<Agente[]>(AGENTES_MOCK)
  const [modalAberto, setModalAberto] = useState(false)
  const [agenteSelecionado, setAgenteSelecionado] = useState<Agente | null>(null)
  
  // Estado do formulário
  const [form, setForm] = useState<Partial<Agente>>({
    nome: '',
    email: '',
    canal: 'todos',
    cor: '#3E5BFF',
    ativo: true,
  })

  // Handlers
  const handleAbrirNovo = () => {
    setAgenteSelecionado(null)
    setForm({
      nome: '',
      email: '',
      canal: 'todos',
      cor: '#3E5BFF',
      ativo: true,
    })
    setModalAberto(true)
  }

  const handleAbrirEditar = (agente: Agente) => {
    setAgenteSelecionado(agente)
    setForm({ ...agente })
    setModalAberto(true)
  }

  const handleFecharModal = () => {
    setModalAberto(false)
    setAgenteSelecionado(null)
  }

  const handleSalvar = (e: React.FormEvent) => {
    e.preventDefault()
    
    const initials = getInitials(form.nome || '')
    
    if (agenteSelecionado) {
      // Editar
      setAgentes(prev => prev.map(a => a.id === agenteSelecionado.id ? {
        ...a,
        ...form as Agente,
        avatarInitials: initials
      } : a))
    } else {
      // Novo
      const novoAgente: Agente = {
        id: `ag-${Date.now()}`,
        nome: form.nome || '',
        email: form.email || '',
        avatarInitials: initials,
        cor: form.cor || '#3E5BFF',
        ativo: form.ativo ?? true,
        canal: form.canal || 'todos',
        conversasAtivas: 0,
        totalAtendimentos: 0,
      }
      setAgentes(prev => [...prev, novoAgente])
    }
    
    handleFecharModal()
  }

  const previewInitials = useMemo(() => getInitials(form.nome || ''), [form.nome])

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      
      {/* 1. Header */}
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '32px'
      }}>
        <div>
          <h1 style={{ 
            fontSize: '24px', 
            fontWeight: 700, 
            color: 'var(--ws-text-1)',
            margin: 0
          }}>Agentes</h1>
          <p style={{ 
            fontSize: '14px', 
            color: 'var(--ws-text-3)',
            marginTop: '4px',
            margin: 0
          }}>{agentes.length} {agentes.length === 1 ? 'agente cadastrado' : 'agentes cadastrados'}</p>
        </div>

        <button 
          onClick={handleAbrirNovo}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: 'var(--ws-radius-md)',
            background: 'linear-gradient(135deg, var(--ws-blue) 0%, var(--ws-purple) 100%)',
            color: 'white',
            border: 'none',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(62, 91, 255, 0.25)',
            transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <Plus size={18} />
          Novo agente
        </button>
      </header>

      {/* 2. Grid de Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '16px',
      }}>
        {agentes.map(agente => (
          <div 
            key={agente.id}
            style={{
              background: 'var(--ws-glass-bg)',
              border: '1px solid var(--ws-glass-border)',
              borderRadius: 'var(--ws-radius-lg)',
              padding: '20px',
              backdropFilter: 'blur(16px)',
              boxShadow: 'var(--ws-glass-shadow)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              transition: 'var(--ws-transition)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: agente.cor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 600,
                  boxShadow: `0 4px 8px ${agente.cor}33`
                }}>
                  {agente.avatarInitials}
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ws-text-1)' }}>{agente.nome}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ws-text-3)' }}>{agente.email}</div>
                </div>
              </div>
              <div style={{
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                padding: '4px 8px',
                borderRadius: '99px',
                background: agente.ativo ? 'rgba(15, 168, 86, 0.1)' : 'rgba(136, 146, 176, 0.1)',
                color: agente.ativo ? '#0fa856' : 'var(--ws-text-3)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                <div style={{ 
                  width: '5px', 
                  height: '5px', 
                  borderRadius: '50%', 
                  background: agente.ativo ? '#0fa856' : 'var(--ws-text-3)' 
                }} />
                {agente.ativo ? 'Ativo' : 'Inativo'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{
                fontSize: '11px',
                fontWeight: 500,
                padding: '4px 10px',
                borderRadius: '8px',
                background: `${CANAL_CONFIG[agente.canal].cor}15`,
                color: CANAL_CONFIG[agente.canal].cor,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                border: `1px solid ${CANAL_CONFIG[agente.canal].cor}22`
              }}>
                {React.createElement(CANAL_CONFIG[agente.canal].Icon, { size: 12 })}
                {CANAL_CONFIG[agente.canal].label}
              </div>
            </div>

            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              padding: '12px 14px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 'var(--ws-radius-md)',
              border: '1px solid var(--ws-glass-border)',
            }}>
              <div>
                <div style={{ fontSize: '10px', color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ativas</div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ws-text-1)' }}>{agente.conversasAtivas}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '10px', color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total</div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ws-text-1)' }}>{agente.totalAtendimentos}</div>
              </div>
            </div>

            <button 
              onClick={() => handleAbrirEditar(agente)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px',
                borderRadius: 'var(--ws-radius-md)',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--ws-glass-border)',
                color: 'var(--ws-text-2)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'var(--ws-transition)'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--ws-glass-bg-hover)'
                e.currentTarget.style.color = 'var(--ws-text-1)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                e.currentTarget.style.color = 'var(--ws-text-2)'
              }}
            >
              <Edit2 size={14} />
              Editar perfil
            </button>
          </div>
        ))}
      </div>

      {/* 3. Modal */}
      {modalAberto && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(5, 8, 22, 0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '480px',
            background: 'var(--ws-glass-bg)',
            border: '1px solid var(--ws-glass-border)',
            borderRadius: 'var(--ws-radius-lg)',
            boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--ws-glass-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ws-text-1)', margin: 0 }}>
                  {agenteSelecionado ? 'Editar Agente' : 'Novo Agente'}
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--ws-text-3)', margin: '4px 0 0' }}>
                  {agenteSelecionado ? 'Atualize os dados do agente abaixo' : 'Preencha os dados do novo integrante'}
                </p>
              </div>
              <button 
                onClick={handleFecharModal}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: 'var(--ws-text-3)', 
                  cursor: 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleSalvar} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Preview Avatar */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: form.cor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '20px',
                  fontWeight: 600,
                  boxShadow: `0 8px 16px ${form.cor}33`,
                  transition: 'background 0.3s ease'
                }}>
                  {previewInitials}
                </div>
              </div>

              {/* Nome */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ws-text-2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={13} /> Nome completo
                </label>
                <input 
                  required
                  type="text"
                  value={form.nome}
                  onChange={e => setForm(prev => ({ ...prev, nome: e.target.value }))}
                  placeholder="Ex: Pedro Silva"
                  style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--ws-radius-md)',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--ws-glass-border)',
                    color: 'var(--ws-text-1)',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--ws-blue)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--ws-glass-border)'}
                />
              </div>

              {/* Email */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ws-text-2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Mail size={13} /> E-mail
                </label>
                <input 
                  required
                  type="email"
                  value={form.email}
                  onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="pedro@suaempresa.com"
                  style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--ws-radius-md)',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--ws-glass-border)',
                    color: 'var(--ws-text-1)',
                    fontSize: '14px',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--ws-blue)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--ws-glass-border)'}
                />
              </div>

              {/* Canal e Ativo em linha */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ws-text-2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Layers size={13} /> Canal preferido
                  </label>
                  <select 
                    value={form.canal}
                    onChange={e => setForm(prev => ({ ...prev, canal: e.target.value as any }))}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 'var(--ws-radius-md)',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--ws-glass-border)',
                      color: 'var(--ws-text-1)',
                      fontSize: '14px',
                      outline: 'none',
                      appearance: 'none',
                      backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'rgba(136, 146, 176, 0.5)\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 12px center',
                      backgroundSize: '16px'
                    }}
                  >
                    <option value="todos">Todos</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="messenger">Messenger</option>
                    <option value="instagram_dm">Instagram DM</option>
                  </select>
                </div>

                <div style={{ width: '100px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ws-text-2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Power size={13} /> Status
                  </label>
                  <div 
                    onClick={() => setForm(prev => ({ ...prev, ativo: !prev.ativo }))}
                    style={{
                      height: '38px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: form.ativo ? 'rgba(15, 168, 86, 0.1)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${form.ativo ? '#0fa85644' : 'var(--ws-glass-border)'}`,
                      borderRadius: 'var(--ws-radius-md)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: form.ativo ? '#0fa856' : 'var(--ws-text-3)',
                      transition: 'all 0.2s'
                    }}
                  >
                    {form.ativo ? 'Ativo' : 'Inativo'}
                  </div>
                </div>
              </div>

              {/* Seletor de Cores */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 500, color: 'var(--ws-text-2)' }}>Cor do perfil</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {CORES_PRESET.map(cor => (
                    <div 
                      key={cor}
                      onClick={() => setForm(prev => ({ ...prev, cor }))}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: cor,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: form.cor === cor ? '2px solid white' : '2px solid transparent',
                        boxShadow: form.cor === cor ? `0 0 0 2px ${cor}` : 'none',
                        transition: 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                        transform: form.cor === cor ? 'scale(1.2)' : 'scale(1)'
                      }}
                    >
                      {form.cor === cor && <CheckCircle2 size={14} color="white" />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Botões do Modal */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button 
                  type="button"
                  onClick={handleFecharModal}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: 'var(--ws-radius-md)',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--ws-glass-border)',
                    color: 'var(--ws-text-2)',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  style={{
                    flex: 1.5,
                    padding: '12px',
                    borderRadius: 'var(--ws-radius-md)',
                    background: 'linear-gradient(135deg, var(--ws-blue) 0%, var(--ws-purple) 100%)',
                    border: 'none',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 8px 16px rgba(62, 91, 255, 0.25)',
                  }}
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

