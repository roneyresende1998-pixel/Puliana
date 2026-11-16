// Preços em USD via DefiLlama (sem chave, limite folgado, EVM + Solana).

const LLAMA_CHAIN: Record<string, string> = {
  eth: "ethereum", arbitrum: "arbitrum", base: "base", optimism: "optimism", polygon: "polygon",
  bsc: "bsc", avalanche: "avax", unichain: "unichain", linea: "linea", solana: "solana",
};
// Moeda nativa (endereço zero na Uniswap v4) → token "embrulhado" equivalente
export const WRAPPED: Record<string, string> = {
  eth: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", arbitrum: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
  base: "0x4200000000000000000000000000000000000006", optimism: "0x4200000000000000000000000000000000000006",
  unichain: "0x4200000000000000000000000000000000000006", polygon: "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
  bsc: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", avalanche: "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7",
  linea: "0xe5d7c2a44ffddf6b295a15c148167daaaf5cf34f",
};

const cache = new Map<string, { t: number; p: number | null }>();
const TTL = 60_000;

const keyOf = (chainKey: string, addr: string) => {
  const a = /^0x0{40}$/.test(addr) ? WRAPPED[chainKey] ?? addr : addr;
  return `${LLAMA_CHAIN[chainKey] ?? chainKey}:${a.startsWith("0x") ? a.toLowerCase() : a}`;
};

/** Retorna mapa "chainKey:endereço" → preço USD (ausente se desconhecido). */
export async function fetchPrices(items: { chainKey: string; address: string }[]): Promise<Map<string, number>> {
  const want = new Map<string, string>(); // llamaKey -> nossa chave
  for (const it of items) want.set(keyOf(it.chainKey, it.address), `${it.chainKey}:${it.address.toLowerCase()}`);
  const now = Date.now();
  const missing = [...want.keys()].filter((k) => !(cache.get(k) && now - cache.get(k)!.t < TTL));
  for (let i = 0; i < missing.length; i += 80) {
    const chunk = missing.slice(i, i + 80);
    try {
      const r = await fetch(`https://coins.llama.fi/prices/current/${chunk.map(encodeURIComponent).join(",")}`, {
        credentials: "omit", referrerPolicy: "no-referrer",
      });
      const j = (await r.json()) as { coins: Record<string, { price: number; confidence?: number }> };
      for (const k of chunk) {
        const c = j.coins[k];
        cache.set(k, { t: now, p: c && (c.confidence ?? 1) >= 0.5 ? c.price : null });
      }
    } catch { /* sem preço */ }
  }
  const out = new Map<string, number>();
  for (const [lk, ours] of want) { const c = cache.get(lk); if (c?.p != null) out.set(ours, c.p); }
  return out;
}
