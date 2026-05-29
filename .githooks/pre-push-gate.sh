#!/bin/sh
# Pre-push gate (op7nexo-front) — xerife determinístico da constituição.
# Quem diz "não" é este script, nunca o agente se auto-policiando.
fail=0
ROOT=$(git rev-parse --show-toplevel) || exit 1
cd "$ROOT" || exit 1

# --- 1. Regra 2.2 (fonte única de dados): nenhum import de lib/db fora da dívida conhecida ---
ALLOW=".githooks/db-debt-allowlist.txt"
importers=$(grep -rlE "from ['\"][^'\"]*lib/db['\"]|require\(['\"][^'\"]*lib/db" src 2>/dev/null | sed 's#^\./##' | sort -u)
violations=""
for f in $importers; do
  grep -qxF "$f" "$ALLOW" 2>/dev/null || violations="$violations $f"
done
if [ -n "$violations" ]; then
  echo "✗ [pre-push] regra 2.2: import de lib/db em arquivo FORA da dívida conhecida:"
  for v in $violations; do echo "      - $v"; done
  echo "  Código novo é PROIBIDO de importar lib/db — o dado passa pela API FastAPI."
  echo "  Se for dívida legítima já migrada, edite $ALLOW conscientemente."
  fail=1
fi

# --- 2. Doc-gate (regra 1.4): rota tocada exige CONTEXT.md no mesmo push ---
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)
if [ -n "$upstream" ] && git rev-parse "$upstream" >/dev/null 2>&1; then
  changed=$(git diff --name-only "$upstream"..HEAD)
  if echo "$changed" | grep -qE '^src/app/api/.*/route\.ts$'; then
    echo "$changed" | grep -qx 'CONTEXT.md' || {
      echo "✗ [pre-push] doc-gate: o push altera route handler(s) mas não atualiza CONTEXT.md."
      echo "  Atualize CONTEXT.md no mesmo trabalho (regra 1.4: doc amarrada a evento)."
      fail=1
    }
  fi
fi

# --- 3. Anti-drift da constituição entre api e front (VPS) ---
A=/root/op7nexo-api/constitution.md
F=/root/op7nexo-front/constitution.md
if [ -f "$A" ] && [ -f "$F" ]; then
  [ "$(sha256sum "$A" | awk '{print $1}')" = "$(sha256sum "$F" | awk '{print $1}')" ] || {
    echo "✗ [pre-push] constitution.md divergiu entre api e front. Reconcilie antes do push."
    fail=1
  }
fi

[ "$fail" -eq 0 ] && echo "✓ [pre-push] gates OK (op7nexo-front)"
exit $fail
