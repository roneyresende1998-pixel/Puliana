# PROJETO POOLIANA — Agente DeFi do Curso Defiverso

Bem-vindo. Este pacote monta uma versão sua da **Puliana** — assistente de IA
para pools de liquidez em Solana, treinada com a metodologia Genesis.

Você escolhe:
- O **nome** do seu agente (pode ser qualquer coisa: Sofia, Nyx, Ava…).
- Se quer **voz** (opcional — dá pra ativar depois).
- Sua **carteira dedicada** de Solana (crie uma nova, jamais use a principal).

---

## 🚀 Instalação rápida (3 passos)

### 1. Pré-requisitos

Precisa ter instalado no seu Mac:

```bash
# uv — gerenciador de Python
curl -LsSf https://astral.sh/uv/install.sh | sh

# Node.js — pra rodar o frontend
brew install node

# make (Xcode Command Line Tools) — se não tiver
xcode-select --install
```

### 2. Rodar o setup interativo

Dentro da pasta `PROJETO POOLIANA`, no terminal:

```bash
./setup.sh
```

Ele vai perguntar:
- Nome do agente
- Chave da **Anthropic (Claude)** — obrigatória
- Se quer **voz** — se sim, chave do **ElevenLabs**
- **Chave privada** da sua carteira Solana dedicada
- Ciclo de mercado atual (bear / bull / neutro)

E salva tudo em `config/.env` (protegido, permissões 600).

### 3. Rodar o agente

```bash
make dev
```

Abra no navegador: **http://localhost:5173**

Pronto — sua agente já tá viva.

---

## 📖 Passo-a-passo completo

Veja o arquivo **`INSTALACAO.pdf`** para o guia detalhado com screenshots,
troubleshooting, e como colocar tudo dentro do Claude Code do jeito certo.

---

## ⚠️ Avisos de segurança

- **Nunca comite `config/.env`.** Já tem `.gitignore` protegendo, mas fica atento.
- **Use uma carteira dedicada** — nunca sua principal.
- O agente opera em **MAINNET** desde o setup. **Tx = dinheiro real.**
- Ele **nunca** dispara transação sem você dizer "go" ou "manda" explicitamente.

---

## 🎓 O que ela sabe fazer

- Escanear pools de Solana (Orca, Raydium) e ranquear pela metodologia Genesis
- Mostrar seu portfolio (SOL + tokens SPL)
- Listar suas posições abertas de Whirlpool
- Calcular rebalance pra abrir uma nova pool
- Abrir e fechar pools no Orca (com confirmação por voz ou texto)
- Fazer swap via Jupiter
- Responder perguntas sobre a metodologia (Portal 1 a 7 + Módulo 11)

Tudo em português brasileiro, tom direto, sem enrolar.

---

## 🔧 Comandos úteis

```bash
make dev            # Roda backend :8000 + frontend :5173
make test           # Roda testes
make cost-today     # Quanto você gastou em API hoje
make clean          # Limpa caches
```

---

## 🆘 Problemas?

1. **Erro de ffmpeg**: `make setup` já instala uma versão portável.
   Se ainda falhar, `brew install ffmpeg`.
2. **`.pth` file hidden (macOS + iCloud)**: rode `make fix-pth`.
3. **Voz não sai**: cheque se `ELEVENLABS_API_KEY` está preenchida no `.env`
   e se tem créditos na sua conta ElevenLabs.
4. **Whisper lento na primeira**: normal — ele baixa o modelo `small` (~500MB)
   uma vez. Depois é rápido.

---

## 🧱 Estrutura do projeto

```
PROJETO POOLIANA/
├── setup.sh                 # setup interativo (gera config/.env)
├── Makefile                 # dev, test, cost-today, clean, fix-pth
├── pyproject.toml           # dependências Python (uv)
├── config/
│   └── .env.example         # modelo — copie pra config/.env
├── backend/
│   └── app/
│       ├── main.py          # FastAPI: /chat, /health
│       ├── agent.py         # loop do agente (Claude + tools)
│       ├── config.py        # leitura do config/.env
│       ├── solana_rpc.py    # cliente JSON-RPC Solana
│       ├── confirmation.py  # trava de "go"/"manda" antes de qualquer tx
│       └── tools/
│           ├── wallet.py        # saldo SOL + SPL
│           ├── pools.py         # scan + ranking Genesis (Orca/Raydium)
│           ├── jupiter.py       # quote + swap
│           ├── whirlpool.py     # posições abertas / abrir / fechar
│           ├── rebalance.py     # cálculo de rebalanceamento
│           └── methodology.py   # Q&A sobre Portal 1-7 + Módulo 11
├── frontend/                # chat web (Vite + React), porta 5173
├── docs/methodology/        # conteúdo da metodologia Genesis (preencher)
└── scripts/                 # utilitários (fix-pth, cost-today)
```

> ⚠️ **Nota de implementação:** abrir/fechar posições de Whirlpool direto no
> Orca (fora do Jupiter) exige o SDK oficial da Orca — hoje só maduro em
> TypeScript/Rust. `tools/whirlpool.py` já traz a leitura de posições
> funcionando; a abertura/fechamento fica marcada como `NotImplementedError`
> até você plugar o SDK oficial ou uma API própria. Não adivinhamos essa
> parte pra não arriscar seu dinheiro com instruções on-chain erradas.

---

## 🙌 Créditos

Base: Defiverso Agent + Puliana — construídos por Genesis (curso Defiverso)
com Claude Code. Este pacote é o "kit do aluno" com adaptações pra você
personalizar.

**Persona, metodologia e tools = idênticos aos originais.**
Só troca o nome e o dono.
