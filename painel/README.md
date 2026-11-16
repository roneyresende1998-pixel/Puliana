# Pooliana Painel — pools de liquidez estilo Revert, **somente leitura**

Painel web para explorar pools de liquidez, acompanhar suas posições Uniswap v3 e
simular faixas, no estilo do Revert Finance, feito para você poder **deixar a
carteira conectada sem risco de roubo**.

## O que ele faz

| Função | Como funciona |
|---|---|
| **Explorar pools: DEX** | 223 redes do GeckoTerminal (Solana, Ethereum, Base, Arbitrum, BNB, Sui, TON…), com filtro por DEX, busca, TVL mínimo e ordenação. Mostra TVL, volume, giro (Vol/TVL), APR de taxas estimado e variação 24h. O modo "em alta" junta todas as redes. |
| **Explorar pools: rendimentos** | Cerca de 15 mil pools do DefiLlama em ~100 redes e centenas de protocolos (Orca, Raydium, Meteora, Uniswap, Aerodrome…): APY de taxas, de incentivos, média de 30 dias e risco de perda impermanente. |
| **Minhas posições** | Várias carteiras ao mesmo tempo, EVM e Solana, somadas: **Uniswap v3** (8 redes), **Uniswap v4** (8 redes, pelo número do NFT), **PancakeSwap v3** (5), **SushiSwap v3** (6), **Aerodrome**, **Velodrome**, **Orca Whirlpools**, **Raydium CLMM** e **Meteora DLMM**. Mostra faixa, dentro/fora, composição, taxas não coletadas, valor em USD, total por rede e filtros. |
| **Simulador e backtest** | Faixa, eficiência de capital, APR estimado, perda impermanente por cenário e backtest com candles reais. |
| **Segurança** | Proteções explicadas, checklist e alerta automático de token-golpe. |

Redes EVM das posições: Ethereum, Arbitrum, Base, Optimism, Polygon, BNB Chain, Avalanche, Unichain e Linea. Todos os endereços de contrato foram conferidos na blockchain.

**Ainda não lido:** posições em stake (NFT depositado em gauge/farm da Aerodrome, Velodrome ou PancakeSwap, que sai da carteira), Orca position bundles e pools v2 (não concentradas).

## Por que é seguro deixar conectado

1. **Somente leitura, garantido em código.** Na EVM todo acesso à carteira passa
   por `src/lib/safeWallet.ts`, que só deixa passar 4 métodos (ler endereço, ler
   rede e desconectar). Na Solana (`src/lib/safeSolana.ts`) o painel só chama
   `connect`/`disconnect` e lê a chave pública. Não existe código de assinatura.
   O retransmissor Solana (`api/sol.ts`) também só aceita métodos de consulta.
2. **Testes automatizados que travam isso:** `tests/safeWallet.test.ts` testa os
   métodos perigosos, e `tests/static-scan.test.ts` falha se alguém colocar no
   código qualquer chamada de assinatura/aprovação, campo de seed/chave privada,
   `innerHTML`/`eval`, ou um host de rede não previsto.
3. **Modo Observar:** cole qualquer endereço e veja tudo sem conectar nada.
4. **Sem backend, sem banco, sem chave privada.** Roda inteiro no navegador.
5. **Content-Security-Policy restrita:** só scripts do próprio site e conexões
   apenas com `api.geckoterminal.com`, `coins.llama.fi`, `yields.llama.fi`,
   `*.publicnode.com` e o próprio site. Sem iframes, sem
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
npm test        # 27 testes (segurança, retransmissor, Solana, keccak, matemática, posições)
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

Dados: GeckoTerminal (limite gratuito ~30 consultas/min), DefiLlama (preços e
rendimentos), nós públicos PublicNode (EVM) e RPC oficial da Solana via
retransmissor só leitura. Estimativas de APR e backtest são aproximações. Não é recomendação
de investimento.
