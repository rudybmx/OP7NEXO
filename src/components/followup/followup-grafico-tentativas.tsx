"use client"

import React, { useMemo } from 'react'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  LabelList
} from 'recharts'
import { FollowupLead } from '@/types/followup'

interface FollowupGraficoTentativasProps {
  leads: FollowupLead[]
}

export function FollowupGraficoTentativas({ leads }: FollowupGraficoTentativasProps) {
  const data = useMemo(() => {
    const trials = [1, 2, 3, 4, 5, 6, 7, 8]
    return trials.map(t => ({
      tentativa: t,
      quantidade: leads.filter(l => l.tentativa_atual === t && l.status_followup === 'ativo').length
    }))
  }, [leads])

  const totalAtivos = useMemo(() => 
    leads.filter(l => l.status_followup === 'ativo').length, 
  [leads])

  const getBarColor = (tentativa: number) => {
    if (tentativa <= 3) return 'var(--ws-blue)'
    if (tentativa <= 6) return 'var(--ws-gold)'
    return 'var(--ws-coral)'
  }

  return (
    <div style={{
      background: 'var(--ws-glass-bg)',
      border: '1px solid var(--ws-glass-border)',
      borderRadius: 'var(--ws-radius-lg)',
      backdropFilter: 'blur(16px)',
      boxShadow: 'var(--ws-glass-shadow)',
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '320px'
    }}>
      {/* Linha de brilho no topo */}
      <div style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        right: 0, 
        height: 1,
        background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.8),transparent)',
        pointerEvents: 'none' 
      }} />

      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 style={{ 
            fontSize: '10px', 
            fontWeight: 'bold', 
            textTransform: 'uppercase', 
            color: 'var(--ws-text-2)',
            letterSpacing: '0.05em'
          }}>
            Por Tentativa
          </h3>
          <p style={{ fontSize: '11px', color: 'var(--ws-text-3)' }}>
            distribuição das tentativas ativas
          </p>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          padding: '4px 10px',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--ws-text-2)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          {totalAtivos} Leads
        </div>
      </div>

      <div className="flex-1 w-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 0, left: -25, bottom: 0 }}>
            <CartesianGrid 
              stroke="rgba(14,20,42,0.06)" 
              strokeDasharray="3 3" 
              vertical={false} 
            />
            <XAxis 
              dataKey="tentativa" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--ws-text-3)', fontSize: 11 }}
              dy={10}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--ws-text-3)', fontSize: 11 }}
            />
            <Tooltip 
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              contentStyle={{
                background: 'var(--ws-navy)',
                border: '1px solid var(--ws-glass-border)',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#fff'
              }}
              itemStyle={{ color: '#fff' }}
              labelStyle={{ color: '#fff', fontWeight: '600' }}
              formatter={(value, _name, props) => {
                const v = value === undefined || value === null ? 0 : value
                return [`${v} leads na tentativa ${props.payload.tentativa}`, '']
              }}
            />
            <Bar 
              dataKey="quantidade" 
              radius={[4, 4, 0, 0]}
              barSize={32}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.tentativa)} />
              ))}
              <LabelList 
                dataKey="quantidade" 
                position="top" 
                style={{ fill: 'var(--ws-text-2)', fontSize: 10, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex gap-4 mt-2 justify-center">
        {[
          { color: 'var(--ws-blue)', label: 'Engajamento' },
          { color: 'var(--ws-gold)', label: 'Persistência' },
          { color: 'var(--ws-coral)', label: 'Última chance' }
        ].map(leg => (
          <div key={leg.label} className="flex items-center gap-1.5">
            <div style={{ width: 8, height: 8, borderRadius: 2, background: leg.color }} />
            <span style={{ fontSize: '10px', color: 'var(--ws-text-3)' }}>{leg.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
