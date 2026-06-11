'use client'

import React, { useEffect, useState } from 'react'
import { Coins, Check, Plus, Search, Wallet, Clock, X } from 'lucide-react'
import { toast } from 'sonner'
import { getToken } from '@/lib/api-client'

interface SaldoRow { workspace_id: string; nome: string; saldo_tokens: number }
interface Pendente { id: string; workspace_id: string; nome: string; tokens: number; valor_reais: number | null; criado_em: string | null }

export function TokenEstudioAdmin() {
  const [saldos, setSaldos] = useState<SaldoRow[]>([])
  const [pendentes, setPendentes] = useState<Pendente[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [liberando, setLiberando] = useState<string | null>(null)
  const [qtd, setQtd] = useState('')

  const auth = () => ({ Authorization: `Bearer ${getToken() ?? ''}` })

  const carregar = async () => {
    setLoading(true)
    try {
      const [s, p] = await Promise.all([
        fetch('/api/proxy/estudio/admin/saldos', { headers: auth() }).then(r => r.json()),
        fetch('/api/proxy/estudio/admin/recargas-pendentes', { headers: auth() }).then(r => r.json()),
      ])
      setSaldos(Array.isArray(s) ? s : [])
      setPendentes(Array.isArray(p) ? p : [])
    } catch {
      toast.error('Erro ao carregar os tokens.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { carregar() }, [])

  const confirmarRecarga = async (id: string) => {
    try {
      const res = await fetch(`/api/proxy/estudio/recarga/${id}/confirmar`, { method: 'POST', headers: auth() })
      if (!res.ok) throw new Error()
      toast.success('Recarga confirmada e creditada')
      carregar()
    } catch {
      toast.error('Erro ao confirmar a recarga.')
    }
  }

  const liberar = async (workspace_id: string) => {
    const n = parseInt(qtd, 10)
    if (!n || n <= 0) { toast.error('Informe a quantidade de tokens.'); return }
    try {
      const res = await fetch('/api/proxy/estudio/creditar', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ workspace_id, tokens: n, motivo: 'Liberação manual (admin)' }),
      })
      if (!res.ok) throw new Error()
      toast.success(`${n} tokens liberados`)
      setLiberando(null); setQtd(''); carregar()
    } catch {
      toast.error('Erro ao liberar tokens.')
    }
  }

  const totalCirculacao = saldos.reduce((a, s) => a + s.saldo_tokens, 0)
  const comSaldo = saldos.filter(s => s.saldo_tokens > 0).length
  const filtrados = saldos.filter(s => s.nome.toLowerCase().includes(busca.toLowerCase()))

  const cardCls = 'rounded-[var(--ws-radius-xl)] border border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)] p-4'

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className={cardCls}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--ws-text-3)] flex items-center gap-1.5"><Coins size={13} className="text-[var(--ws-gold)]" /> Em circulação</div>
          <div className="text-2xl font-bold text-[var(--ws-text-1)] mt-1">{loading ? '—' : totalCirculacao.toLocaleString('pt-BR')}</div>
          <div className="text-[10px] text-[var(--ws-text-3)]">tokens · ≈ R$ {totalCirculacao.toLocaleString('pt-BR')},00</div>
        </div>
        <div className={cardCls}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--ws-text-3)] flex items-center gap-1.5"><Wallet size={13} className="text-[var(--ws-blue)]" /> Clientes com saldo</div>
          <div className="text-2xl font-bold text-[var(--ws-text-1)] mt-1">{loading ? '—' : comSaldo}</div>
          <div className="text-[10px] text-[var(--ws-text-3)]">de {saldos.length} workspaces</div>
        </div>
        <div className={cardCls}>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--ws-text-3)] flex items-center gap-1.5"><Clock size={13} className="text-[var(--ws-gold)]" /> Recargas pendentes</div>
          <div className="text-2xl font-bold text-[var(--ws-text-1)] mt-1">{loading ? '—' : pendentes.length}</div>
          <div className="text-[10px] text-[var(--ws-text-3)]">aguardando confirmação</div>
        </div>
      </div>

      {/* Recargas pendentes */}
      {pendentes.length > 0 && (
        <div className={cardCls}>
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--ws-blue)] mb-3">Recargas pendentes</div>
          <div className="space-y-2">
            {pendentes.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-2 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)]">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[var(--ws-text-1)] truncate">{p.nome}</div>
                  <div className="text-[10px] text-[var(--ws-text-3)]">{p.criado_em ? new Date(p.criado_em).toLocaleString('pt-BR') : ''}</div>
                </div>
                <div className="text-[13px] font-bold text-[var(--ws-text-1)] shrink-0"><b>{p.tokens}</b> tokens · R$ {p.valor_reais ?? p.tokens}</div>
                <button onClick={() => confirmarRecarga(p.id)} className="h-8 px-3 rounded-[var(--ws-radius-lg)] bg-[var(--ws-blue)] text-white text-[10px] font-bold uppercase tracking-wider hover:opacity-90 flex items-center gap-1.5 shrink-0"><Check size={13} /> Confirmar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saldos por cliente */}
      <div className={cardCls}>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-3)]">Saldo por cliente</div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ws-text-3)]" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente..."
              className="h-8 pl-8 pr-3 w-56 bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[var(--ws-radius-lg)] text-[12px] text-[var(--ws-text-1)] focus:outline-none focus:border-[var(--ws-blue)]" />
          </div>
        </div>
        {loading ? (
          <div className="text-[12px] text-[var(--ws-text-3)] py-6 text-center">Carregando...</div>
        ) : (
          <div className="space-y-1">
            {filtrados.map(s => (
              <div key={s.workspace_id} className="flex items-center gap-3 py-2 border-b border-[var(--ws-glass-border)] last:border-0">
                <div className="flex-1 min-w-0 text-[13px] text-[var(--ws-text-1)] truncate">{s.nome}</div>
                {liberando === s.workspace_id ? (
                  <div className="flex items-center gap-1.5">
                    <input autoFocus value={qtd} onChange={e => setQtd(e.target.value.replace(/[^0-9]/g, ''))} placeholder="qtd" inputMode="numeric"
                      onKeyDown={e => { if (e.key === 'Enter') liberar(s.workspace_id) }}
                      className="w-20 h-8 px-2 bg-[var(--ws-glass-bg)] border border-[var(--ws-blue)] rounded-[var(--ws-radius-lg)] text-[12px] text-[var(--ws-text-1)] focus:outline-none" />
                    <button onClick={() => liberar(s.workspace_id)} className="h-8 px-2.5 rounded-[var(--ws-radius-lg)] bg-[var(--ws-blue)] text-white text-[10px] font-bold uppercase">OK</button>
                    <button onClick={() => { setLiberando(null); setQtd('') }} className="h-8 w-8 flex items-center justify-center rounded-[var(--ws-radius-lg)] text-[var(--ws-text-3)] hover:text-[#a32d2d]"><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <span className="text-[14px] font-bold text-[var(--ws-text-1)] tabular-nums w-16 text-right">{s.saldo_tokens}</span>
                    <button onClick={() => { setLiberando(s.workspace_id); setQtd('') }}
                      className="h-8 px-2.5 rounded-[var(--ws-radius-lg)] text-[10px] font-bold uppercase text-[var(--ws-blue)] border border-[var(--ws-blue)]/40 bg-[rgba(62,91,255,0.06)] hover:bg-[rgba(62,91,255,0.12)] flex items-center gap-1"><Plus size={12} /> Liberar</button>
                  </>
                )}
              </div>
            ))}
            {filtrados.length === 0 && <div className="text-[11px] text-[var(--ws-text-3)] italic py-4 text-center opacity-70">Nenhum cliente encontrado.</div>}
          </div>
        )}
      </div>
    </div>
  )
}
