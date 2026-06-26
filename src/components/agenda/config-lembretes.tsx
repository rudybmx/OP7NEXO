'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
  Bell,
  Plus,
  Trash2,
  Edit2,
  MessageSquare,
  Mail,
  Smartphone,
  BellRing,
  Image as ImageIcon,
  Video,
  FileText,
  Clock,
  CheckCheck,
} from 'lucide-react'
import { LembreteConfig, LembreteCanal } from '@/types/agenda'
import { useAgendas } from '@/hooks/use-agendas'
import { useLembretes } from '@/hooks/use-lembretes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

// ─── COMPONENTE: PREVIEW WHATSAPP (cores autênticas do WhatsApp, não chrome do app) ──
function WhatsAppPreview({ template }: { template: string }) {
  const previewText = useMemo(() => {
    return (
      template
        .replace(/{{nome}}/g, 'Maria Silva')
        .replace(/{{data}}/g, '19/04/2026')
        .replace(/{{hora}}/g, '14:32')
        .replace(/{{servico}}/g, 'Avaliação Odontológica')
        .replace(/{{profissional}}/g, 'Dr. Rafael')
        .replace(/{{link_confirmacao}}/g, 'wer.sun/c/123') || 'Sua mensagem aparecerá aqui...'
    )
  }, [template])

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-[#0b141a] p-4">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40">
        <MessageSquare size={10} className="text-[#25D366]" />
        Preview WhatsApp
      </div>

      <div className="flex flex-col gap-2">
        <div className="relative max-w-[85%] self-end rounded-t-lg rounded-bl-lg bg-[#005c4b] p-3 text-sm text-white shadow-sm">
          <p className="whitespace-pre-wrap leading-relaxed">{previewText}</p>
          <div className="mt-1 flex items-center justify-end gap-1">
            <span className="text-[9px] text-white/50">14:32</span>
            <CheckCheck size={12} className="text-[#53bdeb]" />
          </div>
          <div className="absolute top-0 -right-2 h-0 w-0 border-t-[10px] border-r-[10px] border-t-[#005c4b] border-r-transparent" />
        </div>
      </div>
    </div>
  )
}

// ─── COMPONENTE: CARD DE LEMBRETE ─────────────────────────────────────────────
function ReminderCard({
  lembrete,
  onEdit,
  onDelete,
  onToggle,
}: {
  lembrete: LembreteConfig
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}) {
  const canalIcon = () => {
    switch (lembrete.canal) {
      case 'whatsapp': return <MessageSquare size={14} className="text-[#25D366]" />
      case 'email': return <Mail size={14} className="text-primary" />
      case 'sms': return <Smartphone size={14} className="text-violet-500" />
      case 'push': return <BellRing size={14} className="text-pink-500" />
      default: return <Bell size={14} />
    }
  }

  const timingText = () => {
    if (lembrete.dias_antes === 0) {
      return `No dia · ${lembrete.horas_antes}h antes`
    }
    return `${lembrete.dias_antes} ${lembrete.dias_antes === 1 ? 'dia' : 'dias'} antes · ${lembrete.hora_envio}`
  }

  return (
    <div className="relative flex items-center gap-4 rounded-lg border border-border bg-card p-5 shadow-sm transition-all hover:translate-x-1">
      {/* Linha lateral (ativo) */}
      {lembrete.ativo && <div className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-primary" />}

      {/* Toggle Ativo */}
      <Switch checked={lembrete.ativo} onCheckedChange={onToggle} />

      {/* Info */}
      <div className="flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {timingText()}
          </span>
          <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            {canalIcon()}
            <span className="capitalize">{lembrete.canal}</span>
          </div>
          {lembrete.tem_midia && <ImageIcon size={12} className="text-primary opacity-70" />}
        </div>
        <p className="line-clamp-1 text-sm italic text-muted-foreground">"{lembrete.mensagem_template}"</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={onEdit}>
          <Edit2 size={16} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onDelete} className="text-muted-foreground hover:text-destructive">
          <Trash2 size={16} />
        </Button>
      </div>
    </div>
  )
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export function ConfigLembretes() {
  const { agendas } = useAgendas()
  const { listarLembretes, salvarLembrete, excluirLembrete, alternarStatus } = useLembretes()

  const [agendaId, setAgendaId] = useState<string | null>(null) // null = Padrão (todas)
  const [panelAberto, setPanelAberto] = useState(false)
  const [lembreteEditando, setLembreteEditando] = useState<Partial<LembreteConfig> | null>(null)

  const lembretesFiltrados = useMemo(() => listarLembretes(agendaId), [agendaId, listarLembretes])

  const handleNovo = () => {
    setLembreteEditando({
      agenda_id: agendaId,
      ativo: true,
      canal: 'whatsapp',
      dias_antes: 1,
      hora_envio: '09:00',
      mensagem_template: '',
      tem_midia: false,
    })
    setPanelAberto(true)
  }

  const handleEdit = (lem: LembreteConfig) => {
    setLembreteEditando(lem)
    setPanelAberto(true)
  }

  const handleSalvar = async (data: Partial<LembreteConfig>) => {
    const success = await salvarLembrete(data)
    if (success) setPanelAberto(false)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header com select */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Bell size={20} className="text-primary" />
            Lembretes automáticos
          </h2>
          <p className="text-sm text-muted-foreground">
            Configure mensagens de confirmação e lembretes para seus pacientes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select value={agendaId || 'global'} onValueChange={(v) => setAgendaId(v === 'global' ? null : v)}>
            <SelectTrigger className="h-8 min-w-[200px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Padrão (todas as agendas)</SelectItem>
              {agendas.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={handleNovo}>
            <Plus size={16} />
            Novo lembrete
          </Button>
        </div>
      </div>

      {/* Lista de cards */}
      <div className="grid gap-3">
        {lembretesFiltrados.length > 0 ? (
          lembretesFiltrados.map((lem) => (
            <ReminderCard
              key={lem.id}
              lembrete={lem}
              onEdit={() => handleEdit(lem)}
              onDelete={() => {
                if (confirm('Deseja realmente excluir este lembrete?')) {
                  excluirLembrete(lem.id)
                }
              }}
              onToggle={() => alternarStatus(lem.id)}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <BellRing size={24} className="text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">Nenhum lembrete configurado para esta agenda.</p>
            <button onClick={handleNovo} className="text-xs font-bold uppercase text-primary hover:underline">
              Criar o primeiro
            </button>
          </div>
        )}
      </div>

      {/* Modal de Edição */}
      <PanelEdicao
        aberto={panelAberto}
        onFechar={() => setPanelAberto(false)}
        lembrete={lembreteEditando}
        onSalvar={handleSalvar}
      />
    </div>
  )
}

// ─── COMPONENTE: MODAL DE EDIÇÃO ──────────────────────────────────────────────
function PanelEdicao({
  aberto,
  onFechar,
  lembrete,
  onSalvar,
}: {
  aberto: boolean
  onFechar: () => void
  lembrete: Partial<LembreteConfig> | null
  onSalvar: (data: Partial<LembreteConfig>) => void
}) {
  const [localData, setLocalData] = useState<Partial<LembreteConfig>>({})
  const [mostraMidia, setMostraMidia] = useState(false)

  useEffect(() => {
    if (lembrete) {
      setLocalData(lembrete)
      setMostraMidia(lembrete.tem_midia || false)
    }
  }, [lembrete, aberto])

  const variables = [
    { label: 'Nome', value: '{{nome}}' },
    { label: 'Data', value: '{{data}}' },
    { label: 'Hora', value: '{{hora}}' },
    { label: 'Serviço', value: '{{servico}}' },
    { label: 'Profissional', value: '{{profissional}}' },
    { label: 'Link Confirmação', value: '{{link_confirmacao}}' },
  ]

  const insertVar = (v: string) => {
    setLocalData((prev) => ({ ...prev, mensagem_template: (prev.mensagem_template || '') + v }))
  }

  const SectionHead = ({ icon: Icon, children }: { icon: any; children: React.ReactNode }) => (
    <h4 className="ds-label flex items-center gap-2 text-primary">
      <Icon size={12} /> {children}
    </h4>
  )

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar() }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border">
          <DialogTitle>{lembrete?.id ? 'Editar lembrete' : 'Novo lembrete'}</DialogTitle>
          <DialogDescription>Configuração de sequência</DialogDescription>
        </DialogHeader>

        {/* Conteúdo rolável */}
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {/* QUANDO ENVIAR */}
          <section className="space-y-3">
            <SectionHead icon={Clock}>Quando enviar</SectionHead>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Dias antes</label>
                <Select
                  value={String(localData.dias_antes ?? 1)}
                  onValueChange={(v) => setLocalData({ ...localData, dias_antes: Number(v) })}
                >
                  <SelectTrigger className="h-8 w-full text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">No mesmo dia</SelectItem>
                    {[1, 2, 3, 5, 7, 10].map((d) => (
                      <SelectItem key={d} value={String(d)}>{d} {d === 1 ? 'dia' : 'dias'} antes</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {localData.dias_antes === 0 ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Horas antes</label>
                  <Select
                    value={String(localData.horas_antes ?? 2)}
                    onValueChange={(v) => setLocalData({ ...localData, horas_antes: Number(v) })}
                  >
                    <SelectTrigger className="h-8 w-full text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 6, 12].map((h) => (
                        <SelectItem key={h} value={String(h)}>{h}h antes</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Horário de envio</label>
                  <Input
                    type="time"
                    value={localData.hora_envio || '09:00'}
                    onChange={(e) => setLocalData({ ...localData, hora_envio: e.target.value })}
                  />
                </div>
              )}
            </div>
          </section>

          {/* CANAL */}
          <section className="space-y-3">
            <SectionHead icon={Smartphone}>Canal de comunicação</SectionHead>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: '#25D366' },
                { id: 'email', label: 'E-mail', icon: Mail, color: 'var(--primary)' },
                { id: 'sms', label: 'SMS', icon: Smartphone, color: '#7A5AF8' },
                { id: 'push', label: 'Push App', icon: BellRing, color: '#FF5C8D' },
              ].map((canal) => {
                const ativo = localData.canal === canal.id
                return (
                  <button
                    key={canal.id}
                    onClick={() => setLocalData({ ...localData, canal: canal.id as LembreteCanal })}
                    className={`flex flex-col items-center justify-center rounded-xl border p-4 transition-all ${
                      ativo ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-muted-foreground/40'
                    }`}
                  >
                    <canal.icon
                      size={24}
                      style={{ color: ativo ? canal.color : 'var(--muted-foreground)' }}
                      className="mb-2"
                    />
                    <span className={`text-xs font-semibold ${ativo ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {canal.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* MENSAGEM */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionHead icon={FileText}>Conteúdo da mensagem</SectionHead>
              <span className="text-[10px] font-bold uppercase text-muted-foreground">
                {localData.mensagem_template?.length || 0} caracteres
              </span>
            </div>

            <div className="space-y-3">
              <Textarea
                value={localData.mensagem_template || ''}
                onChange={(e) => setLocalData({ ...localData, mensagem_template: e.target.value })}
                placeholder="Escreva sua mensagem aqui..."
                rows={5}
              />

              <div className="flex flex-wrap gap-2">
                {variables.map((v) => (
                  <button
                    key={v.value}
                    onClick={() => insertVar(v.value)}
                    className="rounded-md border border-border bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground transition-all hover:border-primary hover:text-foreground"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {localData.canal === 'whatsapp' && (
              <WhatsAppPreview template={localData.mensagem_template || ''} />
            )}
          </section>

          {/* MÍDIA */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionHead icon={ImageIcon}>Mídia opcional</SectionHead>
              <Switch checked={mostraMidia} onCheckedChange={setMostraMidia} />
            </div>

            {mostraMidia && (
              <div className="space-y-4 rounded-xl border border-border bg-muted/40 p-4 animate-in slide-in-from-top-2 duration-300">
                <div className="flex gap-3">
                  {[
                    { id: 'imagem', icon: ImageIcon, label: 'Imagem' },
                    { id: 'video', icon: Video, label: 'Vídeo' },
                    { id: 'documento', icon: FileText, label: 'Documento' },
                  ].map((tipo) => {
                    const ativo = localData.midia_tipo === tipo.id
                    return (
                      <button
                        key={tipo.id}
                        onClick={() => setLocalData({ ...localData, midia_tipo: tipo.id as any })}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-lg border py-2 text-xs font-bold transition-all ${
                          ativo ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <tipo.icon size={14} />
                        {tipo.label}
                      </button>
                    )
                  })}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">URL da mídia</label>
                  <Input
                    type="text"
                    placeholder="https://sua-midia.com/arquivo.jpg"
                    value={localData.midia_url || ''}
                    onChange={(e) => setLocalData({ ...localData, midia_url: e.target.value, tem_midia: true })}
                  />
                </div>

                {localData.midia_url && localData.midia_tipo === 'imagem' && (
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={localData.midia_url} alt="Preview" className="h-full w-full object-contain" />
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <DialogFooter className="border-t border-border">
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button
            onClick={() => onSalvar({ ...localData, tem_midia: mostraMidia })}
            disabled={!localData.mensagem_template}
          >
            Salvar configuração
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
