@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Telegram App - Verificador e Push Seguro

set LOG=verificacao_github_telegram.log
set DEFAULT_MSG=Atualizacao busca global validada

echo ============================================================ > "%LOG%"
echo TELEGRAM APP - VERIFICADOR AVANCADO E PUSH SEGURO >> "%LOG%"
echo Data/Hora: %date% %time% >> "%LOG%"
echo ============================================================ >> "%LOG%"

call :print "============================================================"
call :print " TELEGRAM APP - VERIFICADOR AVANCADO E PUSH SEGURO"
call :print "============================================================"
call :print ""

call :print "[0/8] Conferindo diretorio atual..."
call :print "Diretorio: %CD%"

if not exist "package.json" call :fail "package.json nao encontrado. Execute este BAT na raiz do projeto."
if not exist "server.js" call :fail "server.js nao encontrado. Execute este BAT na raiz do projeto."
if not exist "services" call :fail "Pasta services nao encontrada."
if not exist "routes" call :fail "Pasta routes nao encontrada."
if not exist "public" call :fail "Pasta public nao encontrada."
if not exist ".git" call :fail "Pasta .git nao encontrada. Este diretorio nao esta versionado."

call :print "OK: estrutura principal encontrada."
call :print ""

call :print "[1/8] Conferindo .gitignore e regras de seguranca..."
if not exist ".gitignore" type nul > ".gitignore"

call :ensure_gitignore ".env"
call :ensure_gitignore ".env.*"
call :ensure_gitignore "session.txt"
call :ensure_gitignore "session*.txt"
call :ensure_gitignore ".telegram_chats_cache.json"
call :ensure_gitignore ".telegram_chats_cache*.json"
call :ensure_gitignore "public/cache/"
call :ensure_gitignore "node_modules/"
call :ensure_gitignore "*.log"

call :print "OK: .gitignore conferido."
call :print ""

call :print "[2/8] Removendo do indice arquivos sensiveis, se houver..."
git rm --cached .env >> "%LOG%" 2>&1
git rm --cached session.txt >> "%LOG%" 2>&1
git rm --cached .telegram_chats_cache.json >> "%LOG%" 2>&1
git rm -r --cached public/cache >> "%LOG%" 2>&1
call :print "OK: remocao preventiva do indice concluida."
call :print ""

call :print "[3/8] Verificando conflitos de merge..."
set HAS_CONFLICT=0
for /r %%f in (*.*) do (
  echo %%f | findstr /i "\\.git\\ node_modules\\ public\\cache\\" >nul
  if errorlevel 1 (
    findstr /c:"<<<<<<<" "%%f" >nul 2>&1 && (
      call :print "CONFLITO: %%f"
      set HAS_CONFLICT=1
    )
    findstr /c:"=======" "%%f" >nul 2>&1 && (
      findstr /c:">>>>>>>" "%%f" >nul 2>&1 && (
        call :print "CONFLITO: %%f"
        set HAS_CONFLICT=1
      )
    )
  )
)
if "!HAS_CONFLICT!"=="1" call :fail "Conflitos de merge encontrados. Resolva antes de subir."
call :print "OK: nenhum conflito de merge detectado."
call :print ""

call :print "[4/8] Validando sintaxe JavaScript..."
set HAS_JS_ERROR=0

for %%f in (
  "server.js"
  "services\envSetup.js"
  "services\telegram.js"
  "services\telegram_global.js"
  "services\telegram_public.js"
  "routes\auth.js"
) do (
  if exist %%f (
    node --check %%f >> "%LOG%" 2>&1
    if errorlevel 1 (
      call :print "ERRO DE SINTAXE: %%f"
      set HAS_JS_ERROR=1
    ) else (
      call :print "OK: %%f"
    )
  ) else (
    call :print "AVISO: arquivo nao encontrado: %%f"
  )
)

if "!HAS_JS_ERROR!"=="1" call :fail "Existe erro de sintaxe em arquivo principal."
call :print "OK: sintaxe principal validada."
call :print ""

call :print "[5/8] Conferindo status antes do git add..."
git status --short
git status --short >> "%LOG%" 2>&1
call :print ""

call :print "[6/8] Adicionando arquivos ao staging..."
git add . >> "%LOG%" 2>&1
if errorlevel 1 call :fail "Falha no git add."

call :print "Status apos git add:"
git status --short
git status --short >> "%LOG%" 2>&1

git status --short | findstr /i ".env session.txt .telegram_chats_cache public/cache node_modules" >nul
if not errorlevel 1 call :fail "Arquivo sensivel apareceu no staging. Push bloqueado."

call :print ""
call :print "[7/8] Commit..."
call :print "Mensagem padrao: %DEFAULT_MSG%"
set /p COMMIT_MSG=Digite a mensagem do commit ou pressione ENTER para usar a padrao: 
if "%COMMIT_MSG%"=="" set COMMIT_MSG=%DEFAULT_MSG%

git diff --cached --quiet
if not errorlevel 1 (
  call :print "Nada novo para commitar. Prosseguindo para push."
) else (
  git commit -m "%COMMIT_MSG%" >> "%LOG%" 2>&1
  if errorlevel 1 call :fail "Falha no git commit. Veja %LOG%."
  call :print "OK: commit criado."
)

call :print ""
call :print "[8/8] Push para GitHub..."
git push origin main >> "%LOG%" 2>&1
if errorlevel 1 (
  call :print "ERRO no push. Saida:"
  git push origin main
  call :fail "Falha no push. Se pedir pull/conflito, mande o print antes de usar --force."
)

call :print ""
call :print "============================================================"
call :print " FINALIZADO COM SUCESSO"
call :print "============================================================"
call :print ""
call :print "Log salvo em: %CD%\%LOG%"
call :print ""
git status
echo.
pause
exit /b 0

:ensure_gitignore
findstr /x /c:%1 ".gitignore" >nul 2>&1
if errorlevel 1 echo %~1>>".gitignore"
exit /b 0

:print
echo %~1
echo %~1>>"%LOG%"
exit /b 0

:fail
echo.
echo ERRO: %~1
echo ERRO: %~1>>"%LOG%"
echo.
echo Log salvo em: %CD%\%LOG%
echo.
pause
exit /b 1
