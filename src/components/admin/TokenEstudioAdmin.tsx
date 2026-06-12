'use client'

import React, { useEffect, useState } from 'react'
import { Coins, Check, Plus, Minus, ArrowRightLeft, Search, Wallet, Clock, X } from 'lucide-react'
import { toast } from 'sonner'
import { getToken } from '@/lib/api-client'

interface SaldoRow {
  workspace_id: string
  nome: string
  saldo_tokens: number
  removivel: number      // concedido ainda no saldo (grátis) — removível
  transferivel: number   // comprado ainda no saldo — transferível
  comprado: number
}
interface Pendente { id: string; workspace_id: string; nome: string; tokens: number; valor_reais: number | null; criado_em: string | null }
type Tipo = 'liberar' | 'remover' | 'transferir'

export function TokenEstudioAdmin() {
  const [saldos, setSaldos] = useState<SaldoRow[]>([])
  const [pendentes, setPendentes] = useState<Pendente[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [acao, setAcao] = useState<{ ws: string; tipo: Tipo } | null>(null)
  const [qtd, setQtd] = useState('')
  const [destino, setDestino] = useState('')
  const [enviando, setEnviando] = useState(false)

  const auth = () => ({ Authorization: `Bearer ${getToken() ?? ''}` })
  const jsonAuth = () => ({ 'Content-Type': 'application/json', ...auth() })

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
    } catch { toast.error('Erro ao confirmar a recarga.') }
  }

  const cancelarRecarga = async (id: string) => {
    try {
      const res = await fetch(`/api/proxy/estudio/recarga/${id}/cancelar`, { method: 'POST', headers: auth() })
      if (!res.ok) throw new Error()
      toast.success('Recarga cancelada')
      carregar()
    } catch { toast.error('Erro ao cancelar a recarga.') }
  }

  const fechar = () => { setAcao(null); setQtd(''); setDestino('') }

  const executar = async (row: SaldoRow) => {
    const n = parseInt(qtd, 10)
    if (!n || n <= 0) { toast.error('Informe a quantidade.'); return }
    if (!acao) return
    setEnviando(true)
    try {
      let res: Response
      if (acao.tipo === 'liberar') {
        res = await fetch('/api/proxy/estudio/creditar', { method: 'POST', headers: jsonAuth(), body: JSON.stringify({ workspace_id: row.workspace_id, tokens: n, motivo: 'Liberação manual (admin)' }) })
      } else if (acao.tipo === 'remover') {
        res = await fetch('/api/proxy/estudio/remover', { method: 'POST', headers: jsonAuth(), body: JSON.stringify({ workspace_id: row.workspace_id, tokens: n }) })
      } else {
        if (!destino) { toast.error('Escolha o workspace de destino.'); setEnviando(false); return }
        res = await fetch('/api/proxy/estudio/transferir', { method: 'POST', headers: jsonAuth(), body: JSON.stringify({ origem_workspace_id: row.workspace_id, destino_workspace_id: destino, tokens: n }) })
      }
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.detail || 'falha')
      }
      toast.success(acao.tipo === 'liberar' ? `${n} tokens liberados` : acao.tipo === 'remover' ? `${n} tokens removidos` : `${n} tokens transferidos`)
      fechar(); carregar()
    } catch (e: any) {
      toast.error(e?.message && e.message !== 'falha' ? e.message : 'Erro na operação.')
    } finally { setEnviando(false) }
  }

  const totalCirculacao = saldos.reduce((a, s) => a + s.saldo_tokens, 0)
  const comSaldo = saldos.filter(s => s.saldo_tokens > 0).length
  const filtrados = saldos.filter(s => s.nome.toLowerCase().includes(busca.toLowerCase()))

  const cardCls = 'rounded-[var(--ws-radius-xl)] border border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)] p-4'
  const miniBtn = 'h-8 px-2.5 rounded-[var(--ws-radius-lg)] text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-colors'

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
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => confirmarRecarga(p.id)} className={`${miniBtn} bg-[var(--ws-blue)] text-white hover:opacity-90`}><Check size={13} /> Confirmar</button>
                  <button onClick={() => cancelarRecarga(p.id)} className={`${miniBtn} text-[#a32d2d] border border-[var(--ws-glass-border)] hover:border-[#a32d2d]`}><X size={13} /> Cancelar</button>
                </div>
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
            {filtrados.map(s => {
              const editando = acao?.ws === s.workspace_id
              return (
                <div key={s.workspace_id} className="flex items-center gap-3 py-2 border-b border-[var(--ws-glass-border)] last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-[var(--ws-text-1)] truncate">{s.nome}</div>
                    {s.saldo_tokens > 0 && (
                      <div className="text-[10px] text-[var(--ws-text-3)]">
                        <span className="text-[var(--ws-gold)]">{s.transferivel} comprado</span> · {s.removivel} grátis
                      </div>
                    )}
                  </div>
                  {editando ? (
                    <div className="flex items-center gap-1.5">
                      {acao!.tipo === 'transferir' && (
                        <select value={destino} onChange={e => setDestino(e.target.value)}
                          className="h-8 px-2 max-w-[160px] bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[var(--ws-radius-lg)] text-[11px] text-[var(--ws-text-1)] focus:outline-none focus:border-[var(--ws-blue)]">
                          <option value="">Destino...</option>
                          {saldos.filter(o => o.workspace_id !== s.workspace_id).map(o => <option key={o.workspace_id} value={o.workspace_id}>{o.nome}</option>)}
                        </select>
                      )}
                      <input autoFocus value={qtd} onChange={e => setQtd(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder={acao!.tipo === 'remover' ? `máx ${s.removivel}` : acao!.tipo === 'transferir' ? `máx ${s.transferivel}` : 'qtd'} inputMode="numeric"
                        onKeyDown={e => { if (e.key === 'Enter') executar(s) }}
                        className="w-24 h-8 px-2 bg-[var(--ws-glass-bg)] border border-[var(--ws-blue)] rounded-[var(--ws-radius-lg)] text-[12px] text-[var(--ws-text-1)] focus:outline-none" />
                      <button disabled={enviando} onClick={() => executar(s)} className="h-8 px-2.5 rounded-[var(--ws-radius-lg)] bg-[var(--ws-blue)] text-white text-[10px] font-bold uppercase disabled:opacity-50">OK</button>
                      <button onClick={fechar} className="h-8 w-8 flex items-center justify-center rounded-[var(--ws-radius-lg)] text-[var(--ws-text-3)] hover:text-[#a32d2d]"><X size={14} /></button>
                    </div>
                  ) : (
                    <>
                      <span className="text-[14px] font-bold text-[var(--ws-text-1)] tabular-nums w-14 text-right">{s.saldo_tokens}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setAcao({ ws: s.workspace_id, tipo: 'liberar' }); setQtd(''); setDestino('') }}
                          className={`${miniBtn} text-[var(--ws-blue)] border border-[var(--ws-blue)]/40 bg-[rgba(62,91,255,0.06)] hover:bg-[rgba(62,91,255,0.12)]`}><Plus size={12} /> Liberar</button>
                        <button disabled={s.removivel <= 0} onClick={() => { setAcao({ ws: s.workspace_id, tipo: 'remover' }); setQtd(''); setDestino('') }}
                          title={s.removivel <= 0 ? 'Sem tokens concedidos para remover' : `Remover até ${s.removivel} (grátis)`}
                          className={`${miniBtn} text-[#a32d2d] border border-[#a32d2d]/30 hover:bg-[rgba(163,45,45,0.08)] disabled:opacity-30 disabled:cursor-not-allowed`}><Minus size={12} /> Remover</button>
                        <button disabled={s.transferivel <= 0} onClick={() => { setAcao({ ws: s.workspace_id, tipo: 'transferir' }); setQtd(''); setDestino('') }}
                          title={s.transferivel <= 0 ? 'Sem tokens comprados para transferir' : `Transferir até ${s.transferivel} (comprado)`}
                          className={`${miniBtn} text-[var(--ws-gold)] border border-[var(--ws-gold)]/40 hover:bg-[rgba(201,168,76,0.10)] disabled:opacity-30 disabled:cursor-not-allowed`}><ArrowRightLeft size={12} /> Transferir</button>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
            {filtrados.length === 0 && <div className="text-[11px] text-[var(--ws-text-3)] italic py-4 text-center opacity-70">Nenhum cliente encontrado.</div>}
          </div>
        )}
      </div>
    </div>
  )
}
