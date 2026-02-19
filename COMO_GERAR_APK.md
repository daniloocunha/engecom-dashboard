# Como Gerar APK - Calculadora HH

## 🚀 Processo SIMPLES (Padronizado)

### Opção 1: Script Automatizado (RECOMENDADO)

1. **Clique duas vezes em**: `gerar-apk.bat`
2. **Aguarde** a compilação (30-60 segundos)
3. **Pronto!** APK estará na raiz do projeto: `CalculadoraHH-v1.5.0-release.apk`

### Opção 2: Linha de Comando

```bash
cd C:\Users\dan\CalculadoraHH
./gradlew assembleRelease
```

APK estará em: `app\build\outputs\apk\release\app-release.apk`

---

## 📋 Checklist Antes de Compilar

✅ **Keystore no lugar certo**: `app/calculadorahh-release.keystore`
✅ **Configuração**: `keystore.properties` na raiz
✅ **Versão atualizada**: `app/build.gradle.kts` (versionCode e versionName)

---

## 🔐 Estrutura de Assinatura

### Keystore Definitivo

**Localização**: `C:\Users\dan\CalculadoraHH\app\calculadorahh-release.keystore`

**Dados**:
- **Senha do Keystore**: `engecomrumo01`
- **Alias**: `controledecampo`
- **Senha do Alias**: `engecomrumo01`
- **Válido até**: 31/03/2053

**⚠️ IMPORTANTE**:
- NUNCA delete ou altere este keystore
- NUNCA comite no Git
- Mantenha backup em: `D:\OneDrive\Usuário\Danilo\Documentos\`

### Configuração (keystore.properties)

```properties
storePassword=engecomrumo01
keyPassword=engecomrumo01
keyAlias=controledecampo
storeFile=calculadorahh-release.keystore
```

---

## 🎯 Atualizar Versão

Antes de gerar novo APK, atualize em `app/build.gradle.kts`:

```kotlin
defaultConfig {
    versionCode = 7        // Incrementar sempre
    versionName = "1.6.0"  // Versão visível
}
```

**Regras**:
- `versionCode`: Número inteiro sequencial (6, 7, 8...)
- `versionName`: Versão semântica (1.5.0, 1.6.0, 2.0.0...)

---

## 📦 Distribuir APK

### 1. Arquivo Gerado

Após executar `gerar-apk.bat`:
- **Nome**: `CalculadoraHH-v1.5.0-release.apk`
- **Localização**: Raiz do projeto
- **Assinado**: ✅ SIM
- **Pronto**: ✅ Para distribuição

### 2. Calcular Hash MD5

O script já calcula automaticamente, mas se precisar manual:

```bash
certutil -hashfile CalculadoraHH-v1.5.0-release.apk MD5
```

### 3. Upload para Google Drive

1. Faça upload do APK
2. Gere link compartilhável
3. Atualize na aba **Config** da planilha:
   - `url_download`: Link do Drive
   - `hash_md5`: Hash calculado
   - `versao_recomendada`: Novo versionCode

---

## 🔄 Atualização In-App

Para que o app detecte e baixe automaticamente:

1. **Gere o APK** assinado
2. **Calcule o hash MD5**
3. **Faça upload** para Google Drive
4. **Atualize Config** na planilha:

```
versao_minima        | 6
versao_recomendada   | 7
url_download         | https://drive.google.com/...
hash_md5             | 6f0c8d8a23cb50fc13e6ed3fda8d6283
forcar_update        | NAO
tamanho_apk_mb       | 3.23
mensagem_aviso       | Nova versão disponível com melhorias!
mensagem_bloqueio    | Atualize para continuar usando o app
```

---

## ❌ Problemas Comuns

### "Keystore not found"

**Solução**: Verifique que existe `app/calculadorahh-release.keystore`

```bash
# Verificar
dir app\calculadorahh-release.keystore

# Se não existir, copie do backup
copy "D:\OneDrive\Usuário\Danilo\Documentos\calculadorahh-release.keystore" app\
```

### "App não instala por cima"

**Causa**: Assinatura diferente

**Solução**:
1. **Primeira instalação**: Desinstalar app antigo, instalar novo
2. **Próximas**: Instalar por cima funcionará (mesma assinatura)

### "Build failed"

**Solução**: Feche Android Studio e execute:

```bash
./gradlew --stop
./gradlew clean
./gradlew assembleRelease
```

---

## 📊 Histórico de Versões

| Versão | versionCode | Data       | Hash MD5                          |
|--------|-------------|------------|-----------------------------------|
| 1.5.0  | 6           | 14/11/2025 | 6f0c8d8a23cb50fc13e6ed3fda8d6283 |

---

## 🎓 Para Desenvolvedores

### Debug APK (para testes)

```bash
./gradlew assembleDebug
```

**Diferenças**:
- Debug: ~10 MB (sem otimização)
- Release: ~3 MB (com ProGuard)

### Verificar Assinatura

```bash
# V1 (jarsigner)
jarsigner -verify -verbose app-release.apk

# V2/V3 (apksigner - requer Android SDK)
apksigner verify --verbose app-release.apk
```

---

## 📝 Resumo do Fluxo

```
1. Atualizar versionCode e versionName
2. Executar gerar-apk.bat
3. Pegar APK gerado na raiz
4. Calcular hash MD5 (já mostrado)
5. Upload para Drive
6. Atualizar Config na planilha
7. Distribuir ou aguardar auto-update
```

---

**Data**: 14/11/2025
**Autor**: Claude Code
**Versão do Doc**: 1.0
