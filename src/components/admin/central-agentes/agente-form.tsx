'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { useWorkspace } from '@/lib/workspace-context'
import api from '@/lib/api-client'
import { type AgenteInput, type HorarioItem, useAgentes } from '@/hooks/use-agentes'
import { useLlmProviders } from '@/hooks/use-llm-providers'
import { useAjustesResposta, type AjusteResposta } from '@/hooks/use-ajustes-resposta'
import { useAgentesDisponiveis } from '@/hooks/use-agentes-disponiveis'
import { useRascunho } from '@/hooks/use-rascunho'
import { BaseConhecimentoManager } from '@/components/admin/central-agentes/BaseConhecimentoManager'
import { Field, inputCls, inputStyle, Section } from '@/components/admin/central-agentes/form-ui'

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const TONS = ['', 'formal', 'informal', 'tecnico', 'amigavel']
const LISTA = '/admin/central-agentes'

type CanalLite = { id: string; nome: string; tipo?: string | null }

function emptyForm(): AgenteInput {
  return {
    nome: '', descricao: '', provider_id: null, modelo: null, status: 'inativo', tom: '',
    idiomas: [], blacklist_topicos: [], threshold_confianca: 0.7, debounce_segundos: 40,
    limite_tokens_dia: null, alerta_threshold_pct: 80, mensagem_abertura: '', objetivo: '', tempo_followup_min: null, codigo_responsavel: '', horario_modo: 'dentro', canais: [],
    horarios: [], prompt: '',
  }
}

const eq = (a: AgenteInput, b: AgenteInput) => JSON.stringify(a) === JSON.stringify(b)

export function AgenteForm({ agenteId, wsParam }: { agenteId?: string; wsParam?: string }) {
  const router = useRouter()
  const { user } = useAuth()
  const { workspaceAtual } = useWorkspace()
  const ws = wsParam ?? workspaceAtual
  const editId = agenteId ?? null
  const wsQuery = ws ? `?ws=${ws}` : ''

  const { obter, criar, atualizar } = useAgentes(ws)
  const { providers, carregar: carregarProviders } = useLlmProviders()
  const { listar: listarAjustes, remover: removerAjuste } = useAjustesResposta()
  // Responsáveis = usuários que podem atender canais no workspace (igual à transferência manual).
  const { agentes: atendentes } = useAgentesDisponiveis(ws ?? undefined)

  const [canais, setCanais] = useState<CanalLite[]>([])
  const [form, setForm] = useState<AgenteInput>(emptyForm())
  const [inicial, setInicial] = useState<AgenteInput>(emptyForm())
  const [carregando, setCarregando] = useState(Boolean(agenteId))
  const [salvando, setSalvando] = useState(false)
  const [publicando, setPublicando] = useState(false)
  const [ajustes, setAjustes] = useState<AjusteResposta[]>([])

  // Heurística #5 — rascunho não se perde silenciosamente.
  const { rascunho, temRascunho, salvar: salvarRascunho, limpar: limparRascunho, descartar: descartarRascunho } =
    useRascunho<AgenteInput>(`central-agente:${agenteId ?? 'novo'}`)
  const [ofereceRascunho, setOfereceRascunho] = useState(false)

  const isAdmin = user?.role === 'platform_admin'

  useEffect(() => { carregarProviders() }, [carregarProviders])

  useEffect(() => {
    if (!ws) { setCanais([]); return }
    api.get<CanalLite[]>(`/workspaces/${ws}/canais`).then(setCanais).catch(() => setCanais([]))
  }, [ws])

  // Carga do agente no editar — só quando ws e id presentes (evita 404 na rehidratação do ws).
  const carregadoRef = useRef(false)
  useEffect(() => {
    if (!agenteId || !ws || carregadoRef.current) return
    carregadoRef.current = true
    setCarregando(true)
    obter(agenteId)
      .then((a) => {
        const f: AgenteInput = {
          nome: a.nome, descricao: a.descricao ?? '', provider_id: a.provider_id, modelo: a.modelo,
          status: a.status === 'ativo' ? 'ativo' : 'inativo', tom: a.tom ?? '', idiomas: a.idiomas,
          blacklist_topicos: a.blacklist_topicos, threshold_confianca: a.threshold_confianca,
          debounce_segundos: a.debounce_segundos, limite_tokens_dia: a.limite_tokens_dia,
          alerta_threshold_pct: a.alerta_threshold_pct, mensagem_abertura: a.mensagem_abertura ?? '',
          objetivo: a.objetivo ?? '', tempo_followup_min: a.tempo_followup_min ?? null, codigo_responsavel: a.codigo_responsavel ?? '', horario_modo: a.horario_modo === 'fora' ? 'fora' : 'dentro',
          canais: a.canais.map((c) => c.canal_id), prompt: a.prompt_draft ?? '',
          horarios: a.horarios.map((h) => ({ dia_semana: h.dia_semana, hora_inicio: h.hora_inicio, hora_fim: h.hora_fim, ativo: h.ativo })),
        }
        setForm(f)
        setInicial(f)
      })
      .catch((e: any) => { toast.error(e?.message || 'Erro ao carregar agente'); router.push(LISTA) })
      .finally(() => setCarregando(false))
  }, [agenteId, ws, obter, router])

  // Ajustes de resposta (edit-only).
  useEffect(() => {
    if (!agenteId || !ws) return
    listarAjustes(ws, agenteId).then(setAjustes).catch(() => setAjustes([]))
  }, [agenteId, ws, listarAjustes])

  // Oferece restaurar o rascunho persistido se diferente do estado base.
  useEffect(() => {
    if (temRascunho && rascunho && !eq(rascunho, inicial)) setOfereceRascunho(true)
  }, [temRascunho, rascunho, inicial])

  const dirty = useMemo(() => !eq(form, inicial), [form, inicial])

  // Autosave do rascunho a cada mudança (após carregar e só quando há alteração real).
  useEffect(() => {
    if (carregando || !dirty) return
    salvarRascunho(form)
  }, [form, carregando, dirty, salvarRascunho])

  const modelosDoProvider = useMemo(
    () => providers.find((p) => p.id === form.provider_id)?.modelos.filter((m) => m.ativo) ?? [],
    [providers, form.provider_id],
  )

  const setF = useCallback(<K extends keyof AgenteInput>(k: K, v: AgenteInput[K]) => setForm((f) => ({ ...f, [k]: v })), [])

  function restaurarRascunho() {
    if (rascunho) setForm(rascunho)
    setOfereceRascunho(false)
  }
  function descartarRascunhoLocal() {
    descartarRascunho()
    setOfereceRascunho(false)
  }

  const voltar = useCallback(() => {
    if (dirty && !confirm('Descartar alterações não salvas?')) return
    router.push(LISTA)
  }, [dirty, router])

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

  async function salvar() {
    if (!ws) { toast.error('Selecione um workspace'); return }
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    setSalvando(true)
    try {
      const payload: AgenteInput = { ...form, descricao: form.descricao || null, tom: form.tom || null, mensagem_abertura: form.mensagem_abertura || null, objetivo: form.objetivo || null }
      if (editId) {
        await atualizar(editId, payload)
        limparRascunho()
        setInicial(form)
        toast.success('Agente atualizado')
        router.push(LISTA)
      } else {
        const novo = await criar(payload)
        limparRascunho()
        toast.success('Agente criado')
        // Vai para a edição: destrava Publicar prompt e Base de conhecimento (edit-only).
        router.replace(`${LISTA}/${novo.id}/editar${wsQuery}`)
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  if (!isAdmin) {
    return <div className="p-8 text-sm" style={{ color: 'var(--ws-text-2)' }}>Acesso restrito a platform_admin.</div>
  }
  if (!ws) {
    return (
      <div className="p-8 text-sm" style={{ color: 'var(--ws-text-2)' }}>
        Selecione um workspace na{' '}
        <button onClick={() => router.push(LISTA)} className="font-medium" style={{ color: '#c9a84c' }}>Central de Agentes</button>.
      </div>
    )
  }

  const tituloPublicar = editId ? (
    <button onClick={publicarPrompt} disabled={publicando} className="px-3 py-1.5 text-xs font-medium rounded-lg border" style={{ borderColor: 'var(--ws-glass-border)', color: 'var(--ws-text-1)' }}>
      {publicando ? 'Publicando…' : 'Publicar versão'}
    </button>
  ) : undefined

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5" style={{ maxWidth: 1180, margin: '0 auto' }}>
        <button
          onClick={voltar}
          aria-label="Voltar"
          className="inline-flex items-center justify-center rounded-lg border shrink-0"
          style={{ width: 38, height: 38, borderColor: 'var(--ws-glass-border)', color: 'var(--ws-text-1)', background: 'var(--card)' }}
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ minWidth: 0 }}>
          <h1 className="ds-page-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {editId ? `Editar: ${form.nome || 'agente'}` : 'Novo agente'}
          </h1>
          <p className="text-sm" style={{ color: 'var(--ws-text-2)' }}>
            {editId ? 'Configure comportamento, modelo, canais e transferência do agente.' : 'Crie um agente de IA de atendimento. Salve para liberar prompt publicado e base de conhecimento.'}
          </p>
        </div>
      </div>

      {/* Banner de rascunho */}
      {ofereceRascunho && (
        <div
          className="flex flex-wrap items-center gap-3 mb-4 rounded-lg px-4 py-3 text-sm"
          style={{ maxWidth: 1180, margin: '0 auto 16px', border: '1px solid rgba(201,168,76,0.4)', background: 'rgba(201,168,76,0.10)', color: 'var(--ws-text-1)' }}
        >
          <span>Há um rascunho não salvo deste formulário.</span>
          <button onClick={restaurarRascunho} className="px-3 py-1.5 text-xs font-medium rounded-lg" style={{ background: '#c9a84c', color: '#1a1205' }}>Restaurar</button>
          <button onClick={descartarRascunhoLocal} className="px-3 py-1.5 text-xs font-medium rounded-lg border" style={{ borderColor: 'var(--ws-glass-border)', color: 'var(--ws-text-2)' }}>Descartar</button>
        </div>
      )}

      {carregando ? (
        <div className="flex justify-center p-16"><Loader2 className="animate-spin" size={22} style={{ color: 'var(--ws-text-2)' }} /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ maxWidth: 1180, margin: '0 auto' }}>
          <Section titulo="Identidade">
            <Field label="Nome">
              <input className={inputCls} style={inputStyle} value={form.nome} onChange={(e) => setF('nome', e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Descrição">
                <input className={inputCls} style={inputStyle} value={form.descricao ?? ''} onChange={(e) => setF('descricao', e.target.value)} />
              </Field>
              <Field label="Tom / persona">
                <select className={inputCls} style={inputStyle} value={form.tom ?? ''} onChange={(e) => setF('tom', e.target.value)}>
                  {TONS.map((t) => <option key={t} value={t}>{t || '— nenhum —'}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          <Section titulo="Modelo & Provider">
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
              <Field label="Limite de tokens/dia">
                <input type="number" min={0} className={inputCls} style={inputStyle} value={form.limite_tokens_dia ?? ''} onChange={(e) => setF('limite_tokens_dia', e.target.value === '' ? null : Number(e.target.value))} />
              </Field>
              <Field label="Alerta de consumo (%)">
                <input type="number" min={0} max={100} className={inputCls} style={inputStyle} value={form.alerta_threshold_pct ?? 80} onChange={(e) => setF('alerta_threshold_pct', Number(e.target.value))} />
              </Field>
            </div>
          </Section>

          <Section titulo="Prompt do sistema (rascunho)" full action={tituloPublicar}>
            <textarea className={inputCls} style={{ ...inputStyle, minHeight: 300, resize: 'vertical' }} value={form.prompt ?? ''} onChange={(e) => setF('prompt', e.target.value)} placeholder="Você é o assistente de atendimento da empresa…" />
            {editId ? (
              <p className="text-xs" style={{ color: 'var(--ws-text-2)' }}>&ldquo;Publicar versão&rdquo; salva o rascunho e cria uma versão publicada (a que o agente usa nas respostas).</p>
            ) : (
              <p className="text-xs" style={{ color: 'var(--ws-text-2)' }}>Salve o agente para publicar versões do prompt.</p>
            )}
          </Section>

          <Section titulo="Objetivo do agente">
            <textarea
              className={inputCls}
              style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
              value={form.objetivo ?? ''}
              onChange={(e) => setF('objetivo', e.target.value)}
              placeholder="Ex.: Agendar uma consulta/avaliação para o lead. Guia a análise de interesse na tela de conversas."
            />
          </Section>

          <Section titulo="Mensagem de abertura">
            <input className={inputCls} style={inputStyle} value={form.mensagem_abertura ?? ''} onChange={(e) => setF('mensagem_abertura', e.target.value)} />
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

          <Section titulo="Horários de funcionamento">
            <div>
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

          <Section titulo="Confiança & Debounce">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Threshold de confiança (0–1)">
                <input type="number" step="0.05" min={0} max={1} className={inputCls} style={inputStyle} value={form.threshold_confianca ?? 0.7} onChange={(e) => setF('threshold_confianca', Number(e.target.value))} />
              </Field>
              <Field label="Debounce (segundos)">
                <input type="number" min={0} max={3600} className={inputCls} style={inputStyle} value={form.debounce_segundos ?? 40} onChange={(e) => setF('debounce_segundos', Number(e.target.value))} />
              </Field>
            </div>
          </Section>

          <Section titulo="Transferência para humano">
            <Field label="Responsável que assume a conversa quando a IA faz handoff">
              <select className={inputCls} style={inputStyle} value={form.codigo_responsavel ?? ''} onChange={(e) => setF('codigo_responsavel', e.target.value)}>
                <option value="">Nenhum — só marca como escalado (sem rotear)</option>
                {atendentes.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </Field>
            {atendentes.length === 0 && (
              <p className="text-xs" style={{ color: 'var(--ws-danger, #c80010)' }}>
                Nenhum usuário com permissão de atender canais neste workspace — habilite &ldquo;atender canais&rdquo; em algum usuário para poder escolher um responsável.
              </p>
            )}
            <p className="text-xs" style={{ color: 'var(--ws-text-3)' }}>
              Definido: quando o agente não consegue responder (baixa confiança, erro…) ou o cliente pede um atendente, a conversa é atribuída a essa pessoa, a IA desliga e a thread ganha uma nota com o resumo. Vazio = comportamento atual.
            </p>
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

          <Section titulo="Base de conhecimento (RAG)" full>
            {editId ? (
              <BaseConhecimentoManager workspaceId={ws} agenteId={editId} />
            ) : (
              <p className="text-xs" style={{ color: 'var(--ws-text-2)' }}>Salve o agente primeiro para indexar documentos/FAQs.</p>
            )}
          </Section>

          {editId && (
            <Section titulo={`Ajustes de resposta salvos${ajustes.length ? ` (${ajustes.length})` : ''}`} full>
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
      )}

      {/* Footer fixo */}
      <div style={{ position: 'sticky', bottom: 0, marginTop: 24, paddingTop: 12, paddingBottom: 12, background: 'var(--card)', borderTop: '1px solid var(--ws-glass-border)' }}>
        <div className="flex justify-end gap-2" style={{ maxWidth: 1180, margin: '0 auto' }}>
          <button onClick={voltar} className="px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--ws-glass-border)', color: 'var(--ws-text-2)' }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="px-4 py-2 text-sm rounded-lg font-medium inline-flex items-center gap-2" style={{ background: '#c9a84c', color: '#1a1205' }}>
            {salvando && <Loader2 size={15} className="animate-spin" />}{editId ? 'Salvar' : 'Criar agente'}
          </button>
        </div>
      </div>
    </div>
  )
}
