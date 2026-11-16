# Pooliana Painel — pools de liquidez estilo Revert, **somente leitura**

Painel web para explorar pools de liquidez, acompanhar suas posições Uniswap v3 e
simular faixas, no estilo do Revert Finance, feito para você poder **deixar a
carteira conectada sem risco de roubo**.

## O que ele faz

| Função | Como funciona |
|---|---|
| **Explorar pools** | Top pools por rede (Arbitrum, Ethereum, Base, Optimism, Polygon, BNB, Solana) com TVL, volume, giro (Vol/TVL), APR de taxas estimado e variação 24h. Busca por par/token, filtro de TVL mínimo, ordenação por coluna. APR acima de 200% aparece em amarelo (quase sempre sinal de risco). |
| **Minhas posições** | Lê direto da blockchain todas as posições Uniswap v3 de um endereço (em todas as redes de uma vez): faixa com barra visual, dentro/fora da faixa, composição, **taxas não coletadas**, valor em USD e totais. |
| **Simulador** | Escolha uma pool → defina faixa (±2% a ±50% ou manual) e depósito: composição inicial, eficiência de capital vs. full-range, APR estimado, taxas/dia, tabela de perda impermanente por cenário e dias de taxas para empatar. |
| **Backtest** | Aplica a faixa ao histórico real (30–365 dias de candles diários): taxas ganhas, dias na faixa, valor final, comparação com HODL e gráfico. |
| **Segurança** | Explica as proteções e traz um checklist para você. |

## Por que é seguro deixar conectado

1. **Somente leitura, garantido em código.** Todo acesso à carteira passa por
   `src/lib/safeWallet.ts`, que só deixa passar 4 métodos: ler endereço
   (`eth_requestAccounts`, `eth_accounts`), ler a rede (`eth_chainId`) e
   desconectar (`wallet_revokePermissions`). Assinaturas, transações, aprovações
   de token e troca de rede são **bloqueadas antes de chegar na carteira**.
2. **Testes automatizados que travam isso:** `tests/safeWallet.test.ts` testa os
   métodos perigosos, e `tests/static-scan.test.ts` falha se alguém colocar no
   código qualquer chamada de assinatura/aprovação, campo de seed/chave privada,
   `innerHTML`/`eval`, ou um host de rede não previsto.
3. **Modo Observar:** cole qualquer endereço e veja tudo sem conectar nada.
4. **Sem backend, sem banco, sem chave privada.** Roda inteiro no navegador.
5. **Content-Security-Policy restrita:** só scripts do próprio site e conexões
   apenas com `api.geckoterminal.com` e `*.publicnode.com`. Sem iframes, sem
   formulários externos, sem scripts de CDN. (Testado: um `fetch` para um site
   qualquer é bloqueado pelo navegador.)
6. **Supply-chain mínima:** em produção só existe React. Nada de bibliotecas de
   carteira de terceiros. Versões fixas (`save-exact`), `ignore-scripts=true`
   no `.npmrc` e `npm audit` com 0 vulnerabilidades.
7. **Alerta anti-phishing:** defina `VITE_DOMINIO_OFICIAL=seu-dominio.com` no
   build; se alguém clonar o site em outro domínio, aparece um aviso vermelho.

> **Regra de ouro:** este site nunca pede assinatura. Se a carteira abrir um
> pedido de assinatura/transação enquanto você usa o painel, **rejeite**.

### O que ele não faz, de propósito

Auto-compound, auto-range, Revert Lend e ações em 1 clique exigem aprovar ou
depositar seu NFT de posição em contratos inteligentes. Sem auditoria
profissional, isso é justamente o risco que você quer evitar. O painel analisa e
simula; para coletar taxas ou mexer em posições use o site oficial
(`app.uniswap.org`), aberto pelo link "Gerenciar na Uniswap" de cada posição.

## Rodar no seu computador

```bash
cd painel
npm ci          # instala exatamente as versões do package-lock
npm test        # 18 testes (segurança, matemática v3, leitura de posições, backtest)
npm run dev     # http://localhost:5174
```

## Publicar (Netlify, Cloudflare Pages ou Vercel)

```bash
VITE_DOMINIO_OFICIAL=seu-dominio.com npm run build   # gera painel/dist
```

- Publique a pasta `dist/`. Os cabeçalhos de segurança já estão prontos em
  `public/_headers` (Netlify/Cloudflare) e `vercel.json` (Vercel), incluindo
  `frame-ancestors 'none'` contra clickjacking e HSTS.
- Ative **2FA** na conta da hospedagem e no seu registrador de domínio (sequestro de
  DNS/conta é a forma mais comum de trocarem o site por um falso).
- Salve o endereço nos favoritos e entre sempre por ele.

## Estrutura

```
painel/
├── src/lib/safeWallet.ts   # lista branca da carteira (núcleo da segurança)
├── src/lib/rpc.ts          # cliente JSON-RPC só com eth_call
├── src/lib/abi.ts          # codificação ABI mínima feita à mão (sem libs)
├── src/lib/uniswap.ts      # leitura de posições Uniswap v3
├── src/lib/v3math.ts       # matemática de liquidez concentrada e IL
├── src/lib/gecko.ts        # dados de pools/preços/candles (GeckoTerminal)
├── src/lib/backtest.ts     # backtest de faixa
├── src/components/         # telas: pools, posições, simulador, segurança
├── tests/                  # testes (node --test)
├── public/_headers         # cabeçalhos HTTP de segurança
└── vite.config.ts          # CSP embutida no build
```

Dados: GeckoTerminal (limite gratuito ~30 consultas/min) e nós públicos
PublicNode. Estimativas de APR e backtest são aproximações. Não é recomendação
de investimento.
