@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ============================================================
echo  TELEGRAM APP - ANALISE SEGURA E PUSH PARA GITHUB
echo ============================================================
echo.

REM Confere se esta na raiz do projeto
if not exist "package.json" (
  echo ERRO: package.json nao encontrado.
  echo Execute este BAT na raiz do projeto Telegram App.
  pause
  exit /b 1
)

if not exist "server.js" (
  echo ERRO: server.js nao encontrado.
  echo Execute este BAT na raiz do projeto Telegram App.
  pause
  exit /b 1
)

if not exist ".git" (
  echo ERRO: este diretorio ainda nao e um repositorio Git.
  echo Execute antes: git init
  pause
  exit /b 1
)

echo [1/7] Conferindo arquivos sensiveis...
echo.

set HAS_SENSITIVE=0

if exist ".env" (
  echo ATENCAO: .env existe localmente. Ele NAO deve subir.
)

if exist "session.txt" (
  echo ATENCAO: session.txt existe localmente. Ele NAO deve subir.
)

if exist ".telegram_chats_cache.json" (
  echo ATENCAO: .telegram_chats_cache.json existe localmente. Ele NAO deve subir.
)

echo.
echo [2/7] Garantindo regras no .gitignore...

if not exist ".gitignore" (
  type nul > ".gitignore"
)

findstr /x /c:".env" ".gitignore" >nul || echo .env>>".gitignore"
findstr /x /c:"session.txt" ".gitignore" >nul || echo session.txt>>".gitignore"
findstr /x /c:"session*.txt" ".gitignore" >nul || echo session*.txt>>".gitignore"
findstr /x /c:".telegram_chats_cache.json" ".gitignore" >nul || echo .telegram_chats_cache.json>>".gitignore"
findstr /x /c:".telegram_chats_cache*.json" ".gitignore" >nul || echo .telegram_chats_cache*.json>>".gitignore"
findstr /x /c:"public/cache/" ".gitignore" >nul || echo public/cache/>>".gitignore"
findstr /x /c:"node_modules/" ".gitignore" >nul || echo node_modules/>>".gitignore"

echo OK: .gitignore conferido.
echo.

echo [3/7] Removendo do indice caso algum sensivel tenha sido rastreado...
git rm --cached .env 2>nul
git rm --cached session.txt 2>nul
git rm --cached .telegram_chats_cache.json 2>nul
git rm -r --cached public/cache 2>nul

echo.
echo [4/7] Validando sintaxe dos arquivos principais...
node --check server.js
if errorlevel 1 (
  echo ERRO: falha de sintaxe em server.js.
  pause
  exit /b 1
)

node --check services/envSetup.js
if errorlevel 1 (
  echo ERRO: falha de sintaxe em services/envSetup.js.
  pause
  exit /b 1
)

node --check services/telegram_global.js
if errorlevel 1 (
  echo ERRO: falha de sintaxe em services/telegram_global.js.
  pause
  exit /b 1
)

if exist "routes/auth.js" (
  node --check routes/auth.js
  if errorlevel 1 (
    echo ERRO: falha de sintaxe em routes/auth.js.
    pause
    exit /b 1
  )
)

echo OK: sintaxe validada.
echo.

echo [5/7] Status antes do commit:
git status --short
echo.

echo Conferindo se arquivos sensiveis estao no staging...
git status --short | findstr /i ".env session.txt .telegram_chats_cache public/cache"
if not errorlevel 1 (
  echo.
  echo ERRO: arquivo sensivel apareceu no git status.
  echo Revise antes de continuar.
  pause
  exit /b 1
)

echo.
echo [6/7] Adicionando arquivos seguros...
git add .

echo.
echo Status apos git add:
git status --short
echo.

git status --short | findstr /i ".env session.txt .telegram_chats_cache public/cache"
if not errorlevel 1 (
  echo.
  echo ERRO: arquivo sensivel entrou no staging.
  echo Cancelando para evitar vazamento.
  pause
  exit /b 1
)

echo.
set /p COMMIT_MSG=Digite a mensagem do commit [Atualizacao busca global validada]: 
if "%COMMIT_MSG%"=="" set COMMIT_MSG=Atualizacao busca global validada

echo.
echo [7/7] Criando commit...
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
  echo.
  echo Nada para commitar ou ocorreu erro no commit.
  echo Se aparecer "nothing to commit", o repositorio ja esta atualizado.
)

echo.
echo Enviando para GitHub...
git push origin main
if errorlevel 1 (
  echo.
  echo ERRO no push.
  echo Se o Git pedir pull, mande o print antes de usar --force.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  FINALIZADO COM SUCESSO
echo ============================================================
echo.
git status
echo.
pause
