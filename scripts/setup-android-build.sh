#!/bin/bash
# ---------------------------------------------------------------------------
# Prepara um ambiente headless capaz de compilar o app Android
# (./gradlew assembleDebug) — usado pelo hook SessionStart do Claude Code na
# web e também executável manualmente em qualquer Linux com JDK 17+.
#
# Idempotente: pode rodar várias vezes; pula etapas já concluídas.
#
# O que faz:
#   1. Instala o Android SDK (cmdline-tools, platform-tools, platform 35,
#      build-tools 35) em $ANDROID_SDK_HOME (padrão: $HOME/android-sdk)
#   2. Cria local.properties apontando para o SDK
#   3. Sobrescreve o org.gradle.java.home do projeto (que aponta p/ Windows)
#      via ~/.gradle/gradle.properties (precedência maior)
#   4. Gera um keystore de DEBUG descartável + keystore.properties, pois o
#      buildType debug referencia o signingConfig "release". O keystore real
#      de release NÃO fica no repo (gitignored) — este é só p/ builds locais.
#
# Todos os arquivos gerados (local.properties, keystore.properties, *.keystore)
# são gitignored e nunca commitados.
# ---------------------------------------------------------------------------
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
ANDROID_SDK_HOME="${ANDROID_SDK_HOME:-$HOME/android-sdk}"
CMDLINE_TOOLS_VERSION="11076708"   # cmdline-tools 12.0 (linux)
PLATFORM="platforms;android-35"    # compileSdk do projeto
BUILD_TOOLS="build-tools;35.0.0"

log() { echo "[setup-android] $*"; }

# --- 1. Android SDK ---------------------------------------------------------
install_sdk() {
  local sdkmanager="$ANDROID_SDK_HOME/cmdline-tools/latest/bin/sdkmanager"

  if [ ! -x "$sdkmanager" ]; then
    log "Baixando Android command-line tools..."
    mkdir -p "$ANDROID_SDK_HOME/cmdline-tools"
    local tmp
    tmp="$(mktemp -d)"
    curl -fsSL -o "$tmp/cmdline-tools.zip" \
      "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS_VERSION}_latest.zip"
    unzip -q -o "$tmp/cmdline-tools.zip" -d "$tmp"
    # a ferramenta espera cmdline-tools/latest/
    rm -rf "$ANDROID_SDK_HOME/cmdline-tools/latest"
    mv "$tmp/cmdline-tools" "$ANDROID_SDK_HOME/cmdline-tools/latest"
    rm -rf "$tmp"
  else
    log "cmdline-tools já instalado."
  fi

  log "Aceitando licenças e instalando pacotes (idempotente)..."
  yes | "$sdkmanager" --sdk_root="$ANDROID_SDK_HOME" --licenses >/dev/null 2>&1 || true
  "$sdkmanager" --sdk_root="$ANDROID_SDK_HOME" \
    "platform-tools" "$PLATFORM" "$BUILD_TOOLS" >/dev/null
  log "SDK pronto em $ANDROID_SDK_HOME"
}

# --- 2. local.properties ----------------------------------------------------
write_local_properties() {
  local f="$PROJECT_DIR/local.properties"
  if ! grep -qs "^sdk.dir=" "$f" 2>/dev/null; then
    echo "sdk.dir=$ANDROID_SDK_HOME" > "$f"
    log "local.properties criado."
  else
    log "local.properties já existe."
  fi
}

# --- 3. Override do java.home (gradle.properties do projeto aponta p/ Windows)
write_gradle_java_home() {
  local jhome
  jhome="${JAVA_HOME:-$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")}"
  local gp="$HOME/.gradle/gradle.properties"
  mkdir -p "$HOME/.gradle"
  touch "$gp"
  # remove linha anterior e regrava (idempotente)
  grep -v "^org.gradle.java.home=" "$gp" > "$gp.tmp" 2>/dev/null || true
  mv "$gp.tmp" "$gp"
  echo "org.gradle.java.home=$jhome" >> "$gp"
  log "org.gradle.java.home=$jhome (em ~/.gradle/gradle.properties)"
}

# --- 4. Keystore de debug descartável --------------------------------------
write_debug_keystore() {
  local ks="$PROJECT_DIR/app/debug-local.keystore"
  local props="$PROJECT_DIR/keystore.properties"

  # Se já houver um keystore.properties válido (ex.: o de release real), respeita.
  if [ -f "$props" ]; then
    log "keystore.properties já existe — mantido."
    return
  fi

  if [ ! -f "$ks" ]; then
    log "Gerando keystore de debug descartável..."
    keytool -genkeypair -v -keystore "$ks" \
      -storepass android -keypass android -alias debuglocal \
      -keyalg RSA -keysize 2048 -validity 3650 \
      -dname "CN=Debug Local, O=Engecom, C=BR" >/dev/null 2>&1
  fi

  cat > "$props" <<EOF
storeFile=app/debug-local.keystore
storePassword=android
keyAlias=debuglocal
keyPassword=android
EOF
  log "keystore.properties (debug) criado."
}

# --- 4b. Semeia o cache do Gradle wrapper -----------------------------------
# O ./gradlew tenta baixar o Gradle de services.gradle.org, que redireciona
# para o GitHub Releases — bloqueado pelo proxy do ambiente remoto (403).
# Como a imagem já traz o Gradle 8.14.3 em /opt, semeamos o cache do wrapper
# com ele para o ./gradlew funcionar offline.
seed_gradle_wrapper() {
  local props="$PROJECT_DIR/gradle/wrapper/gradle-wrapper.properties"
  [ -f "$props" ] || return 0

  local disturl distname ver base sysroot hashdir
  disturl="$(sed -n 's/^distributionUrl=//p' "$props" | tr -d '\\')"
  distname="$(basename "$disturl")"                 # gradle-8.14.3-bin.zip
  ver="$(echo "$distname" | sed -E 's/gradle-([0-9.]+)-.*/\1/')"
  base="$HOME/.gradle/wrapper/dists/${distname%.zip}"

  # Localiza um Gradle de sistema com a versão exata exigida pelo wrapper.
  sysroot=""
  for cand in "/opt/gradle-$ver" "/opt/gradle" "$(command -v gradle 2>/dev/null || true)"; do
    [ -n "$cand" ] || continue
    local root="$cand"
    [ -f "$cand" ] && root="$(dirname "$(dirname "$(readlink -f "$cand")")")"
    if [ -x "$root/bin/gradle" ] && "$root/bin/gradle" --version 2>/dev/null | grep -q "Gradle $ver"; then
      sysroot="$root"; break
    fi
  done
  if [ -z "$sysroot" ]; then
    log "Gradle $ver de sistema não encontrado; ./gradlew tentará baixar."
    return 0
  fi

  # O wrapper cria o diretório de hash antes de baixar; deixe-o criá-lo.
  hashdir="$(ls -d "$base"/*/ 2>/dev/null | head -1 || true)"
  if [ -z "$hashdir" ]; then
    (cd "$PROJECT_DIR" && sh gradlew --version >/dev/null 2>&1) || true
    hashdir="$(ls -d "$base"/*/ 2>/dev/null | head -1 || true)"
  fi
  if [ -z "$hashdir" ]; then
    log "Não foi possível localizar o cache do wrapper; use 'gradle' do sistema."
    return 0
  fi
  hashdir="${hashdir%/}"

  rm -f "$hashdir"/*.part "$hashdir"/*.lck 2>/dev/null || true
  if [ ! -x "$hashdir/gradle-$ver/bin/gradle" ]; then
    log "Semeando cache do wrapper com Gradle $ver de $sysroot..."
    rm -rf "$hashdir/gradle-$ver"
    cp -a "$sysroot" "$hashdir/gradle-$ver"
    touch "$hashdir/$distname.ok"
  fi
  log "Cache do Gradle wrapper pronto."
}

# --- 5. Exporta variáveis para a sessão -------------------------------------
export_env() {
  export ANDROID_HOME="$ANDROID_SDK_HOME"
  export ANDROID_SDK_ROOT="$ANDROID_SDK_HOME"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    {
      echo "export ANDROID_HOME=\"$ANDROID_SDK_HOME\""
      echo "export ANDROID_SDK_ROOT=\"$ANDROID_SDK_HOME\""
      echo "export PATH=\"$ANDROID_SDK_HOME/platform-tools:$ANDROID_SDK_HOME/cmdline-tools/latest/bin:\$PATH\""
    } >> "$CLAUDE_ENV_FILE"
    log "Variáveis exportadas para a sessão (CLAUDE_ENV_FILE)."
  fi
}

install_sdk
write_local_properties
write_gradle_java_home
write_debug_keystore
seed_gradle_wrapper
export_env
log "Ambiente Android pronto. Compile com: ./gradlew assembleDebug"
