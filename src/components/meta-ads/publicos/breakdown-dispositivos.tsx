'use client'

import { Separator } from '@/components/ui/separator'
import type { DadosDispositivo, DadosSO } from '@/types/meta-ads-publicos'

interface Props {
  dispositivos: DadosDispositivo[]
  sistemasOperacionais: DadosSO[]
}

function corCpl(cpl: number): string {
  if (cpl <= 0.50) return '#3b6d11'
  if (cpl <= 1.00) return '#854f0b'
  return '#a32d2d'
}

function IconeMobile() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect x="8" y="4" width="12" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="12" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconeDesktop() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect x="4" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="14" y1="19" x2="14" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="10" y1="23" x2="18" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconeTablet() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect x="6" y="3" width="16" height="22" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="12" y1="22" x2="16" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function EmptyHint({ title, description }: { title: string; description: string }) {
  return (
    <div style={{
      border: '1px dashed var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-md)',
      padding: '14px 12px',
      color: 'var(--ws-text-2)',
      background: 'rgba(14,20,42,0.03)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ws-text-1)', marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.5 }}>
        {description}
      </div>
    </div>
  )
}

const ICONES: Record<string, React.ReactNode> = {
  mobile: <IconeMobile />,
  desktop: <IconeDesktop />,
  tablet: <IconeTablet />,
}

const NOMES: Record<string, string> = {
  mobile: 'Mobile',
  desktop: 'Desktop',
  tablet: 'Tablet',
}

export function BreakdownDispositivos({ dispositivos, sistemasOperacionais }: Props) {
  const semDispositivos = dispositivos.length === 0
  const semSistemas = sistemasOperacionais.length === 0

  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow)',
      padding: '16px 20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
      }} />
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)' }}>Performance por dispositivo</div>
      </div>

      <div style={{ marginBottom: 14 }}>
        {semDispositivos ? (
          <EmptyHint
            title="Dados de dispositivos não disponíveis para o período selecionado."
            description="Quando a API retornar essa série, a distribuição por mobile, desktop e tablet será exibida aqui."
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {dispositivos.map(d => (
              <div key={d.tipo} style={{
                background: 'rgba(14,20,42,0.04)',
                border: '1px solid var(--ws-glass-border)',
                borderRadius: 'var(--ws-radius-md)',
                padding: '10px 8px',
                textAlign: 'center',
              }}>
                <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--ws-text-2)', marginBottom: 4 }}>
                  {ICONES[d.tipo]}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ws-text-2)', marginBottom: 2 }}>{NOMES[d.tipo]}</div>
                <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--ws-text-1)' }}>{d.percentual}%</div>
                <div style={{ fontSize: 11, color: corCpl(d.cpl) }}>R${d.cpl.toFixed(2).replace('.', ',')} CPL</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator style={{ marginBottom: 12, opacity: 0.1 }} />

      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ws-text-2)', marginBottom: 8 }}>
          Sistema operacional
        </div>
        {semSistemas ? (
          <EmptyHint
            title="Dados de sistema operacional não disponíveis para o período selecionado."
            description="Quando a API retornar essa série, a distribuição por Android, iOS e desktop será exibida aqui."
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {sistemasOperacionais.map(so => (
              <div key={so.nome} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--ws-text-1)' }}>{so.nome}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--ws-text-2)' }}>{so.percentual}%</span>
                  <span style={{ fontSize: 11, color: corCpl(so.cpl) }}>R${so.cpl.toFixed(2).replace('.', ',')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
