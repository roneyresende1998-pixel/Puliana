#!/usr/bin/env bash
# Setup interativo do PROJETO POOLIANA — gera config/.env
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/config/.env"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ask() {
    local prompt="$1" default="${2:-}" var
    if [ -n "$default" ]; then
        read -r -p "$prompt [$default]: " var
        echo "${var:-$default}"
    else
        read -r -p "$prompt: " var
        echo "$var"
    fi
}
ask_secret() {
    local prompt="$1" var
    read -r -s -p "$prompt: " var
    echo >&2
    echo "$var"
}

echo
bold "=== PROJETO POOLIANA — setup ==="
echo "Isso vai gerar config/.env com as suas chaves. O arquivo fica só na sua"
echo "máquina (config/.env está no .gitignore) e recebe permissão 600."
echo

if [ -f "$ENV_FILE" ]; then
    overwrite=$(ask "config/.env já existe. Sobrescrever? (s/N)" "N")
    if [[ ! "$overwrite" =~ ^[sS]$ ]]; then
        echo "Cancelado. Nada foi alterado."
        exit 0
    fi
fi

AGENT_NAME=$(ask "Nome do seu agente" "Puliana")

echo
bold "Chave da Anthropic (Claude) — obrigatória"
echo "Pegue em https://console.anthropic.com/settings/keys"
ANTHROPIC_API_KEY=$(ask_secret "ANTHROPIC_API_KEY")
while [ -z "$ANTHROPIC_API_KEY" ]; do
    echo "Essa chave é obrigatória."
    ANTHROPIC_API_KEY=$(ask_secret "ANTHROPIC_API_KEY")
done

echo
WANT_VOICE=$(ask "Quer ativar voz agora? (s/N)" "N")
VOICE_ENABLED="false"
ELEVENLABS_API_KEY=""
ELEVENLABS_VOICE_ID=""
if [[ "$WANT_VOICE" =~ ^[sS]$ ]]; then
    VOICE_ENABLED="true"
    echo "Pegue sua chave em https://elevenlabs.io/app/settings/api-keys"
    ELEVENLABS_API_KEY=$(ask_secret "ELEVENLABS_API_KEY")
    ELEVENLABS_VOICE_ID=$(ask "ID da voz (opcional, Enter pra deixar padrão)" "")
fi

echo
bold "Carteira Solana DEDICADA"
echo "⚠️  NUNCA use sua carteira principal. Crie uma carteira nova só pra"
echo "    a Puliana operar. O agente roda em MAINNET — dinheiro real."
echo "    Aceita chave privada em base58 (Phantom) ou array JSON de bytes."
SOLANA_PRIVATE_KEY=$(ask_secret "SOLANA_PRIVATE_KEY")
while [ -z "$SOLANA_PRIVATE_KEY" ]; do
    echo "Essa chave é obrigatória pra carteira funcionar (pode ajustar depois em config/.env)."
    SOLANA_PRIVATE_KEY=$(ask_secret "SOLANA_PRIVATE_KEY")
done

SOLANA_RPC_URL=$(ask "RPC da Solana" "https://api.mainnet-beta.solana.com")

echo
MARKET_CYCLE=$(ask "Ciclo de mercado atual (bear/bull/neutro)" "neutro")

mkdir -p "$ROOT_DIR/config"
cat > "$ENV_FILE" <<EOF
AGENT_NAME=$AGENT_NAME
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
AGENT_MODEL=claude-sonnet-5

VOICE_ENABLED=$VOICE_ENABLED
ELEVENLABS_API_KEY=$ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID=$ELEVENLABS_VOICE_ID

SOLANA_PRIVATE_KEY=$SOLANA_PRIVATE_KEY
SOLANA_RPC_URL=$SOLANA_RPC_URL

MARKET_CYCLE=$MARKET_CYCLE

BACKEND_PORT=8000
FRONTEND_PORT=5173
EOF

chmod 600 "$ENV_FILE"

echo
bold "✅ config/.env criado e protegido (permissões 600)."
echo "Agora rode:"
echo "    make setup   # instala dependências"
echo "    make dev     # sobe o agente em http://localhost:5173"
