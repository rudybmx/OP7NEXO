'use client'

import React from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Cell, ReferenceLine, Tooltip } from 'recharts'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import type { CampanhaGoogle, DistribuicaoQS } from '@/types/google-ads'

interface Props {
  campanhas: CampanhaGoogle[]
  distribuicaoQS: DistribuicaoQS[]
}

const QS_DIAGRAM = `
  <div style="font-size:10px;color:#666;display:flex;flex-direction:column;gap:4px">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:4px">
        <div style="width:10px;height:10px;background:#FF5C8D;border-radius:2px"></div>
        <span>1–3 Ruim</span>
      </div>
      <span style="color:#999;font-size:9px">CPC até +400%</span>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:4px">
        <div style="width:10px;height:10px;background:#EF9F27;border-radius:2px"></div>
        <span>4–6 Regular</span>
      </div>
      <span style="color:#999;font-size:9px">CPC referência</span>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:4px">
        <div style="width:10px;height:10px;background:#0fa856;border-radius:2px"></div>
        <span>7–10 Bom</span>
      </div>
      <span style="color:#999;font-size:9px">CPC até -50%</span>
    </div>
  </div>
`

const ROAS_DIAGRAM = `
  <div style="font-size:10px;color:#666;display:flex;flex-direction:column;gap:4px">
    <div style="display:flex;align-items:center;gap:5px">
      <div style="width:24px;height:10px;background:#0fa856;border-radius:2px"></div>
      <span>ROAS &gt; 30× Excelente</span>
    </div>
    <div style="display:flex;align-items:center;gap:5px">
      <div style="width:16px;height:10px;background:#F5A623;border-radius:2px"></div>
      <span>ROAS 10–30× Bom</span>
    </div>
    <div style="display:flex;align-items:center;gap:5px">
      <div style="width:8px;height:10px;background:#FF5C8D;border-radius:2px"></div>
      <span>ROAS &lt; 10× Atenção</span>
    </div>
    <div style="margin-top:4px;padding-top:4px;border-top:1px solid var(--ws-divider);font-size:9px;color:#999">
      Linha vermelha = ROAS mínimo (1×)
    </div>
  </div>
`

function isDark() {
  if (typeof window === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

export function GraficosQualidade({ campanhas, distribuicaoQS }: Props) {
  const dark = isDark()
  const tickColor = dark ? '#6b6b6b' : '#9b9a97'

  const [isMobile, setIsMobile] = React.useState(false)
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const dadosRoas = campanhas
    .filter(c => c.roas > 0)
    .map(c => ({
      nome: c.nome.length > 22 ? c.nome.substring(0, 22) + '…' : c.nome,
      roas: c.roas,
      cor: c.roas > 30 ? '#0fa856' : c.roas > 15 ? '#F5A623' : '#FF5C8D',
    }))

  const maxQS = Math.max(...distribuicaoQS.map(d => d.quantidade), 1)

  const commonWrapperStyle: React.CSSProperties = {
    background: 'var(--ws-glass-bg)',
    border: '1px solid var(--ws-glass-border)',
    borderRadius: 'var(--ws-radius-lg)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    boxShadow: 'var(--ws-glass-shadow)',
    padding: '16px 20px',
    position: 'relative',
    overflow: 'hidden',
  }

  const GlowLine = () => (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1,
      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)' }} />
  )

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
      {/* QS */}
      <div style={commonWrapperStyle}>
        <GlowLine />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Distribuição de Quality Score</div>
            <div style={{ fontSize: 11, color: 'var(--ws-text-2)' }}>Keywords por faixa de QS</div>
          </div>
          <InfoTooltip
            title="Distribuição de Quality Score"
            description="QS de 1–10 mede relevância da keyword + anúncio + landing page. QS alto = CPC menor e melhor posição."
            diagram={QS_DIAGRAM}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {distribuicaoQS.map(d => {
            const corMapeada = d.cor === '#3b6d11' ? '#0fa856' : d.cor === '#854f0b' ? '#EF9F27' : d.cor === '#a32d2d' ? '#FF5C8D' : d.cor
            return (
              <div key={d.faixa}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--ws-text-1)', fontWeight: 500 }}>{d.faixa}</span>
                  <span style={{ fontSize: 11, color: 'var(--ws-text-3)' }}>{d.quantidade} keywords</span>
                </div>
                <div style={{ height: 10, background: 'rgba(14,20,42,0.08)', borderRadius: 3 }}>
                  <div style={{ width: `${(d.quantidade / maxQS) * 100}%`, height: '100%', background: corMapeada, borderRadius: 3 }} />
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--ws-divider)', display: 'flex', gap: 12 }}>
          {[
            { cor: '#0fa856', label: '7–10 Bom' },
            { cor: '#EF9F27', label: '4–6 Regular' },
            { cor: '#FF5C8D', label: '1–3 Ruim' },
          ].map(({ cor, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, background: cor, borderRadius: 1, display: 'inline-block' }} />
              <span style={{ fontSize: 10, color: 'var(--ws-text-3)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ROAS */}
      <div style={commonWrapperStyle}>
        <GlowLine />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>ROAS por campanha</div>
            <div style={{ fontSize: 11, color: 'var(--ws-text-2)' }}>Retorno sobre gasto por campanha ativa</div>
          </div>
          <InfoTooltip
            title="ROAS por campanha"
            description="Retorno sobre gasto em anúncios. ROAS 30× = cada R$1 gasto gera R$30 em valor de conversão."
            diagram={ROAS_DIAGRAM}
          />
        </div>

        <ResponsiveContainer width="100%" height={160}>
          <BarChart layout="vertical" data={dadosRoas} margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
            <XAxis type="number" tick={{ fontSize: 10, fill: tickColor }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="nome" tick={{ fontSize: 10, fill: tickColor }} width={isMobile ? 90 : 130} axisLine={false} tickLine={false} />
            <Tooltip 
              contentStyle={{ background: 'rgba(14,20,42,0.92)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 11 }} 
              itemStyle={{ color: '#fff' }}
              labelStyle={{ color: '#fff' }}
              formatter={(v) => [`${Number(v).toFixed(1)}×`, 'ROAS']} 
            />
            <ReferenceLine x={1} stroke="#FF5C8D" strokeDasharray="3 3" label={{ value: 'Mín.', fontSize: 9, fill: '#FF5C8D' }} />
            <Bar dataKey="roas" radius={[0, 2, 2, 0]}>
              {dadosRoas.map((entry, i) => (
                <Cell key={i} fill={entry.cor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
