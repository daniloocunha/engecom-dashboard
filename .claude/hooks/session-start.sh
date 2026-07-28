#!/bin/bash
# SessionStart hook — prepara o ambiente Android para compilar o app durante
# sessões do Claude Code na web. Roda de forma síncrona (a sessão só inicia
# após concluir), garantindo que ./gradlew assembleDebug funcione sem setup
# manual. Idempotente e rápido em execuções subsequentes (SDK já cacheado).
set -euo pipefail

# Só faz sentido no ambiente remoto (Claude Code na web).
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
bash "$PROJECT_DIR/scripts/setup-android-build.sh"
