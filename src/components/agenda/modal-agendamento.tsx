'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { format, parseISO, differenceInMinutes } from 'date-fns'
import { toast } from 'sonner'
import {
  Agenda,
  Agendamento,
  AgendamentoStatus,
  STATUS_LABELS,
  STATUS_COLORS,
} from '@/types/agenda'
import { useServicos } from '@/hooks/use-servicos'
import { useWorkspace } from '@/lib/workspace-context'
import api from '@/lib/api-client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SlotDisp {
  inicio: string // ISO UTC
  fim: string // ISO UTC
}

interface ModalAgendamentoProps {
  aberto: boolean
  onFechar: () => void
  agendas?: Agenda[]
  agendamentoInicial?: Agendamento | null // null = criação, objeto = edição
  dataInicial?: string // pré-preenche data se veio de clique no slot
  horaInicial?: string // pré-preenche hora (HH:mm) se veio de clique no slot
  agendaIdInicial?: string // pré-preenche agenda
  onSalvar: (agendamento: Partial<Agendamento>) => void
}

const fmtHoraTz = (iso: string, fuso: string) =>
  new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: fuso }).format(new Date(iso))

const fmtDur = (min: number) =>
  min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${min % 60 !== 0 ? ` ${min % 60}min` : ''}`

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-5 mb-2 flex items-center gap-2">
    <span className="ds-label text-muted-foreground">{children}</span>
    <div className="h-px flex-1 bg-border" />
  </div>
)

const Field = ({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) => (
  <div className="flex flex-col gap-1.5">
    <label className="ds-label">
      {label} {required && <span className="text-destructive">*</span>}
    </label>
    {children}
  </div>
)

export function ModalAgendamento({
  aberto,
  onFechar,
  agendas = [],
  agendamentoInicial,
  dataInicial,
  horaInicial,
  agendaIdInicial,
  onSalvar,
}: ModalAgendamentoProps) {
  const { workspaceAtual } = useWorkspace()

  // Estados do formulário
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [agendaId, setAgendaId] = useState('')
  const [data, setData] = useState('')
  const [slotInicio, setSlotInicio] = useState('') // ISO UTC do horário escolhido
  const [servico, setServico] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [status, setStatus] = useState<AgendamentoStatus>('agendado')
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [controleAberto, setControleAberto] = useState(false)
  const [servicoId, setServicoId] = useState('')

  // Disponibilidade real da agenda no dia (já remove almoço/bloqueio/ocupados; usa a duração do cadastro)
  const [slotsDisp, setSlotsDisp] = useState<SlotDisp[]>([])
  const [carregandoSlots, setCarregandoSlots] = useState(false)

  const { servicos } = useServicos(agendaId)

  const agendaSel = agendas.find((a) => a.id === agendaId)
  const fuso = agendaSel?.fuso_horario || 'America/Sao_Paulo'

  // Sincroniza estados ao abrir
  useEffect(() => {
    if (!aberto) return
    if (agendamentoInicial) {
      const d = parseISO(agendamentoInicial.data_hora_inicio)
      setNome(agendamentoInicial.cliente_nome)
      setTelefone(agendamentoInicial.cliente_telefone)
      setEmail(agendamentoInicial.cliente_email || '')
      setAgendaId(agendamentoInicial.agenda_id)
      setData(format(d, 'yyyy-MM-dd'))
      setSlotInicio(agendamentoInicial.data_hora_inicio)
      setServico(agendamentoInicial.servico || '')
      setServicoId(agendamentoInicial.servico_id || '')
      setObservacoes(agendamentoInicial.observacoes || '')
      setStatus(agendamentoInicial.status)
      setMotivoCancelamento(agendamentoInicial.cancelamento_motivo || '')
      setControleAberto(true)
    } else {
      setNome('')
      setTelefone('')
      setEmail('')
      setAgendaId(agendaIdInicial || agendas[0]?.id || '')
      setData(dataInicial || format(new Date(), 'yyyy-MM-dd'))
      setSlotInicio('')
      setServico('')
      setServicoId('')
      setObservacoes('')
      setStatus('agendado')
      setMotivoCancelamento('')
      setControleAberto(false)
    }
  }, [aberto, agendamentoInicial, dataInicial, agendaIdInicial, agendas])

  // Busca a disponibilidade real quando agenda/data/serviço mudam
  useEffect(() => {
    if (!aberto || !agendaId || !data || !workspaceAtual) {
      setSlotsDisp([])
      return
    }
    let vivo = true
    setCarregandoSlots(true)
    const params = new URLSearchParams({ agenda_id: agendaId, data, workspace_id: workspaceAtual })
    if (servicoId) params.set('servico_id', servicoId)
    api
      .get<{ slots: SlotDisp[] }>(`/agenda/disponibilidade?${params.toString()}`)
      .then((r) => {
        if (!vivo) return
        let livres: SlotDisp[] = (r.slots || []).map((s) => ({ inicio: s.inicio, fim: s.fim }))
        // Edição: o horário atual está "ocupado" por ele mesmo → reincluir p/ poder mantê-lo.
        if (
          agendamentoInicial &&
          format(parseISO(agendamentoInicial.data_hora_inicio), 'yyyy-MM-dd') === data &&
          !livres.some((s) => s.inicio === agendamentoInicial.data_hora_inicio)
        ) {
          livres = [
            { inicio: agendamentoInicial.data_hora_inicio, fim: agendamentoInicial.data_hora_fim },
            ...livres,
          ].sort((a, b) => a.inicio.localeCompare(b.inicio))
        }
        setSlotsDisp(livres)
      })
      .catch(() => {
        if (vivo) setSlotsDisp([])
      })
      .finally(() => {
        if (vivo) setCarregandoSlots(false)
      })
    return () => {
      vivo = false
    }
  }, [aberto, agendaId, data, servicoId, workspaceAtual, agendamentoInicial])

  // Pré-seleciona o horário clicado no calendário (novo agendamento), se estiver livre
  useEffect(() => {
    if (agendamentoInicial || slotInicio || !horaInicial || slotsDisp.length === 0) return
    const m = slotsDisp.find((s) => fmtHoraTz(s.inicio, fuso) === horaInicial)
    if (m) setSlotInicio(m.inicio)
  }, [slotsDisp, horaInicial, agendamentoInicial, slotInicio, fuso])

  // Duração efetiva (regra): serviço escolhido > duração do slot do cadastro da agenda
  const duracaoMin = useMemo(() => {
    if (servicoId) {
      const sv = servicos.find((s) => s.id === servicoId)
      if (sv) return sv.duracao_minutos
    }
    if (slotsDisp.length) return differenceInMinutes(parseISO(slotsDisp[0].fim), parseISO(slotsDisp[0].inicio))
    return null
  }, [servicoId, servicos, slotsDisp])

  const handleTelefoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '')
    if (value.length <= 13) setTelefone(value)
  }

  const handleSalvar = () => {
    if (nome.trim().length < 3) {
      toast.error('O nome deve ter pelo menos 3 caracteres')
      return
    }
    if (telefone.length < 10) {
      toast.error('Telefone inválido (mínimo 10 dígitos)')
      return
    }
    if (!agendaId) {
      toast.error('Selecione uma agenda')
      return
    }
    if (!slotInicio) {
      toast.error('Escolha um horário disponível')
      return
    }
    const slot = slotsDisp.find((s) => s.inicio === slotInicio)
    const fim =
      slot?.fim ||
      (agendamentoInicial?.data_hora_inicio === slotInicio ? agendamentoInicial.data_hora_fim : null)
    if (!fim) {
      toast.error('Horário inválido. Escolha outro.')
      return
    }

    const payload: Partial<Agendamento> = {
      id: agendamentoInicial?.id,
      agenda_id: agendaId,
      cliente_nome: nome,
      cliente_telefone: telefone,
      cliente_email: email || undefined,
      data_hora_inicio: slotInicio, // já em ISO UTC (vindo da disponibilidade)
      data_hora_fim: fim,
      servico,
      servico_id: servicoId || undefined,
      observacoes,
      status,
      cancelamento_motivo: status === 'cancelado' ? motivoCancelamento : undefined,
    }

    onSalvar(payload)
    toast.success(agendamentoInicial ? 'Agendamento atualizado' : 'Agendamento criado com sucesso')
    onFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar() }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border">
          <DialogTitle>{agendamentoInicial ? 'Editar agendamento' : 'Novo agendamento'}</DialogTitle>
          <DialogDescription>
            {agendamentoInicial ? `ID: ${agendamentoInicial.id.slice(0, 8)}` : 'Preencha os dados abaixo'}
          </DialogDescription>
        </DialogHeader>

        {/* Corpo rolável */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* SEÇÃO: CLIENTE */}
          <SectionTitle>Cliente</SectionTitle>
          <div className="space-y-3">
            <Field label="Nome do cliente" required>
              <Input placeholder="Nome completo" value={nome} onChange={(e) => setNome(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Telefone / WhatsApp" required>
                <Input type="tel" placeholder="5511999999999" value={telefone} onChange={handleTelefoneChange} />
              </Field>
              <Field label="E-mail">
                <Input type="email" placeholder="cliente@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
            </div>
          </div>

          {/* SEÇÃO: AGENDAMENTO */}
          <SectionTitle>Agendamento</SectionTitle>
          <div className="space-y-3">
            <Field label="Agenda" required>
              <Select value={agendaId} onValueChange={(v) => { setAgendaId(v); setSlotInicio('') }}>
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue placeholder="Selecione uma agenda" />
                </SelectTrigger>
                <SelectContent>
                  {agendas?.map((agenda) => (
                    <SelectItem key={agenda.id} value={agenda.id}>
                      <span className="flex items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: agenda.cor || 'var(--primary)' }} />
                        {agenda.nome}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Serviço do catálogo (dirige a duração quando há) */}
            {servicos.length > 0 && (
              <Field label="Serviço (catálogo)">
                <Select
                  value={servicoId}
                  onValueChange={(val) => {
                    const sv = servicos.find((s) => s.id === val)
                    setServicoId(val)
                    if (sv) setServico(sv.nome)
                    setSlotInicio('') // a duração mudou → os horários mudam
                  }}
                >
                  <SelectTrigger className="h-8 w-full text-sm">
                    <SelectValue placeholder="— escolher do catálogo —" />
                  </SelectTrigger>
                  <SelectContent>
                    {servicos.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome} ({s.duracao_minutos} min{s.preco != null ? ` · R$ ${Number(s.preco).toFixed(2)}` : ''})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Data" required>
                <Input type="date" value={data} onChange={(e) => { setData(e.target.value); setSlotInicio('') }} />
              </Field>
              <Field label="Horário" required>
                {carregandoSlots ? (
                  <div className="flex h-8 items-center px-1 text-xs text-muted-foreground">Carregando horários…</div>
                ) : !agendaId || !data ? (
                  <div className="flex h-8 items-center px-1 text-xs text-muted-foreground">Escolha agenda e data</div>
                ) : slotsDisp.length === 0 ? (
                  <div className="flex h-8 items-center px-1 text-xs text-muted-foreground">Sem horários livres neste dia</div>
                ) : (
                  <Select value={slotInicio} onValueChange={setSlotInicio}>
                    <SelectTrigger className="h-8 w-full text-sm">
                      <SelectValue placeholder="Escolha um horário" />
                    </SelectTrigger>
                    <SelectContent>
                      {slotsDisp.map((s) => (
                        <SelectItem key={s.inicio} value={s.inicio}>
                          {fmtHoraTz(s.inicio, fuso)}
                          {agendamentoInicial?.data_hora_inicio === s.inicio ? ' (atual)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Duração (regra da agenda)">
                <div className="flex h-8 items-center rounded-lg border border-input bg-muted/40 px-2.5 text-sm text-muted-foreground">
                  {duracaoMin != null ? (
                    <>
                      {fmtDur(duracaoMin)}
                      <span className="ml-1.5 text-xs">· {servicoId ? 'do serviço' : 'do cadastro'}</span>
                    </>
                  ) : (
                    'definida pela agenda'
                  )}
                </div>
              </Field>
              <Field label="Serviço / Interesse">
                <Input
                  placeholder="Ex: Avaliação"
                  value={servico}
                  onChange={(e) => { setServico(e.target.value); setServicoId(''); setSlotInicio('') }}
                />
              </Field>
            </div>
          </div>

          {/* SEÇÃO: OBSERVAÇÕES */}
          <SectionTitle>Observações</SectionTitle>
          <Textarea
            placeholder="Detalhes adicionais..."
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={3}
          />

          {/* SEÇÃO: CONTROLE (Apenas Edição) */}
          {agendamentoInicial && (
            <div className="mt-6">
              <button
                onClick={() => setControleAberto(!controleAberto)}
                className="flex w-full items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted"
              >
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ background: STATUS_COLORS[status] }} />
                  <span className="ds-label">Controle do status</span>
                </div>
                {controleAberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {controleAberto && (
                <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted/40 p-4">
                  <Field label="Status atual">
                    <Select value={status} onValueChange={(v) => setStatus(v as AgendamentoStatus)}>
                      <SelectTrigger className="h-8 w-full text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABELS).map(([val, label]) => (
                          <SelectItem key={val} value={val}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  {status === 'cancelado' && (
                    <Field label="Motivo do cancelamento">
                      <Textarea
                        placeholder="Por que está sendo cancelado?"
                        value={motivoCancelamento}
                        onChange={(e) => setMotivoCancelamento(e.target.value)}
                        rows={2}
                      />
                    </Field>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="flex-row items-center justify-between border-t border-border sm:justify-between">
          {agendamentoInicial ? (
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm('Tem certeza que deseja excluir este agendamento?')) {
                  toast.success('Agendamento excluído')
                  onFechar()
                }
              }}
            >
              <Trash2 />
              Excluir
            </Button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar}>Salvar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
