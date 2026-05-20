'use client'
import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { X, TrendingUp, Eye, MousePointer } from 'lucide-react'

function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(14,20,42,0.55)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {children}
    </div>
  )
}

function ModalContent({ children, width = 480 }: { children: ReactNode; width?: number }) {
  return (
    <div style={{
      width, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto',
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: 'var(--ws-glass-shadow-lg)',
      borderRadius: 'var(--ws-radius-xl)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }} />
      {children}
    </div>
  )
}

export function DSModais() {
  const [modal, setModal] = useState<1 | 2 | 3 | null>(null)

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ws-text-1)', marginBottom: 6 }}>Modais</h2>
        <p style={{ fontSize: 14, color: 'var(--ws-text-2)', lineHeight: 1.6 }}>
          3 variações: simples, anúncio com thumbnail, e análise IA com KPIs.
          Overlay com blur. Fechar clicando fora.
        </p>
        <div style={{
          marginTop: 14,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--ws-glass-bg)',
          border: '1px solid var(--ws-glass-border)',
          borderRadius: 'var(--ws-radius-lg)',
          backdropFilter: 'blur(16px)',
          boxShadow: 'var(--ws-glass-shadow-sm)',
          padding: '12px 14px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ws-text-3)', marginBottom: 4 }}>
              Novo componente
            </div>
            <div style={{ fontSize: 13, color: 'var(--ws-text-2)', lineHeight: 1.5 }}>
              O modal unificado de criativo está em uma página dedicada para aprovação visual.
            </div>
          </div>
          <Link
            href="/design-system/modal-anuncios"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 12px',
              borderRadius: 'var(--ws-radius-md)',
              background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))',
              color: 'white',
              textDecoration: 'none',
              fontSize: 13,
              fontWeight: 600,
              boxShadow: '0 6px 18px rgba(62,91,255,0.28)',
            }}
          >
            Abrir modal unificado
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { id: 1 as const, label: 'Modal Simples', variant: 'secondary' },
          { id: 2 as const, label: 'Modal Anúncio', variant: 'secondary' },
          { id: 3 as const, label: 'Modal KPIs + IA', variant: 'primary' },
        ].map(({ id, label, variant }) => (
          <button
            key={id}
            type="button"
            onClick={() => setModal(id)}
            style={{
              height: 36, padding: '0 16px', borderRadius: 'var(--ws-radius-md)',
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
              transition: 'var(--ws-transition)',
              ...(variant === 'primary'
                ? { background: 'linear-gradient(135deg, var(--ws-blue), var(--ws-purple))', color: 'white', border: 'none', boxShadow: '0 4px 16px rgba(62,91,255,0.35)' }
                : { background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)', backdropFilter: 'blur(10px)', color: 'var(--ws-text-1)', boxShadow: 'var(--ws-glass-shadow-sm)' }),
            }}
          >{label}</button>
        ))}
      </div>

      {/* Modal 1: Simples */}
      {modal === 1 && (
        <Modal onClose={() => setModal(null)}>
          <ModalContent>
            <div style={{ padding: '24px 24px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ws-text-1)' }}>Pausar campanha?</div>
                  <div style={{ fontSize: 13, color: 'var(--ws-text-2)', marginTop: 4 }}>Esta ação irá pausar todos os grupos desta campanha.</div>
                </div>
                <button type="button" onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-3)', padding: 4 }}>
                  <X size={16} />
                </button>
              </div>
              <p style={{ fontSize: 13, color: 'var(--ws-text-2)', lineHeight: 1.6, marginBottom: 20 }}>
                A campanha <strong style={{ color: 'var(--ws-text-1)' }}>LAL 3% — Lookalike Leads</strong> será pausada imediatamente.
                Você pode reativá-la a qualquer momento.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setModal(null)} style={{
                  height: 36, padding: '0 16px', borderRadius: 'var(--ws-radius-md)',
                  background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
                  fontSize: 13, color: 'var(--ws-text-2)', cursor: 'pointer',
                }}>Cancelar</button>
                <button type="button" onClick={() => setModal(null)} style={{
                  height: 36, padding: '0 16px', borderRadius: 'var(--ws-radius-md)',
                  background: 'rgba(255,92,141,0.12)', border: '1px solid rgba(255,92,141,0.25)',
                  fontSize: 13, color: '#c2004f', fontWeight: 500, cursor: 'pointer',
                }}>Pausar campanha</button>
              </div>
            </div>
          </ModalContent>
        </Modal>
      )}

      {/* Modal 2: Anúncio */}
      {modal === 2 && (
        <Modal onClose={() => setModal(null)}>
          <ModalContent width={600}>
            <div style={{ display: 'flex', gap: 0 }}>
              {/* Thumbnail 9:16 */}
              <div style={{
                width: 200, flexShrink: 0,
                background: 'linear-gradient(180deg, #1A2444 0%, #0E142A 100%)',
                borderRadius: '18px 0 0 18px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                minHeight: 280,
                position: 'relative',
              }}>
                <div style={{ fontSize: 40 }}>🏠</div>
                <div style={{
                  position: 'absolute', bottom: 12, left: 0, right: 0,
                  padding: '0 12px', textAlign: 'center',
                  fontSize: 11, color: 'rgba(255,255,255,0.6)',
                }}>Anúncio · Formato 9:16</div>
              </div>
              {/* Métricas */}
              <div style={{ flex: 1, padding: '24px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ws-text-1)' }}>Morar bem em SP</div>
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', background: 'rgba(15,168,86,0.12)', border: '1px solid rgba(15,168,86,0.25)', borderRadius: 9999, padding: '2px 8px', color: '#007a40' }}>Ativo</span>
                  </div>
                  <button type="button" onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-3)' }}>
                    <X size={16} />
                  </button>
                </div>
                {[
                  ['Impressões', '48.240'],
                  ['Cliques', '1.847'],
                  ['CTR', '3,82%'],
                  ['Leads', '124'],
                  ['CPL', 'R$ 31,20'],
                  ['Frequência', '2,4'],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--ws-divider)' }}>
                    <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ws-text-1)' }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </ModalContent>
        </Modal>
      )}

      {/* Modal 3: KPIs + IA */}
      {modal === 3 && (
        <Modal onClose={() => setModal(null)}>
          <ModalContent width={560}>
            <div style={{ padding: '24px 24px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ws-text-1)' }}>Análise do Criativo</div>
                  <div style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>LAL 3% — Lookalike · 7 últimos dias</div>
                </div>
                <button type="button" onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ws-text-3)' }}>
                  <X size={16} />
                </button>
              </div>
              {/* KPI grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
                {[
                  { icon: <Eye size={14} />, label: 'Impressões', val: '48.240', color: 'var(--ws-blue)' },
                  { icon: <MousePointer size={14} />, label: 'Cliques', val: '1.847', color: 'var(--ws-purple)' },
                  { icon: <TrendingUp size={14} />, label: 'Leads', val: '124', color: 'var(--ws-green)' },
                ].map(({ icon, label, val, color }) => (
                  <div key={label} style={{
                    background: 'var(--ws-glass-bg)', border: '1px solid var(--ws-glass-border)',
                    borderRadius: 10, padding: '10px 12px',
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <div style={{ color, opacity: 0.8 }}>{icon}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ws-text-1)' }}>{val}</div>
                    <div style={{ fontSize: 10, color: 'var(--ws-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                  </div>
                ))}
              </div>
              {/* Análise IA */}
              <div style={{
                borderLeft: '3px solid var(--ws-purple)',
                background: 'var(--ws-purple-soft)',
                border: '1px solid var(--ws-glass-border)',
                borderLeftColor: 'var(--ws-purple)',
                borderRadius: 8, padding: '10px 12px',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ws-purple)', marginBottom: 6 }}>Análise IA</div>
                <p style={{ fontSize: 12, color: 'var(--ws-text-2)', lineHeight: 1.6, margin: 0 }}>
                  Criativo com CTR 38% acima da média do conjunto. Recomendado escalar orçamento em 30%.
                  Frequência ainda controlada (2,4) — sem risco de fadiga nos próximos 7 dias.
                </p>
              </div>
            </div>
          </ModalContent>
        </Modal>
      )}
    </div>
  )
}
