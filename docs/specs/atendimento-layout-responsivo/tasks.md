# Tarefas — Atendimento Layout Responsivo

1. [x] `painel-chat.tsx`: prop `onVoltar?` + botão "voltar" (ArrowLeft, 44×44, aria-label) no header.
2. [x] `pagina-atendimento.tsx`: detecção de breakpoint (`larguraTela` + resize) → `isMobile/isTablet/isDesktop`.
3. [x] `pagina-atendimento.tsx`: container raiz responsivo (sem card chrome no mobile; `height:100%` + `box-sizing:border-box`).
4. [x] `pagina-atendimento.tsx`: grid responsivo — 3 col / 2 col / coluna única drill-down. Vista mobile derivada de `conversaAtiva` (objeto resolvido) p/ evitar dead-end quando a conversa sai da lista.
5. [x] `pagina-atendimento.tsx`: Contato como overlay/drawer fora do desktop, iniciando fechado (`setPainelAberto(isDesktop)`).
6. [x] `onVoltar={() => setConversaAtivaId(null)}` no `PainelChat` só no mobile.
7. [~] Typecheck OK (build tolera TS via `ignoreBuildErrors`). **Verificação visual pendente**: Node local é v18 (<20.9 exigido pelo Next) → não roda `next dev` aqui; teste visual = deploy.
8. [x] `crm/spec.md` aponta para este spec. (CONTEXT.md: sem mudança estrutural relevante.)
9. [x] graphify update + commit + push + deploy `front` (baseline) feitos.

## v2 — Aprofundamento mobile
10. [x] `use-mobile.ts`: hook `useBreakpoint` (mobile/tablet/desktop).
11. [x] `pagina-atendimento.tsx`: consome hook; Inbox/Chat por `display` (preserva scroll); repassa `isMobile`.
12. [x] `painel-inbox.tsx`: touch 40px; busca/select fontSize16; chips min-height.
13. [x] `input-mensagem.tsx`: safe-area no composer; textarea fontSize16.
14. [x] `painel-chat.tsx`: bolha 85% mobile; header (contato icon-only, ações ≥40).
15. [x] `painel-contato.tsx`: fechar 40px no mobile.
16. [x] `layout.tsx` + `barra-lateral.tsx`: bottom-nav + main alinhados a 64px+safe-area.
17. [x] Typecheck sem erros novos; `next dev` (node 22) compila a rota.
18. [ ] Verificação visual autenticada (375/414/768/1024) — via deploy/usuário.
19. [x] graphify update + commit + push + deploy `front` (v2).

## Fase 3 — Layout desktop limpo + erro de Link
20. [x] `barra-lateral.tsx`: flyup mobile filtra itens sem `rota` → elimina `<Link href={undefined}>` (causa de "Cannot destructure property 'auth'" — parse de URL com input undefined).
21. [x] `pagina-atendimento.tsx`: container **flush** no main (sem card: padding/borda/raio/sombra removidos), edge-to-edge.
22. [x] `pagina-atendimento.tsx`: Contato desktop achatado (wrapper duplo → célula única; largura via gridTemplateColumns); 3ª coluna só quando há conversa.
23. [ ] (adiado) HeroUIProvider escopado em arquivado + 2 páginas admin (bug latente, não afeta Conversas).
24. [ ] (segurado) Parte C — unificar 4 detecções de breakpoint na casca (sem verificação local; risco em todas as rotas).
25. [ ] Erro `auth` no desktop: confirmar em Incognito se é extension (WebMCP/@modelcontextprotocol/sdk) vs app.
26. [ ] Verificação visual desktop (flush, sem coluna vazia, sidebar alinhada) + deploy.
