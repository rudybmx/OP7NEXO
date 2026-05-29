#!/bin/sh
# Pre-push gate (op7nexo-api) — xerife determinístico da constituição.
# Quem diz "não" é este script, nunca o agente se auto-policiando.
fail=0
ROOT=$(git rev-parse --show-toplevel) || exit 1
cd "$ROOT" || exit 1

# --- 1. Doc-gate (regras 1.4 / 2.5): migration tocada exige CONTEXT.md no mesmo push ---
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)
if [ -n "$upstream" ] && git rev-parse "$upstream" >/dev/null 2>&1; then
  changed=$(git diff --name-only "$upstream"..HEAD)
  if echo "$changed" | grep -qE '^alembic/versions/'; then
    echo "$changed" | grep -qx 'CONTEXT.md' || {
      echo "✗ [pre-push] doc-gate: o push mexe em alembic/versions/ mas não atualiza CONTEXT.md."
      echo "  Atualize CONTEXT.md no mesmo trabalho (regra 1.4: doc amarrada a evento)."
      fail=1
    }
  fi
fi

# --- 2. Anti-drift da constituição entre api e front (VPS) ---
A=/root/op7nexo-api/constitution.md
F=/root/op7nexo-front/constitution.md
if [ -f "$A" ] && [ -f "$F" ]; then
  [ "$(sha256sum "$A" | awk '{print $1}')" = "$(sha256sum "$F" | awk '{print $1}')" ] || {
    echo "✗ [pre-push] constitution.md divergiu entre api e front. Reconcilie antes do push."
    fail=1
  }
fi

[ "$fail" -eq 0 ] && echo "✓ [pre-push] gates OK (op7nexo-api)"
exit $fail
