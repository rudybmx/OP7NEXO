'use client'

import React, { useState, useEffect } from 'react'
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
  { id: 'agendamento no WhatsApp', label: 'Agendar WhatsApp', hint: 'CTA conversacional e direto, leve urgência e baixa fricção (foco em chamar no WhatsApp).' },
  { id: 'geração de leads', label: 'Gerar lead', hint: 'Desperta curiosidade e valor; CTA de captura ("Quero saber mais", "Receba").' },
  { id: 'divulgar oferta', label: 'Divulgar oferta', hint: 'Escassez/urgência e destaque do benefício/oferta (senso de oportunidade).' },
  { id: 'institucional / marca', label: 'Institucional', hint: 'Tom de autoridade e confiança, memorável, menos promocional.' },
]
// Tom de voz (opcional) → vai para `tone` no backend (já consumido pelo prompt).
const TONS = [
  { id: 'Profissional', hint: 'Linguagem séria e confiável, foco em credibilidade.' },
  { id: 'Próximo', hint: 'Tom caloroso e conversacional, como quem fala de perto.' },
  { id: 'Urgente', hint: 'Senso de oportunidade e ação imediata (bom para ofertas).' },
  { id: 'Inspirador', hint: 'Tom aspiracional e positivo, foco em transformação.' },
]
const QUALITIES = [{ id: 'medium', title: 'Equilibrada' }, { id: 'high', title: 'Alta' }]
const REF_USOS = [
  { id: 'style', label: 'Só estilo', hint: 'Usa a referência só como direção de estilo (cores, clima). O layout fica livre.' },
  { id: 'composition', label: 'Composição', hint: 'Segue a composição/estrutura da referência, sem necessariamente copiar o estilo.' },
  { id: 'style_and_composition', label: 'Estilo + composição', hint: 'Inspiração solta: segue estilo e composição da referência, sem copiar literalmente.' },
  { id: 'replica', label: 'Réplica idêntica', hint: 'Copia o layout do modelo fielmente, trocando só os textos e a marca.' },
  { id: 'modelo_reverso', label: 'Modelo Reverso', hint: 'Analisa a imagem em detalhe (IA de visão) e dá controle total dos pontos. Premium (~3 créditos).' },
]
const AJUSTES = [
  { id: 'fiel', label: 'Fiel' },
  { id: 'livre', label: 'Livre' },
]
const LOGO_POSICOES = ['topo-esquerda', 'topo-central', 'topo-direita', 'rodape-esquerda', 'rodape-central', 'rodape-direita']

interface HistItem { id: string; url: string; titulo: string; at: number }

const labelCls = 'text-[11px] font-bold uppercase tracking-wider text-[var(--ws-text-3)] flex items-center gap-2'
const inputCls = 'w-full h-9 px-3 bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[var(--ws-radius-lg)] text-sm text-[var(--ws-text-1)] placeholder:text-[var(--ws-text-3)] focus:outline-none focus:border-[var(--ws-blue)]'

function readFileAsDataUrl(file: File, onload: (s: string) => void) {
  const r = new FileReader()
  r.onload = () => { if (typeof r.result === 'string') onload(r.result) }
  r.readAsDataURL(file)
}

// Extrai as 3 cores por ÁREA de pixels (regra 60/30/10) de um modelo/referência.
function extrairCores6030(dataUrl: string): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const s = 64
      const canvas = document.createElement('canvas')
      canvas.width = s; canvas.height = s
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve([])
      ctx.drawImage(img, 0, 0, s, s)
      const { data } = ctx.getImageData(0, 0, s, s)
      const buckets: Record<string, { r: number; g: number; b: number; n: number }> = {}
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
        if (a < 128) continue
        const key = `${Math.round(r / 32)}-${Math.round(g / 32)}-${Math.round(b / 32)}`
        const k = buckets[key] || (buckets[key] = { r: 0, g: 0, b: 0, n: 0 })
        k.r += r; k.g += g; k.b += b; k.n++
      }
      const toHex = (k: { r: number; g: number; b: number; n: number }) =>
        '#' + [k.r, k.g, k.b].map(v => Math.round(v / k.n).toString(16).padStart(2, '0')).join('')
      resolve(Object.values(buckets).sort((a, b) => b.n - a.n).slice(0, 3).map(toHex))
    }
    img.onerror = () => resolve([])
    img.src = dataUrl
  })
}

// ── Teoria das cores (HSL) — harmonia determinística, sem IA ──────────────
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let m = (hex || '').replace('#', '')
  if (m.length === 3) m = m.split('').map(c => c + c).join('')
  if (m.length !== 6) return { h: 0, s: 0, l: 0 }
  const r = parseInt(m.slice(0, 2), 16) / 255, g = parseInt(m.slice(2, 4), 16) / 255, b = parseInt(m.slice(4, 6), 16) / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  let h = 0, s = 0; const l = (mx + mn) / 2
  if (mx !== mn) {
    const d = mx - mn
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return { h, s, l }
}
function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), mm = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c } else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c } else if (h < 300) { r = x; b = c } else { r = c; b = x }
  const toH = (v: number) => Math.round((v + mm) * 255).toString(16).padStart(2, '0')
  return '#' + toH(r) + toH(g) + toH(b)
}
function harmonia(primary: string, tipo: 'complementar' | 'analogas'): string[] {
  const { h, s, l } = hexToHsl(primary)
  if (tipo === 'analogas') return [primary, hslToHex(h - 30, s, l), hslToHex(h + 30, s, l)]
  // complementar: 60 = primária, 30 = complementar, 10 = tom claro de detalhe
  return [primary, hslToHex(h + 180, s, l), hslToHex(h, Math.max(0.15, s * 0.5), Math.min(0.92, l + 0.35))]
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

// Tooltip de descrição (hover) — padrão usado em chips/campos. Envolva o gatilho
// num container `relative group` e coloque <Tip> como irmão.
function Tip({ children, w = 'w-56' }: { children: React.ReactNode; w?: string }) {
  return (
    <div className={`pointer-events-none absolute z-20 left-0 top-full mt-1 ${w} p-2 rounded-md bg-[var(--ws-navy)] text-white text-[10px] leading-snug shadow-lg opacity-0 group-hover:opacity-100 transition-opacity`}>
      {children}
    </div>
  )
}

function BotaoIA({ loading, onClick, label }: { loading: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} title="Gerar/Melhorar com IA"
      className="shrink-0 flex items-center gap-1 px-2 h-9 rounded-[var(--ws-radius-lg)] text-[10px] font-bold uppercase text-[var(--ws-blue)] border border-[var(--ws-blue)]/40 bg-[rgba(62,91,255,0.06)] hover:bg-[rgba(62,91,255,0.12)] disabled:opacity-50 transition-all">
      {loading
        ? <span className="w-3 h-3 border-2 border-[var(--ws-blue)]/30 border-t-[var(--ws-blue)] rounded-full animate-spin" />
        : <Sparkles size={12} />}
      {label}
    </button>
  )
}

// Seed vindo da aba "Modelos": estrutura (pré-preenche copy) ou referência (imagem).
export type SeedModelo =
  | { tipo: 'estrutura'; estrutura: Record<string, any> | null; nonce: number }
  | { tipo: 'referencia'; dataUrl: string; nome?: string; nonce: number }

export function GeradorCriativos({ seedModelo = null }: { seedModelo?: SeedModelo | null } = {}) {
  const { workspaceAtual: wsId } = useWorkspace()

  const [referenceUrl, setReferenceUrl] = useState<string | null>(null)
  const [referenceUsage, setReferenceUsage] = useState('style_and_composition')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  // Cores da marca pela regra 60/30/10 (auto do modelo)
  const [cor60, setCor60] = useState('')
  const [cor30, setCor30] = useState('')
  const [cor10, setCor10] = useState('')
  const logoMode: 'compor' | 'integrar' = 'integrar' // padrão fixo: o modelo integra a logo
  const [confirmReverso, setConfirmReverso] = useState(false)

  const [briefing, setBriefing] = useState('')
  const [objetivo, setObjetivo] = useState(OBJETIVOS[0].id)
  const [audience, setAudience] = useState('')      // público-alvo (opcional) → backend `audience`
  const [tone, setTone] = useState('')              // tom de voz (opcional) → backend `tone`
  const [showRefinar, setShowRefinar] = useState(false)
  const [gerandoPacote, setGerandoPacote] = useState(false)
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
  const [showAdvanced, setShowAdvanced] = useState(false)

  const [isGenerating, setIsGenerating] = useState(false)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistItem[]>([])

  // Modelo Reverso
  const [creativeSpec, setCreativeSpec] = useState<any | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [densidadeAjuste, setDensidadeAjuste] = useState('fiel')
  const reverso = referenceUsage === 'modelo_reverso'

  const analisarModelo = async () => {
    if (!referenceUrl || !wsId) { toast.error('Suba um modelo de exemplo primeiro.'); return }
    setAnalyzing(true); setCreativeSpec(null)
    try {
      const res = await fetch('/api/proxy/design/analisar-modelo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
        body: JSON.stringify({ workspace_id: wsId, referencia_base64: referenceUrl }),
      })
      if (!res.ok) throw new Error(`Falha ao analisar (HTTP ${res.status})`)
      const data = await res.json()
      setCreativeSpec(data.creative_spec)
      toast.success('Modelo analisado — edite os pontos abaixo.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao analisar o modelo.')
    } finally {
      setAnalyzing(false)
    }
  }

  // Helpers imutáveis para editar o creative_spec
  // Editores imutáveis do creative_spec (schema rico)
  const setCampo = (chave: string, value: unknown) =>
    setCreativeSpec((s: any) => s && ({ ...s, [chave]: value }))
  const setConteudo = (chave: string, value: string) =>
    setCreativeSpec((s: any) => s && ({ ...s, conteudo_textual: { ...(s.conteudo_textual || {}), [chave]: value } }))
  const setBulletRev = (i: number, value: string) =>
    setCreativeSpec((s: any) => {
      if (!s) return s
      const bl = [...((s.conteudo_textual?.bullets) || [])]
      bl[i] = value
      return { ...s, conteudo_textual: { ...(s.conteudo_textual || {}), bullets: bl } }
    })
  const setPaletaCor = (i: number, hex: string) =>
    setCreativeSpec((s: any) => {
      if (!s) return s
      const p = [...((s.paleta_de_cores) || [])]
      p[i] = hex
      return { ...s, paleta_de_cores: p }
    })
  const setLogoCampo = (chave: string, value: string) =>
    setCreativeSpec((s: any) => s && ({ ...s, logo: { ...(s.logo || {}), [chave]: value } }))

  // Assistente de copy com IA (gera/melhora um campo com gatilhos mentais por objetivo)
  const [melhorando, setMelhorando] = useState<string | null>(null)
  const melhorarCopy = async (campo: string, textoAtual: string, setter: (s: string) => void, loadingKey?: string) => {
    if (!wsId) { toast.error('Selecione um workspace.'); return }
    const chave = loadingKey ?? campo
    // outros textos já no criativo (pra IA complementar e NÃO repetir)
    const todos: { chave: string; valor: string }[] = [
      { chave: 'headline', valor: headline },
      { chave: 'subheadline', valor: subheadline },
      { chave: 'cta', valor: cta },
      { chave: 'selo', valor: selo },
      { chave: 'copy_extra', valor: copyExtra },
      ...bullets.map((b, i) => ({ chave: `bullet${i}`, valor: b })),
    ]
    const existentes = todos.filter(t => t.chave !== chave && t.valor.trim()).map(t => t.valor.trim())
    setMelhorando(chave)
    try {
      const res = await fetch('/api/proxy/design/melhorar-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
        body: JSON.stringify({
          workspace_id: wsId, campo,
          texto_atual: textoAtual || undefined,
          product: briefing.trim() || undefined,
          objective: objetivo, densidade,
          existentes: existentes.length ? existentes : undefined,
          tone: tone || undefined,
          audience: audience.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error(`Falha ao melhorar (HTTP ${res.status})`)
      const data = await res.json()
      if (data?.texto) { setter(data.texto); toast.success('Texto gerado com IA') }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao melhorar o texto.')
    } finally {
      setMelhorando(null)
    }
  }

  // Botão master: gera TODOS os textos de uma vez a partir do briefing (sobrescreve).
  const gerarPacote = async () => {
    if (!wsId) { toast.error('Selecione um workspace.'); return }
    if (!briefing.trim()) { toast.error('Preencha "O que você quer anunciar?" primeiro.'); return }
    setGerandoPacote(true)
    try {
      const res = await fetch('/api/proxy/design/gerar-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
        body: JSON.stringify({
          workspace_id: wsId,
          product: briefing.trim(),
          objective: objetivo,
          densidade,
          tone: tone || undefined,
          audience: audience.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error(`Falha ao gerar textos (HTTP ${res.status})`)
      const data = await res.json()
      const p = data?.pacote
      if (p) {
        setHeadline(p.headline || '')
        setSubheadline(p.subheadline || '')
        setCta(p.cta || '')
        if (densidade === 'rico') {
          const bl: string[] = Array.isArray(p.bullets) ? p.bullets : []
          setBullets([bl[0] || '', bl[1] || '', bl[2] || ''])
          setSelo(p.selo || '')
          setCopyExtra(p.copy_extra || '')
        }
        toast.success('Textos gerados com IA')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao gerar os textos.')
    } finally {
      setGerandoPacote(false)
    }
  }

  // Aplica um modelo escolhido na aba "Modelos" (re-dispara a cada escolha via nonce).
  useEffect(() => {
    if (!seedModelo) return
    if (seedModelo.tipo === 'estrutura' && seedModelo.estrutura) {
      const e = seedModelo.estrutura
      if (e.objetivo) setObjetivo(e.objetivo)
      if (e.densidade === 'simples' || e.densidade === 'rico') setDensidade(e.densidade)
      if (e.headline) setHeadline(e.headline)
      if (e.subheadline) setSubheadline(e.subheadline)
      if (e.cta) setCta(e.cta)
      if (Array.isArray(e.bullets)) setBullets([e.bullets[0] || '', e.bullets[1] || '', e.bullets[2] || ''])
      if (e.selo) setSelo(e.selo)
      if (referenceUsage === 'modelo_reverso') setReferenceUsage('style_and_composition')
      toast.success('Estrutura aplicada — ajuste o briefing e gere os textos com IA')
    } else if (seedModelo.tipo === 'referencia' && seedModelo.dataUrl) {
      setReferenceUrl(seedModelo.dataUrl)
      setReferenceUsage('style_and_composition')
      toast.success('Modelo carregado como referência')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedModelo?.nonce])

  const onUpload = (setter: (s: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.type.startsWith('image/')) { toast.error('Selecione um arquivo de imagem.'); return }
    readFileAsDataUrl(f, async (durl) => {
      setter(durl)
      // Ao subir o MODELO (referência), extrai a paleta 60/30/10 se ainda não definida
      if (setter === setReferenceUrl && !cor60 && !cor30 && !cor10) {
        const c = await extrairCores6030(durl)
        if (c[0]) setCor60(c[0])
        if (c[1]) setCor30(c[1])
        if (c[2]) setCor10(c[2])
      }
    })
  }

  // Cores 60/30/10 — 3 fontes
  const [showHarmonia, setShowHarmonia] = useState(false)
  const [corPrimaria, setCorPrimaria] = useState('#0E142A')
  const [tipoHarmonia, setTipoHarmonia] = useState<'complementar' | 'analogas'>('complementar')

  const coletarDoModelo = async () => {
    if (!referenceUrl) return
    const c = await extrairCores6030(referenceUrl)
    if (!c.length) { toast.error('Não consegui captar cores do modelo.'); return }
    setCor60(c[0]); setCor30(c[1] || ''); setCor10(c[2] || '')
    toast.success('Cores do modelo aplicadas.')
  }
  const coletarDaLogo = async () => {
    if (!logoUrl) return
    const c = await extrairCores6030(logoUrl)
    if (!c.length) { toast.error('Não consegui captar cores da logo.'); return }
    const { h, s, l } = hexToHsl(c[0])
    setCor60(c[0])
    setCor30(c[1] || hslToHex(h + 180, s, l))
    setCor10(c[2] || hslToHex(h, Math.max(0.15, s * 0.5), Math.min(0.92, l + 0.35)))
    toast.success(c.length >= 3 ? 'Cores da logo aplicadas.' : 'Cores completadas por harmonia complementar.')
  }
  const aplicarHarmonia = (primary: string, tipo: 'complementar' | 'analogas') => {
    const [a, b, cc] = harmonia(primary, tipo)
    setCor60(a); setCor30(b); setCor10(cc)
  }
  const primariaDe = async (url: string | null) => {
    if (!url) return
    const c = await extrairCores6030(url)
    if (!c[0]) { toast.error('Não consegui captar a cor.'); return }
    setCorPrimaria(c[0]); aplicarHarmonia(c[0], tipoHarmonia)
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
      audience: audience.trim() || undefined,
      tone: tone || undefined,
      city: cidade.trim() || undefined,
      headline: headline.trim() || undefined,
      subheadline: subheadline.trim() || undefined,
      cta: cta.trim() || undefined,
      footer: cidade.trim() || undefined,
      creative_format,
      densidade,
      quality,
      reference_usage: referenceUsage,
      cor_60: cor60.trim() || undefined,
      cor_30: cor30.trim() || undefined,
      cor_10: cor10.trim() || undefined,
      logo_mode: logoMode,
      logo_base64: logoUrl ?? undefined,
      referencia_base64: referenceUrl ?? undefined,
    }
    if (densidade === 'rico') {
      body.bullets = bullets.map(b => b.trim()).filter(Boolean)
      body.selo = selo.trim() || undefined
      body.copy_extra = copyExtra.trim() || undefined
    }
    if (reverso && creativeSpec) {
      body.creative_spec = creativeSpec
      body.densidade_ajuste = densidadeAjuste
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
    if (reverso && !creativeSpec) { toast.error('Analise o modelo de exemplo primeiro.'); return }
    if (!reverso && !briefing.trim() && !headline.trim()) { toast.error('Diga o que anunciar (ou ao menos a headline).'); return }
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
      {/* Modal: confirmação de custo do Modelo Reverso */}
      {confirmReverso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setConfirmReverso(false)}>
          <div onClick={e => e.stopPropagation()} className="w-[360px] p-5 rounded-[var(--ws-radius-xl)] bg-white border border-[var(--ws-glass-border)] shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-2"><Wand2 size={18} className="text-[var(--ws-gold)]" /><span className="font-bold text-sm text-[var(--ws-text-1)]">Modelo Reverso</span></div>
            <p className="text-[12px] text-[var(--ws-text-2)] leading-relaxed">A análise detalhada do modelo (IA de visão) é uma <b>edição premium</b> e consome <b>~3 créditos</b>. Deseja continuar?</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmReverso(false)} className="flex-1 h-9 rounded-[var(--ws-radius-lg)] text-[11px] font-bold whitespace-nowrap border border-[var(--ws-glass-border)] text-[var(--ws-text-2)] hover:bg-[var(--ws-glass-bg)]">Cancelar</button>
              <button onClick={() => { setConfirmReverso(false); setReferenceUsage('modelo_reverso'); analisarModelo() }} className="flex-1 h-9 rounded-[var(--ws-radius-lg)] text-[11px] font-bold whitespace-nowrap bg-[var(--ws-blue)] text-white">Aceitar (3 créditos)</button>
            </div>
          </div>
        </div>
      )}
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
                <div key={u.id} className="relative group">
                  <button onClick={() => {
                    if (u.id === 'modelo_reverso') { if (creativeSpec) setReferenceUsage(u.id); else setConfirmReverso(true) }
                    else setReferenceUsage(u.id)
                  }}
                    className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${referenceUsage === u.id ? 'bg-[var(--ws-blue)] text-white border-[var(--ws-blue)]' : 'bg-[var(--ws-glass-bg)] text-[var(--ws-text-2)] border-[var(--ws-glass-border)]'}`}>
                    {u.label}
                  </button>
                  <div className="pointer-events-none absolute z-20 left-0 top-full mt-1 w-52 p-2 rounded-md bg-[var(--ws-navy)] text-white text-[10px] leading-snug shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                    {u.hint}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Painel Modelo Reverso — análise cirúrgica + controle total */}
        {reverso && (
          <div className="space-y-3 p-3 rounded-[var(--ws-radius-lg)] border border-[var(--ws-blue)]/40 bg-[rgba(62,91,255,0.04)]">
            <div className="flex items-center justify-between">
              <label className={labelCls}><Wand2 size={14} className="text-[var(--ws-blue)]" /> Modelo Reverso</label>
              <button onClick={analisarModelo} disabled={analyzing || !referenceUrl}
                className="text-[10px] font-bold uppercase text-[var(--ws-blue)] disabled:opacity-40">{analyzing ? 'Analisando...' : 'Re-analisar'}</button>
            </div>
            <div className="text-[10px] font-medium text-[var(--ws-gold)]">⚡ Edição detalhada — consome ~3 créditos</div>
            {analyzing && <div className="text-[11px] text-[var(--ws-text-3)]">Lendo o modelo de forma cirúrgica (visão)...</div>}
            {!analyzing && !creativeSpec && (
              <button onClick={analisarModelo} disabled={!referenceUrl}
                className="w-full h-9 rounded-[var(--ws-radius-lg)] text-[11px] font-bold uppercase bg-[var(--ws-blue)] text-white disabled:opacity-40">Analisar modelo de exemplo</button>
            )}
            {creativeSpec && (
              <div className="space-y-3">
                <div>
                  <span className="text-[9px] font-bold uppercase text-[var(--ws-text-3)]">Descrição (espinha da geração)</span>
                  <textarea value={creativeSpec.descricao || ''} onChange={e => setCampo('descricao', e.target.value)}
                    className="w-full h-24 p-2 mt-1 bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[var(--ws-radius-lg)] text-[12px] text-[var(--ws-text-1)] focus:outline-none focus:border-[var(--ws-blue)] resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={creativeSpec.objetivo_do_criativo || ''} onChange={e => setCampo('objetivo_do_criativo', e.target.value)} placeholder="Objetivo" className={inputCls} />
                  <input value={creativeSpec.estilo_visual || ''} onChange={e => setCampo('estilo_visual', e.target.value)} placeholder="Estilo visual" className={inputCls} />
                  <input value={creativeSpec.estilo || ''} onChange={e => setCampo('estilo', e.target.value)} placeholder="Estilo" className={inputCls} />
                  <input value={creativeSpec.tom || ''} onChange={e => setCampo('tom', e.target.value)} placeholder="Tom" className={inputCls} />
                </div>
                <input value={creativeSpec.personagem || ''} onChange={e => setCampo('personagem', e.target.value)} placeholder="Personagem" className={inputCls} />
                <input value={creativeSpec.composicao_visual || ''} onChange={e => setCampo('composicao_visual', e.target.value)} placeholder="Composição visual" className={inputCls} />
                <div className="space-y-2 pt-2 border-t border-[var(--ws-glass-border)]">
                  <span className="text-[9px] font-bold uppercase text-[var(--ws-text-3)]">Conteúdo textual</span>
                  <input value={creativeSpec.conteudo_textual?.headline || ''} onChange={e => setConteudo('headline', e.target.value)} placeholder="Headline" className={inputCls} />
                  <input value={creativeSpec.conteudo_textual?.subheadline || ''} onChange={e => setConteudo('subheadline', e.target.value)} placeholder="Subtítulo" className={inputCls} />
                  {(creativeSpec.conteudo_textual?.bullets || []).map((b: any, i: number) => (
                    <input key={i} value={typeof b === 'string' ? b : (b?.text || '')} onChange={e => setBulletRev(i, e.target.value)} placeholder={`Bullet ${i + 1}`} className={inputCls} />
                  ))}
                  <div className="grid grid-cols-2 gap-2">
                    <input value={creativeSpec.conteudo_textual?.cta || ''} onChange={e => setConteudo('cta', e.target.value)} placeholder="CTA" className={inputCls} />
                    <input value={creativeSpec.conteudo_textual?.footer || ''} onChange={e => setConteudo('footer', e.target.value)} placeholder="Rodapé" className={inputCls} />
                  </div>
                </div>
                <div>
                  <span className="text-[9px] font-bold uppercase text-[var(--ws-text-3)]">Paleta (clique para alterar)</span>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    {(creativeSpec.paleta_de_cores || []).map((c: string, i: number) => (
                      <label key={i} className="relative w-7 h-7 rounded-md overflow-hidden border border-white/50 shadow-sm cursor-pointer" style={{ background: c }} title={c}>
                        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(c) ? c : '#000000'} onChange={e => setPaletaCor(i, e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[9px] font-bold uppercase text-[var(--ws-text-3)]">Posição da logo</span>
                    <select value={creativeSpec.logo?.posicao || 'topo-esquerda'} onChange={e => setLogoCampo('posicao', e.target.value)}
                      className="w-full h-8 mt-1 px-2 bg-white border border-[var(--ws-glass-border)] rounded-md text-[11px] focus:outline-none">
                      {LOGO_POSICOES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold uppercase text-[var(--ws-text-3)]">Densidade de ajuste</span>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      {AJUSTES.map(a => (
                        <button key={a.id} onClick={() => setDensidadeAjuste(a.id)}
                          className={`h-8 rounded-md text-[10px] font-medium border transition-all ${densidadeAjuste === a.id ? 'bg-[var(--ws-blue)] text-white border-[var(--ws-blue)]' : 'bg-[var(--ws-glass-bg)] text-[var(--ws-text-2)] border-[var(--ws-glass-border)]'}`}>{a.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cores da marca — regra 60/30/10 (auto do modelo). Off em Réplica/Modelo Reverso. */}
        {!reverso && referenceUsage !== 'replica' && (
          <div className="space-y-3">
            <label className={labelCls}><Palette size={14} className="text-[var(--ws-blue)]" /> Cores da marca <span className="text-[9px] font-medium normal-case text-[var(--ws-text-3)]">(regra 60/30/10)</span></label>
            <div className="flex items-stretch gap-2">
              <ColorSwatch label="Dominante 60%" value={cor60} onChange={setCor60} />
              <ColorSwatch label="Secundária 30%" value={cor30} onChange={setCor30} />
              <ColorSwatch label="Detalhe 10%" value={cor10} onChange={setCor10} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'modelo', label: 'Do modelo', dis: !referenceUrl, hint: 'Extrai as cores dominantes da imagem de referência (regra 60/30/10).', fn: coletarDoModelo },
                { id: 'logo', label: 'Da logo', dis: !logoUrl, hint: 'Pega as cores da logo; se tiver poucas, completa por harmonia complementar.', fn: coletarDaLogo },
                { id: 'harmonia', label: 'Harmonia', dis: false, hint: 'Você escolhe a cor primária e a regra (complementar ou análogas); o sistema monta a paleta 60/30/10.', fn: () => setShowHarmonia(v => !v) },
              ] as const).map(b => (
                <div key={b.id} className="relative group">
                  <button onClick={b.fn} disabled={b.dis}
                    className={`w-full h-8 rounded-[var(--ws-radius-lg)] text-[10px] font-medium border bg-[var(--ws-glass-bg)] text-[var(--ws-text-2)] hover:border-[var(--ws-blue)] disabled:opacity-40 transition-all ${b.id === 'harmonia' && showHarmonia ? 'border-[var(--ws-blue)] text-[var(--ws-blue)]' : 'border-[var(--ws-glass-border)]'}`}>
                    {b.label}
                  </button>
                  <div className="pointer-events-none absolute z-20 left-0 top-full mt-1 w-48 p-2 rounded-md bg-[var(--ws-navy)] text-white text-[10px] leading-snug shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">{b.hint}</div>
                </div>
              ))}
            </div>
            {showHarmonia && (
              <div className="space-y-2 p-2 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-[rgba(62,91,255,0.04)] animate-in slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold uppercase text-[var(--ws-text-3)] shrink-0">Primária</span>
                  {([
                    { id: 'modelo', label: 'Do modelo', dis: !referenceUrl, hint: 'Usa a cor dominante do modelo como primária.', fn: () => primariaDe(referenceUrl) },
                    { id: 'logo', label: 'Da logo', dis: !logoUrl, hint: 'Usa a cor dominante da logo como primária.', fn: () => primariaDe(logoUrl) },
                  ] as const).map(b => (
                    <div key={b.id} className="relative group">
                      <button onClick={b.fn} disabled={b.dis}
                        className="h-7 px-2 rounded-md text-[10px] font-medium border border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)] text-[var(--ws-text-2)] hover:border-[var(--ws-blue)] disabled:opacity-40 transition-all">{b.label}</button>
                      <div className="pointer-events-none absolute z-20 left-0 top-full mt-1 w-44 p-2 rounded-md bg-[var(--ws-navy)] text-white text-[10px] leading-snug shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">{b.hint}</div>
                    </div>
                  ))}
                  <label className="relative w-7 h-7 rounded-md overflow-hidden shrink-0 border border-white/50 cursor-pointer ml-auto" style={{ background: corPrimaria }} title="Escolher manualmente">
                    <input type="color" value={corPrimaria} onChange={e => { setCorPrimaria(e.target.value); aplicarHarmonia(e.target.value, tipoHarmonia) }} className="absolute inset-0 opacity-0 cursor-pointer" />
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <select value={tipoHarmonia} onChange={e => { const t = e.target.value as 'complementar' | 'analogas'; setTipoHarmonia(t); aplicarHarmonia(corPrimaria, t) }}
                    className="flex-1 h-8 px-2 bg-[var(--ws-glass-bg)] text-[var(--ws-text-1)] border border-[var(--ws-glass-border)] rounded-md text-[11px] focus:outline-none [&>option]:bg-[var(--ws-navy)] [&>option]:text-[var(--ws-text-1)]">
                    <option value="complementar">Complementar</option>
                    <option value="analogas">Análogas</option>
                  </select>
                  <button onClick={() => aplicarHarmonia(corPrimaria, tipoHarmonia)}
                    className="h-8 px-3 rounded-md text-[10px] font-bold uppercase bg-[var(--ws-blue)] text-white">Aplicar</button>
                </div>
              </div>
            )}
          </div>
        )}

        {!reverso && (<>
        {/* O que anunciar — campo HERO: âncora e gatilho do assistente de IA */}
        <div className="space-y-3 p-4 rounded-[var(--ws-radius-xl)] border border-[var(--ws-blue)]/40 bg-[rgba(62,91,255,0.05)]">
          <div className="flex items-center justify-between gap-2">
            <div className="relative group flex items-center gap-2">
              <label className={labelCls}><Sparkles size={14} className="text-[var(--ws-blue)]" /> O que você quer anunciar?</label>
              <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--ws-blue)] text-white">Principal</span>
              <Tip w="w-60">Campo mais importante. Descreva produto/serviço + público + diferencial. Quanto melhor a direção aqui, melhores os textos que a IA gera nos outros campos.</Tip>
            </div>
            <div className="relative group">
              <BotaoIA loading={melhorando === 'product'} onClick={() => melhorarCopy('product', briefing, setBriefing)} label="Melhorar" />
              <div className="pointer-events-none absolute z-20 right-0 top-full mt-1 w-52 p-2 rounded-md bg-[var(--ws-navy)] text-white text-[10px] leading-snug shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">Refina o que você escreveu numa direção objetiva (produto + público + diferencial).</div>
            </div>
          </div>
          <textarea value={briefing} onChange={e => setBriefing(e.target.value)}
            placeholder="Dê uma direção exata: produto/serviço + público + diferencial. Ex.: Implante dentário premium, sem corte, para adultos que valorizam estética."
            className="w-full h-20 p-3 bg-[var(--ws-glass-bg)] border border-[var(--ws-glass-border)] rounded-[var(--ws-radius-lg)] text-sm text-[var(--ws-text-1)] placeholder:text-[var(--ws-text-3)] focus:outline-none focus:border-[var(--ws-blue)] resize-none" />

          {/* Objetivo da campanha */}
          <div className="space-y-1.5">
            <span className="text-[9px] font-bold uppercase text-[var(--ws-text-3)]">Objetivo</span>
            <div className="flex flex-wrap gap-2">
              {OBJETIVOS.map(o => (
                <div key={o.id} className="relative group">
                  <button onClick={() => setObjetivo(o.id)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all ${objetivo === o.id ? 'bg-[var(--ws-blue)] text-white border-[var(--ws-blue)]' : 'bg-[var(--ws-glass-bg)] text-[var(--ws-text-2)] border-[var(--ws-glass-border)]'}`}>
                    {o.label}
                  </button>
                  <Tip w="w-48">{o.hint}</Tip>
                </div>
              ))}
            </div>
          </div>

          {/* Refinar direção (opcional): público-alvo + tom de voz */}
          <div>
            <button type="button" onClick={() => setShowRefinar(v => !v)}
              className="text-[10px] font-bold uppercase text-[var(--ws-text-3)] hover:text-[var(--ws-text-2)] flex items-center gap-1">
              <span className={`transform transition-transform ${showRefinar ? 'rotate-90' : ''}`}>▶</span> Refinar direção (opcional)
            </button>
            {showRefinar && (
              <div className="mt-2 space-y-2 animate-in slide-in-from-top-2 duration-200">
                <div className="relative group">
                  <input value={audience} onChange={e => setAudience(e.target.value)}
                    placeholder="Público-alvo (ex.: adultos 40+ que valorizam estética)" className={inputCls} />
                  <Tip>Para quem é o anúncio. Afia a linguagem e os gatilhos que a IA usa nos textos.</Tip>
                </div>
                <div className="space-y-1.5">
                  <span className="text-[9px] font-bold uppercase text-[var(--ws-text-3)]">Tom de voz</span>
                  <div className="flex flex-wrap gap-2">
                    {TONS.map(t => (
                      <div key={t.id} className="relative group">
                        <button onClick={() => setTone(tone === t.id ? '' : t.id)}
                          className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${tone === t.id ? 'bg-[var(--ws-blue)] text-white border-[var(--ws-blue)]' : 'bg-[var(--ws-glass-bg)] text-[var(--ws-text-2)] border-[var(--ws-glass-border)]'}`}>
                          {t.id}
                        </button>
                        <Tip w="w-44">{t.hint}</Tip>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Botão master: gera TODOS os textos de uma vez a partir do briefing */}
          <div className="relative group">
            <button onClick={gerarPacote} disabled={gerandoPacote || !briefing.trim()}
              className="w-full h-10 rounded-[var(--ws-radius-lg)] text-[11px] font-bold uppercase tracking-wider text-white bg-[var(--ws-blue)] hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
              {gerandoPacote
                ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Gerando textos...</>
                : <><Sparkles size={14} /> Gerar textos com IA</>}
            </button>
            <Tip w="w-60">A IA lê sua direção acima e cria headline, subtítulo e CTA de uma vez (no modo rico, também bullets, selo e copy). Sobrescreve os campos de texto.</Tip>
          </div>
        </div>

        {/* Textos da arte */}
        <div className="space-y-3">
          <label className={labelCls}><Type size={14} className="text-[var(--ws-blue)]" /> Textos da arte
            <span className="text-[9px] font-medium normal-case text-[var(--ws-text-3)]">(✨ Gerar textos preenche tudo, ou ajuste por campo)</span>
          </label>
          <div className="flex gap-2">
            <div className="relative group flex-1">
              <input value={headline} onChange={e => setHeadline(e.target.value)} placeholder="Headline (ex.: A vida é ouro)" className={inputCls} />
              <Tip>Frase de maior destaque, o gancho que para o scroll. Curta e forte.</Tip>
            </div>
            <BotaoIA loading={melhorando === 'headline'} onClick={() => melhorarCopy('headline', headline, setHeadline)} />
          </div>
          <div className="flex gap-2">
            <div className="relative group flex-1">
              <input value={subheadline} onChange={e => setSubheadline(e.target.value)} placeholder="Subtítulo (opcional)" className={inputCls} />
              <Tip>Complementa a headline com um benefício, sem repetir as mesmas palavras.</Tip>
            </div>
            <BotaoIA loading={melhorando === 'subheadline'} onClick={() => melhorarCopy('subheadline', subheadline, setSubheadline)} />
          </div>
          <div className="flex gap-2">
            <div className="relative group flex-1">
              <input value={cta} onChange={e => setCta(e.target.value)} placeholder="CTA (Agende agora)" className={inputCls} />
              <Tip>Chamada para ação, verbo no imperativo e direto (ex.: Agende sua avaliação).</Tip>
            </div>
            <BotaoIA loading={melhorando === 'cta'} onClick={() => melhorarCopy('cta', cta, setCta)} />
          </div>
          <div className="relative group">
            <input value={cidade} onChange={e => setCidade(e.target.value)} placeholder="Cidade (Londrina/PR)" className={inputCls} />
            <Tip>Opcional. Aparece como rodapé pequeno na arte (localização do anúncio).</Tip>
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
              <div className="relative group inline-block">
                <span className="text-[10px] font-bold uppercase text-[var(--ws-text-3)]">Bullets de benefício</span>
                <Tip>Cada bullet é um BENEFÍCIO curto (não característica). A IA não repete entre eles.</Tip>
              </div>
              {bullets.map((b, i) => (
                <div key={i} className="flex gap-2">
                  <input value={b} onChange={e => setBullets(prev => prev.map((x, j) => j === i ? e.target.value : x))}
                    placeholder={`Benefício ${i + 1}`} className={inputCls} />
                  <BotaoIA loading={melhorando === `bullet${i}`} onClick={() => melhorarCopy('bullet', b, (v) => setBullets(prev => prev.map((x, j) => j === i ? v : x)), `bullet${i}`)} />
                </div>
              ))}
              <div className="flex gap-2">
                <div className="relative group flex-1">
                  <input value={selo} onChange={e => setSelo(e.target.value)} placeholder="Selo de credibilidade (ex.: Mais de 10 anos)" className={inputCls} />
                  <Tip>Selo curto de credibilidade ou urgência que reforça um gatilho (ex.: Últimas vagas).</Tip>
                </div>
                <BotaoIA loading={melhorando === 'selo'} onClick={() => melhorarCopy('selo', selo, setSelo)} />
              </div>
              <div className="flex gap-2">
                <div className="relative group flex-1">
                  <input value={copyExtra} onChange={e => setCopyExtra(e.target.value)} placeholder="Copy extra (opcional)" className={inputCls} />
                  <Tip>Frase de apoio persuasiva (AIDA/PAS) integrada à arte no modo rico.</Tip>
                </div>
                <BotaoIA loading={melhorando === 'copy_extra'} onClick={() => melhorarCopy('copy_extra', copyExtra, setCopyExtra)} />
              </div>
            </div>
          )}
        </div>
        </>)}

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
                      className={`h-8 rounded-md text-[11px] font-medium border transition-all ${quality === q.id ? 'bg-[var(--ws-blue)] text-white border-[var(--ws-blue)]' : 'bg-[var(--ws-glass-bg)] text-[var(--ws-text-2)] border-[var(--ws-glass-border)]'}`}>
                      {q.title}
                    </button>
                  ))}
                </div>
                {quality === 'high' ? (
                  <p className="text-[10px] font-medium text-[var(--ws-gold)]">⚡ Alta qualidade · consome ~2 créditos (mais detalhe).</p>
                ) : (
                  <p className="text-[10px] text-[var(--ws-text-3)]">Equilibrada: custo padrão. Modelo gpt-image-2.</p>
                )}
              </div>
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
