'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, KeyRound, Loader2, Pencil, Plus, Power, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { WSTable, WSTableActions, WSTableShell, wsTableCellStyle, wsTableHeadStyle } from '@/components/ui/ws-table'
import { useAuth } from '@/hooks/use-auth'
import { useWorkspace } from '@/lib/workspace-context'
import { useAgentes } from '@/hooks/use-agentes'
import { type LlmProvider, useLlmProviders } from '@/hooks/use-llm-providers'
import { useDiretrizes } from '@/hooks/use-diretrizes'
import { UsoDashboard } from '@/components/admin/central-agentes/UsoDashboard'
import { Field, inputCls, inputStyle, Section } from '@/components/admin/central-agentes/form-ui'

type Aba = 'agentes' | 'providers' | 'uso' | 'diretrizes'

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
  const router = useRouter()
  const { user } = useAuth()
  const { workspaceAtual, workspaces, setWorkspaceAtual } = useWorkspace()
  const [aba, setAba] = useState<Aba>('agentes')

  const ws = workspaceAtual
  const { agentes, carregando, carregar, alternarStatus, excluir } = useAgentes(ws)
  const providersHook = useLlmProviders()
  const { carregar: carregarProviders } = providersHook

  useEffect(() => { carregarProviders() }, [carregarProviders])
  useEffect(() => { carregar() }, [carregar])

  const isAdmin = user?.role === 'platform_admin'
  const wsQuery = ws ? `?ws=${ws}` : ''

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
          onNovo={() => router.push(`/admin/central-agentes/novo${wsQuery}`)}
          onEditar={(id) => router.push(`/admin/central-agentes/${id}/editar${wsQuery}`)}
          onToggle={toggle}
          onRemover={remover}
        />
      )}
      {aba === 'providers' && <ProvidersTab hook={providersHook} />}
      {aba === 'diretrizes' && <DiretrizesTab ws={ws} />}
      {aba === 'uso' && <UsoDashboard workspaceId={ws} />}
    </div>
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
