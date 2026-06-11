'use client'

import React, { useEffect, useState } from 'react'
import { Coins, CreditCard, Clock, ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { getToken } from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'

interface Transacao {
  id: string
  workspace_id: string
  tipo: 'credito' | 'debito'
  tokens: number
  valor_reais: number | null
  motivo: string | null
  status: 'confirmado' | 'pendente' | 'cancelado'
  criado_em: string | null
}

const PACOTES = [50, 100, 250, 500]

const STATUS_LABEL: Record<string, { txt: string; cor: string }> = {
  confirmado: { txt: 'Confirmado', cor: 'var(--ws-green)' },
  pendente: { txt: 'Pendente', cor: 'var(--ws-gold)' },
  cancelado: { txt: 'Cancelado', cor: '#a32d2d' },
}

export function CarregarTokens() {
  const { workspaceAtual: wsId } = useWorkspace()

  const [saldo, setSaldo] = useState<number>(0)
  const [transacoes, setTransacoes] = useState<Transacao[]>([])
  const [loading, setLoading] = useState(true)
  const [escolhido, setEscolhido] = useState<number>(100)
  const [custom, setCustom] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [pagandoStripe, setPagandoStripe] = useState(false)
  const [pedidoMsg, setPedidoMsg] = useState<string | null>(null)

  const tokensEscolhidos = custom.trim() ? Math.max(0, parseInt(custom, 10) || 0) : escolhido

  const auth = () => ({ Authorization: `Bearer ${getToken() ?? ''}` })

  const carregarDados = async () => {
    if (!wsId) return
    setLoading(true)
    try {
      const [s, t] = await Promise.all([
        fetch(`/api/proxy/estudio/saldo?workspace_id=${wsId}`, { headers: auth() }).then(r => r.json()),
        fetch(`/api/proxy/estudio/transacoes?workspace_id=${wsId}`, { headers: auth() }).then(r => r.json()),
      ])
      setSaldo(s?.saldo_tokens ?? 0)
      setTransacoes(Array.isArray(t) ? t : [])
    } catch {
      toast.error('Erro ao carregar a carteira.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { carregarDados() /* eslint-disable-next-line */ }, [wsId])

  const solicitarRecarga = async () => {
    if (!wsId) return
    if (tokensEscolhidos <= 0) { toast.error('Escolha quantos tokens carregar.'); return }
    setCarregando(true); setPedidoMsg(null)
    try {
      const res = await fetch('/api/proxy/estudio/recarga', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ workspace_id: wsId, tokens: tokensEscolhidos }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setPedidoMsg(data?.instrucao_pagamento || 'Pedido de recarga criado. Aguardando confirmação do pagamento.')
      toast.success('Pedido de recarga criado')
      setCustom('')
      carregarDados()
    } catch {
      toast.error('Erro ao solicitar a recarga.')
    } finally {
      setCarregando(false)
    }
  }

  // Pagamento automático via Stripe Checkout (cartão/PIX)
  const pagarStripe = async () => {
    if (!wsId) return
    if (tokensEscolhidos <= 0) { toast.error('Escolha quantos tokens carregar.'); return }
    setPagandoStripe(true)
    try {
      const res = await fetch('/api/proxy/estudio/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ workspace_id: wsId, tokens: tokensEscolhidos }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data?.url) { window.location.href = data.url } else { throw new Error() }
    } catch {
      toast.error('Erro ao iniciar o pagamento.')
      setPagandoStripe(false)
    }
  }

  // Retorno do Stripe Checkout: confirma o pagamento e credita o saldo
  useEffect(() => {
    if (!wsId || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('cancelado')) {
      toast.info('Pagamento cancelado.')
      window.history.replaceState({}, '', window.location.pathname)
      return
    }
    const sessionId = params.get('session_id')
    if (sessionId) {
      fetch('/api/proxy/estudio/checkout/confirmar', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ workspace_id: wsId, session_id: sessionId }),
      }).then(r => (r.ok ? r.json() : Promise.reject()))
        .then(d => { toast[d?.pago ? 'success' : 'info'](d?.pago ? 'Pagamento confirmado! Saldo creditado.' : 'Pagamento ainda em processamento.'); carregarDados() })
        .catch(() => toast.error('Erro ao confirmar o pagamento.'))
        .finally(() => window.history.replaceState({}, '', window.location.pathname))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId])

  // Aprovação de recargas pendentes fica SÓ na Gestão de Tokens (admin), não aqui (tela do cliente).
  const cardCls = 'rounded-[var(--ws-radius-xl)] border border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)] backdrop-blur-md p-5'

  return (
    <div className="h-full overflow-y-auto p-6 scrollbar-hide animate-in fade-in duration-500">
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <h1 className="text-lg font-bold text-[var(--ws-text-1)] flex items-center gap-2"><Wallet size={20} className="text-[var(--ws-blue)]" /> Carregar Tokens</h1>
          <p className="text-[12px] text-[var(--ws-text-3)]">Saldo do Estúdio AI deste workspace. 1 token = R$ 1,00.</p>
        </div>

        {/* Saldo */}
        <div className={`${cardCls} flex items-center justify-between bg-[linear-gradient(135deg,rgba(62,91,255,0.10),rgba(122,90,248,0.06))]`}>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--ws-text-3)]">Saldo atual</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-4xl font-bold text-[var(--ws-text-1)]">{loading ? '—' : saldo}</span>
              <span className="text-[13px] font-medium text-[var(--ws-text-2)]">tokens</span>
            </div>
            <div className="text-[11px] text-[var(--ws-text-3)] mt-1">≈ R$ {saldo.toLocaleString('pt-BR')},00 · consumo: medium 1 · alta 2 · reverso 3</div>
          </div>
          <Coins size={48} className="text-[var(--ws-gold)] opacity-70" />
        </div>

        {/* Recarga */}
        <div className={cardCls}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--ws-text-3)] mb-3">Quanto carregar?</div>
          <div className="grid grid-cols-4 gap-2">
            {PACOTES.map(p => (
              <button key={p} onClick={() => { setEscolhido(p); setCustom('') }}
                className={`flex flex-col items-center gap-0.5 py-3 rounded-[var(--ws-radius-lg)] border transition-all ${!custom.trim() && escolhido === p ? 'bg-[rgba(62,91,255,0.10)] border-[var(--ws-blue)] text-[var(--ws-blue)]' : 'bg-[var(--ws-glass-bg)] border-[var(--ws-glass-border)] text-[var(--ws-text-2)] hover:border-[var(--ws-blue)]'}`}>
                <span className="text-lg font-bold">{p}</span>
                <span className="text-[10px]">R$ {p}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-[11px] text-[var(--ws-text-3)] shrink-0">Ou valor livre:</span>
            <input value={custom} onChange={e => setCustom(e.target.value.replace(/[^0-9]/g, ''))} placeholder="ex.: 1000"
              inputMode="numeric"
              className="w-32 h-9 px-3 bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[var(--ws-radius-lg)] text-sm text-[var(--ws-text-1)] focus:outline-none focus:border-[var(--ws-blue)]" />
            <span className="text-[11px] text-[var(--ws-text-3)]">tokens</span>
          </div>
          {/* Pagamento automático (Stripe) — primário */}
          <button onClick={pagarStripe} disabled={pagandoStripe || carregando || tokensEscolhidos <= 0}
            className="mt-4 w-full h-11 rounded-[var(--ws-radius-lg)] bg-[var(--ws-gold)] text-white font-bold uppercase tracking-wider text-xs hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
            {pagandoStripe
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Abrindo pagamento...</>
              : <><CreditCard size={16} /> Pagar com cartão/PIX {tokensEscolhidos > 0 ? `· R$ ${tokensEscolhidos}` : ''}</>}
          </button>
          {/* Recarga manual (PIX/comprovante, admin confirma) — secundário */}
          <button onClick={solicitarRecarga} disabled={carregando || tokensEscolhidos <= 0}
            className="mt-2 w-full h-9 rounded-[var(--ws-radius-lg)] text-[10px] font-bold uppercase tracking-wider text-[var(--ws-text-2)] border border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)] hover:border-[var(--ws-blue)] disabled:opacity-50 transition-all flex items-center justify-center gap-2">
            {carregando
              ? <><span className="w-3.5 h-3.5 border-2 border-[var(--ws-text-3)]/30 border-t-[var(--ws-text-2)] rounded-full animate-spin" /> Solicitando...</>
              : <>Solicitar recarga manual (PIX/comprovante)</>}
          </button>
          {pedidoMsg && (
            <div className="mt-3 p-3 rounded-[var(--ws-radius-lg)] border border-[var(--ws-gold)]/40 bg-[rgba(201,168,76,0.08)] text-[11px] text-[var(--ws-text-2)] flex items-start gap-2">
              <Clock size={14} className="text-[var(--ws-gold)] mt-0.5 shrink-0" /> <span>{pedidoMsg}</span>
            </div>
          )}
        </div>

        {/* Histórico */}
        <div className={cardCls}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--ws-text-3)] mb-3">Histórico</div>
          {loading ? (
            <div className="text-[12px] text-[var(--ws-text-3)] py-4 text-center">Carregando...</div>
          ) : transacoes.length === 0 ? (
            <div className="text-[11px] text-[var(--ws-text-3)] italic py-4 text-center opacity-70">Nenhuma transação ainda.</div>
          ) : (
            <div className="space-y-1.5">
              {transacoes.map(t => {
                const st = STATUS_LABEL[t.status] || STATUS_LABEL.confirmado
                const credito = t.tipo === 'credito'
                return (
                  <div key={t.id} className="flex items-center gap-3 py-2 border-b border-[var(--ws-glass-border)] last:border-0">
                    {credito ? <ArrowUpCircle size={16} className="text-[var(--ws-green)] shrink-0" /> : <ArrowDownCircle size={16} className="text-[#a32d2d] shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-[var(--ws-text-1)] truncate">{t.motivo || (credito ? 'Crédito' : 'Débito')}</div>
                      <div className="text-[10px] text-[var(--ws-text-3)]">{t.criado_em ? new Date(t.criado_em).toLocaleString('pt-BR') : ''}</div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ color: st.cor, background: `color-mix(in srgb, ${st.cor} 14%, transparent)` }}>{st.txt}</span>
                    <span className={`text-[13px] font-bold shrink-0 ${credito ? 'text-[var(--ws-green)]' : 'text-[#a32d2d]'}`}>{credito ? '+' : '-'}{t.tokens}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
