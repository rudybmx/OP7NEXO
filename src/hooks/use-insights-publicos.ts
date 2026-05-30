import type { DadosDemograficos, DadosPlacement, DadosHora, InsightPublico } from '@/types/meta-ads-publicos'

export function useInsightsPublicos(
  demograficos: DadosDemograficos[] = [],
  placements: DadosPlacement[] = [],
  heatmap: DadosHora[] = []
): InsightPublico[] {
  const demo = demograficos ?? []
  const place = placements ?? []
  const heat = heatmap ?? []

  if (demo.length === 0 && place.length === 0 && heat.length === 0) return []
  const insights: InsightPublico[] = []

  // ── DEMOGRAFICOS ────────────────────────────────────────────────────────────

  if (demo.length > 0) {
    const comLeads = demo.filter(d => d.leads > 0)
    const pool = comLeads.length > 0 ? comLeads : demo

    const melhor = pool.reduce((a, b) => a.cpl < b.cpl ? a : b)
    const totalLeads = demo.reduce((s, d) => s + d.leads, 0)

    insights.push({
      id: 'melhor-seg',
      severidade: 'oportunidade',
      titulo: 'Audiência de ouro',
      mensagem: `${melhor.genero === 'fem' ? 'Mulheres' : 'Homens'} ${melhor.faixa} com CPL R$${melhor.cpl.toFixed(2).replace('.', ',')} — ${totalLeads > 0 ? (melhor.leads / totalLeads * 100).toFixed(0) : 0}% dos leads com menor custo.`,
      analiseCompleta: `Segmento mais eficiente da conta. CPL R$${melhor.cpl.toFixed(2).replace('.', ',')} com CTR ${melhor.ctr.toFixed(1)}%. Representam ${melhor.leads} leads no período. Recomendação: aumentar bid multiplier para este segmento e criar criativos específicos para essa faixa etária.`,
      labelAcao: 'Ver segmento',
    })

    // Pior segmento com gasto relevante
    const comGasto = demo.filter(d => d.investimento > 50 && d.leads > 0)
    const pior = comGasto.length > 0 ? comGasto.reduce((a, b) => a.cpl > b.cpl ? a : b) : null
    if (pior && pior.cpl > melhor.cpl * 5) {
      insights.push({
        id: 'pior-seg',
        severidade: 'alerta',
        titulo: 'Orçamento desperdiçado',
        mensagem: `${pior.genero === 'fem' ? 'Mulheres' : 'Homens'} ${pior.faixa} com CPL R$${pior.cpl.toFixed(2).replace('.', ',')} — ${(pior.cpl / melhor.cpl).toFixed(0)}× mais caro que o melhor segmento.`,
        analiseCompleta: `Este segmento consome R$${pior.investimento.toFixed(0)} com apenas ${pior.leads} leads (CPL R$${pior.cpl.toFixed(2).replace('.', ',')}). O CPL é ${(pior.cpl / melhor.cpl).toFixed(1)}× pior que o melhor segmento (${melhor.genero === 'fem' ? 'Mulheres' : 'Homens'} ${melhor.faixa}). Recomendação: aplicar exclusão de idade ou bid cap para reduzir gastos nesta faixa.`,
        labelAcao: 'Ver segmento',
      })
    }

    // Maior desequilíbrio de gênero dentro de uma faixa etária
    const faixas = [...new Set(demo.map(d => d.faixa))]
    let maiorRatio = 0
    let maiorDesequilibrio: { faixa: string; melhor: DadosDemograficos; pior: DadosDemograficos } | null = null
    for (const faixa of faixas) {
      const masc = demo.find(d => d.faixa === faixa && d.genero === 'masc')
      const fem = demo.find(d => d.faixa === faixa && d.genero === 'fem')
      if (!masc || !fem || masc.leads === 0 || fem.leads === 0 || masc.cpl === 0 || fem.cpl === 0) continue
      const ratio = Math.max(masc.cpl, fem.cpl) / Math.min(masc.cpl, fem.cpl)
      if (ratio > maiorRatio) {
        maiorRatio = ratio
        maiorDesequilibrio = {
          faixa,
          melhor: masc.cpl < fem.cpl ? masc : fem,
          pior:   masc.cpl < fem.cpl ? fem  : masc,
        }
      }
    }
    if (maiorDesequilibrio && maiorRatio > 2) {
      const { faixa, melhor: m, pior: p } = maiorDesequilibrio
      insights.push({
        id: `genero-${faixa}`,
        severidade: 'info',
        titulo: `Desequilíbrio de gênero — ${faixa}`,
        mensagem: `${m.genero === 'masc' ? 'Homens' : 'Mulheres'} ${faixa} custam ${maiorRatio.toFixed(1)}× menos (R$${m.cpl.toFixed(2).replace('.', ',')} vs R$${p.cpl.toFixed(2).replace('.', ',')}).`,
        analiseCompleta: `Na faixa ${faixa}, ${m.genero === 'masc' ? 'masculino' : 'feminino'} tem CPL R$${m.cpl.toFixed(2).replace('.', ',')} (${m.leads} leads) contra R$${p.cpl.toFixed(2).replace('.', ',')} do outro gênero. Diferença de ${maiorRatio.toFixed(1)}×. Recomendação: ajustar bid multiplier por gênero ou criar conjuntos separados para esta faixa.`,
        labelAcao: 'Ver mapa',
      })
    }
  }

  // ── PLACEMENTS ──────────────────────────────────────────────────────────────

  if (place.length > 0) {
    // Concentração de risco
    const dominante = place.reduce((a, b) => a.leads > b.leads ? a : b)
    if (dominante.percentual > 60) {
      const segundo = place.filter(p => p.nome !== dominante.nome)[0]
      insights.push({
        id: 'concentracao-placement',
        severidade: 'alerta',
        titulo: 'Concentração em um posicionamento',
        mensagem: `${dominante.percentual.toFixed(0)}% dos leads vêm de ${dominante.nome}. Alta dependência aumenta risco de volatilidade.`,
        analiseCompleta: `${dominante.nome} responde por ${dominante.percentual.toFixed(0)}% dos leads. Concentração acima de 60% aumenta vulnerabilidade a mudanças de algoritmo ou CPM. ${segundo ? `Recomendação: testar aumento de budget em ${segundo.nome} (CPL R$${segundo.cpl.toFixed(2).replace('.', ',')}) para diversificar.` : 'Recomendação: ativar mais posicionamentos para distribuir risco.'}`,
        labelAcao: 'Ver posicionamentos',
      })
    }

    // Placement com melhor CPL mas sub-representado
    const melhoresPlat = [...place].sort((a, b) => a.cpl - b.cpl)
    const melhorPlat = melhoresPlat[0]
    if (melhorPlat.cpl > 0 && melhorPlat.percentual < 15) {
      const fbFeed = place.find(p => p.plataforma === 'facebook' && p.nome.toLowerCase().includes('feed'))
      const refCpl = fbFeed ? `CPL Facebook Feed R$${fbFeed.cpl.toFixed(2).replace('.', ',')}` : `CPL médio R$${(place.reduce((s, p) => s + p.cpl, 0) / place.length).toFixed(2).replace('.', ',')}`
      insights.push({
        id: 'plat-sub',
        severidade: 'info',
        titulo: 'Posicionamento subaproveitado',
        mensagem: `${melhorPlat.nome} tem CPL R$${melhorPlat.cpl.toFixed(2).replace('.', ',')} e apenas ${melhorPlat.percentual.toFixed(0)}% do orçamento. Aumentar pode reduzir CPL médio.`,
        analiseCompleta: `${melhorPlat.nome} é o posicionamento mais eficiente (CPL R$${melhorPlat.cpl.toFixed(2).replace('.', ',')}) mas recebe apenas ${melhorPlat.percentual.toFixed(0)}% do orçamento (${melhorPlat.leads} leads). ${refCpl}. Recomendação: ajustar Advantage+ posicionamentos ou criar conjunto dedicado para ${melhorPlat.nome}.`,
        labelAcao: 'Ver posicionamentos',
      })
    }
  }

  // ── HEATMAP ─────────────────────────────────────────────────────────────────

  if (heat.length > 0) {
    const maxIntensidade = heat.reduce((max, h) => h.intensidade > max ? h.intensidade : max, 0)
    const horaOuro = heat.find(h => h.intensidade === maxIntensidade)
    if (horaOuro) {
      const dias = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
      insights.push({
        id: 'horario-ouro',
        severidade: 'oportunidade',
        titulo: 'Horário de ouro detectado',
        mensagem: `${dias[horaOuro.dia]} às ${horaOuro.hora}h concentra maior volume de leads. Day-parting pode reduzir custos.`,
        analiseCompleta: `O pico de intensidade ocorre ${dias[horaOuro.dia]} às ${horaOuro.hora}h (${horaOuro.leads} leads neste slot). Recomendação: ativar day-parting para concentrar orçamento nos horários de pico ou criar regras automáticas de ajuste de bid por horário.`,
        labelAcao: 'Ver horários',
      })
    }
  }

  return insights.sort((a, b) => {
    const ordem: Record<string, number> = { alerta: 0, oportunidade: 1, info: 2 }
    return ordem[a.severidade] - ordem[b.severidade]
  }).slice(0, 6)
}
