'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { KeyRound, Loader2, Pencil, Plus, Power, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { WSTable, WSTableActions, WSTableShell, wsTableCellStyle, wsTableHeadStyle } from '@/components/ui/ws-table'
import { useAuth } from '@/hooks/use-auth'
import { useWorkspace } from '@/lib/workspace-context'
import api from '@/lib/api-client'
import { type AgenteInput, type HorarioItem, useAgentes } from '@/hooks/use-agentes'
import { type LlmProvider, useLlmProviders } from '@/hooks/use-llm-providers'
import { BaseConhecimentoManager } from '@/components/admin/central-agentes/BaseConhecimentoManager'

type Aba = 'agentes' | 'providers' | 'uso'
type CanalLite = { id: string; nome: string; tipo?: string | null }

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const TONS = ['', 'formal', 'informal', 'tecnico', 'amigavel']

const inputCls = 'w-full rounded-lg px-3 py-2 text-sm outline-none border'
const inputStyle: React.CSSProperties = { borderColor: 'var(--ws-glass-border)', background: 'var(--card)', color: 'var(--ws-text-1)' }
const labelCls = 'block text-xs font-medium mb-1 uppercase tracking-wide'
const labelStyle: React.CSSProperties = { color: 'var(--ws-text-2)', letterSpacing: '0.04em' }

function emptyForm(): AgenteInput {
  return {
    nome: '', descricao: '', provider_id: null, modelo: null, status: 'inativo', tom: '',
    idiomas: [], blacklist_topicos: [], threshold_confianca: 0.7, debounce_segundos: 40,
    limite_tokens_dia: null, alerta_threshold_pct: 80, mensagem_abertura: '', canais: [],
    horarios: [], prompt: '',
  }
}

function StatusChip({ status }: { status: string }) {
  const ativo = status === 'ativo'
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        background: ativo ? 'rgba(15,168,86,0.12)' : 'rgba(255,92,141,0.12)',
        color: ativo ? 'var(--ws-green)' : 'var(--ws-coral)',
      }}
    >
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  )
}

export default function CentralAgentesPage() {
  const { user } = useAuth()
  const { workspaceAtual, workspaces, setWorkspaceAtual } = useWorkspace()
  const [aba, setAba] = useState<Aba>('agentes')

  const ws = workspaceAtual
  const { agentes, carregando, carregar, criar, atualizar, alternarStatus, excluir, obter } = useAgentes(ws)
  const providersHook = useLlmProviders()
  const { providers, carregar: carregarProviders } = providersHook

  const [canais, setCanais] = useState<CanalLite[]>([])

  // form de agente (Sheet)
  const [drawer, setDrawer] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<AgenteInput>(emptyForm())
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { carregarProviders() }, [carregarProviders])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    if (!ws) { setCanais([]); return }
    api.get<CanalLite[]>(`/workspaces/${ws}/canais`).then(setCanais).catch(() => setCanais([]))
  }, [ws])

  const isAdmin = user?.role === 'platform_admin'
  const modelosDoProvider = useMemo(
    () => providers.find((p) => p.id === form.provider_id)?.modelos.filter((m) => m.ativo) ?? [],
    [providers, form.provider_id],
  )

  const setF = useCallback(<K extends keyof AgenteInput>(k: K, v: AgenteInput[K]) => setForm((f) => ({ ...f, [k]: v })), [])

  function abrirNovo() {
    setEditId(null)
    setForm(emptyForm())
    setDrawer(true)
  }

  async function abrirEditar(id: string) {
    setEditId(id)
    setDrawer(true)
    try {
      const a = await obter(id)
      setForm({
        nome: a.nome, descricao: a.descricao ?? '', provider_id: a.provider_id, modelo: a.modelo,
        status: a.status === 'ativo' ? 'ativo' : 'inativo', tom: a.tom ?? '', idiomas: a.idiomas,
        blacklist_topicos: a.blacklist_topicos, threshold_confianca: a.threshold_confianca,
        debounce_segundos: a.debounce_segundos, limite_tokens_dia: a.limite_tokens_dia,
        alerta_threshold_pct: a.alerta_threshold_pct, mensagem_abertura: a.mensagem_abertura ?? '',
        canais: a.canais.map((c) => c.canal_id), prompt: a.prompt_draft ?? '',
        horarios: a.horarios.map((h) => ({ dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fim: h.hora_fim, ativo: h.ativo })),
      })
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar agente')
      setDrawer(false)
    }
  }

  async function salvar() {
    if (!ws) return
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    setSalvando(true)
    try {
      const payload: AgenteInput = { ...form, descricao: form.descricao || null, tom: form.tom || null, mensagem_abertura: form.mensagem_abertura || null }
      if (editId) await atualizar(editId, payload)
      else await criar(payload)
      toast.success(editId ? 'Agente atualizado' : 'Agente criado')
      setDrawer(false)
      carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  async function toggle(id: string, status: string) {
    try {
      await alternarStatus(id, status === 'ativo' ? 'inativo' : 'ativo')
      carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao alternar status')
    }
  }

  async function remover(id: string, nome: string) {
    if (!confirm(`Excluir o agente "${nome}"? Esta ação faz soft delete e libera os canais.`)) return
    try {
      await excluir(id)
      toast.success('Agente excluído')
      carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao excluir')
    }
  }

  function toggleCanal(id: string) {
    setForm((f) => {
      const set = new Set(f.canais ?? [])
      set.has(id) ? set.delete(id) : set.add(id)
      return { ...f, canais: [...set] }
    })
  }

  function addHorario() {
    setForm((f) => ({ ...f, horarios: [...(f.horarios ?? []), { dia_semana: 0, hora_inicio: '08:00', hora_fim: '18:00', ativo: true }] }))
  }
  function setHorario(i: number, patch: Partial<HorarioItem>) {
    setForm((f) => ({ ...f, horarios: (f.horarios ?? []).map((h, idx) => (idx === i ? { ...h, ...patch } : h)) }))
  }
  function delHorario(i: number) {
    setForm((f) => ({ ...f, horarios: (f.horarios ?? []).filter((_, idx) => idx !== i) }))
  }

  if (!isAdmin) {
    return <div className="p-8 text-sm" style={{ color: 'var(--ws-text-2)' }}>Acesso restrito a platform_admin.</div>
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="ds-page-title">Central de Agentes</h1>
        <select
          className={inputCls}
          style={{ ...inputStyle, width: 'auto', minWidth: 220 }}
          value={ws ?? ''}
          onChange={(e) => setWorkspaceAtual(e.target.value)}
        >
          <option value="" disabled>Selecione um workspace</option>
          {workspaces.map((w) => (
            <option key={w.workspace_id} value={w.workspace_id}>{w.workspace_nome ?? w.workspace_id}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-1 mb-5" style={{ borderBottom: '1px solid var(--ws-glass-border)' }}>
        {([['agentes', 'Agentes'], ['providers', 'Providers & Modelos'], ['uso', 'Uso & Consumo']] as [Aba, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className="px-4 py-2 text-sm font-medium"
            style={{
              color: aba === id ? '#c9a84c' : 'var(--ws-text-2)',
              borderBottom: aba === id ? '2px solid #c9a84c' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === 'agentes' && (
        <AgentesTab
          ws={ws}
          agentes={agentes}
          carregando={carregando}
          onNovo={abrirNovo}
          onEditar={abrirEditar}
          onToggle={toggle}
          onRemover={remover}
        />
      )}
      {aba === 'providers' && <ProvidersTab hook={providersHook} />}
      {aba === 'uso' && (
        <div className="text-sm p-6 rounded-xl" style={{ color: 'var(--ws-text-2)', background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)' }}>
          Dashboard de uso & consumo chega na Fase 4 (tokens, custo, taxa de handoff, score médio).
        </div>
      )}

      {/* Drawer de criação/edição de agente */}
      <Sheet open={drawer} onOpenChange={(o) => !o && setDrawer(false)}>
        <SheetContent side="right" style={{ width: 'min(640px, 100vw)', maxWidth: '100vw', overflowY: 'auto' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="ds-section-title">{editId ? 'Editar agente' : 'Novo agente'}</h2>
            <button onClick={() => setDrawer(false)} aria-label="Fechar"><X size={18} /></button>
          </div>

          <div className="space-y-4">
            <Section titulo="Identidade">
              <Field label="Nome">
                <input className={inputCls} style={inputStyle} value={form.nome} onChange={(e) => setF('nome', e.target.value)} />
              </Field>
              <Field label="Descrição">
                <input className={inputCls} style={inputStyle} value={form.descricao ?? ''} onChange={(e) => setF('descricao', e.target.value)} />
              </Field>
              <Field label="Tom / persona">
                <select className={inputCls} style={inputStyle} value={form.tom ?? ''} onChange={(e) => setF('tom', e.target.value)}>
                  {TONS.map((t) => <option key={t} value={t}>{t || '— nenhum —'}</option>)}
                </select>
              </Field>
            </Section>

            <Section titulo="Modelo">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Provider">
                  <select className={inputCls} style={inputStyle} value={form.provider_id ?? ''} onChange={(e) => { setF('provider_id', e.target.value || null); setF('modelo', null) }}>
                    <option value="">— selecione —</option>
                    {providers.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </Field>
                <Field label="Modelo">
                  <select className={inputCls} style={inputStyle} value={form.modelo ?? ''} onChange={(e) => setF('modelo', e.target.value || null)} disabled={!form.provider_id}>
                    <option value="">— selecione —</option>
                    {modelosDoProvider.map((m) => <option key={m.id} value={m.nome_modelo}>{m.label_display || m.nome_modelo}</option>)}
                  </select>
                </Field>
              </div>
            </Section>

            <Section titulo="Canais">
              {canais.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--ws-text-2)' }}>Nenhum canal neste workspace.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {canais.map((c) => {
                    const sel = (form.canais ?? []).includes(c.id)
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleCanal(c.id)}
                        className="rounded-full px-3 py-1 text-xs font-medium border"
                        style={{
                          borderColor: sel ? '#c9a84c' : 'var(--ws-glass-border)',
                          background: sel ? 'rgba(201,168,76,0.12)' : 'transparent',
                          color: sel ? '#c9a84c' : 'var(--ws-text-2)',
                        }}
                      >
                        {c.nome}
                      </button>
                    )
                  })}
                </div>
              )}
            </Section>

            <Section titulo="Prompt do sistema (rascunho)">
              <textarea className={inputCls} style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }} value={form.prompt ?? ''} onChange={(e) => setF('prompt', e.target.value)} placeholder="Você é o assistente de atendimento da empresa…" />
              <p className="text-xs mt-1" style={{ color: 'var(--ws-text-2)' }}>Publicação versionada chega na Fase 4.</p>
            </Section>

            <Section titulo="Base de conhecimento (RAG)">
              {editId ? (
                <BaseConhecimentoManager workspaceId={ws} agenteId={editId} />
              ) : (
                <p className="text-xs" style={{ color: 'var(--ws-text-2)' }}>Salve o agente primeiro para indexar documentos/FAQs.</p>
              )}
            </Section>

            <Section titulo="Horários de funcionamento">
              <div className="space-y-2">
                {(form.horarios ?? []).map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select className={inputCls} style={{ ...inputStyle, width: 90 }} value={h.dia_semana} onChange={(e) => setHorario(i, { dia_semana: Number(e.target.value) })}>
                      {DIAS.map((d, idx) => <option key={idx} value={idx}>{d}</option>)}
                    </select>
                    <input type="time" className={inputCls} style={{ ...inputStyle, width: 120 }} value={h.hora_inicio} onChange={(e) => setHorario(i, { hora_inicio: e.target.value })} />
                    <input type="time" className={inputCls} style={{ ...inputStyle, width: 120 }} value={h.hora_fim} onChange={(e) => setHorario(i, { hora_fim: e.target.value })} />
                    <button onClick={() => delHorario(i)} aria-label="Remover horário"><Trash2 size={16} style={{ color: 'var(--ws-coral)' }} /></button>
                  </div>
                ))}
                <button onClick={addHorario} className="text-xs font-medium" style={{ color: 'var(--ws-blue)' }}>+ Adicionar horário</button>
              </div>
            </Section>

            <Section titulo="Handoff & Limites">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Threshold de confiança (0–1)">
                  <input type="number" step="0.05" min={0} max={1} className={inputCls} style={inputStyle} value={form.threshold_confianca ?? 0.7} onChange={(e) => setF('threshold_confianca', Number(e.target.value))} />
                </Field>
                <Field label="Debounce (segundos)">
                  <input type="number" min={0} max={3600} className={inputCls} style={inputStyle} value={form.debounce_segundos ?? 40} onChange={(e) => setF('debounce_segundos', Number(e.target.value))} />
                </Field>
                <Field label="Limite de tokens/dia">
                  <input type="number" min={0} className={inputCls} style={inputStyle} value={form.limite_tokens_dia ?? ''} onChange={(e) => setF('limite_tokens_dia', e.target.value === '' ? null : Number(e.target.value))} />
                </Field>
                <Field label="Alerta de consumo (%)">
                  <input type="number" min={0} max={100} className={inputCls} style={inputStyle} value={form.alerta_threshold_pct ?? 80} onChange={(e) => setF('alerta_threshold_pct', Number(e.target.value))} />
                </Field>
              </div>
            </Section>

            <Section titulo="Mensagem de abertura">
              <input className={inputCls} style={inputStyle} value={form.mensagem_abertura ?? ''} onChange={(e) => setF('mensagem_abertura', e.target.value)} />
            </Section>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setDrawer(false)} className="px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--ws-glass-border)', color: 'var(--ws-text-2)' }}>Cancelar</button>
            <button onClick={salvar} disabled={salvando} className="px-4 py-2 text-sm rounded-lg font-medium inline-flex items-center gap-2" style={{ background: '#c9a84c', color: '#1a1205' }}>
              {salvando && <Loader2 size={15} className="animate-spin" />}{editId ? 'Salvar' : 'Criar agente'}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function Section({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)' }}>
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--ws-text-1)' }}>{titulo}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls} style={labelStyle}>{label}</span>
      {children}
    </label>
  )
}

function AgentesTab(props: {
  ws: string | null
  agentes: import('@/hooks/use-agentes').AgenteListItem[]
  carregando: boolean
  onNovo: () => void
  onEditar: (id: string) => void
  onToggle: (id: string, status: string) => void
  onRemover: (id: string, nome: string) => void
}) {
  const { ws, agentes, carregando, onNovo, onEditar, onToggle, onRemover } = props
  if (!ws) return <p className="text-sm" style={{ color: 'var(--ws-text-2)' }}>Selecione um workspace.</p>
  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={onNovo} className="px-3 py-2 text-sm rounded-lg font-medium inline-flex items-center gap-2" style={{ background: '#c9a84c', color: '#1a1205' }}>
          <Plus size={16} /> Novo agente
        </button>
      </div>
      <WSTableShell>
        <WSTable minWidth={760}>
          <thead>
            <tr>
              {['Nome', 'Status', 'Modelo', 'Canais', 'Ações'].map((h) => (
                <th key={h} style={{ ...wsTableHeadStyle, padding: '10px 14px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr><td colSpan={5} style={{ ...wsTableCellStyle, padding: 24, textAlign: 'center' }}><Loader2 className="inline animate-spin" size={18} /></td></tr>
            )}
            {!carregando && agentes.length === 0 && (
              <tr><td colSpan={5} style={{ ...wsTableCellStyle, padding: 24, textAlign: 'center', color: 'var(--ws-text-2)' }}>Nenhum agente neste workspace.</td></tr>
            )}
            {agentes.map((a) => (
              <tr key={a.id} style={{ borderTop: '1px solid var(--ws-glass-border)' }}>
                <td style={{ ...wsTableCellStyle, padding: '10px 14px' }}>{a.nome}</td>
                <td style={{ ...wsTableCellStyle, padding: '10px 14px' }}><StatusChip status={a.status} /></td>
                <td style={{ ...wsTableCellStyle, padding: '10px 14px' }}>{a.modelo || '—'}{a.provider_nome ? <span style={{ color: 'var(--ws-text-2)' }}> · {a.provider_nome}</span> : null}</td>
                <td style={{ ...wsTableCellStyle, padding: '10px 14px' }}>{a.canais.length ? a.canais.map((c) => c.canal_nome).filter(Boolean).join(', ') : '—'}</td>
                <td style={{ ...wsTableCellStyle, padding: '10px 14px' }}>
                  <WSTableActions>
                    <button onClick={() => onToggle(a.id, a.status)} title={a.status === 'ativo' ? 'Inativar' : 'Ativar'}>
                      <Power size={16} style={{ color: a.status === 'ativo' ? 'var(--ws-green)' : 'var(--ws-text-2)' }} />
                    </button>
                    <button onClick={() => onEditar(a.id)} title="Editar"><Pencil size={16} style={{ color: 'var(--ws-blue)' }} /></button>
                    <button onClick={() => onRemover(a.id, a.nome)} title="Excluir"><Trash2 size={16} style={{ color: 'var(--ws-coral)' }} /></button>
                  </WSTableActions>
                </td>
              </tr>
            ))}
          </tbody>
        </WSTable>
      </WSTableShell>
    </>
  )
}

function ProvidersTab({ hook }: { hook: ReturnType<typeof useLlmProviders> }) {
  const { providers, carregar, salvarToken, adicionarModelo, removerModelo } = hook
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({})
  const [modeloInputs, setModeloInputs] = useState<Record<string, string>>({})

  async function onSalvarToken(p: LlmProvider) {
    const t = (tokenInputs[p.id] || '').trim()
    if (!t) { toast.error('Cole o token'); return }
    try {
      await salvarToken(p.id, t)
      toast.success(`Token de ${p.nome} salvo`)
      setTokenInputs((s) => ({ ...s, [p.id]: '' }))
      carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar token')
    }
  }

  async function onAddModelo(p: LlmProvider) {
    const nome = (modeloInputs[p.id] || '').trim()
    if (!nome) return
    try {
      await adicionarModelo(p.id, { nome_modelo: nome })
      setModeloInputs((s) => ({ ...s, [p.id]: '' }))
      carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao adicionar modelo')
    }
  }

  async function onRemModelo(p: LlmProvider, modeloId: string) {
    try {
      await removerModelo(p.id, modeloId)
      carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao remover modelo')
    }
  }

  return (
    <div className="space-y-4">
      {providers.map((p) => (
        <div key={p.id} className="rounded-xl p-4" style={{ background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)' }}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <span className="text-sm font-semibold" style={{ color: 'var(--ws-text-1)' }}>{p.nome}</span>
              <span className="text-xs ml-2" style={{ color: 'var(--ws-text-2)' }}>{p.base_url} · {p.tipo}</span>
            </div>
            <span className="text-xs inline-flex items-center gap-1" style={{ color: p.token_configurado ? 'var(--ws-green)' : 'var(--ws-text-2)' }}>
              <KeyRound size={13} /> {p.token_configurado ? `token ${p.token_mask}` : 'sem token'}
            </span>
          </div>

          <div className="flex flex-wrap items-end gap-2 mb-3">
            <input
              type="password"
              placeholder={p.token_configurado ? 'Atualizar token…' : 'Colar token…'}
              className={inputCls}
              style={{ ...inputStyle, maxWidth: 320 }}
              value={tokenInputs[p.id] ?? ''}
              onChange={(e) => setTokenInputs((s) => ({ ...s, [p.id]: e.target.value }))}
            />
            <button onClick={() => onSalvarToken(p)} className="px-3 py-2 text-sm rounded-lg font-medium border" style={{ borderColor: 'var(--ws-glass-border)', color: 'var(--ws-text-1)' }}>Salvar token</button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {p.modelos.map((m) => (
              <span key={m.id} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs" style={{ background: 'rgba(62,91,255,0.10)', color: 'var(--ws-text-1)' }}>
                {m.label_display || m.nome_modelo}
                <button onClick={() => onRemModelo(p, m.id)} aria-label="Remover modelo"><X size={12} /></button>
              </span>
            ))}
            <input
              placeholder="novo-modelo"
              className={inputCls}
              style={{ ...inputStyle, width: 160 }}
              value={modeloInputs[p.id] ?? ''}
              onChange={(e) => setModeloInputs((s) => ({ ...s, [p.id]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') onAddModelo(p) }}
            />
            <button onClick={() => onAddModelo(p)} className="text-xs font-medium" style={{ color: 'var(--ws-blue)' }}>+ modelo</button>
          </div>
        </div>
      ))}
      {providers.length === 0 && <p className="text-sm" style={{ color: 'var(--ws-text-2)' }}>Carregando providers…</p>}
    </div>
  )
}
