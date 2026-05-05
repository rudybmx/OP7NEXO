# Odontocompany by Op7 — Guia para Agentes de IA

## Stack
Next.js 16 App Router · TypeScript · Tailwind CSS v4 · shadcn/ui · Recharts · lucide-react

## Como criar um novo componente

### 1. Sempre começar com glass card
Todo componente de conteúdo usa glass card como wrapper:
```css
background: var(--ws-glass-bg);
border: 1px solid var(--ws-glass-border);
border-radius: var(--ws-radius-lg); /* 14px */
backdrop-filter: blur(16px);
box-shadow: var(--ws-glass-shadow);
position: relative; overflow: hidden;

/* Linha de brilho no topo (sempre incluir) */
::after {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent);
}

/* Hover */
:hover {
  box-shadow: var(--ws-glass-shadow-lg);
  background: var(--ws-glass-bg-hover);
  transform: translateY(-2px);
}
```

### 2. Paleta de cores
Nunca usar hex hardcoded. Sempre usar os tokens:
- Ação primária: `var(--ws-blue)` = #3E5BFF
- Destaque/leads: `var(--ws-cyan-dark)` = #00b8c8 (light) / `var(--ws-cyan)` = #00F5FF (dark)
- Alerta: `var(--ws-coral)` = #FF5C8D
- Sucesso/positivo: `var(--ws-green)` = #0fa856
- Hover states: `var(--ws-blue-soft)`, `var(--ws-coral-soft)`

### 3. Texto
- Primário: `var(--ws-text-1)` = #0E142A [light] / #ffffff [dark]
- Secundário: `var(--ws-text-2)` = #4a5580 [light] / rgba(255,255,255,0.55) [dark]
- Muted: `var(--ws-text-3)` = #8892b0 [light] / rgba(255,255,255,0.30) [dark]
- Labels uppercase: font-size 9-10px, letter-spacing 0.06-0.10em, color var(--ws-text-3)

### 4. Tabelas
```
Container: glass card + overflow:hidden + overflow-x:auto
Header: background rgba(62,91,255,0.04) [light] / rgba(255,255,255,0.04) [dark]
Divisor: 1px solid var(--ws-divider)
Hover row: rgba(62,91,255,0.03)
Pausado/inativo: opacity 0.65
```

### 5. Gráficos (Recharts)
```tsx
import { WS_CHART_COLORS } from '@/components/design-system/sections/ds-graficos'

// Tooltip style
const tooltipStyle = {
  background: 'rgba(14,20,42,0.92)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, color: '#ffffff', fontSize: 12,
}

// Grid
<CartesianGrid stroke="rgba(62,91,255,0.06)" strokeDasharray="3 3" vertical={false} />
```

### 6. Badges
- Sempre com border + background soft (nunca background sólido)
- font-size: 10px, font-weight: 600, border-radius: 9999px
- padding: 2px 9px
- Ver todas as variações em ds-badges.tsx

### 7. Botão primário
```css
background: linear-gradient(135deg, var(--ws-blue), var(--ws-purple));
box-shadow: 0 4px 16px rgba(62,91,255,0.35);
/* hover: */
box-shadow: 0 6px 24px rgba(62,91,255,0.50);
transform: translateY(-1px);
```

### 8. Sidebar (sem header)
- Logo no topo do sidebar (não existe Cabecalho separado nesta versão)
- Sidebar height: 100vh, overflow-y: auto
- Nav item ativo: glass-bg-hover + border 1px solid rgba(62,91,255,0.15) + shadow-sm + color ws-blue
- Sub-itens indentados: margin-left 22px, border-left 1px solid var(--ws-divider)

### 9. Dark mode
- Todos os tokens têm variante `.dark` no globals.css
- NUNCA usar media query manualmente — confiar nos tokens CSS
- Testar sempre: se background fosse #0E142A, o texto seria legível?

### 10. Regras de NÃO fazer
- ❌ Nunca usar position:fixed (quebra em iframes)
- ❌ Nunca usar cores hardcoded — sempre tokens
- ❌ Nunca usar font-weight 600+ (exceto botões e valores numéricos grandes)
- ❌ Nunca usar sombra com cor sólida — sempre rgba
- ❌ Nunca criar header separado — ele não existe nesta versão
- ❌ Nunca usar backdrop-filter sem fallback background (quebra no Safari)

## Página de referência visual
→ Acesse `/design-system` para ver todos os componentes em ação (não aparece no menu)
