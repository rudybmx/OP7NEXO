'use client'

import React, { useState } from 'react'
import {
  Sparkles, Image as ImageIcon, Type, Layout, History, Send, AlertCircle,
  Download, Upload, Wand2, Trash2, Palette,
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
  { id: 'replica', label: 'Réplica idêntica' },
]

interface HistItem { id: string; url: string; titulo: string; at: number }

const labelCls = 'text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-3)] flex items-center gap-2'
const inputCls = 'w-full h-9 px-3 bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[var(--ws-radius-lg)] text-sm text-[var(--ws-text-1)] placeholder:text-[var(--ws-text-3)] focus:outline-none focus:border-[var(--ws-blue)]'

function readFileAsDataUrl(file: File, onload: (s: string) => void) {
  const r = new FileReader()
  r.onload = () => { if (typeof r.result === 'string') onload(r.result) }
  r.readAsDataURL(file)
}

// Extrai as 2 cores dominantes (ignora branco/preto/transparente) da logo.
function extrairCoresDaLogo(dataUrl: string): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const s = 48
      const canvas = document.createElement('canvas')
      canvas.width = s; canvas.height = s
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve([])
      ctx.drawImage(img, 0, 0, s, s)
      const { data } = ctx.getImageData(0, 0, s, s)
      const buckets: Record<string, { r: number; g: number; b: number; n: number }> = {}
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
        if (a < 200) continue
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
        if (mx > 240 && mn > 240) continue // branco
        if (mx < 28) continue // preto
        const key = `${Math.round(r / 24)}-${Math.round(g / 24)}-${Math.round(b / 24)}`
        const k = buckets[key] || (buckets[key] = { r: 0, g: 0, b: 0, n: 0 })
        k.r += r; k.g += g; k.b += b; k.n++
      }
      const toHex = (k: { r: number; g: number; b: number; n: number }) =>
        '#' + [k.r, k.g, k.b].map(v => Math.round(v / k.n).toString(16).padStart(2, '0')).join('')
      const cores = Object.values(buckets).sort((a, b) => b.n - a.n).slice(0, 2).map(toHex)
      resolve(cores)
    }
    img.onerror = () => resolve([])
    img.src = dataUrl
  })
}

function UploadCard({ url, onChange, onClear, label, hint }: {
  url: string | null; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; onClear: () => void; label: string; hint: string
}) {
  return url ? (
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
  )
}

function ColorSwatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex-1 flex items-center gap-2 p-2 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)] backdrop-blur-md">
      <label className="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-white/40 shadow-inner cursor-pointer" style={{ background: value || 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 10px 10px' }}>
        <input type="color" value={value || '#000000'} onChange={e => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
      </label>
      <div className="min-w-0">
        <div className="text-[9px] font-bold uppercase text-[var(--ws-text-3)]">{label}</div>
        <input value={value} onChange={e => onChange(e.target.value)} placeholder="#000000"
          className="w-full bg-transparent text-[11px] text-[var(--ws-text-1)] focus:outline-none" />
      </div>
    </div>
  )
}

export function GeradorCriativos() {
  const { workspaceAtual: wsId } = useWorkspace()

  const [referenceUrl, setReferenceUrl] = useState<string | null>(null)
  const [referenceUsage, setReferenceUsage] = useState('style_and_composition')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  const [primaryColor, setPrimaryColor] = useState('')
  const [secondaryColor, setSecondaryColor] = useState('')

  const [briefing, setBriefing] = useState('')
  const [objetivo, setObjetivo] = useState(OBJETIVOS[0].id)
  const [headline, setHeadline] = useState('')
  const [subheadline, setSubheadline] = useState('')
  const [cta, setCta] = useState('')
  const [cidade, setCidade] = useState('')

  const [densidade, setDensidade] = useState<'simples' | 'rico'>('simples')
  const [bullets, setBullets] = useState<string[]>(['', '', ''])
  const [selo, setSelo] = useState('')
  const [copyExtra, setCopyExtra] = useState('')

  const [formatsSel, setFormatsSel] = useState<string[]>(['45'])
  const [quality, setQuality] = useState('medium')
  const [forceRealLogo, setForceRealLogo] = useState(false)
  const [estilo, setEstilo] = useState('Premium')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [isGenerating, setIsGenerating] = useState(false)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistItem[]>([])

  const onUpload = (setter: (s: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    readFileAsDataUrl(f, async (durl) => {
      setter(durl)
      // Ao subir logo, sugere as cores se ainda não escolhidas
      if (setter === setLogoUrl && !primaryColor && !secondaryColor) {
        const cores = await extrairCoresDaLogo(durl)
        if (cores[0]) setPrimaryColor(cores[0])
        if (cores[1]) setSecondaryColor(cores[1])
      }
    })
  }

  const sugerirCores = async () => {
    if (!logoUrl) return
    const cores = await extrairCoresDaLogo(logoUrl)
    if (cores[0]) setPrimaryColor(cores[0])
    if (cores[1]) setSecondaryColor(cores[1])
    if (!cores.length) toast.error('Não consegui captar cores da logo.')
    else toast.success('Cores sugeridas a partir da logo.')
  }

  const toggleFormat = (id: string) => {
    setFormatsSel(prev => {
      if (prev.includes(id)) return prev.length === 1 ? prev : prev.filter(x => x !== id)
      if (prev.length >= 2) return [prev[prev.length - 1], id]
      return [...prev, id]
    })
  }

  const gerarUm = async (creative_format: string, setAsResult: boolean): Promise<boolean> => {
    const body: Record<string, unknown> = {
      workspace_id: wsId,
      product: briefing.trim() || undefined,
      objective: objetivo,
      city: cidade.trim() || undefined,
      headline: headline.trim() || undefined,
      subheadline: subheadline.trim() || undefined,
      cta: cta.trim() || undefined,
      footer: cidade.trim() || undefined,
      creative_format,
      estilo,
      densidade,
      quality,
      force_real_logo: forceRealLogo,
      reference_usage: referenceUsage,
      primary_color: primaryColor.trim() || undefined,
      secondary_color: secondaryColor.trim() || undefined,
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
    if (!res.ok || !res.body) { setError(`Falha ao gerar (HTTP ${res.status})`); return false }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let done = false
    let ok = false
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
          ok = true
          if (setAsResult) setResultImage(data.base_image_url)
          setHistory(prev => [
            { id: data.generation_id, url: data.base_image_url, titulo: headline.trim() || briefing.trim() || 'Criativo', at: Date.now() },
            ...prev,
          ].slice(0, 12))
        } else if (ev === 'generation.failed') {
          setError(data?.error_message || 'Falha na geração.')
        }
      }
    }
    return ok
  }

  const handleGenerate = async () => {
    if (!wsId) { toast.error('Selecione um workspace.'); return }
    if (!briefing.trim() && !headline.trim()) { toast.error('Diga o que anunciar (ou ao menos a headline).'); return }
    setIsGenerating(true); setResultImage(null); setError(null)
    try {
      const formatos = formatsSel.length ? formatsSel : ['45']
      let primeiro = true
      let sucesso = 0
      for (const fmt of formatos) {
        const ok = await gerarUm(FORMAT_TO_CREATIVE[fmt] ?? 'feed_4x5', primeiro)
        if (ok) sucesso++
        primeiro = false
      }
      if (sucesso) toast.success(sucesso > 1 ? `${sucesso} criativos gerados!` : 'Criativo gerado!')
      else toast.error('Não foi possível gerar.')
    } finally {
      setIsGenerating(false)
    }
  }

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

        {/* Cores da marca */}
        <div className="space-y-3">
          <label className={labelCls}><Palette size={14} className="text-[var(--ws-blue)]" /> Cores da marca</label>
          <div className="flex items-stretch gap-2">
            <ColorSwatch label="Primária" value={primaryColor} onChange={setPrimaryColor} />
            <ColorSwatch label="Secundária" value={secondaryColor} onChange={setSecondaryColor} />
          </div>
          <button onClick={sugerirCores} disabled={!logoUrl}
            className="w-full h-8 rounded-[var(--ws-radius-lg)] text-[11px] font-medium border border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)] backdrop-blur-md text-[var(--ws-text-2)] hover:border-[var(--ws-blue)] disabled:opacity-40 transition-all flex items-center justify-center gap-2">
            <Wand2 size={13} /> Sugerir cores da logo
          </button>
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

        {/* Formato (até 2) */}
        <div className="space-y-3">
          <label className={labelCls}>
            <Layout size={14} className="text-[var(--ws-blue)]" /> Onde você vai usar?
            <span className="text-[9px] font-medium normal-case text-[var(--ws-text-3)]">(até 2 — cada formato é uma geração)</span>
          </label>
          <div className="grid grid-cols-3 gap-3">
            {FORMATS.map(f => {
              const idx = formatsSel.indexOf(f.id)
              const active = idx >= 0
              return (
                <button key={f.id} onClick={() => toggleFormat(f.id)}
                  className={`relative flex flex-col items-center justify-center p-3 rounded-[var(--ws-radius-lg)] border transition-all ${active ? 'bg-[rgba(0,74,140,0.08)] border-[var(--ws-blue)]' : 'bg-[var(--ws-glass-bg)] border-[var(--ws-glass-border)]'}`}>
                  {formatsSel.length > 1 && active && (
                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[var(--ws-blue)] text-white text-[9px] font-bold flex items-center justify-center">{idx + 1}</span>
                  )}
                  <div className={`text-base font-bold ${active ? 'text-[var(--ws-blue)]' : 'text-[var(--ws-text-1)]'}`}>{f.title}</div>
                  <div className="text-[10px] uppercase text-[var(--ws-text-3)] font-medium">{f.sub}</div>
                </button>
              )
            })}
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
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Gerando...</>
          ) : (
            <><Send size={16} /> Gerar {formatsSel.length > 1 ? `${formatsSel.length} Criativos` : 'Criativo'}</>
          )}
        </button>
      </div>

      {/* Resultado + Histórico */}
      <div className="w-[340px] flex flex-col gap-6">
        <div className="flex-1 flex flex-col bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[var(--ws-radius-xl)] backdrop-blur-md overflow-hidden shadow-xl min-h-0">
          <div className="p-4 border-b border-[var(--ws-glass-border)] flex items-center justify-between shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-1)]">Resultado</span>
            {isGenerating && <div className="w-2 h-2 rounded-full bg-[var(--ws-blue)] animate-pulse" />}
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-4 gap-3 text-center overflow-hidden min-h-0">
            {resultImage ? (
              <>
                <img src={resultImage} alt="Criativo" className="max-h-full max-w-full object-contain rounded-[var(--ws-radius-lg)] shadow-inner animate-in zoom-in duration-500" />
                <a href={resultImage} target="_blank" rel="noopener noreferrer" download
                  className="shrink-0 px-4 py-2 bg-[var(--ws-gold)] hover:opacity-90 text-white text-[10px] font-bold uppercase tracking-wider rounded-md flex items-center gap-2 shadow-sm">
                  <Download size={12} /> Baixar criativo
                </a>
              </>
            ) : error ? (
              <>
                <div className="w-16 h-16 rounded-full bg-[rgba(163,45,45,0.10)] flex items-center justify-center"><AlertCircle size={32} className="text-[#a32d2d] opacity-70" /></div>
                <div className="text-sm font-medium text-[#a32d2d]">Não foi possível gerar</div>
                <div className="text-[11px] text-[var(--ws-text-3)] max-w-[240px]">{error}</div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-[var(--ws-blue-soft)] flex items-center justify-center"><ImageIcon size={32} className="text-[var(--ws-blue)] opacity-40" /></div>
                <div className="text-sm font-medium text-[var(--ws-text-2)]">{isGenerating ? 'Gerando... (10–40s)' : 'Pronto para gerar'}</div>
                <div className="text-[11px] text-[var(--ws-text-3)] max-w-[240px]">
                  {isGenerating ? 'O modelo está montando a arte completa com texto e logo integrados.' : 'O criativo final aparecerá aqui — texto e marca já integrados pela IA.'}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="h-[200px] flex flex-col bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[var(--ws-radius-xl)] backdrop-blur-md overflow-hidden shadow-lg shrink-0">
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
