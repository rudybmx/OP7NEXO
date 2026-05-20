'use client'
import { useCallback, useRef } from 'react'
import { FiltrosCampanhas } from '@/types/meta-ads-campanhas'
import { OPCOES_VEICULACAO } from '@/lib/veiculacao'
import { OBJETIVOS_FILTRO } from '@/lib/objetivos-meta'
import { OPCOES_PLATAFORMAS_FILTRO, PlataformaCampanha, configPlataformaCampanha } from '@/lib/plataformas-meta'
import { Search } from 'lucide-react'

function IconFacebook({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#1877F2">
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
    </svg>
  )
}

function IconInstagram({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <defs>
        <radialGradient id="ig-btn-grad" cx="30%" cy="107%" r="150%">
          <stop offset="0%" stopColor="#ffd600"/>
          <stop offset="25%" stopColor="#ff7a00"/>
          <stop offset="50%" stopColor="#ff0069"/>
          <stop offset="75%" stopColor="#d300c5"/>
          <stop offset="100%" stopColor="#7638fa"/>
        </radialGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#ig-btn-grad)"/>
      <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.8" fill="none"/>
      <circle cx="17.5" cy="6.5" r="1.2" fill="white"/>
    </svg>
  )
}

function IconWhatsApp({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366">
      <path d="M12.004 0C5.374 0 0 5.373 0 12.004c0 2.117.554 4.1 1.522 5.828L0 24l6.335-1.495A11.94 11.94 0 0012.004 24C18.63 24 24 18.627 24 12.004 24 5.373 18.63 0 12.004 0zm6.27 16.87c-.262.738-1.536 1.41-2.106 1.458-.57.05-1.107.254-3.73-.777-3.157-1.243-5.16-4.464-5.316-4.67-.156-.204-1.27-1.69-1.27-3.225s.8-2.29 1.085-2.604c.285-.313.62-.39.826-.39.206 0 .412.002.593.01.19.01.445-.072.697.532.262.628.888 2.17.966 2.328.078.156.13.34.026.547-.104.208-.156.336-.312.52-.156.183-.327.408-.468.548-.155.155-.317.323-.136.634.18.31.8 1.32 1.716 2.138 1.178 1.05 2.172 1.376 2.484 1.53.312.156.494.13.676-.078.183-.208.78-.91.988-1.222.208-.312.416-.26.702-.156.286.104 1.82.86 2.132 1.015.313.156.52.234.598.364.078.13.078.754-.184 1.492z"/>
    </svg>
  )
}

interface Props {
  filtros: FiltrosCampanhas
  onChange: (f: FiltrosCampanhas) => void
}

export function FiltrosCampanhasComp({ filtros, onChange }: Props) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleBusca = useCallback((valor: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onChange({ ...filtros, busca: valor })
    }, 300)
  }, [filtros, onChange])

  const togglePlataforma = (p: PlataformaCampanha) => {
    const atual = filtros.plataformas
    const nova = atual.includes(p) ? atual.filter(x => x !== p) : [...atual, p]
    onChange({ ...filtros, plataformas: nova })
  }

  const glassStyle = {
    background: 'var(--ws-glass-bg, rgba(255,255,255,0.72))',
    border: '1px solid var(--ws-glass-border, rgba(255,255,255,0.40))',
    borderRadius: '8px',
    backdropFilter: 'blur(10px)',
    boxShadow: '0 2px 8px rgba(14,20,42,0.08)',
    height: '30px',
    fontSize: '12px',
    color: 'var(--ws-text-1, #0E142A)',
    outline: 'none',
    transition: 'all 150ms ease',
  }

  return (
    <div className="flex items-center flex-wrap gap-2 mb-3">
      {/* Search */}
      <div className="relative" style={{ width: 220 }}>
        <Search
          size={13}
          style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            color: '#8892b0',
            zIndex: 1,
          }}
        />
        <input
          type="text"
          placeholder="Buscar campanha..."
          defaultValue={filtros.busca}
          onChange={e => handleBusca(e.target.value)}
          className="focus:border-[rgba(62,91,255,0.35)] focus:shadow-[0_0_0_3px_rgba(62,91,255,0.10)]"
          style={{
            ...glassStyle,
            width: '100%',
            padding: '0 10px 0 32px',
          }}
        />
      </div>

      {/* Objective */}
      <select
        value={filtros.objetivo}
        onChange={e => onChange({ ...filtros, objetivo: e.target.value })}
        className="hover:bg-[rgba(255,255,255,0.90)] hover:border-[rgba(62,91,255,0.25)] dark:hover:bg-[rgba(255,255,255,0.12)]"
        style={{
          ...glassStyle,
          padding: '0 8px',
          cursor: 'pointer',
        }}
      >
        <option value="todos">Todos os objetivos</option>
        {OBJETIVOS_FILTRO.map(grupo => (
          <optgroup key={grupo.grupo} label={grupo.grupo}>
            {grupo.opcoes.map(opcao => (
              <option key={opcao.codigo} value={opcao.codigo}>
                {opcao.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Resultado */}
      <select
        value={filtros.resultado}
        onChange={e => onChange({ ...filtros, resultado: e.target.value as 'performance' | 'todos' })}
        className="hover:bg-[rgba(255,255,255,0.90)] hover:border-[rgba(62,91,255,0.25)] dark:hover:bg-[rgba(255,255,255,0.12)]"
        style={{
          ...glassStyle,
          padding: '0 8px',
          cursor: 'pointer',
        }}
      >
        <option value="performance">Com resultado</option>
        <option value="todos">Todos os itens</option>
      </select>

      {/* Veiculação */}
      <select
        value={filtros.veiculacao}
        onChange={e => onChange({ ...filtros, veiculacao: e.target.value })}
        className="hover:bg-[rgba(255,255,255,0.90)] hover:border-[rgba(62,91,255,0.25)] dark:hover:bg-[rgba(255,255,255,0.12)]"
        style={{
          ...glassStyle,
          padding: '0 8px',
          cursor: 'pointer',
        }}
      >
        <option value="todos">Toda veiculação</option>
        {OPCOES_VEICULACAO.map(grupo => (
          <optgroup key={grupo.grupo} label={grupo.grupo}>
            {grupo.opcoes.map(opcao => (
              <option key={opcao.codigo} value={opcao.codigo}>
                {opcao.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {/* Platform toggles */}
      <div className="flex items-center gap-2">
        {OPCOES_PLATAFORMAS_FILTRO.map(p => {
          const ativo = filtros.plataformas.includes(p.codigo)
          const cfg = configPlataformaCampanha(p.codigo)

          return (
            <button
              key={p.codigo}
              onClick={() => togglePlataforma(p.codigo)}
              title={p.descricao}
              style={{
                height: '30px',
                padding: '0 12px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 150ms ease',
                border: `1px solid ${cfg.border}`,
                background: cfg.bg,
                color: cfg.cor,
                boxShadow: ativo ? 'var(--ws-glass-shadow-sm)' : 'none',
                opacity: ativo ? 1 : 0.78,
                cursor: 'pointer',
              }}
            >
              {p.codigo === 'facebook' && <IconFacebook size={16} />}
              {p.codigo === 'instagram' && <IconInstagram size={16} />}
              {p.codigo === 'whatsapp' && <IconWhatsApp size={16} />}
              <span>{cfg.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
