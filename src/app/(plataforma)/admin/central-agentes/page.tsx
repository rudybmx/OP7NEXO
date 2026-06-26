'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, KeyRound, Loader2, Pencil, Plus, Power, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { WSTable, WSTableActions, WSTableShell, wsTableCellStyle, wsTableHeadStyle } from '@/components/ui/ws-table'
import { useAuth } from '@/hooks/use-auth'
import { useWorkspace } from '@/lib/workspace-context'
import api from '@/lib/api-client'
import { type AgenteInput, type HorarioItem, useAgentes } from '@/hooks/use-agentes'
import { type LlmProvider, useLlmProviders } from '@/hooks/use-llm-providers'
import { useDiretrizes } from '@/hooks/use-diretrizes'
import { useAjustesResposta, type AjusteResposta } from '@/hooks/use-ajustes-resposta'
import { useAgentesDisponiveis } from '@/hooks/use-agentes-disponiveis'
import { BaseConhecimentoManager } from '@/components/admin/central-agentes/BaseConhecimentoManager'
import { UsoDashboard } from '@/components/admin/central-agentes/UsoDashboard'

type Aba = 'agentes' | 'providers' | 'uso' | 'diretrizes'
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
    limite_tokens_dia: null, alerta_threshold_pct: 80, mensagem_abertura: '', objetivo: '', tempo_followup_min: null, codigo_responsavel: '', horario_modo: 'dentro', canais: [],
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
  const [publicando, setPublicando] = useState(false)
  const { listar: listarAjustes, remover: removerAjuste } = useAjustesResposta()
  // Responsáveis = quem pode atender canais no workspace (mesma fonte da transferência manual).
  const { agentes: atendentes } = useAgentesDisponiveis(ws ?? undefined)
  const [ajustes, setAjustes] = useState<AjusteResposta[]>([])

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
    setAjustes([])
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
        alerta_threshold_pct: a.alerta_threshold_pct, mensagem_abertura: a.mensagem_abertura ?? '', objetivo: a.objetivo ?? '', tempo_followup_min: a.tempo_followup_min ?? null, codigo_responsavel: a.codigo_responsavel ?? '', horario_modo: a.horario_modo === 'fora' ? 'fora' : 'dentro',
        canais: a.canais.map((c) => c.canal_id), prompt: a.prompt_draft ?? '',
        horarios: a.horarios.map((h) => ({ dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fim: h.hora_fim, ativo: h.ativo })),
      })
      if (ws) {
        try { setAjustes(await listarAjustes(ws, id)) } catch { setAjustes([]) }
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar agente')
      setDrawer(false)
    }
  }

  async function onRemoverAjuste(id: string) {
    if (!ws || !editId) return
    try {
      await removerAjuste(ws, editId, id)
      setAjustes((l) => l.filter((a) => a.id !== id))
      toast.success('Sugestão removida')
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao remover')
    }
  }

  async function publicarPrompt() {
    if (!ws || !editId) return
    setPublicando(true)
    try {
      await atualizar(editId, { prompt: form.prompt })
      await api.post(`/workspaces/${ws}/agentes/${editId}/publicar`)
      toast.success('Prompt publicado')
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao publicar')
    } finally {
      setPublicando(false)
    }
  }

  async function salvar() {
    if (!ws) return
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    setSalvando(true)
    try {
      const payload: AgenteInput = { ...form, descricao: form.descricao || null, tom: form.tom || null, mensagem_abertura: form.mensagem_abertura || null, objetivo: form.objetivo || null }
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
        {([['agentes', 'Agentes'], ['providers', 'Providers & Modelos'], ['diretrizes', 'Diretrizes'], ['uso', 'Uso & Consumo']] as [Aba, string][]).map(([id, label]) => (
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
      {aba === 'diretrizes' && <DiretrizesTab ws={ws} />}
      {aba === 'uso' && <UsoDashboard workspaceId={ws} />}

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
              {editId ? (
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={publicarPrompt} disabled={publicando} className="px-3 py-1.5 text-xs font-medium rounded-lg border" style={{ borderColor: 'var(--ws-glass-border)', color: 'var(--ws-text-1)' }}>
                    {publicando ? 'Publicando…' : 'Publicar versão'}
                  </button>
                  <span className="text-xs" style={{ color: 'var(--ws-text-2)' }}>salva o rascunho e cria uma versão publicada</span>
                </div>
              ) : (
                <p className="text-xs mt-1" style={{ color: 'var(--ws-text-2)' }}>Salve o agente para publicar versões do prompt.</p>
              )}
            </Section>

            <Section titulo="Base de conhecimento (RAG)">
              {editId ? (
                <BaseConhecimentoManager workspaceId={ws} agenteId={editId} />
              ) : (
                <p className="text-xs" style={{ color: 'var(--ws-text-2)' }}>Salve o agente primeiro para indexar documentos/FAQs.</p>
              )}
            </Section>

            <Section titulo="Horários de funcionamento">
              <div className="mb-3">
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--ws-text-2)' }}>O agente responde:</label>
                <select className={inputCls} style={inputStyle} value={form.horario_modo ?? 'dentro'} onChange={(e) => setF('horario_modo', e.target.value as 'dentro' | 'fora')}>
                  <option value="dentro">Dentro do horário abaixo</option>
                  <option value="fora">Fora do horário abaixo (plantão — noites e fins de semana)</option>
                </select>
                <p className="text-xs mt-1" style={{ color: 'var(--ws-text-2)' }}>
                  Horários no fuso de <strong>Brasília (UTC-3)</strong>. Sem nenhum horário definido, o agente responde <strong>sempre (24/7)</strong>. No modo plantão, cadastre o horário comercial abaixo — o agente atende automaticamente fora dele (noites e fins de semana).
                </p>
              </div>
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

            <Section titulo="Objetivo do agente">
              <textarea
                className={inputCls}
                style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
                value={form.objetivo ?? ''}
                onChange={(e) => setF('objetivo', e.target.value)}
                placeholder="Ex.: Agendar uma consulta/avaliação para o lead. Guia a análise de interesse na tela de conversas."
              />
            </Section>

            <Section titulo="Followup automático">
              <Field label="Tempo sem resposta do lead para entrar em followup (minutos)">
                <input
                  type="number"
                  min={0}
                  className={inputCls}
                  style={inputStyle}
                  value={form.tempo_followup_min ?? ''}
                  onChange={(e) => setF('tempo_followup_min', e.target.value === '' ? null : Number(e.target.value))}
                  placeholder="vazio ou 0 = desligado · ex.: 1440 = 1 dia"
                />
              </Field>
            </Section>

            <Section titulo="Transferência para humano">
              <Field label="Responsável que assume a conversa quando a IA faz handoff">
                <select
                  className={inputCls}
                  style={inputStyle}
                  value={form.codigo_responsavel ?? ''}
                  onChange={(e) => setF('codigo_responsavel', e.target.value)}
                >
                  <option value="">Nenhum — só marca como escalado (sem rotear)</option>
                  {atendentes.map((u) => (
                    <option key={u.id} value={u.id}>{u.nome}</option>
                  ))}
                </select>
              </Field>
              {atendentes.length === 0 && (
                <p className="text-xs mt-1" style={{ color: 'var(--ws-danger, #c80010)' }}>
                  Nenhum usuário com permissão de atender canais neste workspace — habilite
                  &ldquo;atender canais&rdquo; em algum usuário para poder escolher um responsável.
                </p>
              )}
              <p className="text-xs mt-1" style={{ color: 'var(--ws-text-3)' }}>
                Definido: quando o agente não consegue responder (baixa confiança, erro…) ou quando o
                cliente pede um atendente, a conversa é atribuída a essa pessoa, a IA desliga e a
                thread ganha uma nota com o resumo. Vazio = comportamento atual.
              </p>
            </Section>

            {editId && (
              <Section titulo={`Ajustes de resposta salvos${ajustes.length ? ` (${ajustes.length})` : ''}`}>
                {ajustes.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--ws-text-2)' }}>
                    Nenhuma sugestão ainda. Use o ícone ✨ no rodapé das mensagens do agente, na tela de conversas.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {ajustes.map((a) => (
                      <div key={a.id} style={{ border: '1px solid var(--ws-glass-border)', borderRadius: 8, padding: 8 }}>
                        <div className="flex items-start justify-between gap-2">
                          <div style={{ minWidth: 0 }}>
                            {a.categoria && <span className="text-xs font-medium" style={{ color: '#3E5BFF' }}>{a.categoria}</span>}
                            <p className="text-sm" style={{ color: 'var(--ws-text-1)', margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{a.resposta_sugerida}</p>
                            {a.resposta_original && (
                              <p className="text-xs" style={{ color: 'var(--ws-text-3)', margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>Era: {a.resposta_original}</p>
                            )}
                          </div>
                          <button type="button" onClick={() => onRemoverAjuste(a.id)} title="Remover" style={{ color: 'var(--ws-coral)', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}
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

const DIRETRIZES_MAX = 4000

function DiretrizesTab({ ws }: { ws: string | null }) {
  const { carregando, salvando, carregar, salvar } = useDiretrizes()
  const [texto, setTexto] = useState('')
  const [original, setOriginal] = useState('')

  useEffect(() => {
    if (!ws) return
    let vivo = true
    carregar(ws)
      .then((d) => { if (vivo) { setTexto(d.diretrizes || ''); setOriginal(d.diretrizes || '') } })
      .catch(() => { if (vivo) { setTexto(''); setOriginal('') } })
    return () => { vivo = false }
  }, [ws, carregar])

  if (!ws) return <p className="text-sm" style={{ color: 'var(--ws-text-2)' }}>Selecione um workspace.</p>

  const sujo = texto !== original

  async function onSalvar() {
    if (!ws) return
    try {
      const d = await salvar(ws, texto)
      setOriginal(d.diretrizes || '')
      setTexto(d.diretrizes || '')
      toast.success('Diretrizes salvas')
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar diretrizes')
    }
  }

  return (
    <div className="max-w-3xl">
      <Section titulo="Diretrizes do workspace">
        <p className="text-sm" style={{ color: 'var(--ws-text-2)' }}>
          Regras que valem para <strong>todos os agentes deste workspace</strong> — injetadas no
          início do prompt de cada resposta (identidade da marca, tom, o que pode e o que não pode,
          assinatura…). A data e a hora atuais já são fornecidas automaticamente aos agentes.
        </p>
        <Field label="Diretrizes (até 4000 caracteres)">
          <textarea
            className={inputCls}
            style={{ ...inputStyle, minHeight: 220, resize: 'vertical' }}
            value={texto}
            maxLength={DIRETRIZES_MAX}
            disabled={carregando}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={'Ex.: Você representa a Clínica X, especializada em estética.\n- Atenda com cordialidade e objetividade.\n- Nunca prometa preços ou descontos.\n- Encerre as mensagens com "Equipe Clínica X".'}
          />
        </Field>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: sujo ? 'var(--ws-coral)' : 'var(--ws-text-2)' }}>
            {carregando ? 'Carregando…' : sujo ? 'Alterações não salvas' : `${texto.length}/${DIRETRIZES_MAX}`}
          </span>
          <button
            onClick={onSalvar}
            disabled={salvando || carregando || !sujo}
            className="px-3 py-2 text-sm rounded-lg font-medium inline-flex items-center gap-2"
            style={{ background: '#c9a84c', color: '#1a1205', opacity: salvando || carregando || !sujo ? 0.6 : 1 }}
          >
            {salvando && <Loader2 size={15} className="animate-spin" />} Salvar diretrizes
          </button>
        </div>
      </Section>
    </div>
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
  const { providers, carregar, salvarToken, adicionarModelo, removerModelo, carregarModelos } = hook
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({})
  const [modeloInputs, setModeloInputs] = useState<Record<string, string>>({})
  const [carregandoModelos, setCarregandoModelos] = useState<Record<string, boolean>>({})

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

  async function onCarregarModelos(p: LlmProvider) {
    if (!p.token_configurado) { toast.error(`Salve o token de ${p.nome} primeiro`); return }
    setCarregandoModelos((s) => ({ ...s, [p.id]: true }))
    try {
      const res = await carregarModelos(p.id)
      toast.success(`${res.inseridos} novo(s) modelo(s) — ${res.total} no total em ${p.nome}`)
      carregar()
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar modelos do provider')
    } finally {
      setCarregandoModelos((s) => ({ ...s, [p.id]: false }))
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
            <button
              onClick={() => onCarregarModelos(p)}
              disabled={!p.token_configurado || !!carregandoModelos[p.id]}
              title="Busca os modelos disponíveis no provider usando o token salvo"
              className="px-3 py-2 text-sm rounded-lg font-medium border inline-flex items-center gap-1.5 disabled:opacity-50"
              style={{ borderColor: 'var(--ws-blue)', color: 'var(--ws-blue)' }}
            >
              {carregandoModelos[p.id] ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Carregar modelos
            </button>
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
