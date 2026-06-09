'use client'

import React, { useState, useEffect } from 'react'
import { Building2, Loader2, X, ChevronDown, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'
import { wsSheetCreamInputStyle, wsSheetCreamStyle, wsSheetCreamTokens, wsSheetCreamCloseButtonStyle } from '@/components/ui/ws-sheet'
import api from '@/lib/api-client'

interface WorkspaceResumo {
  id: string
  nome: string
}

interface SyncState {
  last_run_at?: string | null
  last_run_mode?: string | null
  last_run_status?: string | null
  last_success_at?: string | null
  last_error_stage?: string | null
  last_error_message?: string | null
  last_rate_limit_usage_percent?: number | null
  cooldown_until?: string | null
}

interface AdsAccount {
  id: string
  workspace_id: string
  workspace_nome: string
  workspace_acessos?: WorkspaceResumo[]
  plataforma: 'meta' | 'google' | 'linkedin' | 'tiktok'
  account_id: string
  nome: string
  bm_id?: string | null
  status: 'ativo' | 'expirado' | 'erro'
  ativo: boolean
  sync_paused: boolean
  sincronizado_em?: string | null
  periodo_sync_inicio?: string | null
  agrupamento?: string | null
  sync_state?: SyncState | null
}

interface EditContaForm {
  account_name: string
  bm_id: string
  token_acesso: string
  agrupamento: string
  sync_paused: boolean
  workspace_ids_acesso: string[]
}

interface SyncLogEntry {
  id: string
  sync_mode: string
  started_at: string | null
  finished_at: string | null
  status: string
  stage_failed: string | null
  campaigns_upserted: number
  adsets_upserted: number
  ads_upserted: number
  request_count: number
  rate_limit_usage_pct: number | null
  duracao_segundos: number | null
}

interface Workspace {
  id: string
  nome: string
}

interface EditarContaDialogProps {
  conta: AdsAccount | null
  workspaces: Workspace[]
  onClose: () => void
  onSaved: (contaAtualizada: AdsAccount) => void
}

function emptyEditForm(): EditContaForm {
  return { account_name: '', bm_id: '', token_acesso: '', agrupamento: '', sync_paused: false, workspace_ids_acesso: [] }
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 10,
  ...wsSheetCreamInputStyle,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--ws-text-2)',
  display: 'block',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const PLATFORM_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  meta: { bg: 'rgba(0,129,251,0.12)', color: '#0081FB', label: 'Meta' },
  google: { bg: 'rgba(234,67,53,0.12)', color: '#EA4335', label: 'Google' },
  linkedin: { bg: 'rgba(10,102,194,0.12)', color: '#0A66C2', label: 'LinkedIn' },
  tiktok: { bg: 'rgba(105,201,208,0.12)', color: '#69C9D0', label: 'TikTok' },
}

const STATUS_BADGE: Record<string, { color: string; bg: string; label: string }> = {
  success: { color: '#0fa856', bg: 'rgba(15,168,86,0.10)', label: 'Sucesso' },
  error: { color: 'var(--ws-coral)', bg: 'rgba(255,92,141,0.10)', label: 'Erro' },
  rate_limited: { color: '#c9a84c', bg: 'rgba(201,168,76,0.10)', label: 'Rate limit' },
  running: { color: 'var(--ws-blue)', bg: 'rgba(62,91,255,0.10)', label: 'Executando' },
  skipped: { color: 'var(--ws-text-3)', bg: 'rgba(15,23,42,0.06)', label: 'Pulado' },
}

function formatDataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

function formatDuracao(secs: number | null): string {
  if (secs === null || secs === undefined) return '—'
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function SyncHistoricoPanel({ contaId }: { contaId: string }) {
  const [historico, setHistorico] = useState<SyncLogEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!contaId) return
    setLoading(true)
    api.get<SyncLogEntry[]>(`/meta/sync/historico/${contaId}?limit=10`)
      .then(setHistorico)
      .catch(() => setHistorico([]))
      .finally(() => setLoading(false))
  }, [contaId])

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ ...labelStyle, marginBottom: 10 }}>Histórico de Sync</div>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: 'var(--ws-text-3)', fontSize: 12 }}>
          <Loader2 size={14} className="animate-spin" /> Carregando histórico...
        </div>
      ) : historico.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--ws-text-3)', padding: '12px 0' }}>
          Nenhum sync registrado ainda.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {historico.map(entry => {
            const badge = STATUS_BADGE[entry.status] || STATUS_BADGE.skipped
            return (
              <div
                key={entry.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 70px 80px 1fr 60px',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: wsSheetCreamTokens.surface,
                  border: `1px solid ${wsSheetCreamTokens.border}`,
                  alignItems: 'center',
                  fontSize: 12,
                }}
              >
                <span style={{ color: 'var(--ws-text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {formatDataHora(entry.started_at)}
                </span>
                <span style={{ color: 'var(--ws-text-3)', fontSize: 11 }}>
                  {entry.sync_mode === 'recorrente' ? 'Auto' : 'Backfill'}
                </span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 999,
                  background: badge.bg, color: badge.color,
                  fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                }}>
                  {entry.status === 'running' && <Loader2 size={10} className="animate-spin" />}
                  {badge.label}
                </span>
                <span style={{ color: 'var(--ws-text-3)', fontSize: 11 }}>
                  {entry.campaigns_upserted > 0 || entry.ads_upserted > 0
                    ? `${entry.campaigns_upserted} camp · ${entry.ads_upserted} anúncios`
                    : entry.stage_failed ? `Falha: ${entry.stage_failed}` : '—'
                  }
                </span>
                <span style={{ color: 'var(--ws-text-3)', fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {formatDuracao(entry.duracao_segundos)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function EditarContaDialog({ conta, workspaces, onClose, onSaved }: EditarContaDialogProps) {
  const [editForm, setEditForm] = useState<EditContaForm>(emptyEditForm())
  const [addAberto, setAddAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (conta) {
      const workspaceIdsAcesso = (conta.workspace_acessos ?? [])
        .map(ws => ws.id)
        .filter(id => id !== conta.workspace_id)
      setEditForm({
        account_name: conta.nome || '',
        bm_id: conta.bm_id || '',
        token_acesso: '',
        agrupamento: conta.agrupamento || '',
        sync_paused: conta.sync_paused,
        workspace_ids_acesso: workspaceIdsAcesso,
      })
    } else {
      setEditForm(emptyEditForm())
      setAddAberto(false)
    }
  }, [conta])

  const handleClose = () => {
    setEditForm(emptyEditForm())
    setAddAberto(false)
    onClose()
  }

  async function handleSalvar() {
    if (!conta) return
    if (!editForm.account_name.trim()) {
      toast.error('Nome da conta é obrigatório')
      return
    }
    setSalvando(true)
    try {
      const tokenAcesso = editForm.token_acesso.trim()
      const payload: Record<string, unknown> = {
        account_name: editForm.account_name.trim(),
        bm_id: editForm.bm_id.trim() || null,
        agrupamento: editForm.agrupamento.trim() || null,
        sync_paused: editForm.sync_paused,
        workspace_ids_acesso: editForm.workspace_ids_acesso.filter(id => id && id !== conta.workspace_id),
      }
      if (tokenAcesso) payload.token_acesso = tokenAcesso
      const atualizada = await api.put<AdsAccount>(`/ads-accounts/${conta.id}`, payload)
      onSaved(atualizada)
      handleClose()
      toast.success('Conta atualizada com sucesso!')
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar conta')
    } finally {
      setSalvando(false)
    }
  }

  const platformBadge = conta ? PLATFORM_BADGE[conta.plataforma] : PLATFORM_BADGE.meta

  // Nome do cliente principal — derivado client-side por match com conta.workspace_id
  const principalNome = conta
    ? (workspaces.find(w => w.id === conta.workspace_id)?.nome || conta.workspace_nome || 'Sem nome')
    : 'Sem nome'

  // Opções disponíveis para adicionar: exclui o principal e os já selecionados
  const opcoesDisponiveis = conta
    ? workspaces.filter(ws => ws.id !== conta.workspace_id && !editForm.workspace_ids_acesso.includes(ws.id))
    : []

  const nomeWorkspace = (id: string) => workspaces.find(w => w.id === id)?.nome || id

  const removerAcesso = (id: string) => {
    setEditForm(prev => ({ ...prev, workspace_ids_acesso: prev.workspace_ids_acesso.filter(w => w !== id) }))
  }

  const adicionarAcesso = (id: string) => {
    setEditForm(prev => prev.workspace_ids_acesso.includes(id)
      ? prev
      : { ...prev, workspace_ids_acesso: [...prev.workspace_ids_acesso, id] })
  }

  return (
    <Dialog open={!!conta} onOpenChange={open => !open && handleClose()}>
      <DialogContent
        showCloseButton={false}
        style={{
          maxWidth: 640,
          width: '95vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          borderRadius: 16,
          overflow: 'hidden',
          ...wsSheetCreamStyle,
        }}
      >
        <DialogTitle className="sr-only">Editar Conta Ads</DialogTitle>
        <DialogDescription className="sr-only">
          Atualize os dados da conta, os clientes com acesso e a pausa de sincronização
        </DialogDescription>

        {/* Header */}
        <div style={{
          padding: '24px 28px 20px',
          borderBottom: '1px solid var(--ws-glass-border)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexShrink: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--ws-text-1)' }}>
                Editar Conta
              </h2>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '3px 8px', borderRadius: 999,
                background: platformBadge.bg, color: platformBadge.color,
                fontSize: 11, fontWeight: 600,
              }}>
                {conta?.plataforma ?? 'meta'}
              </span>
              {editForm.sync_paused && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '3px 8px', borderRadius: 999,
                  background: 'rgba(255,92,141,0.12)', color: 'var(--ws-coral)',
                  fontSize: 11, fontWeight: 600,
                }}>
                  Pausada
                </span>
              )}
            </div>
            <p style={{ fontSize: 12, color: 'var(--ws-text-2)', margin: '4px 0 0', lineHeight: 1.5 }}>
              {conta?.nome}
              {conta?.account_id ? ` · ${conta.account_id}` : ''}
            </p>
          </div>
          <button
            onClick={handleClose}
            style={{
              ...wsSheetCreamCloseButtonStyle,
              borderRadius: 8, width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--ws-text-2)', flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scroll body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Info grid */}
            <div style={{
              padding: '12px 14px', borderRadius: 10,
              background: wsSheetCreamTokens.surface, border: `1px solid ${wsSheetCreamTokens.border}`,
              display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={labelStyle}>Cliente principal</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <Building2 size={13} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conta?.workspace_nome || '—'}
                  </span>
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={labelStyle}>Account ID</div>
                <code style={{ display: 'block', fontSize: 12, color: 'var(--ws-text-2)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {conta?.account_id || '—'}
                </code>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={labelStyle}>Acessos adicionais</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>
                  {editForm.workspace_ids_acesso.length} selecionado{editForm.workspace_ids_acesso.length === 1 ? '' : 's'}
                </div>
              </div>
            </div>

            {/* Nome */}
            <div>
              <label style={labelStyle}>Nome da conta</label>
              <input
                type="text"
                value={editForm.account_name}
                onChange={e => setEditForm(prev => ({ ...prev, account_name: e.target.value }))}
                placeholder="Nome interno da conta"
                style={inputStyle}
              />
            </div>

            {/* BM ID */}
            <div>
              <label style={labelStyle}>BM ID <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
              <input
                type="text"
                value={editForm.bm_id}
                onChange={e => setEditForm(prev => ({ ...prev, bm_id: e.target.value }))}
                placeholder="ID do Business Manager"
                style={inputStyle}
              />
            </div>

            {/* Agrupamento */}
            <div>
              <label style={labelStyle}>Agrupamento <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
              <input
                type="text"
                placeholder="ex: Franquias SP, Zona Sul"
                value={editForm.agrupamento}
                onChange={e => setEditForm(prev => ({ ...prev, agrupamento: e.target.value }))}
                style={inputStyle}
              />
              <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 6 }}>
                Agrupa contas para filtros no dashboard
              </p>
            </div>

            {/* Token */}
            <div>
              <label style={labelStyle}>Token de acesso <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
              <input
                type="password"
                value={editForm.token_acesso}
                onChange={e => setEditForm(prev => ({ ...prev, token_acesso: e.target.value }))}
                placeholder="Deixe vazio para manter o token atual"
                style={inputStyle}
              />
              <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 6 }}>
                Preencha apenas para substituir o token salvo.
              </p>
            </div>

            {/* Sync pause toggle */}
            <div style={{
              padding: '14px 16px', borderRadius: 12,
              background: wsSheetCreamTokens.surface, border: `1px solid ${wsSheetCreamTokens.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>
                  Pausar sincronização
                </div>
                <p style={{ fontSize: 12, color: 'var(--ws-text-2)', margin: '4px 0 0', lineHeight: 1.5 }}>
                  Enquanto pausada, a conta não entra no scheduler e o sync manual responde como pausado.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                <Switch
                  checked={editForm.sync_paused}
                  onCheckedChange={checked => setEditForm(prev => ({ ...prev, sync_paused: checked }))}
                />
                <span style={{ fontSize: 11, fontWeight: 600, color: editForm.sync_paused ? 'var(--ws-coral)' : 'var(--ws-green)' }}>
                  {editForm.sync_paused ? 'Pausada' : 'Ativa'}
                </span>
              </div>
            </div>

            {/* Cliente principal (somente leitura) */}
            <div>
              <label style={labelStyle}>Cliente principal</label>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                borderRadius: 10, background: wsSheetCreamTokens.surface,
                border: `1px solid ${wsSheetCreamTokens.border}`,
              }}>
                <Building2 size={14} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {principalNome}
                </span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '3px 8px', borderRadius: 999,
                  background: 'rgba(62,91,255,0.10)', color: 'var(--ws-blue)',
                  fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                }}>
                  Principal
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--ws-text-3)', marginTop: 6 }}>
                O cliente principal da conta é fixo e sempre mantém acesso.
              </p>
            </div>

            {/* Clientes com acesso adicional */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>
                  Clientes com acesso adicional
                  {editForm.workspace_ids_acesso.length > 0 ? ` (${editForm.workspace_ids_acesso.length})` : ''}
                </label>
                {editForm.workspace_ids_acesso.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEditForm(prev => ({ ...prev, workspace_ids_acesso: [] }))}
                    style={{ background: 'transparent', border: 'none', fontSize: 11, color: 'var(--ws-text-3)', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Limpar seleção
                  </button>
                )}
              </div>

              {/* Chips dos selecionados */}
              {editForm.workspace_ids_acesso.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {editForm.workspace_ids_acesso.map(id => (
                    <span
                      key={id}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '5px 8px 5px 10px', borderRadius: 999,
                        background: 'rgba(62,91,255,0.08)', border: '1px solid rgba(62,91,255,0.28)',
                        fontSize: 12, color: 'var(--ws-text-1)', maxWidth: '100%',
                      }}
                    >
                      <Building2 size={12} style={{ color: 'var(--ws-blue)', flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {nomeWorkspace(id)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removerAcesso(id)}
                        aria-label={`Remover ${nomeWorkspace(id)}`}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 16, height: 16, borderRadius: 999, flexShrink: 0,
                          background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--ws-text-3)',
                        }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: '14px', borderRadius: 10, marginBottom: 10,
                  border: `1px dashed ${wsSheetCreamTokens.border}`,
                  color: 'var(--ws-text-3)', fontSize: 12, lineHeight: 1.5,
                }}>
                  Nenhum cliente adicional. Use a busca abaixo para conceder acesso.
                </div>
              )}

              {/* Combobox de busca para adicionar */}
              <Popover open={addAberto} onOpenChange={setAddAberto}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '10px 14px', borderRadius: 10,
                      background: wsSheetCreamTokens.surface, border: `1px solid ${wsSheetCreamTokens.border}`,
                      fontSize: 13, color: 'var(--ws-text-2)', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <Plus size={14} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>Adicionar cliente...</span>
                    <ChevronDown size={14} style={{ color: 'var(--ws-text-3)', flexShrink: 0 }} />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-1 bg-[rgba(255,255,255,0.97)] dark:bg-[rgba(20,28,56,0.97)] border-[1px] border-[rgba(14,20,42,0.10)] dark:border-[rgba(255,255,255,0.10)] rounded-[10px] shadow-[0_8px_32px_rgba(14,20,42,0.14),0_2px_8px_rgba(14,20,42,0.08)] backdrop-blur-[20px]"
                  align="start"
                >
                  <Command className="bg-transparent">
                    <CommandInput placeholder="Buscar cliente..." className="h-8 text-[12px]" />
                    <CommandList>
                      <CommandEmpty className="py-2 text-[11px] text-center">Nenhum cliente disponível</CommandEmpty>
                      <CommandGroup>
                        {opcoesDisponiveis.map(ws => (
                          <CommandItem
                            key={ws.id}
                            value={ws.nome}
                            onSelect={() => adicionarAcesso(ws.id)}
                            className="text-[12px] rounded-[6px] px-[10px] py-[6px] cursor-pointer transition-colors text-[#0E142A] dark:text-[rgba(255,255,255,0.80)] hover:bg-[rgba(62,91,255,0.06)] dark:hover:bg-[rgba(62,91,255,0.15)] hover:text-[#3E5BFF]"
                          >
                            <Building2 className="mr-2 h-3.5 w-3.5 opacity-60" />
                            {ws.nome}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Divider */}
            <div style={{ borderTop: `1px solid ${wsSheetCreamTokens.border}`, margin: '4px 0' }} />

            {/* Histórico de Sync */}
            {conta && <SyncHistoricoPanel contaId={conta.id} />}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '20px 28px',
          borderTop: '1px solid var(--ws-glass-border)',
          display: 'flex', gap: 12, flexShrink: 0,
        }}>
          <button
            onClick={handleClose}
            style={{
              flex: 1, height: 42, borderRadius: 10,
              background: 'transparent', border: '1px solid var(--ws-glass-border)',
              fontSize: 14, fontWeight: 500, color: 'var(--ws-text-2)', cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSalvar}
            disabled={salvando}
            style={{
              flex: 2, height: 42, borderRadius: 10,
              background: salvando ? 'rgba(62,91,255,0.5)' : 'linear-gradient(135deg, #3E5BFF, #7A5AF8)',
              border: 'none', fontSize: 14, fontWeight: 600, color: 'white',
              cursor: salvando ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: salvando ? 'none' : '0 4px 12px rgba(62,91,255,0.30)',
            }}
          >
            {salvando ? <Loader2 size={16} className="animate-spin" /> : null}
            {salvando ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
