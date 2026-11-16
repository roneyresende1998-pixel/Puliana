// Todas as pools de rendimento do DefiLlama (~15 mil, todas as redes e
// protocolos — inclusive Orca, Raydium, Meteora, Uniswap, Aerodrome…).

export type YieldPool = {
  id: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  apyMean30d: number | null;
  apyBase7d: number | null;
  volumeUsd1d: number | null;
  stablecoin: boolean;
  ilRisk: string;
  exposure: string;
  poolMeta: string | null;
  outlier: boolean;
};

let cache: Promise<YieldPool[]> | null = null;

export function fetchYields(): Promise<YieldPool[]> {
  if (!cache) {
    cache = fetch("https://yields.llama.fi/pools", { credentials: "omit", referrerPolicy: "no-referrer" })
      .then((r) => { if (!r.ok) throw new Error(`DefiLlama respondeu ${r.status}`); return r.json(); })
      .then((j: { data: (YieldPool & { pool: string })[] }) => j.data.map((p) => ({
        id: p.pool, chain: p.chain, project: p.project, symbol: p.symbol, tvlUsd: p.tvlUsd ?? 0,
        apy: p.apy, apyBase: p.apyBase, apyReward: p.apyReward, apyMean30d: p.apyMean30d, apyBase7d: p.apyBase7d,
        volumeUsd1d: p.volumeUsd1d, stablecoin: !!p.stablecoin, ilRisk: p.ilRisk, exposure: p.exposure,
        poolMeta: p.poolMeta, outlier: !!p.outlier,
      })))
      .catch((e) => { cache = null; throw e; });
  }
  return cache;
}
