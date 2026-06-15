'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Calendar, User, Flag, MessageCircle, Plus, Trash2, Phone, FileText, ChevronDown } from 'lucide-react'
import type { CampoDef, KanbanCard, KanbanColuna, Prioridade, Responsavel, TipoCampo } from '@/types/kanban'

interface CardModalProps {
  cardId: string | null
  cardInicial: KanbanCard | null
  colunas: KanbanColuna[]
  campos: CampoDef[]
  responsaveis: Responsavel[]
  aberto: boolean
  modo?: 'lateral' | 'central'
  onFechar: () => void
  atualizarCard: (cardId: string, patch: Record<string, unknown>) => Promise<KanbanCard | null>
  moverCard: (cardId: string, faseId: string, ordem?: number) => void
  excluirCard: (cardId: string) => Promise<void> | void
  salvarValores: (cardId: string, valores: { campo_id: string; valor: unknown }[]) => Promise<void> | void
  criarCampo: (nome: string, tipo: TipoCampo, opcoes?: string[]) => Promise<string | null>
  comentar: (cardId: string, texto: string) => Promise<KanbanCard | null>
  obterCard: (cardId: string) => Promise<KanbanCard | null>
}

const PRIORIDADE_CONFIG: Record<Prioridade, { label: string; cor: string; bg: string; border: string }> = {
  baixa:   { label: 'Baixa',   cor: '#8892b0', bg: 'rgba(136,146,176,0.12)', border: 'rgba(136,146,176,0.25)' },
  media:   { label: 'Média',   cor: '#EF9F27', bg: 'rgba(239,159,39,0.12)',  border: 'rgba(239,159,39,0.25)' },
  alta:    { label: 'Alta',    cor: '#FF5C8D', bg: 'rgba(255,92,141,0.12)',  border: 'rgba(255,92,141,0.25)' },
  urgente: { label: 'Urgente', cor: '#FF3B3B', bg: 'rgba(255,59,59,0.12)',   border: 'rgba(255,59,59,0.25)' },
}

const TIPOS_CAMPO: { tipo: TipoCampo; label: string }[] = [
  { tipo: 'texto', label: 'Texto' },
  { tipo: 'numero', label: 'Número' },
  { tipo: 'data', label: 'Data' },
  { tipo: 'url', label: 'URL' },
  { tipo: 'checkbox', label: 'Sim/Não' },
]

function hashColor(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return `hsl(${Math.abs(hash) % 360}, 55%, 45%)`
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

export function CardModal({
  cardId, cardInicial, colunas, campos, responsaveis, aberto, modo = 'lateral', onFechar,
  atualizarCard, moverCard, excluirCard, salvarValores, criarCampo, comentar, obterCard,
}: CardModalProps) {
  const [local, setLocal] = useState<KanbanCard | null>(null)
  const [comentarioTexto, setComentarioTexto] = useState('')
  const [showPrioridade, setShowPrioridade] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const [showResponsavel, setShowResponsavel] = useState(false)
  const [showNovoCampo, setShowNovoCampo] = useState(false)
  const [novoCampoNome, setNovoCampoNome] = useState('')
  const [novoCampoTipo, setNovoCampoTipo] = useState<TipoCampo>('texto')
  const titleRef = useRef<HTMLTextAreaElement>(null)

  // Seed imediato + enriquece com detalhe (comentários) ao abrir.
  useEffect(() => {
    if (!aberto || !cardId) { setLocal(null); return }
    setLocal(cardInicial)
    obterCard(cardId).then(c => { if (c) setLocal(c) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, cardId])

  useEffect(() => {
    if (aberto && titleRef.current) titleRef.current.focus()
  }, [aberto])

  if (!aberto || !local || !cardId) return null

  async function patch(p: Record<string, unknown>) {
    if (!cardId) return
    const atualizado = await atualizarCard(cardId, p)
    if (atualizado) setLocal(atualizado)
  }

  function trocarStatus(faseId: string) {
    if (!cardId || !local) return
    moverCard(cardId, faseId)
    setLocal({ ...local, status: faseId })
    setShowStatus(false)
  }

  function trocarResponsavel(r: Responsavel | null) {
    setShowResponsavel(false)
    patch({ responsavel_user_id: r ? r.id : null })
  }

  async function adicionarComentario() {
    if (!comentarioTexto.trim() || !cardId) return
    const atualizado = await comentar(cardId, comentarioTexto.trim())
    if (atualizado) setLocal(atualizado)
    setComentarioTexto('')
  }

  async function adicionarCampo() {
    if (!novoCampoNome.trim() || !cardId) return
    await criarCampo(novoCampoNome.trim(), novoCampoTipo)
    setNovoCampoNome('')
    setNovoCampoTipo('texto')
    setShowNovoCampo(false)
    const c = await obterCard(cardId)
    if (c) setLocal(c)
  }

  async function salvarValorCampo(campoId: string, valor: unknown) {
    if (!cardId) return
    await salvarValores(cardId, [{ campo_id: campoId, valor }])
    const c = await obterCard(cardId)
    if (c) setLocal(c)
  }

  const coluna = colunas.find(c => c.id === local.status)
  const vencido = isVencido(local.dataVencimento)
  const temVinculo = !!local.conversaId

  const glassBase: React.CSSProperties = {
    background: 'var(--ws-glass-bg)',
    border: '1px solid var(--ws-glass-border)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  }

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 200,
    ...glassBase, borderRadius: 10, boxShadow: 'var(--ws-glass-shadow-lg)',
    minWidth: 180, maxHeight: 260, overflowY: 'auto',
  }

  const labelStyle: React.CSSProperties = { fontSize: 11, color: '#8892b0', width: 110, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }
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
        width: isCentral ? 680 : 520, maxWidth: '95vw',
        height: isCentral ? 'auto' : '100vh', maxHeight: isCentral ? '92vh' : '100vh',
        overflowY: 'auto',
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: isCentral ? 16 : '16px 0 0 16px',
        boxShadow: 'var(--ws-glass-shadow-lg)', position: 'relative',
        display: 'flex', flexDirection: 'column',
        animation: isCentral ? 'fadeIn 150ms ease' : 'slideIn 200ms ease',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)' }} />

        {/* Header */}
        <div style={{ padding: '20px 24px 0', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
            <textarea
              ref={titleRef}
              value={local.titulo}
              onChange={e => setLocal(l => l ? { ...l, titulo: e.target.value } : l)}
              onBlur={e => patch({ titulo: e.target.value })}
              style={{ flex: 1, fontSize: 20, fontWeight: 700, color: '#0E142A', background: 'transparent', border: 'none', outline: 'none', resize: 'none', lineHeight: 1.3, fontFamily: 'inherit', minHeight: 28 }}
              rows={2}
            />
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={async () => { if (confirm('Excluir este card?')) { await excluirCard(cardId); onFechar() } }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF5C8D', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}
                title="Excluir card"
              ><Trash2 size={14} /></button>
              <button onClick={onFechar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8892b0', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Badge de vínculo */}
          {temVinculo && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 12, fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 9999, background: 'rgba(15,168,86,0.10)', border: '1px solid rgba(15,168,86,0.25)', color: '#0fa856' }}>
              <MessageCircle size={10} /> Lead vinculado a uma conversa
            </div>
          )}

          {/* Propriedades */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 16, borderBottom: '1px solid var(--ws-divider)' }}>

            {/* Status (= fase) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={labelStyle}>Status</span>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowStatus(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', ...glassBase, borderRadius: 8, cursor: 'pointer', fontSize: 12, color: '#0E142A', boxShadow: 'var(--ws-glass-shadow-sm)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: coluna?.cor ?? '#8892b0', flexShrink: 0 }} />
                  {coluna?.nome ?? '—'}
                  <ChevronDown size={10} style={{ color: '#8892b0' }} />
                </button>
                {showStatus && (
                  <div style={dropdownStyle}>
                    {[...colunas].sort((a, b) => a.ordem - b.ordem).map(c => (
                      <button key={c.id} onClick={() => trocarStatus(c.id)}
                        style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#0E142A' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(62,91,255,0.06)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.cor }} />
                        {c.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Responsável (usuários reais do workspace) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={labelStyle}>Responsável</span>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowResponsavel(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', ...glassBase, borderRadius: 8, cursor: 'pointer', fontSize: 12, color: '#0E142A', boxShadow: 'var(--ws-glass-shadow-sm)' }}>
                  {local.responsavel ? (
                    <>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: hashColor(local.responsavel), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: 'white', fontWeight: 700 }}>
                        {local.responsavelInitials}
                      </div>
                      {local.responsavel}
                    </>
                  ) : (<><User size={12} style={{ color: '#8892b0' }} /> Sem responsável</>)}
                  <ChevronDown size={10} style={{ color: '#8892b0' }} />
                </button>
                {showResponsavel && (
                  <div style={dropdownStyle}>
                    <button onClick={() => trocarResponsavel(null)}
                      style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#8892b0' }}>
                      Sem responsável
                    </button>
                    {responsaveis.map(u => {
                      const ini = u.nome.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2)
                      return (
                        <button key={u.id} onClick={() => trocarResponsavel(u)}
                          style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#0E142A' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(62,91,255,0.06)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                          <div style={{ width: 18, height: 18, borderRadius: '50%', background: hashColor(u.nome), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: 'white', fontWeight: 700 }}>{ini}</div>
                          {u.nome}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Prioridade */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={labelStyle}>Prioridade</span>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowPrioridade(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                    background: local.prioridade ? PRIORIDADE_CONFIG[local.prioridade].bg : 'var(--ws-glass-bg)',
                    border: `1px solid ${local.prioridade ? PRIORIDADE_CONFIG[local.prioridade].border : 'var(--ws-glass-border)'}`,
                    backdropFilter: 'blur(10px)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 500,
                    color: local.prioridade ? PRIORIDADE_CONFIG[local.prioridade].cor : '#8892b0' }}>
                  <Flag size={11} />
                  {local.prioridade ? PRIORIDADE_CONFIG[local.prioridade].label : 'Sem prioridade'}
                  <ChevronDown size={10} />
                </button>
                {showPrioridade && (
                  <div style={dropdownStyle}>
                    {(Object.keys(PRIORIDADE_CONFIG) as Prioridade[]).map(pr => (
                      <button key={pr} onClick={() => { patch({ prioridade: pr }); setShowPrioridade(false) }}
                        style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: PRIORIDADE_CONFIG[pr].cor, fontWeight: 500 }}
                        onMouseEnter={e => e.currentTarget.style.background = PRIORIDADE_CONFIG[pr].bg}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <Flag size={11} /> {PRIORIDADE_CONFIG[pr].label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Vencimento */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={labelStyle}>Vencimento</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={12} style={{ color: vencido ? '#FF5C8D' : '#8892b0' }} />
                <input type="date" value={local.dataVencimento ?? ''}
                  onChange={e => patch({ data_vencimento: e.target.value || null })}
                  style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: vencido ? '#FF5C8D' : '#0E142A', fontFamily: 'inherit', cursor: 'pointer' }} />
                {vencido && <span style={{ fontSize: 10, color: '#FF5C8D', fontWeight: 600 }}>VENCIDO</span>}
              </div>
            </div>

            {/* Nome do lead */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={labelStyle}>Nome</span>
              <input type="text" value={local.nome ?? ''}
                onChange={e => setLocal(l => l ? { ...l, nome: e.target.value } : l)}
                onBlur={e => patch({ nome: e.target.value })}
                placeholder="Nome do lead..."
                style={{ flex: 1, fontSize: 12, color: '#0E142A', background: 'rgba(14,20,42,0.03)', border: '1px solid var(--ws-glass-border)', borderRadius: 6, padding: '4px 8px', outline: 'none', fontFamily: 'inherit' }} />
            </div>

            {/* Telefone */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={labelStyle}>Telefone</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                <Phone size={12} style={{ color: '#8892b0' }} />
                <input type="text" value={local.telefone ?? ''}
                  onChange={e => setLocal(l => l ? { ...l, telefone: e.target.value } : l)}
                  onBlur={e => patch({ telefone: e.target.value })}
                  placeholder="Telefone..."
                  style={{ flex: 1, fontSize: 12, color: '#0E142A', background: 'rgba(14,20,42,0.03)', border: '1px solid var(--ws-glass-border)', borderRadius: 6, padding: '4px 8px', outline: 'none', fontFamily: 'inherit' }} />
              </div>
            </div>

            {/* Resumo da conversa (leitura) */}
            {local.resumoConversa && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={labelStyle}>Resumo IA</span>
                <div style={{ flex: 1, fontSize: 12, color: '#4a5580', lineHeight: 1.5, background: 'rgba(62,91,255,0.04)', border: '1px solid rgba(62,91,255,0.12)', borderRadius: 6, padding: '6px 10px' }}>
                  <FileText size={11} style={{ color: '#3E5BFF', marginRight: 4, verticalAlign: 'middle' }} />
                  {local.resumoConversa}
                </div>
              </div>
            )}

            {/* Campos custom (definidos no nível do painel) */}
            {campos.map(def => {
              const valor = local!.camposCustom?.find(c => c.id === def.id)?.valor
              return (
                <div key={def.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...labelStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def.nome}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                    {def.tipo === 'checkbox' ? (
                      <input type="checkbox" checked={!!valor} onChange={e => salvarValorCampo(def.id, e.target.checked)} style={{ accentColor: '#3E5BFF' }} />
                    ) : (
                      <input
                        type={def.tipo === 'numero' ? 'number' : def.tipo === 'data' ? 'date' : 'text'}
                        defaultValue={valor != null ? String(valor) : ''}
                        onBlur={e => salvarValorCampo(def.id, def.tipo === 'numero' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
                        placeholder="Valor..."
                        style={{ flex: 1, fontSize: 12, color: '#0E142A', background: 'rgba(14,20,42,0.03)', border: '1px solid var(--ws-glass-border)', borderRadius: 6, padding: '4px 8px', outline: 'none', fontFamily: 'inherit' }} />
                    )}
                  </div>
                </div>
              )
            })}

            {/* Adicionar campo (board-level) */}
            {showNovoCampo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={labelStyle} />
                <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                  <input autoFocus type="text" value={novoCampoNome}
                    onChange={e => setNovoCampoNome(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') adicionarCampo(); if (e.key === 'Escape') setShowNovoCampo(false) }}
                    placeholder="Nome do campo..."
                    style={{ flex: 1, minWidth: 120, fontSize: 12, color: '#0E142A', background: 'rgba(14,20,42,0.03)', border: '1px solid rgba(62,91,255,0.40)', borderRadius: 6, padding: '4px 8px', outline: 'none', fontFamily: 'inherit' }} />
                  <select value={novoCampoTipo} onChange={e => setNovoCampoTipo(e.target.value as TipoCampo)}
                    style={{ fontSize: 12, color: '#0E142A', background: 'rgba(14,20,42,0.03)', border: '1px solid var(--ws-glass-border)', borderRadius: 6, padding: '4px 6px', outline: 'none', fontFamily: 'inherit' }}>
                    {TIPOS_CAMPO.map(t => <option key={t.tipo} value={t.tipo}>{t.label}</option>)}
                  </select>
                  <button onClick={adicionarCampo} style={{ padding: '4px 10px', background: 'rgba(62,91,255,0.12)', border: '1px solid rgba(62,91,255,0.25)', borderRadius: 6, fontSize: 11, color: '#3E5BFF', cursor: 'pointer', fontWeight: 600 }}>OK</button>
                  <button onClick={() => setShowNovoCampo(false)} style={{ padding: '4px 8px', background: 'none', border: 'none', cursor: 'pointer', color: '#8892b0', fontSize: 11 }}>✕</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowNovoCampo(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#8892b0', alignSelf: 'flex-start', marginLeft: 118 }}>
                <Plus size={12} /> Adicionar campo
              </button>
            )}
          </div>
        </div>

        {/* Descrição */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--ws-divider)' }}>
          <div style={{ fontSize: 11, color: '#8892b0', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8 }}>Descrição</div>
          <textarea value={local.descricao ?? ''}
            onChange={e => setLocal(l => l ? { ...l, descricao: e.target.value } : l)}
            onBlur={e => patch({ descricao: e.target.value })}
            placeholder="Adicionar descrição..." rows={4}
            style={{ width: '100%', fontSize: 13, color: '#0E142A', lineHeight: 1.6, background: 'rgba(14,20,42,0.02)', border: '1px solid transparent', borderRadius: 8, padding: '10px 12px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color 150ms' }}
            onFocus={e => e.target.style.borderColor = 'rgba(62,91,255,0.30)'} />
        </div>

        {/* Comentários */}
        <div style={{ padding: '16px 24px', flex: 1 }}>
          <div style={{ fontSize: 11, color: '#8892b0', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <MessageCircle size={12} /> Comentários {(local.comentarios ?? []).length > 0 && `(${local.comentarios!.length})`}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            {(local.comentarios ?? []).map(c => (
              <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: hashColor(c.autor), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'white', fontWeight: 700, flexShrink: 0 }}>
                  {c.avatarInitials}
                </div>
                <div style={{ flex: 1, background: 'rgba(14,20,42,0.03)', border: '1px solid var(--ws-glass-border)', borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#0E142A', marginBottom: 3 }}>{c.autor} <span style={{ fontWeight: 400, color: '#8892b0' }}>· {formatarData(c.criadoEm)}</span></div>
                  <div style={{ fontSize: 12, color: '#4a5580', lineHeight: 1.5 }}>{c.texto}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: hashColor('Você'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'white', fontWeight: 700, flexShrink: 0 }}>VC</div>
            <div style={{ flex: 1 }}>
              <textarea value={comentarioTexto}
                onChange={e => setComentarioTexto(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) adicionarComentario() }}
                placeholder="Adicionar comentário... (Ctrl+Enter para enviar)" rows={2}
                style={{ width: '100%', fontSize: 12, color: '#0E142A', background: 'rgba(14,20,42,0.02)', border: '1px solid var(--ws-glass-border)', borderRadius: 8, padding: '8px 10px', outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = 'rgba(62,91,255,0.30)'}
                onBlur={e => e.target.style.borderColor = 'var(--ws-glass-border)'} />
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
