'use client'

import React from 'react'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell 
} from 'recharts'
import { FaFacebook, FaGoogle, FaLinkedin, FaTiktok, FaWhatsapp, FaGlobe } from 'react-icons/fa'
import { Smartphone } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// GRÁFICO 1: CONVERSÃO POR PLATAFORMA
// ─────────────────────────────────────────────────────────────────────────────

interface PlatData {
  plataforma: string
  leads: number
  ganhos: number
}

const plataformaConfig: Record<string, { label: string; cor: string; emoji: string }> = {
  meta:      { label: 'Meta',      cor: '#1877F2', emoji: '📘' },
  google:    { label: 'Google',    cor: '#4285F4', emoji: '🔍' },
  whatsapp:  { label: 'WhatsApp',  cor: '#25d366', emoji: '💬' },
  offline:   { label: 'Offline',   cor: '#8892b0', emoji: '📍' },
  linkedin:  { label: 'LinkedIn',  cor: '#0A66C2', emoji: '💼' },
  tiktok:    { label: 'TikTok',    cor: '#000000', emoji: '🎵' },
  organico:  { label: 'Orgânico',  cor: 'var(--ws-green)', emoji: '🌱' },
  outro:     { label: 'Outro',     cor: '#8892b0', emoji: '📌' },
}

const CustomYAxisTick = ({ x, y, payload }: any) => {
  const config = plataformaConfig[payload.value.toLowerCase()] || { label: payload.value, emoji: '•', cor: '#8892b0' }
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={-8} y={4} textAnchor="end" fontSize={11} fill="var(--ws-text-2)" fontFamily="Plus Jakarta Sans">
        {config.emoji} {config.label}
      </text>
    </g>
  )
}

export function GraficoPlataformas({ data }: { data: PlatData[] }) {
  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow)',
      padding: '20px 24px',
      position: 'relative', overflow: 'hidden',
      height: '100%',
    }}>
      {/* Linha de brilho */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.8),transparent)',
        pointerEvents: 'none',
      }} />
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--ws-text-3)' }}>
          CONVERSÃO POR PLATAFORMA
        </p>
        {/* Legenda */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(62,91,255,0.4)' }} />
            <span style={{ fontSize: 10, color: 'var(--ws-text-3)' }}>Leads</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--ws-green)' }} />
            <span style={{ fontSize: 10, color: 'var(--ws-text-3)' }}>Ganhos</span>
          </div>
        </div>
      </div>
      
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={data} 
            layout="vertical" 
            margin={{ left: 40, right: 20 }}
            barGap={4}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
            <XAxis type="number" hide />
            <YAxis 
              dataKey="plataforma" 
              type="category" 
              tick={<CustomYAxisTick />}
              width={100}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip 
              cursor={{ fill: 'rgba(255,255,255,0.02)' }}
              contentStyle={{ 
                background: '#0f2744', 
                border: 'none', 
                borderRadius: '8px',
                fontSize: '11px',
                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)'
              }}
              itemStyle={{ color: '#fff', padding: '2px 0' }}
              labelStyle={{ color: '#fff', fontWeight: '600', marginBottom: '4px' }}
            />
            <Bar dataKey="leads" name="Leads" fill="var(--ws-blue)" opacity={0.4} radius={[0, 4, 4, 0]} barSize={10} />
            <Bar dataKey="ganhos" name="Ganhos" fill="var(--ws-green)" radius={[0, 4, 4, 0]} barSize={10} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GRÁFICO 2: FUNIL DE CONVERSÃO (SVG)
// ─────────────────────────────────────────────────────────────────────────────

interface FunnelStep {
  label: string
  value: number
  percent: number
}

export function FunilConversao({ steps }: { steps: FunnelStep[] }) {
  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow)',
      padding: '20px 24px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Linha de brilho */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.8),transparent)',
        pointerEvents: 'none',
      }} />
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--ws-text-3)', marginBottom: 16 }}>
        FUNIL DE CONVERSÃO
      </p>

      <div className="flex flex-col gap-1 mt-4">
        {steps.map((step, idx) => {
          const maxWidth = 100
          const minWidth = 10
          // Calcula largura proporcional, mas garante um mínimo para visibilidade
          const width = Math.max(minWidth, maxWidth * (step.percent / 100))
          
          // Cores degradê de Blue para Green
          const colors = [
            'linear-gradient(90deg, #3E5BFF, #5c77ff)',
            'linear-gradient(90deg, #4270ff, #5c8bff)',
            'linear-gradient(90deg, #4784ff, #5ca0ff)',
            'linear-gradient(90deg, #0fa856, #22c55e)',
            'linear-gradient(90deg, #0fa856, #4ade80)'
          ]

          return (
            <div key={idx} className="flex flex-col items-center">
              <div 
                className="relative h-10 flex items-center justify-center transition-all hover:scale-[1.02]"
                style={{ 
                  width: `${width}%`,
                  background: colors[idx] || colors[0],
                  clipPath: 'polygon(5% 0%, 95% 0%, 100% 100%, 0% 100%)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
              >
                <div className="text-[11px] font-bold text-white whitespace-nowrap drop-shadow-md">
                  {step.value} {step.label}
                </div>
                <div className="absolute right-[-45px] top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--ws-text-3)]">
                  {step.percent}%
                </div>
              </div>
              {idx < steps.length - 1 && (
                <div className="w-[1px] h-2 bg-white/10" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
