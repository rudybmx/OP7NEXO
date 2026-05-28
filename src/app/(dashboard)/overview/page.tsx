"use client"

import { useMetaOverview } from '@/hooks/use-meta-overview'
import { useMetaGrafico } from '@/hooks/use-meta-grafico'
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts'

export default function OverviewPage() {
  const { kpis, financeiro, isLoading, error, hasData } = useMetaOverview()
  const { dados: dadosGrafico, isLoading: loadingGrafico, error: errorGrafico, hasData: hasDadosGrafico } = useMetaGrafico()

  // Formatters
  const currency = (val: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
  
  const number = (val: number) => 
    new Intl.NumberFormat('pt-BR').format(val)
  
  const integer = (val: number) => 
    new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(val)
  
  const percent = (val: number) => 
    new Intl.NumberFormat('pt-BR', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    }).format(val) + '%'

  // Error State
  if (error && !hasData) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 p-4 rounded-xl text-red-700 dark:text-red-400">
          <p className="font-medium">Erro ao carregar dados:</p>
          <p className="text-sm opacity-90">{error.message || 'Não foi possível conectar à API de relatórios.'}</p>
        </div>
      </div>
    )
  }

  // Loading State (Skeleton)
  if (isLoading && !hasData) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-5 animate-pulse border border-transparent dark:border-zinc-800">
              <div className="h-3 w-20 bg-zinc-100 dark:bg-zinc-800 rounded mb-3" />
              <div className="h-7 w-32 bg-zinc-100 dark:bg-zinc-800 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-6 animate-pulse border border-transparent dark:border-zinc-800">
          <div className="h-4 w-40 bg-zinc-100 dark:bg-zinc-800 rounded mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-24 bg-zinc-50 dark:bg-zinc-800/50 rounded" />
                <div className="h-5 w-36 bg-zinc-50 dark:bg-zinc-800/50 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <header className="mb-2">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Visão Geral</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Performance consolidada da conta Meta Ads</p>
      </header>

      {error && hasData && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          Alguns dados não puderam ser atualizados agora. A página continua mostrando o último conjunto válido.
        </div>
      )}

      {/* Grid de KPIs - 2 col mobile, 4 desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Investimento */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-5 border border-zinc-100 dark:border-zinc-800">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Investimento</p>
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{currency(kpis.spend)}</p>
        </div>

        {/* Leads */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-5 border border-zinc-100 dark:border-zinc-800">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Leads</p>
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{integer(kpis.leads)}</p>
        </div>

        {/* Impressões */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-5 border border-zinc-100 dark:border-zinc-800">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Impressões</p>
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{number(kpis.impressions)}</p>
        </div>

        {/* Alcance */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-5 border border-zinc-100 dark:border-zinc-800">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Alcance</p>
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{number(kpis.reach)}</p>
        </div>

        {/* Cliques */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-5 border border-zinc-100 dark:border-zinc-800">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Cliques</p>
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{number(kpis.clicks)}</p>
        </div>

        {/* CTR */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-5 border border-zinc-100 dark:border-zinc-800">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">CTR</p>
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{percent(kpis.ctr)}</p>
        </div>

        {/* CPC */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-5 border border-zinc-100 dark:border-zinc-800">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">CPC</p>
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{currency(kpis.cpc)}</p>
        </div>

        {/* CPL */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-5 border border-zinc-100 dark:border-zinc-800">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">CPL</p>
          <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{currency(kpis.cpl)}</p>
        </div>
      </div>

      {/* Card de Saldo Separado */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-6 border border-zinc-100 dark:border-zinc-800">
        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-6">Informações da Conta</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Saldo Disponível */}
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-medium mb-1">Saldo disponível</p>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{currency(financeiro.saldo)}</p>
          </div>

          {/* Limite do Cartão */}
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-medium mb-1">Limite do cartão</p>
            <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{currency(financeiro.limite)}</p>
          </div>

          {/* Forma de Pagamento */}
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-medium mb-1">Forma de pagamento</p>
            <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 truncate" title={financeiro.formaPagamento}>
              {financeiro.formaPagamento}
            </p>
          </div>

          {/* BM */}
          <div>
            <p className="text-[10px] text-zinc-500 uppercase font-medium mb-1">BM</p>
            <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100 truncate" title={financeiro.nomeBm}>
              {financeiro.nomeBm}
            </p>
          </div>
        </div>
      </div>

      {/* Gráfico de Performance */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-6 border border-zinc-100 dark:border-zinc-800">
        <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-6">Performance do Mês</h2>
        
        {errorGrafico && !hasDadosGrafico ? (
          <div className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-700 dark:text-red-300">
            Não foi possível carregar o gráfico neste momento.
          </div>
        ) : loadingGrafico && !hasDadosGrafico ? (
          <div className="h-[300px] w-full bg-zinc-50 dark:bg-zinc-800/50 animate-pulse rounded-lg" />
        ) : (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dadosGrafico}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis 
                  dataKey="data" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#888' }}
                  tickFormatter={(v) => v.slice(8, 10)}
                  dy={10}
                />
                <YAxis 
                  yAxisId="left"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#888' }}
                  tickFormatter={(v) => `R$ ${v}`}
                />
                <YAxis 
                  yAxisId="right" 
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#888' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)' 
                  }}
                  formatter={(value, name) => {
                    const v = value === undefined || value === null ? 0 : Number(value)
                    if (name === 'investimento') return [currency(v), 'Investimento']
                    if (name === 'leads') return [v, 'Leads']
                    return [v, String(name)]
                  }}
                />
                <Legend verticalAlign="top" height={36} />
                <Line 
                  yAxisId="left"
                  type="monotone" 
                  dataKey="investimento" 
                  stroke="#3b82f6" 
                  strokeWidth={2} 
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                <Line 
                  yAxisId="right"
                  type="monotone" 
                  dataKey="leads" 
                  stroke="#10b981" 
                  strokeWidth={2} 
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
