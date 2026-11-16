// Dados públicos de pools via GeckoTerminal (sem chave de API, só leitura).
// Limite gratuito ~30 req/min — por isso há cache em memória.

import { parseFeeFromName, poolFeeApr } from "./v3math.ts";

const BASE = "https://api.geckoterminal.com/api/v2";
const cache = new Map<string, { t: number; v: unknown }>();
const TTL = 60_000;

async function get<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.t < TTL) return hit.v as T;
  const res = await fetch(BASE + path, {
    headers: { accept: "application/json" },
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (res.status === 429) throw new Error("Limite do GeckoTerminal atingido — aguarde 1 minuto.");
  if (!res.ok) throw new Error(`GeckoTerminal respondeu ${res.status}`);
  const v = (await res.json()) as T;
  cache.set(path, { t: Date.now(), v });
  return v;
}

export type Pool = {
  id: string;
  network: string;
  address: string;
  name: string;
  dex: string;
  base: string;
  quote: string;
  baseAddress: string;
  quoteAddress: string;
  baseUsd: number;
  quoteUsd: number;
  /** preço do token base cotado no token quote */
  priceBaseInQuote: number;
  tvl: number;
  volume24h: number;
  volume1h: number;
  change24h: number;
  txs24h: number;
  feeTier: number | null;
  feeApr: number | null;
  createdAt: string;
};

type GtPoolResp = {
  data: {
    id: string;
    attributes: Record<string, unknown> & {
      address: string;
      name: string;
      reserve_in_usd: string;
      base_token_price_usd: string;
      quote_token_price_usd: string;
      base_token_price_quote_token: string;
      volume_usd: Record<string, string>;
      price_change_percentage: Record<string, string>;
      transactions: Record<string, { buys: number; sells: number }>;
      pool_created_at: string;
    };
    relationships: Record<string, { data: { id: string } }>;
  }[];
  included?: { id: string; type: string; attributes: { name?: string; symbol?: string; address?: string } }[];
};

export type PoolSort = "h24_volume_usd_desc" | "h24_tx_count_desc";

export async function fetchTopPools(network: string, page = 1, sort: PoolSort = "h24_volume_usd_desc"): Promise<Pool[]> {
  if (!/^[a-z0-9_]+$/.test(network)) throw new Error("rede inválida");
  const r = await get<GtPoolResp>(
    `/networks/${network}/pools?page=${page}&include=dex,base_token,quote_token&sort=${sort}`,
  );
  return parsePools(r, network);
}

export async function searchPools(query: string, network?: string): Promise<Pool[]> {
  const q = encodeURIComponent(query.trim().slice(0, 80));
  const net = network && /^[a-z0-9_]+$/.test(network) ? `&network=${network}` : "";
  const r = await get<GtPoolResp>(`/search/pools?query=${q}${net}&include=dex,base_token,quote_token`);
  return parsePools(r, network);
}

export function parsePools(r: GtPoolResp, network?: string): Pool[] {
  const inc = new Map((r.included ?? []).map((i) => [i.id, i.attributes]));
  return r.data.map((d) => {
    const a = d.attributes;
    const baseId = d.relationships.base_token?.data.id ?? "";
    const quoteId = d.relationships.quote_token?.data.id ?? "";
    const dexId = d.relationships.dex?.data.id ?? "";
    const tvl = Number(a.reserve_in_usd) || 0;
    const volume24h = Number(a.volume_usd?.h24) || 0;
    const feeTier = parseFeeFromName(a.name);
    const t = a.transactions?.h24;
    return {
      id: d.id,
      network: network ?? d.id.split("_")[0],
      address: a.address,
      name: a.name,
      dex: inc.get(dexId)?.name ?? dexId,
      base: inc.get(baseId)?.symbol ?? a.name.split(" / ")[0],
      quote: inc.get(quoteId)?.symbol ?? (a.name.split(" / ")[1] ?? "").split(" ")[0],
      baseAddress: inc.get(baseId)?.address ?? baseId.split("_").pop() ?? "",
      quoteAddress: inc.get(quoteId)?.address ?? quoteId.split("_").pop() ?? "",
      baseUsd: Number(a.base_token_price_usd) || 0,
      quoteUsd: Number(a.quote_token_price_usd) || 0,
      priceBaseInQuote: Number(a.base_token_price_quote_token) || 0,
      tvl,
      volume24h,
      volume1h: Number(a.volume_usd?.h1) || 0,
      change24h: Number(a.price_change_percentage?.h24) || 0,
      txs24h: t ? t.buys + t.sells : 0,
      feeTier,
      feeApr: feeTier === null ? null : poolFeeApr(volume24h, feeTier, tvl),
      createdAt: a.pool_created_at,
    };
  });
}

/** Preços em USD de até 30 tokens de uma rede. */
export async function fetchTokenPrices(network: string, addresses: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const list = [...new Set(addresses.map((a) => a.toLowerCase()))].filter((a) => /^0x[0-9a-f]{40}$/.test(a));
  for (let i = 0; i < list.length; i += 30) {
    const chunk = list.slice(i, i + 30);
    const r = await get<{ data: { attributes: { token_prices: Record<string, string | null> } } }>(
      `/simple/networks/${network}/token_price/${chunk.join(",")}`,
    );
    for (const [k, v] of Object.entries(r.data.attributes.token_prices)) {
      if (v !== null) out.set(k.toLowerCase(), Number(v));
    }
  }
  return out;
}

export type Candle = { t: number; open: number; high: number; low: number; close: number; volumeUsd: number };

/** Candles diários: preço do token base cotado no token quote, volume em USD. */
export async function fetchDailyCandles(network: string, poolAddress: string, days: number): Promise<Candle[]> {
  if (!/^[a-zA-Z0-9]+$/.test(poolAddress)) throw new Error("endereço de pool inválido");
  const path = (cur: string) => `/networks/${network}/pools/${poolAddress}/ohlcv/day?limit=${Math.min(days, 1000)}&currency=${cur}`;
  type R = { data: { attributes: { ohlcv_list: number[][] } } };
  // Duas consultas: "token" dá o preço na moeda quote; "usd" dá o volume em dólares.
  const [tok, usd] = await Promise.all([get<R>(path("token")), get<R>(path("usd"))]);
  return mergeCandles(tok.data.attributes.ohlcv_list, usd.data.attributes.ohlcv_list);
}

export function mergeCandles(tokenList: number[][], usdList: number[][]): Candle[] {
  const volUsd = new Map(usdList.map((c) => [c[0], c[5]]));
  return tokenList
    .filter((c) => volUsd.has(c[0]))
    .map(([t, open, high, low, close]) => ({ t, open, high, low, close, volumeUsd: volUsd.get(t)! }))
    .sort((a, b) => a.t - b.t);
}
