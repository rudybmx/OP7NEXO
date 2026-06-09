# Plano — Atendimento Layout Responsivo

## Arquivos afetados
- `src/components/crm/atendimento/pagina-atendimento.tsx` — orquestra o layout (mudança principal).
- `src/components/crm/atendimento/painel-chat.tsx` — nova prop opcional `onVoltar?`.

## Decisões de arquitetura

### 1. Detecção de breakpoint
Seguir o padrão já usado em `layout.tsx` / `barra-lateral.tsx`: `useState` + `useEffect` com `window.innerWidth` e listener de `resize`. Estado único `larguraTela` (number) e derivar:
- `isMobile = largura < 768`
- `isTablet = largura >= 768 && largura < 1024`
- `isDesktop = largura >= 1024`

Default SSR: assume desktop (≥1024) — coerente com o resto do projeto. Aceito o flash de hidratação no mobile (mesmo trade-off do `layout.tsx`/`barra-lateral`).

### 2. Vista mobile derivada (sem estado novo)
Não criar `vistaMobile`. A vista é função pura de `conversaAtivaId`:
- mobile + `conversaAtivaId == null` → render só Inbox (100%).
- mobile + `conversaAtivaId != null` → render só Chat (100%), header com "voltar".
- "voltar" = `setConversaAtivaId(null)` (reusa caminho já existente).

Motivo: 5 pontos mutam `conversaAtivaId` (effect de workspace, `handleSelectConversa`, `handleAbandonarEfemera`, `handleIniciarConversa`, voltar). Fonte única evita desync.

### 3. Painel de Contato
- Desktop: coluna 3 do grid (comportamento atual, alternado por `painelAberto`).
- Tablet/Mobile: overlay `position:absolute; inset:0` (mobile) ou drawer pela direita (tablet) sobre o Chat, renderizado condicionalmente por `painelAberto`.
- Garantir início fechado fora do desktop: ao detectar não-desktop, se necessário forçar `painelAberto=false` na transição (ou gatear a abertura por breakpoint), evitando que o default `true` jogue o usuário direto no Contato.

### 4. Estrutura / encaixe no main
- Container raiz da página: `height:100%`, `boxSizing:border-box`, `minHeight:0`, `width:100%`.
- Mobile: `padding:0`, `borderRadius:0`, sem `boxShadow`/`border` (card chrome só ≥768px).
- Manter scroll interno por painel; não introduzir scroll no nível da página.

### 5. PainelChat.onVoltar
- Adicionar `onVoltar?: () => void` em `PainelChatProps`.
- Quando presente, renderizar um botão seta (`ArrowLeft`, 44×44, `aria-label="Voltar para a lista"`) antes do avatar no header.
- `pagina-atendimento` passa `onVoltar` somente no mobile.

## Riscos
- Desync de vista mobile → mitigado pela derivação de `conversaAtivaId`.
- Scroll duplo → preservar invariante `height:100%` + `border-box`.
- Contato abrir por engano no mobile → gatear por breakpoint.

## Estratégia de teste
Build local + verificação visual em 375/768/1024/1440 (resize). Deploy via `bash /root/deploy.sh front` somente após aprovação do usuário.
