// Símbolo e casas decimais de tokens Solana: decimais vêm da própria conta do
// mint (blockchain); símbolo vem do GeckoTerminal (com fallback para o endereço).

import type { TokenInfo } from "../positions.ts";
import { getAccounts, u8 } from "./core.ts";

const cache = new Map<string, TokenInfo>();
const KNOWN: Record<string, string> = {
  So11111111111111111111111111111111111111112: "SOL",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
};

export async function solTokenInfo(mints: string[]): Promise<Map<string, TokenInfo>> {
  const missing = [...new Set(mints)].filter((m) => !cache.has(m));
  if (missing.length) {
    const accs = await getAccounts(missing);
    let symbols = new Map<string, string>();
    try {
      symbols = await geckoSymbols(missing);
    } catch { /* sem símbolo: usa abreviação */ }
    missing.forEach((m, i) => {
      const dec = accs[i] && accs[i]!.data.length >= 45 ? u8(accs[i]!.data, 44) : 0;
      cache.set(m, { address: m, decimals: dec, symbol: KNOWN[m] ?? symbols.get(m) ?? `${m.slice(0, 4)}…` });
    });
  }
  return new Map(mints.map((m) => [m, cache.get(m)!]));
}

async function geckoSymbols(mints: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < mints.length; i += 30) {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/multi/${mints.slice(i, i + 30).join(",")}`, {
      credentials: "omit", referrerPolicy: "no-referrer", headers: { accept: "application/json" },
    });
    if (!r.ok) continue;
    const j = (await r.json()) as { data: { attributes: { address: string; symbol: string } }[] };
    for (const t of j.data) out.set(t.attributes.address, t.attributes.symbol);
  }
  return out;
}
