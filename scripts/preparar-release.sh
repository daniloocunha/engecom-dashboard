#!/usr/bin/env bash
#
# Prepara um release do app Android e verifica tudo que a atualização
# automática precisa para funcionar nos aparelhos em campo.
#
# NÃO executa ações externas: não cria GitHub Release e não escreve na aba
# Config do Sheets. Ao final, imprime o comando pronto para o usuário decidir.
#
# Uso:
#   bash scripts/preparar-release.sh            # verifica e gera o APK
#   bash scripts/preparar-release.sh --skip-build   # só verifica (usa APK existente)
#
set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

APK="app/build/outputs/apk/release/app-release.apk"
# Certificado de produção (Engecom Engenharia, válido até 2053).
CERT_ESPERADO="05ff35faf2d84092b383add4204ea2f7031fa9bc366b16dd4c30867ab8218a5d"

SKIP_BUILD=0
[ "${1:-}" = "--skip-build" ] && SKIP_BUILD=1

falhas=0
avisos=0

ok()    { printf '  \033[32m✓\033[0m %s\n' "$1"; }
erro()  { printf '  \033[31m✗\033[0m %s\n' "$1"; falhas=$((falhas + 1)); }
aviso() { printf '  \033[33m!\033[0m %s\n' "$1"; avisos=$((avisos + 1)); }
titulo(){ printf '\n\033[1m%s\033[0m\n' "$1"; }

# ─────────────────────────────────────────────────────────────────────────
titulo "1. Repositório"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  erro "não é um repositório git"
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git fetch origin --quiet 2>/dev/null || aviso "não foi possível consultar o origin (offline?)"

if git rev-parse --verify --quiet "origin/$BRANCH" >/dev/null; then
  ATRAS="$(git rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo 0)"
  AFRENTE="$(git rev-list --count "origin/$BRANCH..HEAD" 2>/dev/null || echo 0)"
  if [ "$ATRAS" -gt 0 ]; then
    erro "branch '$BRANCH' está $ATRAS commit(s) atrás do GitHub — rode: git pull origin $BRANCH"
  else
    ok "branch '$BRANCH' alinhado com o GitHub"
  fi
  [ "$AFRENTE" -gt 0 ] && aviso "$AFRENTE commit(s) locais ainda não enviados (git push)"
else
  aviso "branch '$BRANCH' não existe no origin"
fi

if [ -n "$(git status --porcelain)" ]; then
  aviso "há alterações não commitadas — o APK vai incluí-las"
fi

# Credenciais nunca podem entrar no git.
if git status --porcelain | grep -qE 'rdo-engecom-.*\.json|keystore'; then
  erro "credencial ou keystore aparece em 'git status' — NÃO commite"
fi

# ─────────────────────────────────────────────────────────────────────────
titulo "2. Versão"

VERSION_CODE="$(sed -n 's/.*versionCode[[:space:]]*=[[:space:]]*\([0-9]\{1,\}\).*/\1/p' app/build.gradle.kts | head -1)"
VERSION_NAME="$(sed -n 's/.*versionName[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' app/build.gradle.kts | head -1)"

if [ -z "$VERSION_CODE" ] || [ -z "$VERSION_NAME" ]; then
  erro "não consegui ler versionCode/versionName de app/build.gradle.kts"
else
  ok "versionCode=$VERSION_CODE  versionName=$VERSION_NAME"
  echo "     (precisa ser MAIOR que 'versao_recomendada' na aba Config,"
  echo "      senão nenhum aparelho enxerga a atualização)"
fi

# ─────────────────────────────────────────────────────────────────────────
titulo "3. Credenciais do Google (sincronização do app)"

CRED_ASSET="$(ls app/src/main/assets/rdo-engecom-*.json 2>/dev/null | head -1)"
if [ -n "$CRED_ASSET" ]; then
  ok "credenciais presentes em $CRED_ASSET"
else
  erro "app/src/main/assets/rdo-engecom-*.json AUSENTE"
  echo "     Sem esse arquivo o APK instala normalmente, mas TODA sincronização"
  echo "     falha em campo. O arquivo é gitignored — copie da sua cópia segura."
fi

CRED_RAIZ="$(ls rdo-engecom-*.json 2>/dev/null | head -1)"
[ -n "$CRED_RAIZ" ] || aviso "rdo-engecom-*.json ausente na raiz (necessário para update_config_release.py)"

# ─────────────────────────────────────────────────────────────────────────
titulo "4. Assinatura"

if [ ! -f keystore.properties ]; then
  erro "keystore.properties não encontrado"
else
  STORE="$(sed -n 's/^storeFile=//p' keystore.properties | tr -d '\r' | head -1)"
  if [ -f "$STORE" ]; then
    ok "keystore configurado: $STORE"
    case "$STORE" in
      *debug*) erro "keystore.properties aponta para um keystore de DEBUG — o APK não atualizará a versão em campo" ;;
    esac
  else
    erro "keystore '$STORE' não existe"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────
titulo "5. Build"

if [ "$falhas" -gt 0 ]; then
  printf '\n\033[31mCorrija os %d erro(s) acima antes de gerar o APK.\033[0m\n' "$falhas"
  exit 1
fi

if [ "$SKIP_BUILD" -eq 1 ]; then
  aviso "build pulado (--skip-build)"
else
  echo "  Gerando APK de release..."
  if ./gradlew assembleRelease -q; then
    ok "APK gerado"
  else
    erro "falha no build"
    exit 1
  fi
fi

[ -f "$APK" ] || { erro "APK não encontrado em $APK"; exit 1; }

# ─────────────────────────────────────────────────────────────────────────
titulo "6. Verificação do APK"

# No Windows o SDK traz 'apksigner.bat'; procura a build-tools mais recente.
SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-${LOCALAPPDATA:-$HOME}/Android/Sdk}}"
APKSIGNER="$(command -v apksigner \
             || find "$SDK_DIR/build-tools" \( -name apksigner -o -name apksigner.bat \) 2>/dev/null | sort | tail -1 \
             || find "$HOME/android-sdk" \( -name apksigner -o -name apksigner.bat \) 2>/dev/null | head -1)"
if [ -n "$APKSIGNER" ]; then
  CERT="$("$APKSIGNER" verify --print-certs "$APK" 2>/dev/null \
          | grep -i 'SHA-256 digest' | head -1 | awk '{print $NF}')"
  if [ "$CERT" = "$CERT_ESPERADO" ]; then
    ok "assinado com o certificado de produção"
  else
    erro "assinatura DIFERENTE da de produção — não instalará por cima da versão em campo"
    echo "     esperado: $CERT_ESPERADO"
    echo "     obtido:   ${CERT:-<não foi possível ler>}"
  fi
else
  aviso "apksigner não encontrado — assinatura não verificada"
fi

# Sem 'grep -q' aqui: ele fecha o pipe cedo, o unzip morre com SIGPIPE e o
# 'pipefail' faria o teste falhar mesmo com a credencial presente.
CRED_NO_APK="$(unzip -l "$APK" 2>/dev/null | grep -c 'assets/rdo-engecom')"
if [ "${CRED_NO_APK:-0}" -gt 0 ]; then
  ok "credenciais empacotadas no APK"
else
  erro "APK SEM as credenciais — a sincronização falhará em todos os aparelhos"
fi

MD5="$(md5sum "$APK" | awk '{print $1}')"
SHA256="$(sha256sum "$APK" | awk '{print $1}')"
TAMANHO="$(awk -v b="$(stat -c%s "$APK")" 'BEGIN{printf "%.2f", b/1048576}')"
ok "MD5:     $MD5"
ok "SHA-256: $SHA256"
ok "Tamanho: $TAMANHO MB"

# ─────────────────────────────────────────────────────────────────────────
titulo "Resumo"
printf '  erros: %d   avisos: %d\n' "$falhas" "$avisos"

if [ "$falhas" -gt 0 ]; then
  printf '\n\033[31mNÃO publique: corrija os erros acima.\033[0m\n'
  exit 1
fi

TAG="v$VERSION_NAME"
cat <<FIM

Próximos passos (ações externas — confirme antes de executar):

  1. Criar o GitHub Release com tag $TAG anexando:
       $APK

  2. Atualizar a aba Config do Sheets com a URL do asset publicado:

     python scripts/update_config_release.py --apply \\
         --versao $VERSION_CODE \\
         --hash $SHA256 \\
         --tamanho $TAMANHO \\
         --url https://github.com/daniloocunha/engecom-dashboard/releases/download/$TAG/app-release.apk \\
         --mensagem "Nova versão $VERSION_NAME"

  Lembretes:
    - hash: SHA-256 (64 chars) só é aceito por versionCode >= 24. Se a aba Config
      tiver 'versao_minima' >= 24, todo aparelho ativo entende SHA-256.
      Caso contrário use o MD5 acima ($MD5).
    - 'versao_minima' não é alterada pelo script: bloquear versões antigas é decisão manual
    - atualizar Version Information e Version History no CLAUDE.md
FIM
