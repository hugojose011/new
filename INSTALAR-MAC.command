#!/bin/bash
# Instalador de duplo clique - Imersão Funnel Labs I.A. (macOS)
# Prepara o Python + Playwright + Chromium usados para gerar os PNG dos criativos.
# Não apaga nada, não trava: cada etapa trata o próprio erro e segue em frente.

set +e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR" || exit 1

SIM="${IFL_SIMULA:-0}"

verde() { printf '\033[32m%s\033[0m\n' "$1"; }
vermelho() { printf '\033[31m%s\033[0m\n' "$1"; }
amarelo() { printf '\033[33m%s\033[0m\n' "$1"; }
linha() { printf -- '----------------------------------------------------------\n'; }

linha
echo "Imersão Funnel Labs I.A., instalador do Mac"
linha
echo
echo "Isto prepara o computador para o hackathon. Leva alguns minutos"
echo "na primeira vez, principalmente por causa de um download de"
echo "cerca de 200 MB. Não feche esta janela."
echo

PYBIN=""

# 1. Detectar Python 3
echo "1. Procurando o Python 3..."
if [ "$SIM" = "1" ]; then
  echo "   [simulação] pulando detecção real, assumindo python3 encontrado"
  PYBIN="python3"
else
  if command -v python3 >/dev/null 2>&1; then
    PYBIN="python3"
  fi
fi

if [ -z "$PYBIN" ]; then
  vermelho "   Não encontrei o Python 3 neste Mac."
  echo "   Vou abrir a página de download. Baixe e instale o pacote para macOS,"
  echo "   depois dê dois cliques neste instalador de novo."
  if [ "$SIM" = "1" ]; then
    echo "   [simulação] abriria https://www.python.org/downloads/"
  else
    open "https://www.python.org/downloads/" >/dev/null 2>&1
  fi
  echo
  linha
  amarelo "Nada foi instalado ainda. Instale o Python e rode este arquivo de novo."
  linha
  echo
  read -p "Pressione Enter para fechar esta janela... " _dummy
  exit 0
fi
echo "   Python encontrado: $PYBIN"
echo

# 2. Instalar o pacote playwright (nunca pip sozinho)
echo "2. Instalando o pacote playwright..."
if [ "$SIM" = "1" ]; then
  echo "   [simulação] rodaria: $PYBIN -m pip install playwright"
  echo "   [simulação] (com fallback --user e --user --break-system-packages se preciso)"
else
  PIP_OUT="$("$PYBIN" -m pip install playwright 2>&1)"
  PIP_STATUS=$?
  if [ $PIP_STATUS -ne 0 ] && echo "$PIP_OUT" | grep -qi "externally-managed-environment"; then
    amarelo "   Este Mac protege o Python do sistema (Homebrew). Tentando com --user..."
    PIP_OUT="$("$PYBIN" -m pip install --user playwright 2>&1)"
    PIP_STATUS=$?
    if [ $PIP_STATUS -ne 0 ]; then
      amarelo "   Ainda não deu. Tentando com --user --break-system-packages..."
      PIP_OUT="$("$PYBIN" -m pip install --user --break-system-packages playwright 2>&1)"
      PIP_STATUS=$?
    fi
  fi
  echo "$PIP_OUT" | tail -n 6
fi
echo

# 3. Instalar o navegador Chromium
echo "3. Baixando o navegador que gera os PNG (Chromium)."
echo "   São cerca de 200 MB. Pode demorar alguns minutos, dependendo da internet."
if [ "$SIM" = "1" ]; then
  echo "   [simulação] rodaria: $PYBIN -m playwright install chromium"
else
  "$PYBIN" -m playwright install chromium
fi
echo

# 4. Verificação final de verdade (importa o playwright e confere o Chromium)
echo "4. Conferindo se está tudo certo..."
PLAYWRIGHT_OK=0
if [ "$SIM" = "1" ]; then
  echo "   [simulação] verificação pulada, assumindo sucesso"
  PLAYWRIGHT_OK=1
else
  CHECK="$("$PYBIN" -c "
import os, sys
ok = False
try:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        path = p.chromium.executable_path
        ok = bool(path) and os.path.exists(path)
except Exception:
    ok = False
print('OK' if ok else 'FALTA')
" 2>/dev/null)"
  if [ "$CHECK" = "OK" ]; then
    PLAYWRIGHT_OK=1
  fi
fi
echo

# 5. Detectar o comando claude (não bloqueia se faltar)
CLAUDE_OK=0
echo "5. Procurando o comando claude..."
if [ "$SIM" = "1" ]; then
  echo "   [simulação] verificaria o comando claude"
else
  if command -v claude >/dev/null 2>&1; then
    CLAUDE_OK=1
  fi
fi
echo

linha
if [ "$PLAYWRIGHT_OK" = "1" ]; then
  verde "TUDO PRONTO."
else
  vermelho "FALTOU ALGO."
  echo "O pacote playwright ou o navegador Chromium não ficaram prontos."
  echo "Dê dois cliques neste instalador de novo, ou peça ao Claude Code:"
  echo "  \"confira se as dependências estão instaladas\""
fi
if [ "$CLAUDE_OK" != "1" ]; then
  echo
  amarelo "Não encontrei o comando claude neste Mac. Se ainda não instalou o"
  echo "Claude Code, veja em claude.ai/code."
fi
linha
echo
echo "Próximo passo: abra esta pasta (squad-funil-black-ofertas) no Claude"
echo "Code e diga: Comece o hackathon, missão CAPTURA (dia 1) ou missão"
echo "PERPÉTUO (dia 2)."
echo

if [ "$SIM" = "1" ]; then
  echo "[simulação] abriria a pasta $DIR no Finder"
else
  open "$DIR" >/dev/null 2>&1
fi

echo
read -p "Pressione Enter para fechar esta janela... " _dummy
exit 0
