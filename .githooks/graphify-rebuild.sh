#!/bin/sh
# Mantém o grafo do graphify atualizado após commit/checkout.
# Migrado dos hooks .git/hooks/{post-commit,post-checkout} do graphify para o lefthook
# (decisão de arquitetura 2026-05-29: lefthook dona os hooks, lógica não pode ser orfanada).

GIT_DIR=$(git rev-parse --git-dir 2>/dev/null) || exit 0
# Não roda durante rebase/merge/cherry-pick (evita travar --continue)
[ -d "$GIT_DIR/rebase-merge" ] && exit 0
[ -d "$GIT_DIR/rebase-apply" ] && exit 0
[ -f "$GIT_DIR/MERGE_HEAD" ] && exit 0
[ -f "$GIT_DIR/CHERRY_PICK_HEAD" ] && exit 0

export PATH="$HOME/.local/bin:$PATH"
command -v graphify >/dev/null 2>&1 || exit 0

LOG="${HOME}/.cache/graphify-rebuild.log"
mkdir -p "$(dirname "$LOG")"
# `graphify update` é AST-only (sem custo de LLM). Roda em background pra não travar o git.
nohup graphify update . >"$LOG" 2>&1 </dev/null &
exit 0
