// Panorama de um token: GeckoTerminal (preço on-chain, holders, segurança,
// pools) + CoinGecko (mercado, máxima histórica, oferta, categorias) +
// DefiLlama (gráfico de preço). Tudo leitura pública, sem chave.

import { parsePools, type Pool } from "./gecko.ts";

export type TokenRef = { network: string; address: string; symbol?: string };

export type TokenOverview = {
  network: string;
  address: string;
  nome: string;
  simbolo: string;
  imagem: string | null;
  precoUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  volume24h: number | null;
  rank: number | null;
  variacao: { h24: number | null; d7: number | null; d30: number | null; a1: number | null };
  ath: number | null;
  athDistancia: number | null;
  athData: string | null;
  atl: number | null;
  circulante: number | null;
  total: number | null;
  maximo: number | null;
  categorias: string[];
  descricao: string;
  links: { nome: string; url: string }[];
  holders: number | null;
  top10: number | null;
  gtScore: number | null;
  verificado: boolean;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  honeypot: string | null;
  devPct: number | null;
  coingeckoId: string | null;
  pools: Pool[];
};

const GT = "https://api.geckoterminal.com/api/v2";
const opts: RequestInit = { credentials: "omit", referrerPolicy: "no-referrer", headers: { accept: "application/json" } };
const cache = new Map<string, Promise<TokenOverview>>();

const CG_PLATFORM: Record<string, string> = {
  solana: "solana", eth: "ethereum", base: "base", arbitrum: "arbitrum-one", optimism: "optimistic-ethereum",
  polygon_pos: "polygon-pos", bsc: "binance-smart-chain", avax: "avalanche", unichain: "unichain", linea: "linea", sonic: "sonic",
};

// IDs "embrulhados" → moeda principal (mais dados de mercado)
const CG_NATIVO: Record<string, string> = {
  "wrapped-solana": "solana", weth: "ethereum", "wrapped-bitcoin": "bitcoin", wbnb: "binancecoin",
  "wrapped-avax": "avalanche-2", wmatic: "matic-network", "wrapped-pol": "polygon-ecosystem-token",
};

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const safeUrl = (u: unknown) => (typeof u === "string" && /^https:\/\/[^\s"'<>]+$/i.test(u) ? u : null);

async function getJson<T>(url: string, tentativas = 2): Promise<T | null> {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.status === 429 && i + 1 < tentativas) { await new Promise((ok) => setTimeout(ok, 2500)); continue; }
      if (!r.ok) return null;
      return (await r.json()) as T;
    } catch { return null; }
  }
  return null;
}

export function loadToken(ref: TokenRef): Promise<TokenOverview> {
  const key = `${ref.network}:${ref.address.toLowerCase()}`;
  let p = cache.get(key);
  if (!p) {
    p = fetchToken(ref);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

async function fetchToken({ network, address }: TokenRef): Promise<TokenOverview> {
  if (!/^[a-z0-9_-]+$/.test(network) || !/^[a-zA-Z0-9]+$/.test(address)) throw new Error("token inválido");
  type GtTok = { data: { attributes: Record<string, unknown> & { volume_usd?: { h24?: string } } } };
  type GtInfo = { data: { attributes: Record<string, unknown> & { holders?: { count?: number; distribution_percentage?: { top_10?: string } }; websites?: string[] } } };
  const [tok, info, pools] = await Promise.all([
    getJson<GtTok>(`${GT}/networks/${network}/tokens/${address}`),
    getJson<GtInfo>(`${GT}/networks/${network}/tokens/${address}/info`),
    getJson<Parameters<typeof parsePools>[0]>(`${GT}/networks/${network}/tokens/${address}/pools?include=dex,base_token,quote_token&page=1`),
  ]);
  const t: Record<string, unknown> & { volume_usd?: { h24?: string } } = tok?.data.attributes ?? {};
  const i = info?.data.attributes ?? {};

  // Sem GeckoTerminal (limite/sem cadastro)? Acha o token pelo contrato na CoinGecko.
  let cgId = (t.coingecko_coin_id as string | null) ?? null;
  if (!tok && CG_PLATFORM[network]) {
    const c = await getJson<{ id: string }>(`https://api.coingecko.com/api/v3/coins/${CG_PLATFORM[network]}/contract/${address}`);
    cgId = c?.id ?? null;
  }
  if (!tok && !cgId) throw new Error("Não achei dados deste token agora (limite de consultas atingido ou token sem cadastro). Tente em 1 minuto.");
  if (cgId && CG_NATIVO[cgId]) cgId = CG_NATIVO[cgId];
  type Cg = {
    name?: string; symbol?: string; market_cap_rank: number | null; categories: (string | null)[]; description: Record<string, string>;
    links: { homepage: string[]; twitter_screen_name?: string; telegram_channel_identifier?: string; subreddit_url?: string; repos_url?: { github?: string[] } };
    image?: { large?: string };
    market_data: Record<string, unknown> & {
      current_price: { usd: number }; market_cap: { usd: number }; fully_diluted_valuation: { usd: number }; total_volume: { usd: number };
      ath: { usd: number }; ath_change_percentage: { usd: number }; ath_date: { usd: string }; atl: { usd: number };
    };
  };
  const cg = cgId && /^[a-z0-9-]+$/.test(cgId)
    ? await getJson<Cg>(`https://api.coingecko.com/api/v3/coins/${cgId}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`)
    : null;
  const m = cg?.market_data;
  const pct = (k: string) => num((m?.[k] as number | undefined) ?? null);

  const links: { nome: string; url: string }[] = [];
  const add = (nome: string, u: unknown) => { const s = safeUrl(u); if (s && !links.some((l) => l.url === s)) links.push({ nome, url: s }); };
  for (const w of (i.websites as string[] | undefined) ?? cg?.links.homepage ?? []) add("Site", w);
  const tw = (i.twitter_handle as string | null) ?? cg?.links.twitter_screen_name;
  if (tw && /^[A-Za-z0-9_]{1,30}$/.test(tw)) add("X / Twitter", `https://x.com/${tw}`);
  const tg = (i.telegram_handle as string | null) ?? cg?.links.telegram_channel_identifier;
  if (tg && /^[A-Za-z0-9_]{3,40}$/.test(tg)) add("Telegram", `https://t.me/${tg}`);
  add("Discord", i.discord_url);
  add("GitHub", cg?.links.repos_url?.github?.[0]);
  if (cgId) add("CoinGecko", `https://www.coingecko.com/pt/moedas/${cgId}`);
  add("GeckoTerminal", `https://www.geckoterminal.com/${network}/tokens/${address}`);

  const desc = (cg?.description?.pt || cg?.description?.en || (i.description as string) || "")
    .replace(/<[^>]*>/g, "").replace(/\s+\n/g, "\n").trim();

  return {
    network, address,
    nome: String(t.name ?? cg?.name ?? "?"), simbolo: String(t.symbol ?? cg?.symbol?.toUpperCase() ?? "?"),
    imagem: safeUrl(cg?.image?.large) ?? safeUrl(t.image_url),
    precoUsd: num(m?.current_price?.usd) ?? num(t.price_usd),
    marketCap: num(m?.market_cap?.usd) || num(t.market_cap_usd),
    fdv: num(m?.fully_diluted_valuation?.usd) || num(t.fdv_usd),
    volume24h: num(m?.total_volume?.usd) ?? num(t.volume_usd?.h24),
    rank: cg?.market_cap_rank ?? null,
    variacao: {
      h24: pct("price_change_percentage_24h"), d7: pct("price_change_percentage_7d"),
      d30: pct("price_change_percentage_30d"), a1: pct("price_change_percentage_1y"),
    },
    ath: num(m?.ath?.usd), athDistancia: num(m?.ath_change_percentage?.usd), athData: m?.ath_date?.usd ?? null, atl: num(m?.atl?.usd),
    circulante: num(m?.circulating_supply), total: num(m?.total_supply) ?? num(t.normalized_total_supply), maximo: num(m?.max_supply),
    categorias: (cg?.categories ?? []).filter((c): c is string => !!c).slice(0, 8),
    descricao: desc.length > 1500 ? desc.slice(0, 1500) + "…" : desc,
    links,
    holders: num(i.holders?.count), top10: num(i.holders?.distribution_percentage?.top_10),
    gtScore: num(i.gt_score), verificado: i.gt_verified === true,
    mintAuthority: (i.mint_authority as string | null) ?? null, freezeAuthority: (i.freeze_authority as string | null) ?? null,
    honeypot: (i.is_honeypot as string | null) ?? null, devPct: num(i.developer_holding_percentage),
    coingeckoId: cgId,
    pools: pools ? parsePools(pools, network).slice(0, 10) : [],
  };
}

const LLAMA: Record<string, string> = { eth: "ethereum", polygon_pos: "polygon", avax: "avax" };

/** Série de preço (USD) para o gráfico. */
export async function tokenChart(network: string, address: string, dias: number): Promise<{ t: number; p: number }[]> {
  const coin = `${LLAMA[network] ?? network}:${address}`;
  const period = dias <= 7 ? "1h" : dias <= 90 ? "4h" : "1d";
  const passo = period === "1h" ? 3600 : period === "4h" ? 14400 : 86400;
  const span = Math.min(480, Math.ceil((dias * 86400) / passo));
  const start = Math.floor(Date.now() / 1000) - span * passo;
  const j = await getJson<{ coins: Record<string, { prices: { timestamp: number; price: number }[] }> }>(
    `https://coins.llama.fi/chart/${encodeURIComponent(coin)}?start=${start}&span=${span}&period=${period}`);
  return (Object.values(j?.coins ?? {})[0]?.prices ?? []).map((x) => ({ t: x.timestamp, p: x.price }));
}
