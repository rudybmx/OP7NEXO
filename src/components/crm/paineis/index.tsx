'use client'

import { useState } from 'react'
import { LayoutGrid, List, Search, Plus, Columns3, Maximize2, Lock, Unlock, ChevronDown, Check, Zap } from 'lucide-react'
import type { KanbanCard } from '@/types/kanban'
import { useWorkspace } from '@/lib/workspace-context'
import { usePaineis } from '@/hooks/use-paineis'
import { KanbanBoardComp } from './kanban-board'
import { ListaView } from './lista-view'
import { CardModal } from './card-modal'

type Visualizacao = 'kanban' | 'lista'
type ModoModal = 'lateral' | 'central'

export function PaineisCRM() {
  const { workspaceAtual } = useWorkspace()
  const p = usePaineis(workspaceAtual)

  const [visualizacao, setVisualizacao] = useState<Visualizacao>('kanban')
  const [cardSelecionadoId, setCardSelecionadoId] = useState<string | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  const [modoModal, setModoModal] = useState<ModoModal>('lateral')
  const [busca, setBusca] = useState('')
  const [seletorBoardAberto, setSeletorBoardAberto] = useState(false)

  const board = p.board
  const estruturaEditavel = !!board && !board.bloqueado

  function abrirCard(card: KanbanCard) {
    setCardSelecionadoId(card.id)
    setModalAberto(true)
  }

  async function novoCard() {
    if (!board) return
    const coluna = [...board.colunas].sort((a, b) => a.ordem - b.ordem)[0]
    if (!coluna) return
    const criado = await p.criarCard(coluna.id, 'Novo card')
    if (criado) { setCardSelecionadoId(criado.id); setModalAberto(true) }
  }

  async function novoBoard() {
    const nome = prompt('Nome do novo painel:')
    if (!nome?.trim()) return
    await p.criarPainel(nome.trim())
    setSeletorBoardAberto(false)
  }

  const boardFiltrado = board && busca
    ? {
        ...board,
        cards: board.cards.filter(c => {
          const q = busca.toLowerCase()
          return (
            c.titulo.toLowerCase().includes(q) ||
            (c.nome ?? '').toLowerCase().includes(q) ||
            (c.telefone ?? '').toLowerCase().includes(q)
          )
        }),
      }
    : board

  const boardResumoAtivo = p.boards.find(b => b.id === p.boardId)

  return (
    <div style={{ padding: '24px 32px', fontFamily: 'var(--font-plus-jakarta-sans)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>

        {/* Seletor de painel */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setSeletorBoardAberto(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ws-text-1)', letterSpacing: '-0.02em', margin: 0 }}>
              {board?.nome ?? 'Painéis'}
            </h1>
            <ChevronDown size={16} style={{ color: 'var(--ws-text-3)', marginTop: 2, transition: 'transform 150ms', transform: seletorBoardAberto ? 'rotate(180deg)' : 'none' }} />
          </button>
          <p style={{ fontSize: 13, color: 'var(--ws-text-3)', margin: '4px 0 0' }}>
            {board ? `${board.cards.length} cards · ${board.colunas.length} fases` : 'Carregando…'}
          </p>

          {seletorBoardAberto && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 8, zIndex: 200,
              background: 'rgba(255,255,255,0.95)', border: '1px solid var(--ws-glass-border)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              borderRadius: 12, boxShadow: 'var(--ws-glass-shadow-lg)',
              minWidth: 260, overflow: 'hidden', padding: '6px 0',
            }}>
              {p.boards.map(b => (
                <button
                  key={b.id}
                  onClick={() => { p.setBoardId(b.id); setSeletorBoardAberto(false) }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '9px 14px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 13, color: b.id === p.boardId ? '#3E5BFF' : '#0E142A',
                    fontWeight: b.id === p.boardId ? 500 : 400,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(62,91,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  {b.id === p.boardId ? <Check size={12} style={{ color: '#3E5BFF', flexShrink: 0 }} /> : <div style={{ width: 12 }} />}
                  {b.nome}
                  {b.sistema && <Zap size={11} style={{ color: '#EF9F27', flexShrink: 0 }} />}
                </button>
              ))}
              <div style={{ height: 1, background: 'var(--ws-divider)', margin: '4px 0' }} />
              <button
                onClick={novoBoard}
                style={{ width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#3E5BFF' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(62,91,255,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <Plus size={13} /> Novo painel
              </button>
            </div>
          )}
        </div>

        {/* Controles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Automação (só painéis de sistema) */}
          {boardResumoAtivo?.sistema && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ws-text-2)', cursor: 'pointer', padding: '0 6px' }}>
              <input
                type="checkbox"
                checked={!!board?.automacaoAtiva}
                onChange={e => board && p.toggleAutomacao(board.id, e.target.checked)}
                style={{ accentColor: '#3E5BFF', cursor: 'pointer' }}
              />
              <Zap size={12} style={{ color: board?.automacaoAtiva ? '#EF9F27' : 'var(--ws-text-3)' }} />
              Automação
            </label>
          )}

          {/* Busca */}
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ws-text-3)', pointerEvents: 'none' }} />
            <input
              type="text" placeholder="Buscar cards..." value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{ height: 32, paddingLeft: 30, paddingRight: 12, background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)', backdropFilter: 'blur(10px)', borderRadius: 'var(--ws-radius-md)', fontSize: 12, color: 'var(--ws-text-1)', outline: 'none', width: 180, boxShadow: 'var(--ws-glass-shadow-sm)', fontFamily: 'inherit' }}
              onFocus={e => { e.target.style.borderColor = 'rgba(62,91,255,0.50)'; e.target.style.boxShadow = '0 0 0 3px rgba(62,91,255,0.12)' }}
              onBlur={e => { e.target.style.borderColor = 'var(--ws-glass-border)'; e.target.style.boxShadow = 'var(--ws-glass-shadow-sm)' }}
            />
          </div>

          {/* Toggle group */}
          <div style={{ display: 'inline-flex', background: 'rgba(14,20,42,0.05)', border: '1px solid rgba(14,20,42,0.08)', borderRadius: 10, padding: 3, gap: 2, alignItems: 'center' }}>
            {([['lateral', Columns3, 'Abrir lateral'], ['central', Maximize2, 'Abrir central']] as const).map(([modo, Icon, title]) => (
              <button key={modo} onClick={() => setModoModal(modo)} title={title}
                style={{ padding: '4px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', background: modoModal === modo ? 'rgba(255,255,255,0.85)' : 'transparent', color: modoModal === modo ? '#3E5BFF' : 'var(--ws-text-3)', transition: 'all 150ms', display: 'flex', alignItems: 'center', boxShadow: modoModal === modo ? '0 2px 8px rgba(14,20,42,0.10)' : 'none' }}>
                <Icon size={13} />
              </button>
            ))}

            <div style={{ width: 1, height: 18, background: 'rgba(14,20,42,0.10)', margin: '0 2px' }} />

            {/* Cadeado = bloqueio (persistido) da estrutura de fases */}
            <button
              onClick={() => board && p.toggleBloqueio(board.id, !board.bloqueado)}
              title={board?.bloqueado ? 'Estrutura bloqueada — clique para liberar fases' : 'Estrutura liberada — clique para bloquear fases'}
              style={{
                padding: '4px 8px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: board?.bloqueado ? 'rgba(239,159,39,0.15)' : 'transparent',
                color: board?.bloqueado ? '#EF9F27' : 'var(--ws-text-3)',
                transition: 'all 150ms', display: 'flex', alignItems: 'center',
                boxShadow: board?.bloqueado ? '0 2px 8px rgba(239,159,39,0.20)' : 'none',
              }}
            >
              {board?.bloqueado ? <Lock size={13} /> : <Unlock size={13} />}
            </button>

            <div style={{ width: 1, height: 18, background: 'rgba(14,20,42,0.10)', margin: '0 2px' }} />

            {([['kanban', LayoutGrid, 'Kanban'], ['lista', List, 'Lista']] as const).map(([view, Icon, label]) => (
              <button key={view} onClick={() => setVisualizacao(view)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, background: visualizacao === view ? 'rgba(255,255,255,0.85)' : 'transparent', color: visualizacao === view ? '#3E5BFF' : 'var(--ws-text-3)', fontWeight: visualizacao === view ? 500 : 400, transition: 'all 150ms', boxShadow: visualizacao === view ? '0 2px 8px rgba(14,20,42,0.10)' : 'none' }}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>

          <button
            onClick={novoCard}
            disabled={!board}
            style={{ height: 32, padding: '0 14px', background: 'linear-gradient(135deg, #3E5BFF, #7A5AF8)', border: 'none', borderRadius: 'var(--ws-radius-md)', fontSize: 12, fontWeight: 600, color: 'white', cursor: board ? 'pointer' : 'not-allowed', opacity: board ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(62,91,255,0.35)', transition: 'all 150ms' }}
          >
            <Plus size={14} /> Novo card
          </button>
        </div>
      </div>

      {/* Stats por fase */}
      {board && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[...board.colunas].sort((a, b) => a.ordem - b.ordem).map(coluna => {
            const count = board.cards.filter(c => c.status === coluna.id).length
            return (
              <div key={coluna.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)', backdropFilter: 'blur(10px)', borderRadius: 8, boxShadow: 'var(--ws-glass-shadow-sm)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: coluna.cor }} />
                <span style={{ fontSize: 11, color: 'var(--ws-text-2)' }}>{coluna.nome}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ws-text-1)' }}>{count}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Conteúdo */}
      {p.error && !board ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#a32d2d', fontSize: 13 }}>{p.error}</div>
      ) : !board ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--ws-text-3)', fontSize: 13 }}>
          {p.isLoading ? 'Carregando painéis…' : 'Selecione um painel.'}
        </div>
      ) : visualizacao === 'kanban' ? (
        <KanbanBoardComp
          board={boardFiltrado!}
          estruturaEditavel={estruturaEditavel}
          onCardClick={abrirCard}
          onMoverCard={p.moverCard}
          onCriarCard={p.criarCard}
          onCriarFase={p.criarFase}
          onRenomearFase={(faseId, nome) => p.atualizarFase(faseId, { nome })}
          onExcluirFase={p.excluirFase}
          onReordenarFases={p.reordenarFases}
        />
      ) : (
        <ListaView
          board={boardFiltrado!}
          onCardClick={abrirCard}
          onMoverCard={p.moverCard}
          onCriarCard={p.criarCard}
        />
      )}

      <CardModal
        cardId={cardSelecionadoId}
        cardInicial={board?.cards.find(c => c.id === cardSelecionadoId) ?? null}
        colunas={board?.colunas ?? []}
        campos={board?.campos ?? []}
        responsaveis={p.responsaveis}
        aberto={modalAberto}
        modo={modoModal}
        onFechar={() => { setModalAberto(false); setCardSelecionadoId(null) }}
        atualizarCard={p.atualizarCard}
        moverCard={p.moverCard}
        excluirCard={p.excluirCard}
        salvarValores={p.salvarValores}
        criarCampo={p.criarCampo}
        comentar={p.comentar}
        obterCard={p.obterCard}
      />
    </div>
  )
}
