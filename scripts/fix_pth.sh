#!/usr/bin/env bash
# Corrige o problema do .pth ficando "oculto"/não sincronizado quando o
# projeto está dentro de uma pasta gerenciada pelo iCloud Drive no macOS.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$ROOT_DIR/.venv"

if [ ! -d "$VENV_DIR" ]; then
    echo "Nenhum .venv encontrado em $VENV_DIR — rode 'uv sync' primeiro."
    exit 1
fi

echo "Forçando download/materialização dos arquivos do venv (iCloud)..."
find "$VENV_DIR" -type f -name "*.pth" -print0 | while IFS= read -r -d '' f; do
    # Ler o arquivo força o macOS a baixar do iCloud se estiver "em nuvem".
    cat "$f" > /dev/null 2>&1 || true
    echo "  ok: $f"
done

echo "Removendo o atributo de 'oculto' de arquivos .pth, se houver..."
find "$VENV_DIR" -type f -name "*.pth" -exec chflags nohidden {} \; 2>/dev/null || true

echo "Pronto. Se o problema persistir, mova o projeto pra fora de uma pasta"
echo "sincronizada pelo iCloud Drive (ex: ~/Projects em vez de ~/Desktop)."
