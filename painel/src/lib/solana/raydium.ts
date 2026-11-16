// Raydium CLMM: posições são NFTs; conta pessoal = PDA ["position", mint].
// Layouts conferidos contra contas reais e a API oficial da Raydium.

import { amountsFromSqrt, pendingFees, tickPrice } from "../clmm.ts";
import type { LpPosition } from "../positions.ts";
import { b58decode, findPda, getAccounts, i32, i32BE, pubkey, u128, u16, u32, u64, u8, utf8 } from "./core.ts";
import { solTokenInfo } from "./tokens.ts";

export const RAYDIUM_CLMM = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK";
const POSITION_SIZE = 281;
const TICKS_PER_ARRAY = 60;
const TICK_ARRAY_LEN = 10240;
const TICK_LEN = 168;

export async function loadRaydiumPositions(mints: string[]): Promise<LpPosition[]> {
  if (mints.length === 0) return [];
  const pdas = await Promise.all(mints.map((m) => findPda([utf8("position"), b58decode(m)], RAYDIUM_CLMM)));
  const accs = await getAccounts(pdas);
  const pos = accs.flatMap((a, i) => {
    if (!a || a.owner !== RAYDIUM_CLMM || a.data.length !== POSITION_SIZE) return [];
    const d = a.data;
    return [{
      addr: pdas[i], mint: mints[i], pool: pubkey(d, 41), tl: i32(d, 73), tu: i32(d, 77), liquidity: u128(d, 81),
      fg0: u128(d, 97), fg1: u128(d, 113), owed0: u64(d, 129), owed1: u64(d, 137),
    }];
  });
  if (pos.length === 0) return [];

  const poolAddrs = [...new Set(pos.map((p) => p.pool))];
  const poolAccs = await getAccounts(poolAddrs);
  const pools = new Map<string, { cfg: string; mint0: string; mint1: string; dec0: number; dec1: number; ts: number; sqrt: bigint; tick: number; fg0: bigint; fg1: bigint }>();
  poolAccs.forEach((a, i) => {
    if (!a) return;
    const d = a.data;
    pools.set(poolAddrs[i], {
      cfg: pubkey(d, 9), mint0: pubkey(d, 73), mint1: pubkey(d, 105), dec0: u8(d, 233), dec1: u8(d, 234), ts: u16(d, 235),
      sqrt: u128(d, 253), tick: i32(d, 269), fg0: u128(d, 277), fg1: u128(d, 293),
    });
  });
  const cfgAddrs = [...new Set([...pools.values()].map((p) => p.cfg))];
  const cfgAccs = await getAccounts(cfgAddrs);
  const feeRate = new Map(cfgAddrs.map((c, i) => [c, cfgAccs[i] ? u32(cfgAccs[i]!.data, 47) / 1_000_000 : null]));

  const startOf = (t: number, ts: number) => Math.floor(t / (TICKS_PER_ARRAY * ts)) * TICKS_PER_ARRAY * ts;
  const keys: string[] = [];
  const seeds: Promise<string>[] = [];
  for (const p of pos) {
    const pl = pools.get(p.pool);
    if (!pl || p.liquidity === 0n) continue;
    for (const t of [p.tl, p.tu]) {
      const k = `${p.pool}:${startOf(t, pl.ts)}`;
      if (keys.includes(k)) continue;
      keys.push(k);
      seeds.push(findPda([utf8("tick_array"), b58decode(p.pool), i32BE(startOf(t, pl.ts))], RAYDIUM_CLMM));
    }
  }
  const taAddrs = await Promise.all(seeds);
  const taAccs = taAddrs.length ? await getAccounts(taAddrs) : [];
  const arrays = new Map(keys.map((k, i) => [k, taAccs[i]?.data ?? null]));

  const tokens = await solTokenInfo([...pools.values()].flatMap((p) => [p.mint0, p.mint1]));
  const out: LpPosition[] = [];
  for (const p of pos) {
    const pl = pools.get(p.pool);
    if (!pl) continue;
    const t0 = { ...tokens.get(pl.mint0)!, decimals: pl.dec0 };
    const t1 = { ...tokens.get(pl.mint1)!, decimals: pl.dec1 };
    const sqrtP = Number(pl.sqrt) / 2 ** 64;
    const { a0, a1 } = amountsFromSqrt(Number(p.liquidity), sqrtP, p.tl, p.tu);

    let f0 = p.owed0, f1 = p.owed1, approx = p.liquidity > 0n;
    if (p.liquidity > 0n) {
      const lo = outside(arrays.get(`${p.pool}:${startOf(p.tl, pl.ts)}`), p.tl, startOf(p.tl, pl.ts), pl.ts);
      const hi = outside(arrays.get(`${p.pool}:${startOf(p.tu, pl.ts)}`), p.tu, startOf(p.tu, pl.ts), pl.ts);
      if (lo && hi) {
        const base = { liquidity: p.liquidity, tickCurrent: pl.tick, tickLower: p.tl, tickUpper: p.tu, bits: 64 as const };
        f0 = pendingFees({ ...base, global: pl.fg0, outsideLower: lo.a, outsideUpper: hi.a, checkpoint: p.fg0, owed: p.owed0 });
        f1 = pendingFees({ ...base, global: pl.fg1, outsideLower: lo.b, outsideUpper: hi.b, checkpoint: p.fg1, owed: p.owed1 });
        approx = false;
      }
    }
    out.push({
      key: `raydium:${p.addr}`, id: p.mint, chainKey: "solana", chainName: "Solana", protocol: "Raydium",
      token0: t0, token1: t1, fee: feeRate.get(pl.cfg) ?? null,
      priceLower: tickPrice(p.tl, pl.dec0, pl.dec1), priceUpper: tickPrice(p.tu, pl.dec0, pl.dec1),
      priceCurrent: sqrtP * sqrtP * 10 ** (pl.dec0 - pl.dec1),
      inRange: p.liquidity > 0n && pl.tick >= p.tl && pl.tick < p.tu, closed: p.liquidity === 0n,
      amount0: a0 / 10 ** pl.dec0, amount1: a1 / 10 ** pl.dec1,
      fees0: Number(f0) / 10 ** pl.dec0, fees1: Number(f1) / 10 ** pl.dec1, feesApprox: approx,
      manageUrl: "https://raydium.io/portfolio/", explorerUrl: `https://solscan.io/account/${p.addr}`, gecko: "solana",
    });
  }
  return out;
}

function outside(d: Uint8Array | null | undefined, tick: number, start: number, ts: number) {
  if (!d || d.length !== TICK_ARRAY_LEN || i32(d, 40) !== start) return null;
  const idx = Math.floor((tick - start) / ts);
  if (idx < 0 || idx >= TICKS_PER_ARRAY) return null;
  const o = 44 + idx * TICK_LEN;
  if (i32(d, o) !== tick) return null;
  return { a: u128(d, o + 36), b: u128(d, o + 52) };
}
