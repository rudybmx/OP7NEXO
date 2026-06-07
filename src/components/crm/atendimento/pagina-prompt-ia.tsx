'use client'

import React, { useState, useEffect } from 'react'
import { 
  Sparkles, 
  Save, 
  RefreshCcw, 
  Bot, 
  Check, 
  Clock, 
  Settings2, 
  MessageSquare,
  Activity,
  ChevronDown
} from 'lucide-react'

// ─── Tipos Internos ───────────────────────────────────────────────────────────

interface ConfigPrompt {
  nomeNegocio: string
  segmento: string
  servicos: string
  horarios: string
  tomVoz: string
  instrucoes: string
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const CONFIG_MOCK: ConfigPrompt = {
  nomeNegocio: 'Odontologia Tuler',
  segmento: 'Odontologia',
  servicos: 'Implante dentário, limpeza, clareamento, ortodontia, lente de contato dental',
  horarios: 'Segunda a sexta das 8h às 18h, sábados das 8h às 13h',
  tomVoz: 'profissional e acolhedor',
  instrucoes: 'Sempre oferecer consulta gratuita de avaliação. Não informar preços sem antes qualificar o lead. Se o cliente perguntar sobre financiamento, informar que temos parcelas em até 18x sem juros.',
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export function PaginaPromptIA() {
  const [config, setConfig] = useState<ConfigPrompt>(CONFIG_MOCK)
  const [iaAtiva, setIaAtiva] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [toastVisivel, setToastVisivel] = useState(false)
  
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  async function salvar() {
    setSalvando(true)
    await new Promise(r => setTimeout(r, 800)) // simula chamada API
    setSalvando(false)
    setToastVisivel(true)
    setTimeout(() => setToastVisivel(false), 3000)
  }

  const restaurarPadrao = () => {
    if (confirm('Deseja restaurar as configurações padrão?')) {
      setConfig(CONFIG_MOCK)
    }
  }

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--ws-text-2)',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 'var(--ws-radius-md)',
    background: 'var(--ws-glass-bg)',
    border: '1px solid var(--ws-glass-border)',
    color: 'var(--ws-text-1)',
    fontSize: '14px',
    outline: 'none',
    transition: 'all 0.2s ease',
  }

  return (
    <div style={{ 
      padding: '24px', 
      maxWidth: '1100px', 
      margin: '0 auto',
      position: 'relative' 
    }}>
      
      {/* 1. Header */}
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '32px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <h1 style={{ 
            fontSize: '24px', 
            fontWeight: 700, 
            color: 'var(--ws-text-1)',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Bot size={28} color="var(--ws-blue)" />
            Configuração do Agente IA
          </h1>
          <p style={{ 
            fontSize: '14px', 
            color: 'var(--ws-text-3)',
            marginTop: '4px',
            margin: 0
          }}>Defina como o agente se comportará nas conversas de atendimento</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '99px',
            background: iaAtiva ? 'rgba(15, 168, 86, 0.1)' : 'rgba(136, 146, 176, 0.1)',
            color: iaAtiva ? '#0fa856' : 'var(--ws-text-3)',
            fontSize: '13px',
            fontWeight: 600,
            border: `1px solid ${iaAtiva ? '#0fa85633' : 'var(--ws-glass-border)'}`,
          }}>
            <div className={iaAtiva ? "pulse-dot" : ""} style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              background: iaAtiva ? '#0fa856' : 'var(--ws-text-3)' 
            }} />
            {iaAtiva ? 'IA Ativa' : 'IA Inativa'}
          </div>

          <div 
            onClick={() => setIaAtiva(!iaAtiva)}
            style={{
              width: '44px',
              height: '24px',
              borderRadius: '22px',
              background: iaAtiva ? 'var(--ws-blue)' : 'var(--ws-glass-border)',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background 0.3s ease',
              border: '1px solid var(--ws-glass-border)'
            }}
          >
            <div style={{
              position: 'absolute',
              top: '2px',
              left: iaAtiva ? '22px' : '2px',
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: 'white',
              transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }} />
          </div>
        </div>
      </header>

      {/* 2. Preview do Agente */}
      <section style={{ marginBottom: '32px' }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(62, 91, 255, 0.08) 0%, rgba(122, 90, 248, 0.08) 100%)',
          border: '1px solid var(--ws-glass-border)',
          borderRadius: 'var(--ws-radius-lg)',
          padding: '24px',
          backdropFilter: 'blur(16px)',
          boxShadow: 'var(--ws-glass-shadow)',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: '32px',
          alignItems: 'center'
        }}>
          <div style={{ flex: 1, display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--ws-blue) 0%, var(--ws-purple) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              boxShadow: '0 8px 16px rgba(62, 91, 255, 0.2)'
            }}>
              <Sparkles size={28} />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--ws-text-1)', margin: 0 }}>Agente Op7 Nexo</h3>
              <p style={{ fontSize: '13px', color: 'var(--ws-text-2)', margin: '4px 0 0' }}>
                Especialista em <span style={{ color: 'var(--ws-blue)' }}>{config.segmento}</span> · Tom: <span style={{ color: 'var(--ws-purple)' }}>{config.tomVoz}</span>
              </p>
            </div>
          </div>

          <div style={{ 
            width: isMobile ? '100%' : '380px',
            padding: '16px',
            background: 'var(--ws-glass-bg)',
            borderRadius: 'var(--ws-radius-md)',
            border: '1px solid var(--ws-glass-border)',
          }}>
            <div style={{ fontSize: '10px', color: 'var(--ws-text-3)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Exemplo de resposta</div>
            <div style={{ 
              background: 'var(--ws-blue)', 
              color: 'white', 
              padding: '10px 14px', 
              borderRadius: '12px 12px 12px 2px',
              fontSize: '13px',
              lineHeight: '1.5',
              maxWidth: '90%',
              position: 'relative'
            }}>
              Olá! Sou o assistente da {config.nomeNegocio || 'sua empresa'}. Como posso te ajudar hoje? 😊
            </div>
          </div>
        </div>
      </section>

      {/* 3. Formulário */}
      <section style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)',
        padding: '32px',
        boxShadow: 'var(--ws-glass-shadow)',
      }}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', 
          gap: '24px',
          marginBottom: '24px'
        }}>
          {/* Coluna Esquerda */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={labelStyle}>Nome do negócio</label>
              <input 
                style={inputStyle}
                value={config.nomeNegocio}
                onChange={e => setConfig(prev => ({ ...prev, nomeNegocio: e.target.value }))}
                placeholder="Ex: Clínica Odonto"
              />
            </div>
            <div>
              <label style={labelStyle}>Segmento</label>
              <input 
                style={inputStyle}
                value={config.segmento}
                onChange={e => setConfig(prev => ({ ...prev, segmento: e.target.value }))}
                placeholder="Ex: Odontologia"
              />
            </div>
            <div>
              <label style={labelStyle}>Tom de voz</label>
              <div style={{ position: 'relative' }}>
                <select 
                  value={config.tomVoz}
                  onChange={e => setConfig(prev => ({ ...prev, tomVoz: e.target.value }))}
                  style={{
                    ...inputStyle,
                    appearance: 'none',
                    paddingRight: '40px'
                  }}
                >
                  <option value="profissional e acolhedor">Profissional e acolhedor</option>
                  <option value="descontraído e próximo">Descontraído e próximo</option>
                  <option value="formal e técnico">Formal e técnico</option>
                  <option value="animado e entusiasmado">Animado e entusiasmado</option>
                </select>
                <ChevronDown size={18} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--ws-text-3)' }} />
              </div>
            </div>
          </div>

          {/* Coluna Direita */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={labelStyle}>
                <Clock size={14} /> Horários de atendimento
              </label>
              <textarea 
                style={{ ...inputStyle, resize: 'none', height: '88px' }}
                value={config.horarios}
                onChange={e => setConfig(prev => ({ ...prev, horarios: e.target.value }))}
                placeholder="Ex: Segunda a Sexta das 9h às 18h..."
              />
            </div>
            <div>
              <label style={labelStyle}>
                <Settings2 size={14} /> Serviços oferecidos
              </label>
              <textarea 
                style={{ ...inputStyle, resize: 'none', height: '88px' }}
                value={config.servicos}
                onChange={e => setConfig(prev => ({ ...prev, servicos: e.target.value }))}
                placeholder="Liste seus principais serviços aqui..."
              />
            </div>
          </div>
        </div>

        {/* Largura Total */}
        <div style={{ marginBottom: '32px' }}>
          <label style={labelStyle}>
            <Activity size={14} /> Instruções específicas
          </label>
          <textarea 
            style={{ ...inputStyle, resize: 'none', height: '140px', lineHeight: '1.6' }}
            value={config.instrucoes}
            onChange={e => setConfig(prev => ({ ...prev, instrucoes: e.target.value }))}
            placeholder="Ex: Sempre oferecer consulta gratuita. Não informar preços sem qualificar..."
          />
        </div>

        {/* 4. Rodapé do Formulário */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          borderTop: '1px solid var(--ws-glass-border)',
          paddingTop: '24px',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <button 
            onClick={restaurarPadrao}
            style={{
              background: 'none',
              border: '1px solid transparent',
              color: 'var(--ws-text-3)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: 'var(--ws-radius-md)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#FF3B3B'
              e.currentTarget.style.background = 'rgba(255, 59, 59, 0.05)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = 'var(--ws-text-3)'
              e.currentTarget.style.background = 'none'
            }}
          >
            <RefreshCcw size={16} />
            Restaurar padrão
          </button>

          <button 
            disabled={salvando}
            onClick={salvar}
            style={{
              background: 'linear-gradient(135deg, var(--ws-blue) 0%, var(--ws-purple) 100%)',
              border: 'none',
              color: 'white',
              fontSize: '15px',
              fontWeight: 600,
              cursor: salvando ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 28px',
              borderRadius: 'var(--ws-radius-md)',
              transition: 'all 0.2s',
              boxShadow: '0 8px 24px rgba(62, 91, 255, 0.25)',
              opacity: salvando ? 0.7 : 1
            }}
            onMouseEnter={e => { if(!salvando) e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { if(!salvando) e.currentTarget.style.transform = 'translateY(0)' }}
          >
            {salvando ? (
              <div style={{ width: '18px', height: '18px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            ) : (
              <Save size={18} />
            )}
            {salvando ? 'Salvando...' : 'Salvar configuração'}
          </button>
        </div>
      </section>

      {/* Toast de Confirmação */}
      <div style={{
        position: 'fixed',
        bottom: '32px',
        right: '32px',
        background: 'rgba(15, 168, 86, 0.9)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 'var(--ws-radius-md)',
        padding: '12px 24px',
        color: 'white',
        fontSize: '14px',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 12px 24px rgba(0,0,0,0.3)',
        transform: toastVisivel ? 'translateY(0) scale(1)' : 'translateY(100px) scale(0.9)',
        opacity: toastVisivel ? 1 : 0,
        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        zIndex: 2000
      }}>
        <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={14} color="#0fa856" />
        </div>
        Configuração salva com sucesso
      </div>

      {/* Global CSS for animations */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(15, 168, 86, 0.7); }
          70% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 10px rgba(15, 168, 86, 0); }
          100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(15, 168, 86, 0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .pulse-dot {
          animation: pulse 2s infinite;
        }
        select option {
          background: #0f172a;
          color: white;
          padding: 10px;
        }
      `}} />
    </div>
  )
}
