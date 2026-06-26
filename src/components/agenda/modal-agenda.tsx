'use client'

import React, { useState, useEffect } from 'react'
import { Trash2, CheckCircle2, Loader2 } from 'lucide-react'
import { Agenda, AgendaCor, AgendaTipo } from '@/types/agenda'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'

interface ModalAgendaProps {
  aberto: boolean
  onFechar: () => void
  agendaInicial?: Agenda | null
  onSalvar: (agenda: Partial<Agenda>) => void
  onDeletar?: (id: string) => void
}

const CORES_DISPONIVEIS: { hex: AgendaCor; nome: string }[] = [
  { hex: '#006EFF', nome: 'Azul' },
  { hex: '#0fa856', nome: 'Verde' },
  { hex: '#FF5C8D', nome: 'Coral' },
  { hex: '#7A5AF8', nome: 'Roxo' },
  { hex: '#00b8c8', nome: 'Cyan' },
  { hex: '#F5A623', nome: 'Dourado' },
  { hex: '#FF8C00', nome: 'Laranja' },
  { hex: '#6B7280', nome: 'Cinza' },
]

const FUSOS_HORARIOS = [
  { value: 'America/Sao_Paulo', label: 'Horário de Brasília (GMT-3)' },
  { value: 'America/Rio_Branco', label: 'Horário do Acre (GMT-5)' },
  { value: 'America/Noronha', label: 'Horário de Fernando de Noronha (GMT-2)' },
  { value: 'America/Manaus', label: 'Horário de Manaus (GMT-4)' },
]

export function ModalAgenda({
  aberto,
  onFechar,
  agendaInicial,
  onSalvar,
  onDeletar,
}: ModalAgendaProps) {
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<AgendaTipo>('profissional')
  const [cor, setCor] = useState<AgendaCor>('#006EFF')
  const [capacidade, setCapacidade] = useState(1)
  const [fuso, setFuso] = useState('America/Sao_Paulo')
  const [webhook, setWebhook] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [confirmandoDelecao, setConfirmandoDelecao] = useState(false)
  const [salvando, setSalvando] = useState(false)

  // Sincronizar campos quando o modal abre ou a agenda inicial muda
  useEffect(() => {
    if (aberto) {
      if (agendaInicial) {
        setNome(agendaInicial.nome)
        setTipo(agendaInicial.tipo)
        setCor(agendaInicial.cor)
        setCapacidade(agendaInicial.capacidade_simultanea)
        setFuso(agendaInicial.fuso_horario)
        setWebhook(agendaInicial.webhook_url || '')
        setAtivo(agendaInicial.ativo)
      } else {
        // Reset para nova agenda
        setNome('')
        setTipo('profissional')
        setCor('#006EFF')
        setCapacidade(1)
        setFuso('America/Sao_Paulo')
        setWebhook('')
        setAtivo(true)
      }
      setConfirmandoDelecao(false)
    }
  }, [aberto, agendaInicial])

  const handleSalvar = async () => {
    if (!nome) {
      toast.error('O nome da agenda é obrigatório')
      return
    }

    setSalvando(true)
    try {
      await onSalvar({
        nome,
        tipo,
        cor,
        capacidade_simultanea: capacidade,
        fuso_horario: fuso,
        webhook_url: webhook || undefined,
        ativo,
      })
      toast.success(agendaInicial ? 'Agenda atualizada!' : 'Agenda criada com sucesso!')
      onFechar()
    } catch (error) {
      toast.error('Erro ao salvar agenda')
    } finally {
      setSalvando(false)
    }
  }

  const handleDeletar = () => {
    if (confirmandoDelecao && agendaInicial?.id && onDeletar) {
      onDeletar(agendaInicial.id)
      onFechar()
    } else {
      setConfirmandoDelecao(true)
    }
  }

  const webhookValido = webhook.startsWith('http://') || webhook.startsWith('https://')

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar() }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border">
          <DialogTitle>{agendaInicial ? 'Editar agenda' : 'Nova agenda'}</DialogTitle>
          <DialogDescription>
            {agendaInicial
              ? 'Ajuste as configurações desta agenda'
              : 'Configure uma nova agenda para agendamentos'}
          </DialogDescription>
        </DialogHeader>

        {/* Conteúdo */}
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {/* Nome da Agenda */}
          <div className="space-y-1.5">
            <label className="ds-label">
              Nome da agenda <span className="text-destructive">*</span>
            </label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Dr. Rafael, Sala 01"
            />
            <p className="text-xs text-muted-foreground">Nome visível no calendário.</p>
          </div>

          {/* Tipo de Agenda */}
          <div className="space-y-1.5">
            <label className="ds-label">
              Tipo <span className="text-destructive">*</span>
            </label>
            <Select value={tipo} onValueChange={(v: any) => setTipo(v)}>
              <SelectTrigger className="h-8 w-full text-sm">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="profissional">Profissional</SelectItem>
                <SelectItem value="sala">Sala</SelectItem>
                <SelectItem value="equipamento">Equipamento</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Cor da Agenda */}
          <div className="space-y-2">
            <label className="ds-label">
              Cor da agenda <span className="text-destructive">*</span>
            </label>
            <div className="flex flex-wrap gap-3">
              {CORES_DISPONIVEIS.map((item) => (
                <button
                  key={item.hex}
                  onClick={() => setCor(item.hex)}
                  title={item.nome}
                  className={`relative size-8 rounded-full transition-all duration-200 ${
                    cor === item.hex
                      ? 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-background'
                      : 'opacity-70 hover:scale-105 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: item.hex }}
                >
                  {cor === item.hex && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="size-1.5 rounded-full bg-white shadow" />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Cor usada para identificar esta agenda no calendário.
            </p>
          </div>

          {/* Capacidade e Fuso Horário em Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="ds-label">
                Capacidade <span className="text-destructive">*</span>
              </label>
              <Input
                type="number"
                min={1}
                max={10}
                value={capacidade}
                onChange={(e) => setCapacidade(parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">Agendamentos simultâneos</p>
            </div>
            <div className="space-y-1.5">
              <label className="ds-label">Fuso horário</label>
              <Select value={fuso} onValueChange={setFuso}>
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue placeholder="Selecione o fuso" />
                </SelectTrigger>
                <SelectContent>
                  {FUSOS_HORARIOS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Webhook */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="ds-label">Webhook de agendamento</label>
              {webhookValido && (
                <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={10} /> Configurado
                </Badge>
              )}
            </div>
            <Input
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
              placeholder="https://sua-url-de-callback.com/webhook"
            />
            <p className="text-xs text-muted-foreground">
              Enviamos os dados para esta URL quando um agendamento for criado ou alterado.
            </p>
          </div>

          {/* Status Ativo */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-4">
            <div className="flex items-center gap-3">
              <span
                className={`size-2 rounded-full ${ativo ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
              />
              <div>
                <p className="text-sm font-medium text-foreground">Status da agenda</p>
                <p className="text-xs text-muted-foreground">Disponível para novos agendamentos</p>
              </div>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="flex-row items-center justify-between border-t border-border sm:justify-between">
          <div>
            {agendaInicial && onDeletar && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeletar}
              >
                <Trash2 size={14} />
                {confirmandoDelecao ? 'Confirmar exclusão?' : 'Excluir agenda'}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar} disabled={salvando}>
              {salvando ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
