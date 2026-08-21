@echo off
chcp 65001 >nul
setlocal EnableExtensions

rem Instalador de duplo clique - Imersao Funnel Labs I.A. (Windows)
rem Prepara o Python + Playwright + Chromium usados para gerar os PNG dos criativos.
rem Nao apaga nada, nao trava: cada etapa trata o proprio erro e segue em frente.

set "DIR=%~dp0"
cd /d "%DIR%"

set "SIM=%IFL_SIMULA%"
set "PYBIN="
set "CLAUDE_OK=0"
set "PLAYWRIGHT_OK=0"

echo ----------------------------------------------------------
echo Imersão Funnel Labs I.A., instalador do Windows
echo ----------------------------------------------------------
echo.
echo Isto prepara o computador para o hackathon. Leva alguns minutos
echo na primeira vez, principalmente por causa de um download de
echo cerca de 200 MB. Não feche esta janela.
echo.

echo 1. Procurando o Python...
if "%SIM%"=="1" (
    echo    [simulação] pulando detecção real, assumindo python encontrado
    set "PYBIN=python"
    goto :python_ok
)

where python >nul 2>&1
if errorlevel 1 goto :try_py
set "PYBIN=python"
goto :python_ok

:try_py
where py >nul 2>&1
if errorlevel 1 goto :python_missing
py -3 --version >nul 2>&1
if errorlevel 1 goto :python_missing
set "PYBIN=py -3"
goto :python_ok

:python_missing
echo.
echo    Não encontrei o Python neste computador.
echo    Vou abrir a página de download. Baixe e instale o pacote para Windows.
echo    Na primeira tela do instalador, marque a caixa "Add python.exe to PATH".
echo    Depois, dê dois cliques neste instalador de novo.
if "%SIM%"=="1" (
    echo    [simulação] abriria https://www.python.org/downloads/
) else (
    start "" "https://www.python.org/downloads/"
)
echo.
echo ----------------------------------------------------------
echo Nada foi instalado ainda. Instale o Python e rode este arquivo de novo.
echo ----------------------------------------------------------
echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul
exit /b 0

:python_ok
echo    Python encontrado: %PYBIN%
echo.

echo 2. Instalando o pacote playwright...
if "%SIM%"=="1" (
    echo    [simulação] rodaria: %PYBIN% -m pip install playwright
) else (
    %PYBIN% -m pip install playwright
)
echo.

echo 3. Baixando o navegador que gera os PNG (Chromium).
echo    São cerca de 200 MB. Pode demorar alguns minutos, dependendo da internet.
if "%SIM%"=="1" (
    echo    [simulação] rodaria: %PYBIN% -m playwright install chromium
) else (
    %PYBIN% -m playwright install chromium
)
echo.

echo 4. Conferindo se está tudo certo...
if "%SIM%"=="1" (
    echo    [simulação] verificação pulada, assumindo sucesso
    set "PLAYWRIGHT_OK=1"
    goto :verif_done
)

set "CHECK_PY=%TEMP%\ifl_check_playwright.py"
if exist "%CHECK_PY%" del "%CHECK_PY%" >nul 2>&1
echo import os, sys> "%CHECK_PY%"
echo ok = False>> "%CHECK_PY%"
echo try:>> "%CHECK_PY%"
echo     from playwright.sync_api import sync_playwright>> "%CHECK_PY%"
echo     with sync_playwright() as p:>> "%CHECK_PY%"
echo         path = p.chromium.executable_path>> "%CHECK_PY%"
echo         ok = bool(path) and os.path.exists(path)>> "%CHECK_PY%"
echo except Exception:>> "%CHECK_PY%"
echo     ok = False>> "%CHECK_PY%"
echo print("OK" if ok else "FALTA")>> "%CHECK_PY%"

set "CHECK_RESULT="
for /f "delims=" %%R in ('%PYBIN% "%CHECK_PY%" 2^>nul') do set "CHECK_RESULT=%%R"
if "%CHECK_RESULT%"=="OK" set "PLAYWRIGHT_OK=1"
del "%CHECK_PY%" >nul 2>&1

:verif_done
echo.

echo 5. Procurando o comando claude...
if "%SIM%"=="1" (
    echo    [simulação] verificaria o comando claude
    goto :claude_done
)
where claude >nul 2>&1
if errorlevel 1 goto :claude_done
set "CLAUDE_OK=1"

:claude_done
echo.
echo ----------------------------------------------------------
if "%PLAYWRIGHT_OK%"=="1" (
    echo TUDO PRONTO.
) else (
    echo FALTOU ALGO.
    echo O pacote playwright ou o navegador Chromium não ficaram prontos.
    echo Dê dois cliques neste instalador de novo, ou peça ao Claude Code:
    echo   "confira se as dependências estão instaladas"
)
if not "%CLAUDE_OK%"=="1" (
    echo.
    echo Não encontrei o comando claude neste computador. Se ainda não
    echo instalou o Claude Code, veja em claude.ai/code.
)
echo ----------------------------------------------------------
echo.
echo Próximo passo: abra esta pasta ^(squad-funil-black-ofertas^) no Claude
echo Code e diga: Comece o hackathon, missão CAPTURA ^(dia 1^) ou missão
echo PERPÉTUO ^(dia 2^).
echo.

if "%SIM%"=="1" (
    echo [simulação] abriria a pasta %DIR% no Explorador de Arquivos
) else (
    start "" explorer "%DIR%"
)

echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul
exit /b 0
