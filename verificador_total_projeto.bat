@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================================
echo VERIFICADOR AVANÇADO + PUSH SEGURO
echo ============================================================

echo.
echo [1] VALIDANDO ESTRUTURA...

if not exist "package.json" goto erro
if not exist "server.js" goto erro
if not exist "services" goto erro
if not exist "routes" goto erro
if not exist "public" goto erro

echo OK: Estrutura básica válida.
echo.

echo [2] PROCURANDO ARQUIVOS QUEBRADOS (JS)...

set HAS_ERROR=0

for /r %%f in (*.js) do (
    node --check "%%f" >nul 2>&1
    if errorlevel 1 (
        echo ERRO DE SINTAXE: %%f
        set HAS_ERROR=1
    )
)

if !HAS_ERROR!==1 (
    echo.
    echo ERRO: Existem arquivos JS quebrados.
    pause
    exit /b 1
)

echo OK: Nenhum JS quebrado.
echo.

echo [3] PROCURANDO CONFLITOS DE MERGE...

set HAS_CONFLICT=0

for /r %%f in (*.*) do (
    findstr /c:"<<<<<<<" "%%f" >nul 2>&1 && (
        echo CONFLITO DETECTADO EM: %%f
        set HAS_CONFLICT=1
    )
)

if !HAS_CONFLICT!==1 (
    echo.
    echo ERRO: Existem conflitos de merge nao resolvidos.
    pause
    exit /b 1
)

echo OK: Nenhum conflito encontrado.
echo.

echo [4] VALIDANDO DEPENDÊNCIAS...

if exist "package.json" (
    npm ls >nul 2>&1
    if errorlevel 1 (
        echo AVISO: dependencias podem estar inconsistentes.
    ) else (
        echo OK: dependencias válidas.
    )
)

echo.

echo [5] PROTEÇÃO DE SEGURANÇA...

git rm --cached .env 2>nul
git rm --cached session.txt 2>nul
git rm --cached .telegram_chats_cache.json 2>nul
git rm -r --cached public/cache 2>nul

echo.

echo [6] STATUS GIT...
git status --short
echo.

echo [7] COMMIT E PUSH...

set /p MSG=Mensagem commit: 
if "%MSG%"=="" set MSG=Atualizacao segura projeto

git add .
git commit -m "%MSG%"

git push origin main

echo.
echo FINALIZADO COM SUCESSO
pause
exit /b 0

:erro
echo ERRO: Estrutura do projeto invalida.
pause
exit /b 1
