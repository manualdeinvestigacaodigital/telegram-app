@echo off
cls

echo ==========================================
echo PUBLICACAO PROJETO TELEGRAM NO GITHUB
echo ==========================================

cd /d "%~dp0"

echo Diretorio atual:
cd

echo.
echo [1/6] Verificando Git...
git --version >nul 2>&1
if errorlevel 1 (
    echo ERRO: Git nao instalado
    pause
    exit
)

echo [2/6] Verificando Node...
node -v >nul 2>&1
if errorlevel 1 (
    echo ERRO: Node nao instalado
    pause
    exit
)

echo [3/6] Instalando dependencias...
call npm install

echo.
echo [4/6] Criando .gitignore...
(
echo node_modules/
echo .env
echo session.txt
echo public/cache/
echo bk/
echo *.log
) > .gitignore

echo [5/6] Inicializando Git...
git init

echo.
set /p REPO=Cole a URL do repositorio:

git remote remove origin >nul 2>&1
git remote add origin %REPO%

git add .
git commit -m "Publicacao inicial"

git branch -M main

echo [6/6] Enviando para GitHub...
git push -u origin main

echo.
echo FINALIZADO COM SUCESSO
pause