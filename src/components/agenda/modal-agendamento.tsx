'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { format, parseISO, addMinutes, startOfDay, isBefore, parse } from 'date-fns'
import { toast } from 'sonner'
import {
  Agenda,
  Agendamento,
  AgendamentoStatus,
  STATUS_LABELS,
  STATUS_COLORS,
} from '@/types/agenda'
import { useServicos } from '@/hooks/use-servicos'
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

interface ModalAgendamentoProps {
  aberto: boolean
  onFechar: () => void
  agendas?: Agenda[]
  agendamentoInicial?: Agendamento | null // null = criação, objeto = edição
  dataInicial?: string // pré-preenche data se veio de clique no slot
  horaInicial?: string // pré-preenche hora se veio de clique no slot
  agendaIdInicial?: string // pré-preenche agenda
  onSalvar: (agendamento: Partial<Agendamento>) => void
}

// Cabeçalho de seção (semântico, lê nos 2 temas)
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
  // Estados do formulário
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [agendaId, setAgendaId] = useState('')
  const [data, setData] = useState('')
  const [hora, setHora] = useState('')
  const [duracao, setDuracao] = useState(30)
  const [servico, setServico] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [status, setStatus] = useState<AgendamentoStatus>('agendado')
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [controleAberto, setControleAberto] = useState(false)
  const [servicoId, setServicoId] = useState('')

  // Serviços do catálogo da agenda selecionada (+ os do workspace, agenda_id null)
  const { servicos } = useServicos(agendaId)

  // Sincroniza estados com agendamentoInicial ao abrir
  useEffect(() => {
    if (aberto) {
      if (agendamentoInicial) {
        const d = parseISO(agendamentoInicial.data_hora_inicio)
        setNome(agendamentoInicial.cliente_nome)
        setTelefone(agendamentoInicial.cliente_telefone)
        setEmail(agendamentoInicial.cliente_email || '')
        setAgendaId(agendamentoInicial.agenda_id)
        setData(format(d, 'yyyy-MM-dd'))
        setHora(format(d, 'HH:mm'))

        const fim = parseISO(agendamentoInicial.data_hora_fim)
        const diff = (fim.getTime() - d.getTime()) / (1000 * 60)
        setDuracao(diff)

        setServico(agendamentoInicial.servico || '')
        setServicoId(agendamentoInicial.servico_id || '')
        setObservacoes(agendamentoInicial.observacoes || '')
        setStatus(agendamentoInicial.status)
        setMotivoCancelamento(agendamentoInicial.cancelamento_motivo || '')
        setControleAberto(true)
      } else {
        // Reset para novo agendamento
        setNome('')
        setTelefone('')
        setEmail('')
        setAgendaId(agendaIdInicial || agendas[0]?.id || '')
        setData(dataInicial || format(new Date(), 'yyyy-MM-dd'))
        setHora(horaInicial || '09:00')
        setDuracao(30)
        setServico('')
        setServicoId('')
        setObservacoes('')
        setStatus('agendado')
        setMotivoCancelamento('')
        setControleAberto(false)
      }
    }
  }, [aberto, agendamentoInicial, dataInicial, horaInicial, agendaIdInicial, agendas])

  // Máscara de telefone (5511999999999)
  const handleTelefoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '')
    if (value.length <= 13) {
      setTelefone(value)
    }
  }

  // Gera slots de horários
  const slots = useMemo(() => {
    const s = []
    for (let h = 7; h <= 21; h++) {
      for (let m = 0; m < 60; m += 30) {
        const hh = h.toString().padStart(2, '0')
        const mm = m.toString().padStart(2, '0')
        s.push(`${hh}:${mm}`)
      }
    }
    return s
  }, [])

  const handleSalvar = () => {
    // Validações
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
    if (!data || !hora) {
      toast.error('Data e horário são obrigatórios')
      return
    }

    const dataHoraInicio = parse(`${data} ${hora}`, 'yyyy-MM-dd HH:mm', new Date())
    const dataHoraFim = addMinutes(dataHoraInicio, duracao)

    if (isBefore(dataHoraInicio, startOfDay(new Date()))) {
      toast.warning('Atenção: O agendamento está sendo criado em uma data passada.')
    }

    const payload: Partial<Agendamento> = {
      id: agendamentoInicial?.id,
      agenda_id: agendaId,
      cliente_nome: nome,
      cliente_telefone: telefone,
      cliente_email: email || undefined,
      data_hora_inicio: dataHoraInicio.toISOString(),
      data_hora_fim: dataHoraFim.toISOString(),
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
            {agendamentoInicial
              ? `ID: ${agendamentoInicial.id.slice(0, 8)}`
              : 'Preencha os dados abaixo'}
          </DialogDescription>
        </DialogHeader>

        {/* Corpo rolável */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* SEÇÃO: CLIENTE */}
          <SectionTitle>Cliente</SectionTitle>
          <div className="space-y-3">
            <Field label="Nome do cliente" required>
              <Input
                placeholder="Nome completo"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Telefone / WhatsApp" required>
                <Input
                  type="tel"
                  placeholder="5511999999999"
                  value={telefone}
                  onChange={handleTelefoneChange}
                />
              </Field>
              <Field label="E-mail">
                <Input
                  type="email"
                  placeholder="cliente@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
            </div>
          </div>

          {/* SEÇÃO: AGENDAMENTO */}
          <SectionTitle>Agendamento</SectionTitle>
          <div className="space-y-3">
            <Field label="Agenda" required>
              <Select value={agendaId} onValueChange={setAgendaId}>
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue placeholder="Selecione uma agenda" />
                </SelectTrigger>
                <SelectContent>
                  {agendas?.map((agenda) => (
                    <SelectItem key={agenda.id} value={agenda.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: agenda.cor || 'var(--primary)' }}
                        />
                        {agenda.nome}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Data" required>
                <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </Field>
              <Field label="Horário" required>
                <Select value={hora} onValueChange={setHora}>
                  <SelectTrigger className="h-8 w-full text-sm">
                    <SelectValue placeholder="Horário" />
                  </SelectTrigger>
                  <SelectContent>
                    {slots.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {servicos.length > 0 && (
              <Field label="Serviço (catálogo)">
                <Select
                  value={servicoId}
                  onValueChange={(val) => {
                    const sv = servicos.find((s) => s.id === val)
                    setServicoId(val)
                    if (sv) {
                      setServico(sv.nome)
                      setDuracao(sv.duracao_minutos)
                    }
                  }}
                >
                  <SelectTrigger className="h-8 w-full text-sm">
                    <SelectValue placeholder="— escolher do catálogo —" />
                  </SelectTrigger>
                  <SelectContent>
                    {servicos.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome} ({s.duracao_minutos} min
                        {s.preco != null ? ` · R$ ${Number(s.preco).toFixed(2)}` : ''})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Duração">
                <Select value={String(duracao)} onValueChange={(v) => setDuracao(Number(v))}>
                  <SelectTrigger className="h-8 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[15, 30, 45, 60, 90, 120].map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {m < 60 ? `${m} min` : `${m / 60}h${m % 60 !== 0 ? ` ${m % 60}min` : ''}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Serviço / Interesse">
                <Input
                  placeholder="Ex: Avaliação"
                  value={servico}
                  onChange={(e) => {
                    setServico(e.target.value)
                    setServicoId('')
                  }}
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
                  <span
                    className="size-2 rounded-full"
                    style={{ background: STATUS_COLORS[status] }}
                  />
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
