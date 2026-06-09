# Tarefas — Atendimento Layout Responsivo

1. [x] `painel-chat.tsx`: prop `onVoltar?` + botão "voltar" (ArrowLeft, 44×44, aria-label) no header.
2. [x] `pagina-atendimento.tsx`: detecção de breakpoint (`larguraTela` + resize) → `isMobile/isTablet/isDesktop`.
3. [x] `pagina-atendimento.tsx`: container raiz responsivo (sem card chrome no mobile; `height:100%` + `box-sizing:border-box`).
4. [x] `pagina-atendimento.tsx`: grid responsivo — 3 col / 2 col / coluna única drill-down. Vista mobile derivada de `conversaAtiva` (objeto resolvido) p/ evitar dead-end quando a conversa sai da lista.
5. [x] `pagina-atendimento.tsx`: Contato como overlay/drawer fora do desktop, iniciando fechado (`setPainelAberto(isDesktop)`).
6. [x] `onVoltar={() => setConversaAtivaId(null)}` no `PainelChat` só no mobile.
7. [~] Typecheck OK (build tolera TS via `ignoreBuildErrors`). **Verificação visual pendente**: Node local é v18 (<20.9 exigido pelo Next) → não roda `next dev` aqui; teste visual = deploy.
8. [x] `crm/spec.md` aponta para este spec. (CONTEXT.md: sem mudança estrutural relevante.)
9. [~] graphify update + commit local feitos. Push/deploy `front` pendente de aprovação.
