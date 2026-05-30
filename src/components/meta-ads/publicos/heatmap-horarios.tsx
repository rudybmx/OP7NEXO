'use client'

import { InfoTooltip } from '@/components/ui/info-tooltip'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { DadosHora } from '@/types/meta-ads-publicos'

interface Props {
  heatmap: DadosHora[]
}

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const HEATMAP_HORARIOS_DIAGRAM = `
  <div style="font-size:10px;color:#666">
    <div style="display:grid;grid-template-columns:30px repeat(6,1fr);gap:2px;margin-bottom:6px">
      <div></div>
      <div style="text-align:center;font-size:8px;color:#999">6h</div>
      <div style="text-align:center;font-size:8px;color:#999">10h</div>
      <div style="text-align:center;font-size:8px;color:#999">14h</div>
      <div style="text-align:center;font-size:8px;color:#999">18h</div>
      <div style="text-align:center;font-size:8px;color:#999">20h</div>
      <div style="text-align:center;font-size:8px;color:#999">22h</div>
      <div style="font-size:8px;color:#999;padding-top:2px">Ter</div>
      <div style="background:rgba(15,168,86,0.15);border-radius:1px;height:12px"></div>
      <div style="background:rgba(245,166,35,0.40);border-radius:1px;height:12px"></div>
      <div style="background:rgba(245,166,35,0.60);border-radius:1px;height:12px"></div>
      <div style="background:rgba(255,92,141,0.85);border-radius:1px;height:12px"></div>
      <div style="background:rgba(163,45,45,0.95);border-radius:1px;height:12px"></div>
      <div style="background:rgba(255,92,141,0.70);border-radius:1px;height:12px"></div>
      <div style="font-size:8px;color:#999;padding-top:2px">Sáb</div>
      <div style="background:rgba(15,168,86,0.10);border-radius:1px;height:12px"></div>
      <div style="background:rgba(15,168,86,0.20);border-radius:1px;height:12px"></div>
      <div style="background:rgba(245,166,35,0.30);border-radius:1px;height:12px"></div>
      <div style="background:rgba(245,166,35,0.50);border-radius:1px;height:12px"></div>
      <div style="background:rgba(245,166,35,0.45);border-radius:1px;height:12px"></div>
      <div style="background:rgba(245,166,35,0.35);border-radius:1px;height:12px"></div>
    </div>
    <div style="font-size:9px;color:#999">Cores quentes (laranja/vermelho) = maior conversão</div>
  </div>
`

export function HeatmapHorarios({ heatmap }: Props) {
  if (!heatmap.length) {
    return (
      <div style={{
        background: 'var(--ws-glass-bg)',
        border: '1px solid var(--ws-glass-border)',
        borderRadius: 'var(--ws-radius-lg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: 'var(--ws-glass-shadow)',
        padding: '16px 20px',
        minHeight: 220,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ws-text-2)',
        fontSize: 13,
        textAlign: 'center',
      }}>
        Dados de horário não disponíveis para o período selecionado.
      </div>
    )
  }

  const horas = Array.from({ length: 24 }, (_, i) => i)

  function getHeatColor(intensidade: number) {
    if (intensidade <= 0.25) return `rgba(15, 168, 86, ${0.1 + intensidade * 1.5})` // Verde
    if (intensidade <= 0.6) return `rgba(245, 166, 35, ${0.3 + (intensidade - 0.25) * 1.2})` // Amber
    if (intensidade <= 0.85) return `rgba(255, 92, 141, ${0.6 + (intensidade - 0.6) * 1})` // Coral
    return `rgba(163, 45, 45, ${0.8 + (intensidade - 0.85) * 1.3})` // Red
  }

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ws-text-1)' }}>Mapa de calor — dia × hora</div>
          <div style={{ fontSize: 11, color: 'var(--ws-text-2)' }}>Horários com maior geração de leads. Cores quentes = pico.</div>
        </div>
        <InfoTooltip
          title="Mapa de calor — dia × hora"
          description="A escala varia do verde (frio) ao vermelho (quente). Use para identificar quando sua audiência está mais ativa e converter melhor."
          diagram={HEATMAP_HORARIOS_DIAGRAM}
        />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 500 }}>
          {DIAS.map((dia, d) => (
            <div key={dia} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
              <div style={{ fontSize: 10, color: 'var(--ws-text-2)', minWidth: 30, textAlign: 'right', paddingRight: 6 }}>{dia}</div>
              {horas.map(h => {
                const cell = heatmap.find(x => x.dia === d && x.hora === h)
                const intensidade = cell?.intensidade ?? 0
                const leads = cell?.leads ?? 0
                return (
                  <TooltipProvider key={h} delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div style={{
                          flex: 1, height: 18, borderRadius: 2,
                          background: getHeatColor(intensidade),
                          cursor: 'pointer',
                          transition: 'transform 0.1s ease',
                        }} />
                      </TooltipTrigger>
                      <TooltipContent style={{ background: '#0f2744', color: '#fff', border: 'none', fontSize: 11, borderRadius: 6 }}>
                        {dia} às {h}h: ~{leads} leads
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )
              })}
            </div>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <div style={{ minWidth: 30 }} />
            {horas.map(h => (
              <div key={h} style={{ flex: 1, fontSize: 9, color: 'var(--ws-text-2)', textAlign: 'center' }}>
                {h % 4 === 0 ? h : ''}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 10, color: 'var(--ws-text-2)' }}>
        <span>Menos leads</span>
        <div style={{ display: 'flex', gap: 2 }}>
          {[
            'rgba(15,168,86,0.15)',
            'rgba(245,166,35,0.45)',
            'rgba(255,92,141,0.75)',
            'rgba(163,45,45,0.95)'
          ].map((bg, i) => (
            <div key={i} style={{ width: 14, height: 8, background: bg, borderRadius: 1 }} />
          ))}
        </div>
        <span>Mais leads</span>
      </div>
    </div>
  )
}
