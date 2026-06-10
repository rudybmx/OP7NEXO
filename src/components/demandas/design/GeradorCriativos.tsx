'use client'

import React, { useState } from 'react'
import {
  Sparkles, Image as ImageIcon, Type, Layout, History, Send, AlertCircle,
  Download, Upload, Wand2, Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { getToken } from '@/lib/api-client'
import { useWorkspace } from '@/lib/workspace-context'

const FORMATS = [
  { id: '45', title: '4:5', sub: 'Feed' },
  { id: '11', title: '1:1', sub: 'Quadrado' },
  { id: '916', title: '9:16', sub: 'Stories/Reel' },
]
const FORMAT_TO_CREATIVE: Record<string, string> = { '45': 'feed_4x5', '11': 'feed_1x1', '916': 'story' }

const OBJETIVOS = [
  { id: 'agendamento no WhatsApp', label: 'Agendar WhatsApp' },
  { id: 'geração de leads', label: 'Gerar lead' },
  { id: 'divulgar oferta', label: 'Divulgar oferta' },
  { id: 'institucional / marca', label: 'Institucional' },
]
const ESTILOS = ['Premium', 'Lifestyle', 'Minimalista', 'Impacto visual']
const QUALITIES = [{ id: 'medium', title: 'Equilibrada' }, { id: 'high', title: 'Alta' }]
const REF_USOS = [
  { id: 'style', label: 'Só estilo' },
  { id: 'composition', label: 'Composição' },
  { id: 'style_and_composition', label: 'Estilo + composição' },
]

interface HistItem { id: string; url: string; titulo: string; at: number }

function readFileAsDataUrl(file: File, onload: (s: string) => void) {
  const r = new FileReader()
  r.onload = () => { if (typeof r.result === 'string') onload(r.result) }
  r.readAsDataURL(file)
}

export function GeradorCriativos() {
  const { workspaceAtual: wsId } = useWorkspace()

  // Arquivos
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null)
  const [referenceUsage, setReferenceUsage] = useState('style_and_composition')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  // Campanha + copy
  const [briefing, setBriefing] = useState('')
  const [objetivo, setObjetivo] = useState(OBJETIVOS[0].id)
  const [headline, setHeadline] = useState('')
  const [subheadline, setSubheadline] = useState('')
  const [cta, setCta] = useState('')
  const [cidade, setCidade] = useState('')

  // Densidade
  const [densidade, setDensidade] = useState<'simples' | 'rico'>('simples')
  const [bullets, setBullets] = useState<string[]>(['', '', ''])
  const [selo, setSelo] = useState('')
  const [copyExtra, setCopyExtra] = useState('')

  // Formato + avançado
  const [selectedFormat, setSelectedFormat] = useState('45')
  const [quality, setQuality] = useState('medium')
  const [forceRealLogo, setForceRealLogo] = useState(false)
  const [estilo, setEstilo] = useState('Premium')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Resultado
  const [isGenerating, setIsGenerating] = useState(false)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistItem[]>([])

  const onUpload = (setter: (s: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    readFileAsDataUrl(f, setter)
  }

  const getFormatStyles = (): React.CSSProperties => {
    switch (selectedFormat) {
      case '11': return { aspectRatio: '1/1', maxHeight: '100%', maxWidth: '100%', width: '100%' }
      case '916': return { aspectRatio: '9/16', maxHeight: '100%', height: '100%' }
      default: return { aspectRatio: '4/5', maxHeight: '100%', height: '100%' }
    }
  }

  const handleGenerate = async () => {
    if (!wsId) { toast.error('Selecione um workspace.'); return }
    if (!briefing.trim() && !headline.trim()) {
      toast.error('Diga o que anunciar (ou ao menos a headline).'); return
    }
    setIsGenerating(true); setResultImage(null); setError(null)
    try {
      const body: Record<string, unknown> = {
        workspace_id: wsId,
        product: briefing.trim() || undefined,
        objective: objetivo,
        city: cidade.trim() || undefined,
        headline: headline.trim() || undefined,
        subheadline: subheadline.trim() || undefined,
        cta: cta.trim() || undefined,
        footer: cidade.trim() || undefined,
        creative_format: FORMAT_TO_CREATIVE[selectedFormat] ?? 'feed_4x5',
        estilo,
        densidade,
        quality,
        force_real_logo: forceRealLogo,
        reference_usage: referenceUsage,
        logo_base64: logoUrl ?? undefined,
        referencia_base64: referenceUrl ?? undefined,
      }
      if (densidade === 'rico') {
        body.bullets = bullets.map(b => b.trim()).filter(Boolean)
        body.selo = selo.trim() || undefined
        body.copy_extra = copyExtra.trim() || undefined
      }

      const res = await fetch('/api/proxy/design/gerar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
        body: JSON.stringify(body),
      })
      if (!res.ok || !res.body) throw new Error(`Falha ao gerar (HTTP ${res.status})`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let done = false
      while (!done) {
        const { done: d, value } = await reader.read()
        done = d
        if (value) buffer += decoder.decode(value, { stream: true })
        let sep
        while ((sep = buffer.indexOf('\n\n')) >= 0) {
          const bloco = buffer.slice(0, sep); buffer = buffer.slice(sep + 2)
          const linhas = bloco.split('\n')
          const ev = linhas.find(l => l.startsWith('event:'))?.slice(6).trim()
          const dl = linhas.find(l => l.startsWith('data:'))?.slice(5).trim()
          const data = dl ? JSON.parse(dl) : null
          if (ev === 'generation.completed' && data?.base_image_url) {
            setResultImage(data.base_image_url)
            setHistory(prev => [
              { id: data.generation_id, url: data.base_image_url, titulo: headline.trim() || briefing.trim() || 'Criativo', at: Date.now() },
              ...prev,
            ].slice(0, 12))
            toast.success('Criativo gerado!')
          } else if (ev === 'generation.failed') {
            const msg = data?.error_message || 'Falha na geração.'
            setError(msg); toast.error(msg)
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao gerar.'
      setError(msg); toast.error(msg)
    } finally {
      setIsGenerating(false)
    }
  }

  const labelCls = 'text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-3)] flex items-center gap-2'
  const inputCls = 'w-full h-9 px-3 bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[var(--ws-radius-lg)] text-sm text-[var(--ws-text-1)] placeholder:text-[var(--ws-text-3)] focus:outline-none focus:border-[var(--ws-blue)]'

  const UploadCard = ({ url, onChange, onClear, label, hint }: {
    url: string | null; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; onClear: () => void; label: string; hint: string
  }) => (
    <div className="relative">
      {url ? (
        <div className="flex items-center gap-3 p-2 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)]">
          <img src={url} alt={label} className="w-12 h-12 rounded object-contain bg-white/40 shrink-0" />
          <div className="flex-1 min-w-0 text-[11px] text-[var(--ws-text-2)] truncate">{label} enviado</div>
          <button onClick={onClear} className="text-[var(--ws-text-3)] hover:text-[#a32d2d] p-1"><Trash2 size={15} /></button>
        </div>
      ) : (
        <label className="cursor-pointer flex flex-col items-center justify-center gap-1 h-[68px] rounded-[var(--ws-radius-lg)] border border-dashed border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)] hover:border-[var(--ws-blue)] transition-all text-center px-3">
          <Upload size={16} className="text-[var(--ws-text-3)]" />
          <span className="text-[11px] font-medium text-[var(--ws-text-2)]">{label}</span>
          <span className="text-[9px] text-[var(--ws-text-3)]">{hint}</span>
          <input type="file" accept="image/*" onChange={onChange} className="hidden" />
        </label>
      )}
    </div>
  )

  return (
    <div className="flex h-full gap-6 p-6 animate-in fade-in duration-500 overflow-hidden">
      {/* Configuração */}
      <div className="flex-1 flex flex-col gap-5 overflow-y-auto pr-4 scrollbar-hide">

        {/* Modelo de exemplo + Logo */}
        <div className="space-y-3">
          <label className={labelCls}><ImageIcon size={14} className="text-[var(--ws-blue)]" /> Modelo de exemplo & Marca</label>
          <div className="grid grid-cols-2 gap-3">
            <UploadCard url={referenceUrl} onChange={onUpload(setReferenceUrl)} onClear={() => setReferenceUrl(null)} label="Modelo de exemplo" hint="referência de estilo (opcional)" />
            <UploadCard url={logoUrl} onChange={onUpload(setLogoUrl)} onClear={() => setLogoUrl(null)} label="Logo" hint="marca do cliente" />
          </div>
          {referenceUrl && (
            <div className="flex flex-wrap gap-2">
              {REF_USOS.map(u => (
                <button key={u.id} onClick={() => setReferenceUsage(u.id)}
                  className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${referenceUsage === u.id ? 'bg-[var(--ws-blue)] text-white border-[var(--ws-blue)]' : 'bg-[var(--ws-glass-bg)] text-[var(--ws-text-2)] border-[var(--ws-glass-border)]'}`}>
                  {u.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* O que anunciar */}
        <div className="space-y-3">
          <label className={labelCls}><Sparkles size={14} className="text-[var(--ws-blue)]" /> O que você quer anunciar?</label>
          <textarea value={briefing} onChange={e => setBriefing(e.target.value)}
            placeholder="Ex.: Implante dentário premium, para adultos perfil aspiracional..."
            className="w-full h-20 p-3 bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[var(--ws-radius-lg)] text-sm text-[var(--ws-text-1)] placeholder:text-[var(--ws-text-3)] focus:outline-none focus:border-[var(--ws-blue)] resize-none" />
          <div className="flex flex-wrap gap-2">
            {OBJETIVOS.map(o => (
              <button key={o.id} onClick={() => setObjetivo(o.id)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all ${objetivo === o.id ? 'bg-[var(--ws-blue)] text-white border-[var(--ws-blue)]' : 'bg-[var(--ws-glass-bg)] text-[var(--ws-text-2)] border-[var(--ws-glass-border)]'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Textos da arte */}
        <div className="space-y-3">
          <label className={labelCls}><Type size={14} className="text-[var(--ws-blue)]" /> Textos da arte</label>
          <input value={headline} onChange={e => setHeadline(e.target.value)} placeholder="Headline (ex.: A vida é ouro)" className={inputCls} />
          <input value={subheadline} onChange={e => setSubheadline(e.target.value)} placeholder="Subtítulo (opcional)" className={inputCls} />
          <div className="grid grid-cols-2 gap-3">
            <input value={cta} onChange={e => setCta(e.target.value)} placeholder="CTA (Agende agora)" className={inputCls} />
            <input value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Cidade (Londrina/PR)" className={inputCls} />
          </div>
        </div>

        {/* Densidade */}
        <div className="space-y-3">
          <label className={labelCls}><Wand2 size={14} className="text-[var(--ws-blue)]" /> Densidade do criativo</label>
          <div className="grid grid-cols-2 gap-2">
            {(['simples', 'rico'] as const).map(d => (
              <button key={d} onClick={() => setDensidade(d)}
                className={`flex flex-col items-start p-3 rounded-[var(--ws-radius-lg)] border transition-all text-left ${densidade === d ? 'bg-[rgba(0,74,140,0.08)] border-[var(--ws-blue)]' : 'bg-[var(--ws-glass-bg)] border-[var(--ws-glass-border)]'}`}>
                <span className={`text-sm font-semibold capitalize ${densidade === d ? 'text-[var(--ws-blue)]' : 'text-[var(--ws-text-1)]'}`}>{d}</span>
                <span className="text-[10px] text-[var(--ws-text-3)]">{d === 'simples' ? 'Limpo, premium, respirado' : 'Bullets, selo, copy completo'}</span>
              </button>
            ))}
          </div>
          {densidade === 'rico' && (
            <div className="space-y-2 p-3 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-[rgba(14,20,42,0.02)] animate-in slide-in-from-top-2 duration-300">
              <span className="text-[10px] font-bold uppercase text-[var(--ws-text-3)]">Bullets de benefício</span>
              {bullets.map((b, i) => (
                <input key={i} value={b} onChange={e => setBullets(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                  placeholder={`Benefício ${i + 1}`} className={inputCls} />
              ))}
              <input value={selo} onChange={e => setSelo(e.target.value)} placeholder="Selo de credibilidade (ex.: Mais de 10 anos)" className={inputCls} />
              <input value={copyExtra} onChange={e => setCopyExtra(e.target.value)} placeholder="Copy extra (opcional)" className={inputCls} />
            </div>
          )}
        </div>

        {/* Formato */}
        <div className="space-y-3">
          <label className={labelCls}><Layout size={14} className="text-[var(--ws-blue)]" /> Onde você vai usar?</label>
          <div className="grid grid-cols-3 gap-3">
            {FORMATS.map(f => (
              <button key={f.id} onClick={() => setSelectedFormat(f.id)}
                className={`flex flex-col items-center justify-center p-3 rounded-[var(--ws-radius-lg)] border transition-all ${selectedFormat === f.id ? 'bg-[rgba(0,74,140,0.08)] border-[var(--ws-blue)]' : 'bg-[var(--ws-glass-bg)] border-[var(--ws-glass-border)]'}`}>
                <div className={`text-base font-bold ${selectedFormat === f.id ? 'text-[var(--ws-blue)]' : 'text-[var(--ws-text-1)]'}`}>{f.title}</div>
                <div className="text-[10px] uppercase text-[var(--ws-text-3)] font-medium">{f.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Avançado */}
        <div>
          <button onClick={() => setShowAdvanced(!showAdvanced)} className={`${labelCls} hover:text-[var(--ws-text-2)]`}>
            <span className={`transform transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>▶</span> Configurações avançadas
          </button>
          {showAdvanced && (
            <div className="mt-3 p-4 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-[rgba(14,20,42,0.02)] space-y-4 animate-in slide-in-from-top-2 duration-300">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase text-[var(--ws-text-3)]">Qualidade</span>
                <div className="grid grid-cols-2 gap-2">
                  {QUALITIES.map(q => (
                    <button key={q.id} onClick={() => setQuality(q.id)}
                      className={`h-8 rounded-md text-[11px] font-medium border transition-all ${quality === q.id ? 'bg-[var(--ws-blue)] text-white border-[var(--ws-blue)]' : 'bg-white text-[var(--ws-text-2)] border-[var(--ws-glass-border)]'}`}>
                      {q.title}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--ws-text-3)]">Alta consome mais tokens (~4x). Modelo: gpt-image-2.</p>
              </div>
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase text-[var(--ws-text-3)]">Estilo</span>
                <div className="flex flex-wrap gap-2">
                  {ESTILOS.map(s => (
                    <button key={s} onClick={() => setEstilo(s)}
                      className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${estilo === s ? 'bg-[var(--ws-blue)] text-white border-[var(--ws-blue)]' : 'bg-white text-[var(--ws-text-2)] border-[var(--ws-glass-border)]'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={forceRealLogo} onChange={e => setForceRealLogo(e.target.checked)} className="accent-[var(--ws-blue)]" />
                <span className="text-[11px] text-[var(--ws-text-2)]">Garantir logo fiel (aplica a logo real por cima)</span>
              </label>
            </div>
          )}
        </div>

        {/* Gerar */}
        <button onClick={handleGenerate} disabled={isGenerating}
          className="mt-1 w-full py-4 bg-[var(--ws-gold)] hover:opacity-90 disabled:opacity-50 text-white font-bold rounded-[var(--ws-radius-lg)] shadow-lg transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-xs">
          {isGenerating ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Gerando criativo...</>
          ) : (
            <><Send size={16} /> Gerar Criativo</>
          )}
        </button>
      </div>

      {/* Resultado + Histórico */}
      <div className="w-[340px] flex flex-col gap-6">
        <div className="flex-1 flex flex-col bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[var(--ws-radius-xl)] backdrop-blur-md overflow-hidden shadow-xl">
          <div className="p-4 border-b border-[var(--ws-glass-border)] flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-1)]">Resultado</span>
            {isGenerating && <div className="w-2 h-2 rounded-full bg-[var(--ws-blue)] animate-pulse" />}
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center overflow-hidden">
            {resultImage ? (
              <div className="relative rounded-[var(--ws-radius-lg)] overflow-hidden shadow-inner animate-in zoom-in duration-500 mx-auto" style={getFormatStyles()}>
                <img src={resultImage} alt="Criativo" className="w-full h-full object-cover" />
                <a href={resultImage} target="_blank" rel="noopener noreferrer" download
                  className="absolute top-2 right-2 px-2.5 py-1.5 bg-black/45 hover:bg-black/65 backdrop-blur-md text-white text-[9px] font-bold uppercase rounded-md border border-white/20 flex items-center gap-1.5">
                  <Download size={11} /> Baixar
                </a>
              </div>
            ) : error ? (
              <>
                <div className="w-16 h-16 rounded-full bg-[rgba(163,45,45,0.10)] flex items-center justify-center mb-4"><AlertCircle size={32} className="text-[#a32d2d] opacity-70" /></div>
                <div className="text-sm font-medium text-[#a32d2d] mb-1">Não foi possível gerar</div>
                <div className="text-[11px] text-[var(--ws-text-3)] max-w-[240px]">{error}</div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-[var(--ws-blue-soft)] flex items-center justify-center mb-4"><ImageIcon size={32} className="text-[var(--ws-blue)] opacity-40" /></div>
                <div className="text-sm font-medium text-[var(--ws-text-2)] mb-1">{isGenerating ? 'Gerando... (10–40s)' : 'Pronto para gerar'}</div>
                <div className="text-[11px] text-[var(--ws-text-3)] max-w-[240px]">
                  {isGenerating ? 'O modelo está montando a arte completa com texto e logo integrados.' : 'O criativo final aparecerá aqui — texto e marca já integrados pela IA.'}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="h-[200px] flex flex-col bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[var(--ws-radius-xl)] backdrop-blur-md overflow-hidden shadow-lg">
          <div className="p-4 border-b border-[var(--ws-glass-border)] flex items-center gap-2">
            <History size={14} className="text-[var(--ws-text-3)]" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-1)]">Histórico</span>
          </div>
          <div className="flex-1 flex flex-col gap-2 p-3 overflow-y-auto scrollbar-hide">
            {history.length > 0 ? history.map(item => (
              <button key={item.id} onClick={() => { setResultImage(item.url); setError(null) }}
                className="flex items-center gap-3 p-2 rounded-lg bg-white/40 border border-white/60 hover:bg-white/60 transition-all text-left">
                <div className="w-10 h-10 rounded bg-gray-200 overflow-hidden shrink-0"><img src={item.url} className="w-full h-full object-cover" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold text-[var(--ws-text-1)] truncate">{item.titulo}</div>
                  <div className="text-[9px] text-[var(--ws-text-3)]">{new Date(item.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </button>
            )) : (
              <div className="flex-1 flex items-center justify-center"><span className="text-[10px] text-[var(--ws-text-3)] italic opacity-60">Nenhuma geração ainda</span></div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
