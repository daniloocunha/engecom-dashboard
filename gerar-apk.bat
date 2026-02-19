@echo off
setlocal enabledelayedexpansion
:: ============================================================
:: Script Melhorado - Gera APK com versão automática
:: Versão: 2.0
:: Data: 2025-11-18
:: ============================================================

cd /d "%~dp0"

:: Extrair versão do build.gradle.kts
echo Lendo versão do build.gradle.kts...
for /f "tokens=3 delims= " %%a in ('findstr /C:"versionName = " app\build.gradle.kts') do (
    set VERSION_RAW=%%a
)
:: Remover aspas
set VERSION=%VERSION_RAW:"=%

if "%VERSION%"=="" (
    echo ERRO: Não foi possível ler a versão do build.gradle.kts
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   GERANDO APK ASSINADO - CalculadoraHH v%VERSION%
echo ============================================================
echo.

:: Passo 1: Para todos os processos Gradle
echo [1/6] Parando processos Gradle...
.\gradlew --stop >nul 2>&1

:: Passo 2: Mata processos Java/Gradle persistentes
echo [2/6] Limpando processos...
taskkill /F /IM java.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Passo 3: Limpa build folder
echo [3/6] Limpando cache...
powershell -Command "if (Test-Path 'app\build') { Remove-Item -Path 'app\build' -Recurse -Force -ErrorAction SilentlyContinue }" >nul 2>&1

:: Passo 4: Testa conexão internet (para dependências)
echo [4/6] Verificando conexão...
ping -n 1 google.com >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo    ⚠ AVISO: Sem conexão com internet. Gradle pode falhar ao baixar dependências.
    echo.
) else (
    echo    ✓ Conexão OK
)

:: Passo 5: Limpa APKs antigos
echo [5/6] Limpando APKs antigos...
del /F /Q CalculadoraHH-*.apk >nul 2>&1
del /F /Q CalculadoraHH-*.apk.md5 >nul 2>&1

:: Passo 6: Compila APK
echo [6/6] Compilando APK (aguarde 30-90s)...
echo.
.\gradlew assembleRelease

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ============================================================
    echo   ❌ ERRO NA COMPILAÇÃO
    echo ============================================================
    echo.
    echo Possíveis causas:
    echo   - Android Studio está aberto (feche e tente novamente)
    echo   - Erro de sintaxe no código
    echo   - Dependências não baixadas
    echo.
    echo Verifique os logs acima para mais detalhes.
    echo.
    pause
    exit /b 1
)

:: Verifica se APK foi gerado
if not exist "app\build\outputs\apk\release\app-release.apk" (
    echo.
    echo ❌ ERRO: APK não foi gerado!
    pause
    exit /b 1
)

:: Define nome do arquivo com versão
set APK_NAME=CalculadoraHH-v%VERSION%-release.apk

:: Copia para raiz
copy /Y "app\build\outputs\apk\release\app-release.apk" "%APK_NAME%" >nul

echo.
echo ============================================================
echo   ✅ SUCESSO!
echo ============================================================
echo.
echo 📦 Arquivo: %APK_NAME%
echo.

:: Calcula tamanho
for %%I in ("%APK_NAME%") do (
    set /a SIZE_KB=%%~zI/1024
    set /a SIZE_MB=%%~zI/1048576
    echo 📊 Tamanho: !SIZE_MB! MB (!SIZE_KB! KB)
)

:: Calcula MD5
echo.
echo 🔐 Calculando hash MD5...
certutil -hashfile "%APK_NAME%" MD5 > temp_md5.txt
for /f "skip=1 tokens=*" %%h in (temp_md5.txt) do (
    set "line=%%h"
    if not "!line:~0,3!"=="Cer" (
        set "MD5_HASH=%%h"
        echo    Hash MD5: %%h

        :: Salva MD5 em arquivo separado
        echo %%h > "%APK_NAME%.md5"
        goto :md5_done
    )
)
:md5_done
del temp_md5.txt >nul 2>&1

:: Informações adicionais
echo.
echo ============================================================
echo   📋 INFORMAÇÕES DO BUILD
echo ============================================================
echo.
echo Versão: %VERSION%
echo Data: %DATE% %TIME%
echo Local: %CD%
echo.
echo Arquivos gerados:
echo   ✓ %APK_NAME%
echo   ✓ %APK_NAME%.md5
echo.

:: Verifica assinatura
echo 🔍 Verificando assinatura...
jarsigner -verify -verbose -certs "%APK_NAME%" > temp_verify.txt 2>&1
findstr /C:"jar verified" temp_verify.txt >nul
if %ERRORLEVEL% EQU 0 (
    echo    ✓ APK assinado corretamente
) else (
    echo    ⚠ AVISO: Problema na verificação de assinatura
)
del temp_verify.txt >nul 2>&1

echo.
echo ============================================================
echo   🚀 PRONTO PARA DISTRIBUIR!
echo ============================================================
echo.
echo Próximos passos:
echo   1. Testar instalação em dispositivo Android
echo   2. Distribuir para usuários
echo   3. Atualizar planilha Config se necessário
echo.

:: Pergunta se deseja abrir pasta
choice /C SN /M "Deseja abrir a pasta do APK"
if %ERRORLEVEL% EQU 1 (
    explorer /select,"%APK_NAME%"
)

pause
