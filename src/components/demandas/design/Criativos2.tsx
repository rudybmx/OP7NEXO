'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Sparkles, Wand2, RefreshCw, Loader2, AlertCircle, ArrowRight, ArrowLeft, Download,
  Image as ImageIcon, ScanSearch, History, LayoutGrid, Check, Trash2, ShieldCheck, X, Maximize2, Zap,
} from 'lucide-react'
import { useWorkspace } from '@/lib/workspace-context'
import { usePersistedState } from '@/hooks/use-estado-persistido'
import api from '@/lib/api-client'

// Tela Criativos 2.0 — carrossel newsjacking. Fluxo passo-a-passo (contínuo, mesma página):
// origem -> roteiro -> estilo visual (modelo reverso) -> edição por slide (melhorar-IA em
// tudo) -> análise por IA (advisory) -> gerar (box de resultado no final). Texto é QUEIMADO
// pelo modelo (gpt-image-2). Backend: /design/carrossel/* + reuso /design/melhorar-copy e
// /design/analisar-modelo. Abas: Criar · Históricos · Modelos.

type SlideCopy = { contexto?: string; palavra_bomba?: string; selo?: string; texto?: string; cta_continuacao?: string }
type SlideRoteiro = {
  index: number; intensidade?: string; copy?: SlideCopy; direcao_imagem?: string
  personagens_idx?: number[] | null; objetos_idx?: number[] | null; estilo_referencia?: string | null
  objeto?: { descricao?: string } | null  // objeto POR SLIDE (descrição; foto vai no estado objetosSlide)
}
type Roteiro = {
  molde?: string; tensao?: string; payload?: string; gatilhos?: string[]; estilo?: string; estilo_referencia?: string
  paleta?: { tensao?: string; resolucao?: string; pivo?: string }
  slides?: SlideRoteiro[]; ctas?: { engajamento?: string; conversao?: string }; legenda?: string
}
type SlideEstado = { slide_index: number; status: string; base_image_url?: string | null; error_code?: string | null; error_message?: string | null }
type CarrosselEstado = {
  carrossel: { id: string; status: string; error_code?: string | null; error_message?: string | null }
  slides: SlideEstado[]
}
type Pauta = { titulo: string; assunto: string; personagens?: string[]; linha_criativa?: string; fonte_url?: string | null }
type ItemRef = { descricao: string; imagem_base64?: string }
type CreativeSpec = { descricao?: string; paleta_de_cores?: string[] }
type Analise = { score: number; status: string; resumo?: string; inconsistencias?: string[]; sugestoes?: string[] }
type HistItem = {
  id: string; tema?: string | null; status?: string; criado_em?: string | null
  capa?: string | null; thumbs?: string[]; n_prontos?: number; master_format?: string | null; director_json?: Roteiro
}

const MASTERS = [{ id: '9x16', label: '9:16 · stories/reels' }, { id: '4x3', label: '4:3 · landscape' }]
const QUALITIES = [{ id: 'low', label: 'Rascunho' }, { id: 'medium', label: 'Médio' }, { id: 'high', label: 'Alta' }]
const TERMINAIS = ['done', 'error', 'parcial']
const ESTILOS = [
  { id: 'integrado', label: 'Integrado / artístico', desc: 'Profundidade, textura e luz rica. Não chapado. O mais editorial e bonito.' },
  { id: 'chapado', label: 'Chapado / flat', desc: 'Cores sólidas, vetorial, minimalista. Direto e limpo.' },
  { id: 'ilustracao', label: 'Ilustração', desc: 'Traços e texturas autorais, mais lúdico e único.' },
  { id: 'foto', label: 'Fotorrealista', desc: 'Foto editorial de alto contraste, realista.' },
]
const MOLDES: Record<string, string> = {
  '': 'A IA escolhe o melhor formato/estrutura pelo seu tema.',
  A: 'Evento/Celebridade: capa com rosto/figura recortada + emoção extrema + headline-bomba; o resto desenvolve a lição por trás do evento. Bom p/ notícia quente ou figura conhecida.',
  B: 'Feature/Tutorial: fato → "isso mudou tudo" → tutorial passo a passo → antes/depois → CTA. Bom p/ ensinar um método ou ferramenta.',
  C: 'Tese ("X NÃO É Y"): 3 capas repetindo a fórmula → lista do "que é de verdade" → síntese → clímax + prova social. Bom p/ quebrar um mito / reposicionar uma ideia.',
}
const NOMES_HEX: Record<string, string> = { vermelho: '#cc0000', verde: '#1ca84c', amarelo: '#ffd400', azul: '#1450a0', preto: '#111111', branco: '#ffffff', laranja: '#ff6a00', roxo: '#7a5af8', rosa: '#ff5c8d', cinza: '#888888' }
const toHex = (c?: string) => { if (!c) return '#cccccc'; const s = c.trim().toLowerCase(); return s.startsWith('#') ? s.slice(0, 7) : (NOMES_HEX[s] || '#cccccc') }

// ── Paleta: derivar análogas/complementares de uma cor-base (regra 60/30/10) ──
function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace('#', ''); const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let hh = 0, ss = 0; const ll = (mx + mn) / 2
  if (mx !== mn) { const d = mx - mn; ss = ll > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60 }
  return [hh, ss, ll]
}
function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x]
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}
function derivar(base: string, modo: 'analogas' | 'complementares'): { tensao: string; resolucao: string; pivo: string } {
  const [h, s, l] = hexToHsl(base)
  if (modo === 'complementares') return { tensao: base, resolucao: hslToHex(h + 180, s, Math.min(0.92, l + 0.12)), pivo: hslToHex(h + 180, Math.min(1, s + 0.1), l) }
  return { tensao: base, resolucao: hslToHex(h + 30, s, l), pivo: hslToHex(h - 30, Math.min(1, s + 0.05), Math.min(0.9, l + 0.05)) }
}

function errMsg(e: unknown): string | undefined {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) {
    const v = (e as { message?: unknown }).message
    return typeof v === 'string' ? v : undefined
  }
  return undefined
}

const card = 'rounded-[14px] border border-[var(--ws-glass-border)] bg-[var(--ws-glass-bg)] backdrop-blur-md'
const botaoPrimario = 'inline-flex items-center justify-center gap-2 h-10 px-5 rounded-[var(--ws-radius-lg)] text-sm font-medium bg-[var(--ws-blue)] text-white disabled:opacity-50 hover:opacity-90 transition'
const inputCls = 'w-full px-3 h-9 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-transparent text-sm outline-none focus:border-[var(--ws-blue)]'

export function Criativos2() {
  const { workspaceAtual } = useWorkspace()
  const [aba, setAba] = usePersistedState<'criar' | 'historicos' | 'modelos'>('op7-c2-aba', 'criar')
  const [tema, setTema] = usePersistedState<string>('op7-c2-tema', '')
  const [nSlides, setNSlides] = usePersistedState<number>('op7-c2-nslides', 5)
  const [master, setMaster] = usePersistedState<string>('op7-c2-master', '9x16')
  const [quality, setQuality] = usePersistedState<string>('op7-c2-quality', 'low')
  const [estilo, setEstilo] = usePersistedState<string>('op7-c2-estilo', 'integrado')
  const [molde, setMolde] = usePersistedState<string>('op7-c2-molde', '')  // '' = Auto (IA escolhe)
  const [origem, setOrigem] = usePersistedState<'manual' | 'referencia' | 'noticia'>('op7-c2-origem', 'manual')
  const [refImg, setRefImg] = useState<string | null>(null)
  const [assuntoNoticia, setAssuntoNoticia] = useState('')
  const [pautas, setPautas] = useState<Pauta[] | null>(null)
  const [buscandoPautas, setBuscandoPautas] = useState(false)
  const [personagens, setPersonagens] = useState<ItemRef[]>([])
  const [objetos, setObjetos] = useState<ItemRef[]>([])
  const [carrosselId, setCarrosselId] = usePersistedState<string | null>('op7-c2-carrossel', null)
  const [roteiro, setRoteiro] = useState<Roteiro | null>(null)
  const [estado, setEstado] = useState<CarrosselEstado | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // Estilo visual / modelo reverso
  const [usarModelo, setUsarModelo] = useState(false)
  const [modeloModo, setModeloModo] = useState<'geral' | 'porSlide'>('geral')
  const [modeloGeral, setModeloGeral] = useState<{ img: string; spec?: CreativeSpec } | null>(null)
  const [modelosSlide, setModelosSlide] = useState<Record<number, { img: string; spec?: CreativeSpec }>>({})
  const [analisandoModelo, setAnalisandoModelo] = useState<string | null>(null)
  // Melhorar com IA / Análise
  const [melhorando, setMelhorando] = useState<string | null>(null)
  const [analise, setAnalise] = useState<Analise | null>(null)
  const [analisando, setAnalisando] = useState(false)
  const [showAnalise, setShowAnalise] = useState(false)
  const [showVer, setShowVer] = useState(false)
  const [melhorandoRef, setMelhorandoRef] = useState<string | null>(null)
  const [regenerando, setRegenerando] = useState<number | null>(null)
  const [saldo, setSaldo] = useState<number | null>(null)
  const [objetosSlide, setObjetosSlide] = useState<Record<number, string>>({})  // index -> foto base64 do objeto
  // Históricos
  const [historicos, setHistoricos] = useState<HistItem[] | null>(null)
  const [carregandoHist, setCarregandoHist] = useState(false)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resultRef = useRef<HTMLDivElement | null>(null)

  const lerArquivo = (f: File, cb: (dataUrl: string) => void) => { const r = new FileReader(); r.onload = () => cb(String(r.result)); r.readAsDataURL(f) }

  // ───── Origin A: buscar pautas de notícia (Firecrawl) ─────
  const buscarPautas = useCallback(async () => {
    if (!workspaceAtual || !assuntoNoticia.trim()) { setErro('Informe um assunto.'); return }
    setBuscandoPautas(true); setErro(null); setPautas(null)
    try {
      const r = await api.post<{ pautas: Pauta[] }>('/design/carrossel/pautas', { workspace_id: workspaceAtual, assunto: assuntoNoticia.trim() })
      setPautas(r.pautas || [])
    } catch (e) { setErro(errMsg(e) ||'Falha ao buscar pautas.') }
    finally { setBuscandoPautas(false) }
  }, [workspaceAtual, assuntoNoticia])

  // ───── Diretor: tema/referência/pauta -> roteiro (custo zero) ─────
  const gerarRoteiro = useCallback(async () => {
    if (!workspaceAtual) return
    if (origem !== 'referencia' && !tema.trim()) { setErro('Escolha um tema ou uma pauta.'); return }
    if (origem === 'referencia' && !refImg) { setErro('Suba uma imagem de referência.'); return }
    setCarregando(true); setErro(null); setEstado(null)
    try {
      const r = await api.post<{ carrossel_id: string; director_json: Roteiro }>('/design/carrossel/diretor', {
        workspace_id: workspaceAtual, origem, estilo, molde: molde || undefined,
        tema: origem === 'referencia' ? undefined : tema.trim(),
        referencia_base64: origem === 'referencia' ? refImg : undefined,
        n_slides: nSlides, master_format: master,
      })
      setCarrosselId(r.carrossel_id); setRoteiro(r.director_json); setAnalise(null)
    } catch (e) { setErro(errMsg(e) ||'Falha ao gerar o roteiro.') }
    finally { setCarregando(false) }
  }, [workspaceAtual, origem, estilo, molde, tema, refImg, nSlides, master, setCarrosselId])

  const editarSlide = (idx: number, patch: Partial<SlideRoteiro>) =>
    setRoteiro(prev => prev ? { ...prev, slides: (prev.slides || []).map(s => s.index === idx ? { ...s, ...patch } : s) } : prev)
  const editarCopy = (idx: number, campo: keyof SlideCopy, valor: string) =>
    setRoteiro(prev => prev ? { ...prev, slides: (prev.slides || []).map(s => s.index === idx ? { ...s, copy: { ...(s.copy || {}), [campo]: valor } } : s) } : prev)

  // ───── Melhorar com IA (qualquer campo, contextual; custo ZERO) ─────
  const melhorarCampo = useCallback(async (idx: number, campo: keyof SlideCopy | 'direcao_imagem' | 'objeto', valorAtual: string) => {
    if (!workspaceAtual || !roteiro) return
    const chave = `${idx}:${campo}`; setMelhorando(chave); setErro(null)
    try {
      const slide = (roteiro.slides || []).find(s => s.index === idx)
      const copy = slide?.copy || {}
      const outros = [copy.palavra_bomba, copy.contexto, copy.selo, copy.texto, copy.cta_continuacao, campo !== 'direcao_imagem' ? slide?.direcao_imagem : undefined]
        .filter((x): x is string => !!x && x !== valorAtual)
      const mapaCampo: Record<string, string> = { palavra_bomba: 'headline', contexto: 'subheadline', selo: 'selo', texto: 'copy_extra', cta_continuacao: 'cta', direcao_imagem: 'personagem', objeto: 'objeto' }
      const ctxModelo = (modeloGeral?.spec?.descricao || modelosSlide[idx]?.spec?.descricao) ? ` | estilo do modelo: ${(modeloGeral?.spec?.descricao || modelosSlide[idx]?.spec?.descricao)!.slice(0, 200)}` : ''
      const r = await api.post<{ texto: string }>('/design/melhorar-copy', {
        workspace_id: workspaceAtual,
        campo: mapaCampo[campo] || 'headline',
        texto_atual: valorAtual || undefined,
        product: `${tema || ''} | molde ${roteiro.molde || ''} | ângulo: ${roteiro.tensao || ''}${ctxModelo}`.trim(),
        objective: 'carrossel newsjacking de negócios (Instagram), parar o polegar',
        existentes: outros.slice(0, 8),
      })
      if (campo === 'direcao_imagem') editarSlide(idx, { direcao_imagem: r.texto })
      else if (campo === 'objeto') editarSlide(idx, { objeto: { descricao: r.texto } })
      else editarCopy(idx, campo, r.texto)
    } catch (e) { setErro(errMsg(e) ||'Falha ao melhorar com IA.') }
    finally { setMelhorando(null) }
  }, [workspaceAtual, roteiro, tema, modeloGeral, modelosSlide])

  // ───── Modelo reverso (analisar-modelo): estilo + paleta a partir da imagem ─────
  const aplicarPaletaSpec = (spec?: CreativeSpec) => {
    const cores = (spec?.paleta_de_cores || []).filter(Boolean)
    if (cores.length) setRoteiro(prev => prev ? { ...prev, paleta: { tensao: cores[0], resolucao: cores[1] || prev.paleta?.resolucao, pivo: cores[2] || prev.paleta?.pivo } } : prev)
  }
  const analisarModelo = useCallback(async (dataUrl: string, alvo: number | 'geral') => {
    if (!workspaceAtual) return
    setAnalisandoModelo(String(alvo)); setErro(null)
    try {
      const r = await api.post<{ creative_spec: CreativeSpec }>('/design/analisar-modelo', { workspace_id: workspaceAtual, referencia_base64: dataUrl })
      const spec = r.creative_spec || {}
      if (alvo === 'geral') {
        setModeloGeral({ img: dataUrl, spec })
        setRoteiro(prev => prev ? { ...prev, estilo_referencia: spec.descricao || prev.estilo_referencia } : prev)
        aplicarPaletaSpec(spec)
      } else {
        setModelosSlide(prev => ({ ...prev, [alvo]: { img: dataUrl, spec } }))
        editarSlide(alvo, { estilo_referencia: spec.descricao || null })
      }
    } catch (e) { setErro(errMsg(e) ||'Falha ao analisar o modelo.') }
    finally { setAnalisandoModelo(null) }
  }, [workspaceAtual, roteiro])

  const limparModelo = () => {
    setUsarModelo(false); setModeloGeral(null); setModelosSlide({})
    setRoteiro(prev => prev ? { ...prev, estilo_referencia: undefined, slides: (prev.slides || []).map(s => ({ ...s, estilo_referencia: null })) } : prev)
  }

  // Seleção de personagens/objetos por slide (null = todos do pool) ─────
  const idxSel = (s: SlideRoteiro, key: 'personagens_idx' | 'objetos_idx', poolLen: number): number[] =>
    s[key] == null ? Array.from({ length: poolLen }, (_, i) => i) : (s[key] as number[])
  const toggleIdx = (idx: number, key: 'personagens_idx' | 'objetos_idx', i: number, poolLen: number) => {
    setRoteiro(prev => prev ? {
      ...prev, slides: (prev.slides || []).map(s => {
        if (s.index !== idx) return s
        const cur = idxSel(s, key, poolLen)
        const next = cur.includes(i) ? cur.filter(x => x !== i) : [...cur, i].sort((a, b) => a - b)
        return { ...s, [key]: next }
      }),
    } : prev)
  }

  // ───── Salvar roteiro (custo zero) — usado por análise e geração ─────
  const salvarRoteiro = useCallback(async () => {
    if (!carrosselId || !roteiro) return
    await api.put(`/design/carrossel/${carrosselId}/roteiro`, { director_json: { ...roteiro, estilo } })
  }, [carrosselId, roteiro, estilo])

  const refsPayload = () => ({
    personagens: personagens.filter(p => (p.descricao || '').trim() || p.imagem_base64).map(p => ({ descricao: p.descricao, imagem_base64: p.imagem_base64 })),
    objetos: objetos.filter(o => (o.descricao || '').trim() || o.imagem_base64).map(o => ({ descricao: o.descricao, imagem_base64: o.imagem_base64 })),
    modelo_base64: usarModelo && modeloModo === 'geral' ? (modeloGeral?.img || undefined) : undefined,
    modelos_slide: usarModelo && modeloModo === 'porSlide'
      ? Object.fromEntries(Object.entries(modelosSlide).map(([k, v]) => [k, v.img]))
      : {},
    objetos_slide: Object.fromEntries(
      (roteiro?.slides || [])
        .map(s => [s.index, { descricao: s.objeto?.descricao || '', imagem_base64: objetosSlide[s.index] }] as const)
        .filter(([, v]) => v.descricao || v.imagem_base64),
    ),
  })

  // ───── Polling do estado (recursão local em `tick` — sem self-ref no useCallback) ─────
  const carregarEstado = useCallback((id: string) => {
    const tick = async () => {
      try {
        const d = await api.get<CarrosselEstado>(`/design/carrossel/${id}`)
        setEstado(d)
        const st = d.carrossel.status
        if (!TERMINAIS.includes(st)) pollRef.current = setTimeout(tick, 2500)
        else if (st === 'error') setErro(d.carrossel.error_message || 'A geração falhou.')
      } catch (e) { setErro(errMsg(e) || 'Falha ao consultar o carrossel.') }
    }
    if (pollRef.current) clearTimeout(pollRef.current)
    tick()
  }, [])

  // ───── Análise completa por IA (advisory) ─────
  const rodarAnalise = useCallback(async () => {
    if (!carrosselId || !roteiro) return
    setAnalisando(true); setErro(null)
    try {
      await salvarRoteiro()
      const { personagens: ps, objetos: os } = refsPayload()
      const r = await api.post<Analise>(`/design/carrossel/${carrosselId}/analise`, {
        personagens: ps.map(p => ({ descricao: p.descricao })), objetos: os.map(o => ({ descricao: o.descricao })),
      })
      setAnalise(r); setShowAnalise(true)
    } catch (e) { setErro(errMsg(e) ||'Falha na análise por IA.') }
    finally { setAnalisando(false) }
  }, [carrosselId, roteiro, salvarRoteiro, personagens, objetos])

  // ───── "Deixar a IA ajustar tudo": reescreve o roteiro na melhor versão (mesmo assunto) ─────
  const ajustarTudo = useCallback(async () => {
    if (!carrosselId || !roteiro) return
    setAnalisando(true); setErro(null)
    try {
      await salvarRoteiro()
      const r = await api.post<{ director_json: Roteiro }>(`/design/carrossel/${carrosselId}/ajustar`, {})
      setRoteiro(r.director_json); setShowAnalise(false); setAnalise(null)
    } catch (e) { setErro(errMsg(e) || 'Falha ao ajustar com IA.') }
    finally { setAnalisando(false) }
  }, [carrosselId, roteiro, salvarRoteiro])

  // ───── Gerar: salva roteiro e dispara a geração (resultado no fim da página) ─────
  const gerar = useCallback(async () => {
    if (!carrosselId || !roteiro) return
    setShowAnalise(false); setCarregando(true); setErro(null)
    try {
      await salvarRoteiro()
      await api.post(`/design/carrossel/${carrosselId}/gerar`, { quality, ...refsPayload() })
      setEstado({ carrossel: { id: carrosselId, status: 'queued' }, slides: [] })
      carregarEstado(carrosselId)  // inicia o polling (auto-agenda via tick)
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (e) { setErro(errMsg(e) ||'Falha ao iniciar a geração.') }
    finally { setCarregando(false) }
  }, [carrosselId, roteiro, quality, salvarRoteiro, carregarEstado, personagens, objetos])

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current) }, [])

  const regenerarSlide = useCallback(async (idx: number) => {
    if (!carrosselId) return
    setRegenerando(idx); setErro(null)
    try {
      await salvarRoteiro()  // regenera já com os textos editados no momento
      await api.post(`/design/carrossel/${carrosselId}/slides/${idx}/regenerar`, { quality, ...refsPayload() })
      if (pollRef.current) clearTimeout(pollRef.current)
      carregarEstado(carrosselId)
    } catch (e) { setErro(errMsg(e) ||'Falha ao regenerar o slide.') }
    finally { setRegenerando(null) }
  }, [carrosselId, quality, carregarEstado, salvarRoteiro, personagens, objetos])

  const reset = () => {
    if (pollRef.current) clearTimeout(pollRef.current)
    setRoteiro(null); setEstado(null); setErro(null); setCarrosselId(null); setAnalise(null)
    setUsarModelo(false); setModeloGeral(null); setModelosSlide({})
  }
  const limparTudo = () => {
    reset()
    setTema(''); setRefImg(null); setAssuntoNoticia(''); setPautas(null)
    setPersonagens([]); setObjetos([]); setObjetosSlide({}); setMolde('')
  }

  // ───── Históricos ─────
  const carregarHistoricos = useCallback(async () => {
    if (!workspaceAtual) return
    setCarregandoHist(true)
    try {
      const r = await api.get<{ carrosseis: HistItem[] }>(`/design/carrossel?workspace_id=${workspaceAtual}`)
      setHistoricos(r.carrosseis || [])
    } catch (e) { setErro(errMsg(e) ||'Falha ao carregar históricos.') }
    finally { setCarregandoHist(false) }
  }, [workspaceAtual])

  // ───── Saldo de tokens (cabeçalho) — best-effort, sem setState síncrono ─────
  const carregarSaldo = useCallback(async () => {
    if (!workspaceAtual) return
    try {
      const r = await api.get<{ saldo_tokens: number }>(`/estudio/saldo?workspace_id=${workspaceAtual}`)
      setSaldo(r.saldo_tokens)
    } catch { /* saldo é best-effort */ }
  }, [workspaceAtual])
  // mount + sempre que o status do carrossel muda (terminal = saldo debitado).
  // defer com setTimeout p/ não chamar setState de forma síncrona dentro do efeito.
  useEffect(() => {
    if (!workspaceAtual) return
    const t = setTimeout(() => carregarSaldo(), 0)
    return () => clearTimeout(t)
  }, [workspaceAtual, estado?.carrossel.status, carregarSaldo])

  const excluirHist = async (id: string) => {
    try { await api.delete(`/design/carrossel/${id}`); setHistoricos(prev => (prev || []).filter(h => h.id !== id)) }
    catch (e) { setErro(errMsg(e) ||'Falha ao excluir.') }
  }
  const usarComoModelo = (h: HistItem) => {
    reset(); setAba('criar'); setOrigem('manual')
    if (h.tema) setTema(h.tema)
    if (h.director_json?.estilo) setEstilo(h.director_json.estilo)
  }

  // ───── UI: pool de personagens/objetos (upload + descrição) ─────
  // Melhorar com IA a descrição de um personagem/objeto do pool, integrando o contexto
  // (tema + TODOS os personagens/objetos) — ex.: "personagem com bola no pé".
  const melhorarRef = useCallback(async (key: 'personagens' | 'objetos', i: number) => {
    if (!workspaceAtual) return
    const chave = `${key}:${i}`; setMelhorandoRef(chave); setErro(null)
    try {
      const items = key === 'personagens' ? personagens : objetos
      const setItems = key === 'personagens' ? setPersonagens : setObjetos
      const atual = items[i]?.descricao || ''
      const todos = [...personagens.map(p => p.descricao), ...objetos.map(o => o.descricao)].filter(Boolean)
      const r = await api.post<{ texto: string }>('/design/melhorar-copy', {
        workspace_id: workspaceAtual,
        campo: key === 'personagens' ? 'personagem' : 'objeto',
        texto_atual: atual || undefined,
        product: `${tema || ''} | personagens: ${personagens.map(p => p.descricao).filter(Boolean).join(', ')} | objetos: ${objetos.map(o => o.descricao).filter(Boolean).join(', ')}`.trim(),
        objective: 'descrever para integrar bem na arte do carrossel (personagem e objeto coerentes)',
        existentes: todos.filter(d => d !== atual).slice(0, 8),
      })
      setItems(prev => prev.map((x, j) => j === i ? { ...x, descricao: r.texto } : x))
    } catch (e) { setErro(errMsg(e) || 'Falha ao melhorar com IA.') }
    finally { setMelhorandoRef(null) }
  }, [workspaceAtual, tema, personagens, objetos])

  const renderRefs = (key: 'personagens' | 'objetos', items: ItemRef[], setItems: React.Dispatch<React.SetStateAction<ItemRef[]>>, lbl: string) => (
    <div className="flex flex-col gap-2">
      <span className="ds-help">{lbl}</span>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <label className="shrink-0 h-9 w-9 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] flex items-center justify-center cursor-pointer overflow-hidden hover:border-[var(--ws-blue)]">
            {it.imagem_base64 ? <img src={it.imagem_base64} className="w-full h-full object-cover" alt="" /> : <ImageIcon size={14} />}
            <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) lerArquivo(f, url => setItems(prev => prev.map((x, j) => j === i ? { ...x, imagem_base64: url } : x))) }} />
          </label>
          <input value={it.descricao} onChange={e => setItems(prev => prev.map((x, j) => j === i ? { ...x, descricao: e.target.value } : x))}
            placeholder={key === 'personagens' ? `Personagem ${i + 1}: quem é (nome/papel)` : `Objeto ${i + 1}: o que é`} className={inputCls + ' flex-1'} />
          <button type="button" onClick={() => melhorarRef(key, i)} disabled={!!melhorandoRef} title="Melhorar com IA"
            className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-[var(--ws-radius-lg)] border border-[var(--ws-blue)]/40 bg-[rgba(62,91,255,0.06)] text-[var(--ws-blue)] hover:bg-[rgba(62,91,255,0.12)] disabled:opacity-50">
            {melhorandoRef === `${key}:${i}` ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          </button>
          <button onClick={() => setItems(prev => prev.filter((_, j) => j !== i))} className="ds-help px-1.5 text-base hover:text-[#a32d2d]">×</button>
        </div>
      ))}
      {items.length < 5 && (
        <button onClick={() => setItems(prev => [...prev, { descricao: '' }])} className="ds-help self-start hover:text-[var(--ws-text-1)]">+ Adicionar {key === 'personagens' ? 'personagem' : 'objeto'}</button>
      )}
    </div>
  )

  // botão pequeno "melhorar com IA" para um campo
  const botaoIA = (idx: number, campo: keyof SlideCopy | 'direcao_imagem' | 'objeto', valor: string) => {
    const chave = `${idx}:${campo}`
    return (
      <button type="button" onClick={() => melhorarCampo(idx, campo, valor)} disabled={!!melhorando} title="Melhorar com IA"
        className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-[var(--ws-radius-lg)] border border-[var(--ws-blue)]/40 bg-[rgba(62,91,255,0.06)] text-[var(--ws-blue)] hover:bg-[rgba(62,91,255,0.12)] disabled:opacity-50">
        {melhorando === chave ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
      </button>
    )
  }

  const poolP = personagens.filter(p => (p.descricao || '').trim() || p.imagem_base64)

  return (
    <div className="flex flex-col h-full overflow-auto px-6 py-5 gap-4">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="ds-page-title flex items-center gap-2"><Sparkles size={18} className="text-[var(--ws-blue)]" /> Criativos 2.0</h1>
          <p className="ds-help">Carrossel editorial newsjacking · design completo, integrado por IA</p>
        </div>
        <div className="flex items-center gap-2">
          {saldo !== null && (
            <span className="inline-flex items-center gap-1 h-8 px-2.5 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] text-sm" title="Tokens do Estúdio disponíveis na conta">
              <Zap size={13} className="text-[var(--ws-blue)]" /> {saldo} <span className="ds-help">tokens</span>
            </span>
          )}
          <button onClick={limparTudo} title="Limpar tudo e recomeçar do zero"
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] text-sm text-[var(--ws-text-2)] hover:text-[#a32d2d] hover:border-[#a32d2d]/50">
            <Trash2 size={13} /> Limpar
          </button>
          <div className="flex items-center gap-1 p-1 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)]">
            {([['criar', 'Criar', Wand2], ['historicos', 'Históricos', History], ['modelos', 'Modelos', LayoutGrid]] as const).map(([id, lbl, Icon]) => (
              <button key={id} onClick={() => { setAba(id); if (id === 'historicos' && historicos === null) carregarHistoricos() }}
                className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-[var(--ws-radius-md,8px)] text-sm transition ${aba === id ? 'bg-[var(--ws-blue)] text-white' : 'text-[var(--ws-text-2)] hover:text-[var(--ws-text-1)]'}`}>
                <Icon size={14} /> {lbl}
              </button>
            ))}
          </div>
        </div>
      </header>

      {erro && (
        <div className="flex items-start gap-2 p-3 rounded-[var(--ws-radius-lg)] border border-[#a32d2d]/40 bg-[#a32d2d]/10 text-[#a32d2d] text-sm">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> <span>{erro}</span>
          <button onClick={() => setErro(null)} className="ml-auto opacity-70 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {/* ══════════════════ ABA CRIAR ══════════════════ */}
      {aba === 'criar' && (
        <div className="flex flex-col gap-4 max-w-3xl w-full">
          {/* 1) ORIGEM + CONFIG */}
          <div className={`${card} p-5 flex flex-col gap-4`}>
            <div className="flex items-center justify-between">
              <span className="ds-section-title">1 · De onde vem o assunto</span>
              {roteiro && <button onClick={reset} className="ds-help inline-flex items-center gap-1 hover:text-[var(--ws-text-1)]"><ArrowLeft size={13} /> Recomeçar</button>}
            </div>
            <div className="flex gap-2 flex-wrap">
              {([['manual', 'Tema manual'], ['referencia', 'Referência de estilo'], ['noticia', '🔥 Pesquisar notícia']] as const).map(([id, lbl]) => (
                <button key={id} onClick={() => setOrigem(id)}
                  className={`h-9 px-4 rounded-[var(--ws-radius-lg)] text-sm border transition ${origem === id ? 'bg-[var(--ws-blue)] text-white border-[var(--ws-blue)]' : 'bg-transparent text-[var(--ws-text-2)] border-[var(--ws-glass-border)] hover:border-[var(--ws-blue)]'}`}>{lbl}</button>
              ))}
            </div>
            {origem === 'manual' && (
              <label className="flex flex-col gap-1.5">
                <span className="ds-label">Assunto / tema</span>
                <textarea value={tema} onChange={e => setTema(e.target.value)} rows={3} placeholder="Ex.: o maior erro de quem faz tráfego pago para clínicas"
                  className="w-full p-3 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-transparent text-sm resize-none focus:border-[var(--ws-blue)] outline-none" />
              </label>
            )}
            {origem === 'referencia' && (
              <label className="flex flex-col gap-1.5">
                <span className="ds-label">Imagem de referência (estilo)</span>
                <div className="flex items-center gap-3">
                  <span className="h-10 px-4 inline-flex items-center gap-2 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] text-sm cursor-pointer hover:border-[var(--ws-blue)]">
                    <ImageIcon size={15} /> Escolher imagem
                    <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) lerArquivo(f, setRefImg) }} className="hidden" />
                  </span>
                  {refImg && <img src={refImg} alt="referência" className="h-16 w-16 object-cover rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)]" />}
                </div>
                <span className="ds-help">A IA lê o estilo (cores, composição, clima) e monta o roteiro nesse visual.</span>
              </label>
            )}
            {origem === 'noticia' && (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <input value={assuntoNoticia} onChange={e => setAssuntoNoticia(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') buscarPautas() }}
                    placeholder="Assunto de interesse (ex.: tráfego pago para clínicas)" className={inputCls + ' h-10 flex-1'} />
                  <button onClick={buscarPautas} disabled={buscandoPautas || !assuntoNoticia.trim()} className={botaoPrimario}>
                    {buscandoPautas ? <><Loader2 size={16} className="animate-spin" /> Buscando…</> : 'Buscar pautas'}
                  </button>
                </div>
                {pautas && pautas.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="ds-help">Escolha uma pauta (vira o tema):</span>
                    {pautas.map((p, i) => (
                      <button key={i} onClick={() => setTema(p.assunto)}
                        className={`text-left p-3 rounded-[var(--ws-radius-lg)] border transition ${tema === p.assunto ? 'border-[var(--ws-blue)] bg-[rgba(62,91,255,0.06)]' : 'border-[var(--ws-glass-border)] hover:border-[var(--ws-blue)]'}`}>
                        <div className="text-sm font-medium text-[var(--ws-text-1)]">{p.titulo}</div>
                        <div className="ds-help mt-0.5">{p.assunto}</div>
                        {p.personagens && p.personagens.length > 0 && <div className="ds-help mt-1">👤 {p.personagens.join(', ')}{p.linha_criativa ? ` · ${p.linha_criativa}` : ''}</div>}
                      </button>
                    ))}
                  </div>
                )}
                {pautas && pautas.length === 0 && <span className="ds-help">Nenhuma pauta encontrada. Tente outro assunto.</span>}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <label className="flex flex-col gap-1.5"><span className="ds-label">Slides</span>
                <input type="number" min={2} max={10} value={nSlides} onChange={e => setNSlides(Math.max(2, Math.min(10, Number(e.target.value) || 5)))} className={inputCls + ' h-10'} /></label>
              <label className="flex flex-col gap-1.5"><span className="ds-label">Formato mestre</span>
                <select value={master} onChange={e => setMaster(e.target.value)} className={inputCls + ' h-10'}>{MASTERS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
              <label className="flex flex-col gap-1.5"><span className="ds-label">Qualidade</span>
                <select value={quality} onChange={e => setQuality(e.target.value)} className={inputCls + ' h-10'}>{QUALITIES.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}</select></label>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="ds-label">Estilo visual</span>
              <div className="grid grid-cols-2 gap-2">
                {ESTILOS.map(s => (
                  <button key={s.id} onClick={() => setEstilo(s.id)}
                    className={`text-left p-2.5 rounded-[var(--ws-radius-lg)] border transition ${estilo === s.id ? 'border-[var(--ws-blue)] bg-[rgba(62,91,255,0.06)]' : 'border-[var(--ws-glass-border)] hover:border-[var(--ws-blue)]'}`}>
                    <div className="text-sm font-medium text-[var(--ws-text-1)] flex items-center gap-1">{estilo === s.id && <Check size={13} className="text-[var(--ws-blue)]" />}{s.label}</div>
                    <div className="ds-help mt-0.5 leading-snug">{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="ds-label">Molde / estrutura</span>
              <select value={molde} onChange={e => setMolde(e.target.value)} className={inputCls + ' h-10'}>
                <option value="">Automático (a IA escolhe pelo tema)</option>
                <option value="A">A · Evento/Celebridade</option>
                <option value="B">B · Feature/Tutorial</option>
                <option value="C">C · Tese (X NÃO É Y)</option>
              </select>
              <span className="ds-help">{MOLDES[molde] || MOLDES['']}</span>
            </label>
            {!roteiro && (
              <button onClick={gerarRoteiro} disabled={carregando || (origem === 'referencia' ? !refImg : !tema.trim())} className={botaoPrimario + ' self-start'}>
                {carregando ? <><Loader2 size={16} className="animate-spin" /> Gerando roteiro…</> : <><Wand2 size={16} /> Gerar roteiro</>}
              </button>
            )}
          </div>

          {/* 2) ESTILO VISUAL / MODELO REVERSO (após roteiro) */}
          {roteiro && (
            <div className={`${card} p-5 flex flex-col gap-4`}>
              <span className="ds-section-title">2 · Estilo visual & paleta</span>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="ds-label">Usar um modelo de referência?</span>
                <div className="flex gap-1 p-1 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)]">
                  <button onClick={limparModelo} className={`h-8 px-3 rounded text-sm ${!usarModelo ? 'bg-[var(--ws-blue)] text-white' : 'text-[var(--ws-text-2)]'}`}>Não</button>
                  <button onClick={() => setUsarModelo(true)} className={`h-8 px-3 rounded text-sm ${usarModelo ? 'bg-[var(--ws-blue)] text-white' : 'text-[var(--ws-text-2)]'}`}>Sim</button>
                </div>
                {usarModelo && (
                  <div className="flex gap-1 p-1 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)]">
                    {([['geral', '1 modelo p/ tudo'], ['porSlide', '1 por slide']] as const).map(([id, lbl]) => (
                      <button key={id} onClick={() => setModeloModo(id)} className={`h-8 px-3 rounded text-sm ${modeloModo === id ? 'bg-[var(--ws-blue)] text-white' : 'text-[var(--ws-text-2)]'}`}>{lbl}</button>
                    ))}
                  </div>
                )}
              </div>
              <span className="ds-help">O <b>modelo</b> é uma imagem de referência: a IA segue a linha visual dele (cores, composição, clima, tipografia) e encaixa o seu assunto. <b>1 modelo p/ tudo</b> = mesma cara em todos os slides · <b>1 por slide</b> = um modelo diferente em cada slide.</span>
              {usarModelo && modeloModo === 'geral' && (
                <div className="flex items-center gap-3">
                  <label className="h-10 px-4 inline-flex items-center gap-2 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] text-sm cursor-pointer hover:border-[var(--ws-blue)]">
                    {analisandoModelo === 'geral' ? <Loader2 size={15} className="animate-spin" /> : <ScanSearch size={15} />} Enviar modelo
                    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) lerArquivo(f, url => analisarModelo(url, 'geral')) }} />
                  </label>
                  {modeloGeral && <img src={modeloGeral.img} alt="modelo" className="h-16 w-16 object-cover rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)]" />}
                  {modeloGeral?.spec?.descricao && <span className="ds-help flex-1 line-clamp-2">{modeloGeral.spec.descricao}</span>}
                </div>
              )}
              {/* Paleta 60/30/10 */}
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1">
                  <span className="ds-label">Paleta 60 / 30 / 10 (dominante · apoio · destaque)</span>
                  <div className="flex gap-2 items-center">
                    {(['tensao', 'resolucao', 'pivo'] as const).map((k, n) => (
                      <div key={k} className="flex flex-col items-center gap-0.5">
                        <input type="color" value={toHex((roteiro.paleta || {})[k])} title={['60% dominante', '30% apoio', '10% destaque'][n]}
                          onChange={e => setRoteiro(r => r ? { ...r, paleta: { ...(r.paleta || {}), [k]: e.target.value } } : r)}
                          className="w-9 h-9 rounded cursor-pointer border border-[var(--ws-glass-border)] bg-transparent" />
                        <span className="ds-micro text-[var(--ws-text-3)]">{['60', '30', '10'][n]}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setRoteiro(r => r ? { ...r, paleta: derivar(toHex(r.paleta?.tensao), 'analogas') } : r)} className="ds-help h-8 px-2 rounded border border-[var(--ws-glass-border)] hover:border-[var(--ws-blue)]">Análogas</button>
                  <button onClick={() => setRoteiro(r => r ? { ...r, paleta: derivar(toHex(r.paleta?.tensao), 'complementares') } : r)} className="ds-help h-8 px-2 rounded border border-[var(--ws-glass-border)] hover:border-[var(--ws-blue)]">Complementares</button>
                </div>
              </div>
            </div>
          )}

          {/* 3) ROTEIRO + EDIÇÃO POR SLIDE */}
          {roteiro && (
            <div className="flex flex-col gap-3">
              <div className={`${card} p-4 flex flex-wrap items-end gap-4`}>
                <label className="flex flex-col gap-1"><span className="ds-label">Molde (estrutura)</span>
                  <select value={roteiro.molde || 'A'} onChange={e => { const v = e.target.value; setRoteiro(r => r ? { ...r, molde: v } : r); setMolde(v) }} className={inputCls + ' h-9'}>
                    <option value="A">A · evento/celebridade</option><option value="B">B · feature/tutorial</option><option value="C">C · tese (X NÃO É Y)</option>
                  </select></label>
                <button onClick={() => gerarRoteiro()} disabled={carregando} title="Reescrever o roteiro inteiro nesta estrutura (a IA remonta os slides)"
                  className="ds-help inline-flex items-center gap-1 h-9 px-2.5 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] hover:border-[var(--ws-blue)] disabled:opacity-50">
                  {carregando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Reescrever roteiro
                </button>
                <label className="flex flex-col gap-1 flex-1 min-w-[220px]"><span className="ds-label">Ângulo / tensão (o gancho, em texto)</span>
                  <input value={roteiro.tensao || ''} onChange={e => setRoteiro(r => r ? { ...r, tensao: e.target.value } : r)} placeholder="ex.: clínicas perdem pacientes por um erro invisível" className={inputCls} /></label>
              </div>
              <p className="ds-help">3 · Ajuste cada slide. Tudo tem <Sparkles size={11} className="inline" /> melhorar com IA (contextual, custo zero). Selecione quais personagens/objetos entram em cada slide.</p>
              {(roteiro.slides || []).map(s => (
                <div key={s.index} className={`${card} p-4 flex flex-col gap-2`}>
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[var(--ws-blue)] text-white text-xs flex items-center justify-center font-medium">{s.index}</span>
                    <span className="ds-label">{s.intensidade}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input value={s.copy?.palavra_bomba || ''} onChange={e => editarCopy(s.index, 'palavra_bomba', e.target.value)} placeholder="Palavra-bomba (GIGANTE)"
                      className="flex-1 px-3 h-10 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-transparent text-base font-semibold outline-none focus:border-[var(--ws-blue)]" />
                    {botaoIA(s.index, 'palavra_bomba', s.copy?.palavra_bomba || '')}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2"><input value={s.copy?.contexto || ''} onChange={e => editarCopy(s.index, 'contexto', e.target.value)} placeholder="Contexto (topo)" className={inputCls} />{botaoIA(s.index, 'contexto', s.copy?.contexto || '')}</div>
                    <div className="flex items-center gap-2"><input value={s.copy?.selo || ''} onChange={e => editarCopy(s.index, 'selo', e.target.value)} placeholder="Selo" className={inputCls} />{botaoIA(s.index, 'selo', s.copy?.selo || '')}</div>
                  </div>
                  <div className="flex items-center gap-2"><input value={s.copy?.texto || ''} onChange={e => editarCopy(s.index, 'texto', e.target.value)} placeholder="Texto de apoio" className={inputCls} />{botaoIA(s.index, 'texto', s.copy?.texto || '')}</div>
                  <div className="flex items-start gap-2">
                    <textarea value={s.direcao_imagem || ''} onChange={e => editarSlide(s.index, { direcao_imagem: e.target.value })} rows={2}
                      placeholder="Descreva a imagem deste slide e como encaixar personagens/objetos" className="flex-1 p-3 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] bg-transparent text-sm resize-none outline-none focus:border-[var(--ws-blue)]" />
                    {botaoIA(s.index, 'direcao_imagem', s.direcao_imagem || '')}
                  </div>
                  {/* personagens do pool (seleção por slide) + OBJETO inline deste slide */}
                  {poolP.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1"><span className="ds-micro text-[var(--ws-text-3)] mr-1">Personagens:</span>
                      {poolP.map((p, i) => { const on = idxSel(s, 'personagens_idx', poolP.length).includes(i); return (
                        <button key={i} onClick={() => toggleIdx(s.index, 'personagens_idx', i, poolP.length)}
                          className={`h-6 px-2 rounded-full text-xs border ${on ? 'bg-[var(--ws-blue)] text-white border-[var(--ws-blue)]' : 'border-[var(--ws-glass-border)] text-[var(--ws-text-2)]'}`}>{p.descricao?.slice(0, 18) || `#${i + 1}`}</button>) })}
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <label className="shrink-0 h-9 w-9 rounded-[var(--ws-radius-lg)] border border-[var(--ws-glass-border)] flex items-center justify-center cursor-pointer overflow-hidden hover:border-[var(--ws-blue)]" title="Objeto deste slide (opcional)">
                      {objetosSlide[s.index] ? <img src={objetosSlide[s.index]} className="w-full h-full object-cover" alt="" /> : <ImageIcon size={14} />}
                      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) lerArquivo(f, url => setObjetosSlide(prev => ({ ...prev, [s.index]: url }))) }} />
                    </label>
                    <input value={s.objeto?.descricao || ''} onChange={e => editarSlide(s.index, { objeto: { descricao: e.target.value } })}
                      placeholder="Objeto deste slide (produto/elemento) — opcional" className={inputCls} />
                    {botaoIA(s.index, 'objeto', s.objeto?.descricao || '')}
                  </div>
                  {usarModelo && modeloModo === 'porSlide' && (
                    <label className="self-start ds-help inline-flex items-center gap-1.5 cursor-pointer hover:text-[var(--ws-text-1)]">
                      {analisandoModelo === String(s.index) ? <Loader2 size={13} className="animate-spin" /> : <ScanSearch size={13} />} {modelosSlide[s.index] ? 'Trocar modelo' : 'Modelo deste slide'}
                      {modelosSlide[s.index] && <img src={modelosSlide[s.index].img} className="h-7 w-7 object-cover rounded border border-[var(--ws-glass-border)]" alt="" />}
                      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) lerArquivo(f, url => analisarModelo(url, s.index)) }} />
                    </label>
                  )}
                </div>
              ))}

              {/* Pool de personagens (o objeto é por slide, acima) */}
              <div className={`${card} p-4 flex flex-col gap-3`}>
                <span className="ds-label">Personagens (pool — selecione por slide acima)</span>
                {renderRefs('personagens', personagens, setPersonagens, 'Personagens (até 5, rosto fiel). Pessoas que se repetem entre os slides.')}
                <p className="ds-help">⚠️ Evite fotos de celebridades / figuras públicas — a OpenAI costuma bloquear a geração. Use fotos próprias, de clientes ou de modelos.</p>
              </div>

              {/* Ações: analisar + gerar */}
              <div className="flex flex-wrap gap-2">
                <button onClick={rodarAnalise} disabled={analisando} className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-[var(--ws-radius-lg)] text-sm font-medium border border-[var(--ws-blue)]/50 text-[var(--ws-blue)] bg-[rgba(62,91,255,0.06)] hover:bg-[rgba(62,91,255,0.12)] disabled:opacity-50">
                  {analisando ? <><Loader2 size={16} className="animate-spin" /> Analisando…</> : <><ShieldCheck size={16} /> Análise completa por IA</>}
                </button>
                <button onClick={gerar} disabled={carregando} className={botaoPrimario}>
                  {carregando ? <><Loader2 size={16} className="animate-spin" /> Iniciando…</> : <>{estado ? 'Regenerar' : 'Gerar'} carrossel ({(roteiro.slides || []).length} slides) <ArrowRight size={16} /></>}
                </button>
              </div>
            </div>
          )}

          {/* 4) RESULTADO — box no fim da MESMA página */}
          {estado && (
            <div ref={resultRef} className={`${card} p-4 flex flex-col gap-3`}>
              <div className="flex items-center gap-2 text-sm">
                {!TERMINAIS.includes(estado.carrossel.status)
                  ? <><Loader2 size={16} className="animate-spin text-[var(--ws-blue)]" /> Gerando… ({estado.slides.filter(s => s.status === 'done').length}/{estado.slides.length || (roteiro?.slides || []).length})</>
                  : <span className="ds-label">Carrossel <b className="text-[var(--ws-text-1)] ml-1">{estado.carrossel.status}</b></span>}
                {estado.slides.some(s => s.base_image_url) && (
                  <button onClick={() => setShowVer(true)} className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-[var(--ws-radius-lg)] text-sm border border-[var(--ws-blue)]/50 text-[var(--ws-blue)] bg-[rgba(62,91,255,0.06)] hover:bg-[rgba(62,91,255,0.12)]"><Maximize2 size={14} /> Ver carrossel</button>
                )}
              </div>
              {estado.carrossel.status === 'error' && estado.carrossel.error_message && (
                <div className="flex items-start gap-2 p-2.5 rounded-[var(--ws-radius-lg)] border border-[#a32d2d]/40 bg-[#a32d2d]/10 text-[#a32d2d] text-sm">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>{estado.carrossel.error_message}{estado.carrossel.error_code === 'saldo_insuficiente' ? ' Credite tokens do Estúdio para gerar.' : ''}</span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {(estado.slides || []).map(s => (
                  <div key={s.slide_index} className={`${card} overflow-hidden flex flex-col`}>
                    <div className={`relative ${master === '4x3' ? 'aspect-[4/3]' : 'aspect-[9/16]'} bg-[var(--ws-glass-border)] flex items-center justify-center`}>
                      {s.base_image_url ? <img src={s.base_image_url} alt={`Slide ${s.slide_index}`} className="w-full h-full object-cover" />
                        : (s.status === 'error' || TERMINAIS.includes(estado.carrossel.status)) ? <AlertCircle size={20} className="text-[#a32d2d]" /> : <Loader2 size={20} className="animate-spin text-[var(--ws-text-3)]" />}
                      <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-black/60 text-white text-[11px] flex items-center justify-center">{s.slide_index}</span>
                      {regenerando === s.slide_index && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/55 text-white text-xs">
                          <Loader2 size={22} className="animate-spin" /> Regenerando…
                        </div>
                      )}
                    </div>
                    {(s.status === 'error' || (TERMINAIS.includes(estado.carrossel.status) && !s.base_image_url && s.status !== 'done')) && (
                      <p className="px-2 pt-1.5 text-[11px] leading-snug text-[#a32d2d]">
                        {s.error_message || estado.carrossel.error_message || 'Não gerado.'}{s.error_code === 'blocked_by_policy' ? ' Evite celebridades/figuras públicas; use fotos próprias.' : ''}
                      </p>
                    )}
                    <div className="flex items-center justify-between p-2">
                      <button onClick={() => regenerarSlide(s.slide_index)} disabled={regenerando !== null} title="Regenerar" className="ds-help inline-flex items-center gap-1 hover:text-[var(--ws-text-1)] disabled:opacity-50">
                        {regenerando === s.slide_index ? <><Loader2 size={12} className="animate-spin" /> Regenerando…</> : <><RefreshCw size={12} /> Regenerar</>}
                      </button>
                      {s.base_image_url && <a href={s.base_image_url} target="_blank" rel="noreferrer" download title="Baixar" className="ds-help hover:text-[var(--ws-text-1)]"><Download size={13} /></a>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════ ABA HISTÓRICOS ══════════════════ */}
      {aba === 'historicos' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2"><span className="ds-section-title">Históricos</span>
            <button onClick={carregarHistoricos} className="ds-help inline-flex items-center gap-1 hover:text-[var(--ws-text-1)]"><RefreshCw size={12} /> Atualizar</button></div>
          {carregandoHist && <div className="ds-help inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando…</div>}
          {historicos && historicos.length === 0 && !carregandoHist && <p className="ds-help">Nenhum carrossel ainda. Crie o primeiro na aba Criar.</p>}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {(historicos || []).map(h => (
              <div key={h.id} className={`${card} overflow-hidden flex flex-col`}>
                <div className={`relative ${h.master_format === '4x3' ? 'aspect-[4/3]' : 'aspect-[9/16]'} bg-[var(--ws-glass-border)]`}>
                  {h.capa ? <img src={h.capa} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon size={20} className="text-[var(--ws-text-3)]" /></div>}
                  {!!h.n_prontos && <span className="absolute top-1.5 right-1.5 px-1.5 h-5 rounded-full bg-black/60 text-white text-[11px] flex items-center justify-center">{h.n_prontos}</span>}
                </div>
                <div className="p-2 flex flex-col gap-1">
                  <span className="text-sm text-[var(--ws-text-1)] line-clamp-2" title={h.tema || ''}>{h.tema || 'Sem tema'}</span>
                  <span className="ds-micro text-[var(--ws-text-3)]">{h.criado_em ? new Date(h.criado_em).toLocaleDateString('pt-BR') : ''} · {h.status}</span>
                  <div className="flex items-center gap-2 pt-1">
                    {h.capa && <a href={h.capa} target="_blank" rel="noreferrer" download className="ds-help hover:text-[var(--ws-text-1)]" title="Baixar capa"><Download size={13} /></a>}
                    <button onClick={() => usarComoModelo(h)} className="ds-help hover:text-[var(--ws-text-1)]" title="Usar como modelo"><LayoutGrid size={13} /></button>
                    <button onClick={() => excluirHist(h.id)} className="ds-help ml-auto hover:text-[#a32d2d]" title="Excluir"><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════ ABA MODELOS ══════════════════ */}
      {aba === 'modelos' && (
        <div className={`${card} p-6 flex flex-col items-center gap-2 text-center max-w-xl`}>
          <LayoutGrid size={22} className="text-[var(--ws-blue)]" />
          <span className="ds-section-title">Modelos de referência</span>
          <p className="ds-help">Em breve: uma biblioteca de modelos curados de carrossel newsjacking. Por enquanto, salve um carrossel pronto pelo botão <b>Usar como modelo</b> na aba Históricos.</p>
        </div>
      )}

      {/* ══════════════════ MODAL "VER CARROSSEL" (lado a lado, fit na tela) ══════════════════ */}
      {showVer && estado && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/85 p-3 sm:p-5" onClick={() => setShowVer(false)}>
          <div className="flex items-center justify-between text-white mb-3 shrink-0" onClick={e => e.stopPropagation()}>
            <span className="text-sm font-medium">Carrossel — {estado.slides.filter(s => s.base_image_url).length}/{estado.slides.length} prontos</span>
            <button onClick={() => setShowVer(false)} title="Fechar" className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white"><X size={18} /></button>
          </div>
          <div className="flex-1 min-h-0 flex items-stretch justify-center gap-2 sm:gap-3" onClick={e => e.stopPropagation()}>
            {estado.slides.map(s => (
              <div key={s.slide_index} className="relative flex-1 min-w-0 flex items-center justify-center">
                {s.base_image_url
                  ? <img src={s.base_image_url} alt={`Slide ${s.slide_index}`} className="max-h-full max-w-full object-contain rounded-lg shadow-2xl" />
                  : <div className="flex flex-col items-center justify-center gap-1.5 text-white/60 text-xs px-2 text-center">
                      {s.status === 'error'
                        ? <><AlertCircle size={22} className="text-[#ff8b8b]" /><span>{s.error_message || 'Falhou'}</span></>
                        : <Loader2 size={22} className="animate-spin" />}
                    </div>}
                <span className="absolute top-1 left-1 w-6 h-6 rounded-full bg-black/70 text-white text-xs flex items-center justify-center">{s.slide_index}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════ MODAL DA ANÁLISE ══════════════════ */}
      {showAnalise && analise && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowAnalise(false)}>
          <div className={`${card} max-w-lg w-full p-5 flex flex-col gap-3`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className={analise.status === 'bom' ? 'text-[#3b6d11]' : analise.status === 'ruim' ? 'text-[#a32d2d]' : 'text-[#854f0b]'} />
              <span className="ds-section-title">Análise por IA</span>
              <span className={`ml-auto text-sm font-semibold ${analise.score >= 80 ? 'text-[#3b6d11]' : analise.score >= 50 ? 'text-[#854f0b]' : 'text-[#a32d2d]'}`}>{analise.score}/100</span>
            </div>
            {analise.resumo && <p className="text-sm text-[var(--ws-text-1)]">{analise.resumo}</p>}
            {!!(analise.inconsistencias || []).length && (
              <div className="flex flex-col gap-1"><span className="ds-label text-[#a32d2d]">Inconsistências</span>
                <ul className="list-disc pl-5 text-sm text-[var(--ws-text-2)] flex flex-col gap-0.5">{analise.inconsistencias!.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            )}
            {!!(analise.sugestoes || []).length && (
              <div className="flex flex-col gap-1"><span className="ds-label">Sugestões</span>
                <ul className="list-disc pl-5 text-sm text-[var(--ws-text-2)] flex flex-col gap-0.5">{analise.sugestoes!.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button onClick={() => setShowAnalise(false)} className="h-9 px-4 rounded-[var(--ws-radius-lg)] text-sm border border-[var(--ws-glass-border)] hover:border-[var(--ws-blue)]">Ajusto eu</button>
              <button onClick={ajustarTudo} disabled={analisando} title="A IA reescreve tudo na melhor versão, mantendo o mesmo assunto"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[var(--ws-radius-lg)] text-sm border border-[var(--ws-blue)]/50 text-[var(--ws-blue)] bg-[rgba(62,91,255,0.06)] hover:bg-[rgba(62,91,255,0.12)] disabled:opacity-50">
                {analisando ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Deixar a IA ajustar tudo
              </button>
              <button onClick={gerar} className={botaoPrimario + ' h-9'}>Gerar mesmo assim <ArrowRight size={15} /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
