'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import api from '@/lib/api-client'

type Info = {
  canal_nome: string | null
  cliente_nome: string | null
  tipo: string
  connection_status: string | null
  numero_telefone: string | null
}

type ConexaoResp = {
  connection_status: string | null
  qr_code: string | null
  pairing_code: string | null
  numero_telefone?: string | null
  message?: string
}

type Fase = 'carregando' | 'qr' | 'pareando' | 'conectado' | 'expirado' | 'erro'

const QR_TTL_SEGUNDOS = 150
const POLL_MS = 2000

function normalizarQr(qr: string | null | undefined): string | null {
  if (!qr) return null
  if (qr.startsWith('data:') || qr.startsWith('http')) return qr
  return `data:image/png;base64,${qr}`
}

function ehTokenInvalido(msg: string): boolean {
  const m = msg.toLowerCase()
  return m.includes('expirado') || m.includes('inválido') || m.includes('invalido')
}

export function ConectarCliente({ token }: { token: string }) {
  const [fase, setFase] = useState<Fase>('carregando')
  const [info, setInfo] = useState<Info | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [pairing, setPairing] = useState<string | null>(null)
  const [numero, setNumero] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [restante, setRestante] = useState(QR_TTL_SEGUNDOS)
  const [telefone, setTelefone] = useState('')
  const [pareando, setPareando] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const ttlRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pararTimers = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (ttlRef.current) {
      clearInterval(ttlRef.current)
      ttlRef.current = null
    }
  }, [])

  const aoConectar = useCallback(
    (num?: string | null) => {
      pararTimers()
      setNumero(num ?? null)
      setFase('conectado')
    },
    [pararTimers],
  )

  const iniciarPolling = useCallback(() => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      try {
        const s = await api.get<ConexaoResp>(`/public/conectar/${token}/status`)
        if (s.connection_status === 'connected') {
          aoConectar(s.numero_telefone)
          return
        }
        const novoQr = normalizarQr(s.qr_code)
        if (novoQr) setQr(novoQr)
        if (s.pairing_code) setPairing(s.pairing_code)
      } catch {
        // erros transitórios de polling (rate-limit/rede) são ignorados
      }
    }, POLL_MS)
  }, [token, aoConectar])

  const iniciarTtl = useCallback(() => {
    setRestante(QR_TTL_SEGUNDOS)
    if (ttlRef.current) clearInterval(ttlRef.current)
    ttlRef.current = setInterval(() => {
      setRestante((r) => {
        if (r <= 1) {
          pararTimers()
          setFase('expirado')
          return 0
        }
        return r - 1
      })
    }, 1000)
  }, [pararTimers])

  const iniciarConexao = useCallback(async () => {
    setErro(null)
    setQr(null)
    setPairing(null)
    setFase('carregando')
    try {
      const r = await api.post<ConexaoResp>(`/public/conectar/${token}/iniciar`)
      if (r.connection_status === 'connected') {
        aoConectar(r.numero_telefone)
        return
      }
      setQr(normalizarQr(r.qr_code))
      setPairing(r.pairing_code)
      setFase('qr')
      iniciarTtl()
      iniciarPolling()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao iniciar a conexão')
      setFase('erro')
    }
  }, [token, aoConectar, iniciarTtl, iniciarPolling])

  useEffect(() => {
    let ativo = true
    ;(async () => {
      try {
        const i = await api.get<Info>(`/public/conectar/${token}`)
        if (!ativo) return
        setInfo(i)
        if (i.connection_status === 'connected') {
          setNumero(i.numero_telefone)
          setFase('conectado')
          return
        }
        await iniciarConexao()
      } catch (e) {
        if (!ativo) return
        const msg = e instanceof Error ? e.message : ''
        if (ehTokenInvalido(msg)) {
          setFase('expirado')
        } else {
          setErro(msg || 'Não foi possível carregar o link de conexão')
          setFase('erro')
        }
      }
    })()
    return () => {
      ativo = false
      pararTimers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const parear = useCallback(async () => {
    const tel = telefone.replace(/\D/g, '')
    if (tel.length < 10) {
      setErro('Informe o número com DDD (ex.: 11999999999)')
      return
    }
    setPareando(true)
    setErro(null)
    try {
      const r = await api.post<ConexaoResp>(`/public/conectar/${token}/parear`, { telefone: tel })
      setPairing(r.pairing_code)
      setFase('pareando')
      iniciarPolling()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar o código')
    } finally {
      setPareando(false)
    }
  }, [token, telefone, iniciarPolling])

  const mm = String(Math.floor(restante / 60)).padStart(1, '0')
  const ss = String(restante % 60).padStart(2, '0')
  const titulo = info?.cliente_nome
    ? `Conectar o WhatsApp de ${info.cliente_nome}`
    : 'Conectar seu WhatsApp'

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0E142A] px-4 py-10 text-white">
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl backdrop-blur-xl"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.45)' }}
      >
        <div className="mb-6 text-center">
          <h1 className="text-lg font-semibold">{titulo}</h1>
          {info?.canal_nome && (
            <p className="mt-1 text-sm text-white/60">Canal: {info.canal_nome}</p>
          )}
        </div>

        {fase === 'carregando' && (
          <div className="flex flex-col items-center gap-3 py-10">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#00F5FF]" />
            <p className="text-sm text-white/70">Preparando a conexão…</p>
          </div>
        )}

        {fase === 'qr' && (
          <div className="flex flex-col items-center gap-4">
            {qr ? (
              <div className="rounded-xl bg-white p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="QR Code de conexão" width={232} height={232} />
              </div>
            ) : (
              <div className="flex h-[256px] w-[256px] items-center justify-center rounded-xl bg-white/5 text-sm text-white/60">
                Gerando QR code…
              </div>
            )}
            <p className="text-center text-sm text-white/70">
              Abra o WhatsApp → <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong> e
              escaneie o código.
            </p>
            <p className="text-xs text-white/45">O código expira em {mm}:{ss}</p>

            <div className="mt-2 w-full border-t border-white/10 pt-4">
              <p className="mb-2 text-center text-xs text-white/55">Ou conecte pelo número:</p>
              <div className="flex gap-2">
                <input
                  inputMode="numeric"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="DDD + número"
                  className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-white/35 focus:border-[#00F5FF]/60"
                />
                <button
                  type="button"
                  onClick={parear}
                  disabled={pareando}
                  className="rounded-lg bg-[#3E5BFF] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#3E5BFF]/85 disabled:opacity-50"
                >
                  {pareando ? '…' : 'Gerar código'}
                </button>
              </div>
            </div>
            {erro && <p className="text-center text-xs text-[#FF5C8D]">{erro}</p>}
          </div>
        )}

        {fase === 'pareando' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-sm text-white/70">Digite este código no seu WhatsApp:</p>
            <div className="rounded-xl border border-[#00F5FF]/30 bg-white/5 px-6 py-4 text-3xl font-bold tracking-[0.3em] text-[#00F5FF]">
              {pairing ?? '••••••'}
            </div>
            <p className="text-center text-sm text-white/60">
              WhatsApp → <strong>Aparelhos conectados</strong> → <strong>Conectar com número de telefone</strong>.
            </p>
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-[#00F5FF]" />
          </div>
        )}

        {fase === 'conectado' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0fa856]/15 text-3xl text-[#0fa856]">
              ✓
            </div>
            <h2 className="text-lg font-semibold">WhatsApp conectado!</h2>
            {numero && <p className="text-sm text-white/65">Número: {numero}</p>}
            <p className="text-sm text-white/55">Pode fechar esta página.</p>
          </div>
        )}

        {fase === 'expirado' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <p className="text-sm text-white/70">O código expirou. Gere um novo para continuar.</p>
            <button
              type="button"
              onClick={iniciarConexao}
              className="rounded-lg bg-[#3E5BFF] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#3E5BFF]/85"
            >
              Gerar novo código
            </button>
          </div>
        )}

        {fase === 'erro' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <p className="text-sm text-[#FF5C8D]">{erro ?? 'Algo deu errado.'}</p>
            <button
              type="button"
              onClick={iniciarConexao}
              className="rounded-lg border border-white/15 bg-white/5 px-5 py-2 text-sm font-medium text-white transition hover:bg-white/10"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
