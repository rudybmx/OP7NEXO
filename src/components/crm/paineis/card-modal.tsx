'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Calendar, User, Flag, MessageCircle, Plus, Trash2, ExternalLink, ChevronDown } from 'lucide-react'
import type { KanbanCard, KanbanColuna, Prioridade, CampoCustom, Comentario } from '@/types/kanban'

interface CardModalProps {
  card: KanbanCard | null
  colunas: KanbanColuna[]
  aberto: boolean
  modo?: 'lateral' | 'central'
  onFechar: () => void
  onAtualizar: (card: KanbanCard) => void
  onExcluir: (cardId: string) => void
}

const PRIORIDADE_CONFIG: Record<Prioridade, { label: string; cor: string; bg: string; border: string }> = {
  baixa:   { label: 'Baixa',   cor: '#8892b0', bg: 'rgba(136,146,176,0.12)', border: 'rgba(136,146,176,0.25)' },
  media:   { label: 'Média',   cor: '#EF9F27', bg: 'rgba(239,159,39,0.12)',  border: 'rgba(239,159,39,0.25)' },
  alta:    { label: 'Alta',    cor: '#FF5C8D', bg: 'rgba(255,92,141,0.12)',  border: 'rgba(255,92,141,0.25)' },
  urgente: { label: 'Urgente', cor: '#FF3B3B', bg: 'rgba(255,59,59,0.12)',   border: 'rgba(255,59,59,0.25)' },
}

const USUARIOS_MOCK = ['Ana Lima', 'Carlos Melo', 'Beatriz Costa', 'Rudy Bermúdez', 'Marcelo Santos']

function hashColor(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 45%)`
}

function formatarData(iso: string) {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isVencido(iso?: string) {
  if (!iso) return false
  return new Date(iso + 'T23:59:59') < new Date()
}

export function CardModal({ card, colunas, aberto, modo = 'lateral', onFechar, onAtualizar, onExcluir }: CardModalProps) {
  const [local, setLocal] = useState<KanbanCard | null>(null)
  const [comentarioTexto, setComentarioTexto] = useState('')
  const [showPrioridade, setShowPrioridade] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const [showResponsavel, setShowResponsavel] = useState(false)
  const [showNovoCampo, setShowNovoCampo] = useState(false)
  const [novoCampoNome, setNovoCampoNome] = useState('')
  const titleRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (card) setLocal({ ...card, comentarios: card.comentarios ?? [], camposCustom: card.camposCustom ?? [] })
  }, [card])

  useEffect(() => {
    if (aberto && titleRef.current) titleRef.current.focus()
  }, [aberto])

  if (!aberto || !local) return null

  function salvar(patch: Partial<KanbanCard>) {
    if (!local) return
    const atualizado = { ...local, ...patch, atualizadoEm: new Date().toISOString().slice(0, 10) }
    setLocal(atualizado)
    onAtualizar(atualizado)
  }

  function adicionarComentario() {
    if (!comentarioTexto.trim() || !local) return
    const novo: Comentario = {
      id: `cm-${Date.now()}`, autor: 'Você', avatarInitials: 'VC',
      texto: comentarioTexto.trim(), criadoEm: new Date().toISOString().slice(0, 10),
    }
    salvar({ comentarios: [...(local.comentarios ?? []), novo] })
    setComentarioTexto('')
  }

  function adicionarCampo() {
    if (!novoCampoNome.trim() || !local) return
    const novo: CampoCustom = { id: `cf-${Date.now()}`, nome: novoCampoNome.trim(), tipo: 'texto', valor: '' }
    salvar({ camposCustom: [...(local.camposCustom ?? []), novo] })
    setNovoCampoNome('')
    setShowNovoCampo(false)
  }

  function removerCampo(id: string) {
    if (!local) return
    salvar({ camposCustom: (local.camposCustom ?? []).filter(c => c.id !== id) })
  }

  const coluna = colunas.find(c => c.id === local.status)
  const vencido = isVencido(local.dataVencimento)

  const glassBase: React.CSSProperties = {
    background: 'var(--ws-glass-bg)',
    border: '1px solid var(--ws-glass-border)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  }

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 200,
    ...glassBase,
    borderRadius: 10,
    boxShadow: 'var(--ws-glass-shadow-lg)',
    minWidth: 160,
    overflow: 'hidden',
  }

  const isCentral = modo === 'central'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: isCentral ? 'rgba(14,20,42,0.55)' : 'transparent',
        backdropFilter: isCentral ? 'blur(4px)' : 'none',
        display: 'flex',
        alignItems: isCentral ? 'center' : 'stretch',
        justifyContent: isCentral ? 'center' : 'flex-end',
      }}
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}
    >
      <div style={{
        width: isCentral ? 680 : 520,
        maxWidth: '95vw',
        height: isCentral ? 'auto' : '100vh',
        maxHeight: isCentral ? '92vh' : '100vh',
        overflowY: 'auto',
        background: 'var(--ws-surface)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: isCentral ? 16 : '16px 0 0 16px',
        boxShadow: 'var(--ws-glass-shadow-lg)',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        animation: isCentral ? 'fadeIn 150ms ease' : 'slideIn 200ms ease',
      }}>
        {/* Shine line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, var(--ws-glass-border), transparent)' }} />

        {/* Header */}
        <div style={{ padding: '20px 24px 0', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
            <textarea
              ref={titleRef}
              value={local.titulo}
              onChange={e => setLocal(l => l ? { ...l, titulo: e.target.value } : l)}
              onBlur={e => salvar({ titulo: e.target.value })}
              style={{
                flex: 1, fontSize: 20, fontWeight: 700, color: 'var(--ws-text-1)',
                background: 'transparent', border: 'none', outline: 'none',
                resize: 'none', lineHeight: 1.3, fontFamily: 'inherit',
                minHeight: 28,
              }}
              rows={2}
            />
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => { if (confirm('Excluir este card?')) { onExcluir(local.id); onFechar() } }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF5C8D', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}
                title="Excluir card"
              ><Trash2 size={14} /></button>
              <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-2)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Propriedades */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 16, borderBottom: '1px solid var(--ws-divider)' }}>

            {/* Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--ws-text-2)', width: 110, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Status</span>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowStatus(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                    ...glassBase, borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--ws-text-1)',
                    boxShadow: 'var(--ws-glass-shadow-sm)',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: coluna?.cor ?? '#8892b0', flexShrink: 0 }} />
                  {coluna?.nome ?? local.status}
                  <ChevronDown size={10} style={{ color: 'var(--ws-text-2)' }} />
                </button>
                {showStatus && (
                  <div style={dropdownStyle}>
                    {colunas.map(c => (
                      <button key={c.id} onClick={() => { salvar({ status: c.id }); setShowStatus(false) }}
                        style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ws-text-1)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(62,91,255,0.06)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.cor }} />
                        {c.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Responsável */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--ws-text-2)', width: 110, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Responsável</span>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowResponsavel(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                    ...glassBase, borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--ws-text-1)',
                    boxShadow: 'var(--ws-glass-shadow-sm)',
                  }}
                >
                  {local.responsavel ? (
                    <>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: hashColor(local.responsavel), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: 'white', fontWeight: 700 }}>
                        {local.responsavelInitials}
                      </div>
                      {local.responsavel}
                    </>
                  ) : (
                    <><User size={12} style={{ color: 'var(--ws-text-2)' }} /> Sem responsável</>
                  )}
                  <ChevronDown size={10} style={{ color: 'var(--ws-text-2)' }} />
                </button>
                {showResponsavel && (
                  <div style={dropdownStyle}>
                    <button onClick={() => { salvar({ responsavel: undefined, responsavelInitials: undefined }); setShowResponsavel(false) }}
                      style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-2)' }}>
                      Sem responsável
                    </button>
                    {USUARIOS_MOCK.map(u => {
                      const initials = u.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
                      return (
                        <button key={u} onClick={() => { salvar({ responsavel: u, responsavelInitials: initials }); setShowResponsavel(false) }}
                          style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ws-text-1)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(62,91,255,0.06)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                        >
                          <div style={{ width: 18, height: 18, borderRadius: '50%', background: hashColor(u), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: 'white', fontWeight: 700 }}>{initials}</div>
                          {u}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Prioridade */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--ws-text-2)', width: 110, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Prioridade</span>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowPrioridade(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                    background: local.prioridade ? PRIORIDADE_CONFIG[local.prioridade].bg : 'var(--ws-glass-bg)',
                    border: `1px solid ${local.prioridade ? PRIORIDADE_CONFIG[local.prioridade].border : 'var(--ws-glass-border)'}`,
                    backdropFilter: 'blur(10px)', borderRadius: 8, cursor: 'pointer',
                    fontSize: 12, fontWeight: 500,
                    color: local.prioridade ? PRIORIDADE_CONFIG[local.prioridade].cor : '#8892b0',
                  }}
                >
                  <Flag size={11} />
                  {local.prioridade ? PRIORIDADE_CONFIG[local.prioridade].label : 'Sem prioridade'}
                  <ChevronDown size={10} />
                </button>
                {showPrioridade && (
                  <div style={dropdownStyle}>
                    {(Object.keys(PRIORIDADE_CONFIG) as Prioridade[]).map(p => (
                      <button key={p} onClick={() => { salvar({ prioridade: p }); setShowPrioridade(false) }}
                        style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: PRIORIDADE_CONFIG[p].cor, fontWeight: 500 }}
                        onMouseEnter={e => e.currentTarget.style.background = PRIORIDADE_CONFIG[p].bg}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        <Flag size={11} /> {PRIORIDADE_CONFIG[p].label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Data de vencimento */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--ws-text-2)', width: 110, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Vencimento</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={12} style={{ color: vencido ? '#FF5C8D' : 'var(--ws-text-2)' }} />
                <input
                  type="date"
                  value={local.dataVencimento ?? ''}
                  onChange={e => salvar({ dataVencimento: e.target.value || undefined })}
                  style={{
                    background: 'transparent', border: 'none', outline: 'none',
                    fontSize: 12, color: vencido ? '#FF5C8D' : 'var(--ws-text-1)',
                    fontFamily: 'inherit', cursor: 'pointer',
                  }}
                />
                {vencido && <span style={{ fontSize: 10, color: '#FF5C8D', fontWeight: 600 }}>VENCIDO</span>}
              </div>
            </div>

            {/* Campos custom */}
            {(local.camposCustom ?? []).map(campo => (
              <div key={campo.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--ws-text-2)', width: 110, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campo.nome}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                  <input
                    type="text"
                    value={String(campo.valor ?? '')}
                    onChange={e => {
                      const novos = (local.camposCustom ?? []).map(c => c.id === campo.id ? { ...c, valor: e.target.value } : c)
                      salvar({ camposCustom: novos })
                    }}
                    placeholder="Valor..."
                    style={{
                      flex: 1, fontSize: 12, color: 'var(--ws-text-1)', background: 'var(--ws-surface-2)',
                      border: '1px solid var(--ws-glass-border)', borderRadius: 6, padding: '4px 8px',
                      outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                  <button onClick={() => removerCampo(campo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF5C8D', padding: 2, display: 'flex' }}>
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}

            {/* Adicionar campo */}
            {showNovoCampo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--ws-text-2)', width: 110, flexShrink: 0 }} />
                <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                  <input
                    autoFocus type="text" value={novoCampoNome}
                    onChange={e => setNovoCampoNome(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') adicionarCampo(); if (e.key === 'Escape') setShowNovoCampo(false) }}
                    placeholder="Nome do campo..."
                    style={{ flex: 1, fontSize: 12, color: 'var(--ws-text-1)', background: 'var(--ws-surface-2)', border: '1px solid rgba(62,91,255,0.40)', borderRadius: 6, padding: '4px 8px', outline: 'none', fontFamily: 'inherit' }}
                  />
                  <button onClick={adicionarCampo} style={{ padding: '4px 10px', background: 'rgba(62,91,255,0.12)', border: '1px solid rgba(62,91,255,0.25)', borderRadius: 6, fontSize: 11, color: '#3E5BFF', cursor: 'pointer', fontWeight: 600 }}>OK</button>
                  <button onClick={() => setShowNovoCampo(false)} style={{ padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-2)', fontSize: 11 }}>✕</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNovoCampo(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--ws-text-2)', alignSelf: 'flex-start', marginLeft: 118 }}
              >
                <Plus size={12} /> Adicionar campo
              </button>
            )}
          </div>
        </div>

        {/* Corpo / Descrição */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--ws-divider)' }}>
          <div style={{ fontSize: 11, color: 'var(--ws-text-2)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8 }}>Descrição</div>
          <textarea
            value={local.descricao ?? ''}
            onChange={e => setLocal(l => l ? { ...l, descricao: e.target.value } : l)}
            onBlur={e => salvar({ descricao: e.target.value })}
            placeholder="Adicionar descrição..."
            rows={4}
            style={{
              width: '100%', fontSize: 13, color: 'var(--ws-text-1)', lineHeight: 1.6,
              background: 'var(--ws-surface-2)', border: '1px solid transparent',
              borderRadius: 8, padding: '10px 12px', outline: 'none', resize: 'vertical',
              fontFamily: 'inherit', boxSizing: 'border-box',
              transition: 'border-color 150ms',
            }}
            onFocus={e => e.target.style.borderColor = 'rgba(62,91,255,0.30)'}
          />
        </div>

        {/* Comentários */}
        <div style={{ padding: '16px 24px', flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--ws-text-2)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <MessageCircle size={12} /> Comentários {(local.comentarios ?? []).length > 0 && `(${local.comentarios!.length})`}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {(local.comentarios ?? []).map(c => (
              <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: hashColor(c.autor), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'white', fontWeight: 700, flexShrink: 0 }}>
                  {c.avatarInitials}
                </div>
                <div style={{ flex: 1, background: 'var(--ws-surface-2)', border: '1px solid var(--ws-glass-border)', borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ws-text-1)', marginBottom: 3 }}>{c.autor} <span style={{ fontWeight: 400, color: 'var(--ws-text-2)' }}>· {formatarData(c.criadoEm)}</span></div>
                  <div style={{ fontSize: 12, color: 'var(--ws-text-2)', lineHeight: 1.5 }}>{c.texto}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: hashColor('Você'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'white', fontWeight: 700, flexShrink: 0 }}>VC</div>
            <div style={{ flex: 1 }}>
              <textarea
                value={comentarioTexto}
                onChange={e => setComentarioTexto(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) adicionarComentario() }}
                placeholder="Adicionar comentário... (Ctrl+Enter para enviar)"
                rows={2}
                style={{
                  width: '100%', fontSize: 12, color: 'var(--ws-text-1)', background: 'var(--ws-surface-2)',
                  border: '1px solid var(--ws-glass-border)', borderRadius: 8, padding: '8px 10px',
                  outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(62,91,255,0.30)'}
                onBlur={e => e.target.style.borderColor = 'var(--ws-glass-border)'}
              />
              {comentarioTexto.trim() && (
                <button onClick={adicionarComentario}
                  style={{ marginTop: 6, padding: '5px 14px', background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)', border: 'none', borderRadius: 6, fontSize: 11, color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                  Comentar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  )
}
