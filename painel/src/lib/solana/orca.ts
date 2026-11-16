// Orca Whirlpools: posições são NFTs. Para cada NFT da carteira derivamos a
// conta da posição (PDA ["position", mint]) e lemos tudo direto da blockchain.

import { amountsFromSqrt, pendingFees, tickPrice } from "../clmm.ts";
import type { LpPosition } from "../positions.ts";
import { b58decode, findPda, getAccounts, i32, i32LE, pubkey, u128, u16, u64, u8, utf8 } from "./core.ts";
import { solTokenInfo } from "./tokens.ts";

export const ORCA_PROGRAM = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
const POSITION_SIZE = 216;
const TICK_ARRAY_SIZE = 88;
const FIXED_TICK_ARRAY_LEN = 9988;
const TICK_LEN = 113;

type Pos = { addr: string; mint: string; whirlpool: string; liquidity: bigint; tl: number; tu: number; fgA: bigint; owedA: bigint; fgB: bigint; owedB: bigint };

export async function loadOrcaPositions(mints: string[]): Promise<LpPosition[]> {
  if (mints.length === 0) return [];
  const pdas = await Promise.all(mints.map((m) => findPda([utf8("position"), b58decode(m)], ORCA_PROGRAM)));
  const accs = await getAccounts(pdas);
  const pos: Pos[] = [];
  accs.forEach((a, i) => {
    if (!a || a.owner !== ORCA_PROGRAM || a.data.length !== POSITION_SIZE) return;
    const d = a.data;
    pos.push({
      addr: pdas[i], mint: mints[i], whirlpool: pubkey(d, 8), liquidity: u128(d, 72), tl: i32(d, 88), tu: i32(d, 92),
      fgA: u128(d, 96), owedA: u64(d, 112), fgB: u128(d, 120), owedB: u64(d, 136),
    });
  });
  if (pos.length === 0) return [];

  const poolAddrs = [...new Set(pos.map((p) => p.whirlpool))];
  const poolAccs = await getAccounts(poolAddrs);
  const pools = new Map<string, { tickSpacing: number; feeRate: number; sqrt: bigint; tick: number; mintA: string; mintB: string; fgA: bigint; fgB: bigint }>();
  poolAccs.forEach((a, i) => {
    if (!a) return;
    const d = a.data;
    pools.set(poolAddrs[i], {
      tickSpacing: u16(d, 41), feeRate: u16(d, 45), sqrt: u128(d, 65), tick: i32(d, 81),
      mintA: pubkey(d, 101), fgA: u128(d, 165), mintB: pubkey(d, 181), fgB: u128(d, 245),
    });
  });

  // Tick arrays (para calcular as taxas pendentes com precisão)
  const span = (ts: number) => TICK_ARRAY_SIZE * ts;
  const startOf = (tick: number, ts: number) => Math.floor(tick / span(ts)) * span(ts);
  const taKeys: string[] = [];
  const taSeeds: Promise<string>[] = [];
  for (const p of pos) {
    const pl = pools.get(p.whirlpool);
    if (!pl || p.liquidity === 0n) continue;
    for (const t of [p.tl, p.tu]) {
      const k = `${p.whirlpool}:${startOf(t, pl.tickSpacing)}`;
      if (taKeys.includes(k)) continue;
      taKeys.push(k);
      taSeeds.push(findPda([utf8("tick_array"), b58decode(p.whirlpool), utf8(String(startOf(t, pl.tickSpacing)))], ORCA_PROGRAM));
    }
  }
  const taAddrs = await Promise.all(taSeeds);
  const taAccs = taAddrs.length ? await getAccounts(taAddrs) : [];
  const tickArrays = new Map<string, Uint8Array | null>();
  taKeys.forEach((k, i) => tickArrays.set(k, taAccs[i]?.data ?? null));

  const tokens = await solTokenInfo([...pools.values()].flatMap((p) => [p.mintA, p.mintB]));

  const out: LpPosition[] = [];
  for (const p of pos) {
    const pl = pools.get(p.whirlpool);
    if (!pl) continue;
    const t0 = tokens.get(pl.mintA)!, t1 = tokens.get(pl.mintB)!;
    const sqrtP = Number(pl.sqrt) / 2 ** 64;
    const { a0, a1 } = amountsFromSqrt(Number(p.liquidity), sqrtP, p.tl, p.tu);

    let feesA = p.owedA, feesB = p.owedB, approx = true;
    if (p.liquidity > 0n) {
      const lo = tickOutside(tickArrays.get(`${p.whirlpool}:${startOf(p.tl, pl.tickSpacing)}`), p.tl, startOf(p.tl, pl.tickSpacing), pl.tickSpacing);
      const hi = tickOutside(tickArrays.get(`${p.whirlpool}:${startOf(p.tu, pl.tickSpacing)}`), p.tu, startOf(p.tu, pl.tickSpacing), pl.tickSpacing);
      if (lo && hi) {
        const base = { liquidity: p.liquidity, tickCurrent: pl.tick, tickLower: p.tl, tickUpper: p.tu, bits: 64 as const };
        feesA = pendingFees({ ...base, global: pl.fgA, outsideLower: lo.a, outsideUpper: hi.a, checkpoint: p.fgA, owed: p.owedA });
        feesB = pendingFees({ ...base, global: pl.fgB, outsideLower: lo.b, outsideUpper: hi.b, checkpoint: p.fgB, owed: p.owedB });
        approx = false;
      }
    } else approx = false;

    out.push({
      key: `orca:${p.addr}`,
      id: p.mint,
      chainKey: "solana",
      chainName: "Solana",
      protocol: "Orca",
      token0: t0,
      token1: t1,
      fee: pl.feeRate / 1_000_000,
      priceLower: tickPrice(p.tl, t0.decimals, t1.decimals),
      priceUpper: tickPrice(p.tu, t0.decimals, t1.decimals),
      priceCurrent: sqrtP * sqrtP * 10 ** (t0.decimals - t1.decimals),
      inRange: p.liquidity > 0n && pl.tick >= p.tl && pl.tick < p.tu,
      closed: p.liquidity === 0n,
      amount0: a0 / 10 ** t0.decimals,
      amount1: a1 / 10 ** t1.decimals,
      fees0: Number(feesA) / 10 ** t0.decimals,
      fees1: Number(feesB) / 10 ** t1.decimals,
      feesApprox: approx,
      manageUrl: `https://www.orca.so/portfolio`,
      explorerUrl: `https://solscan.io/account/${p.addr}`,
      gecko: "solana",
    });
  }
  return out;
}

/** fee_growth_outside de um tick num TickArray de tamanho fixo; null se o formato for outro. */
function tickOutside(d: Uint8Array | null | undefined, tick: number, start: number, ts: number) {
  if (!d || d.length !== FIXED_TICK_ARRAY_LEN || i32(d, 8) !== start) return null;
  const idx = Math.floor((tick - start) / ts);
  if (idx < 0 || idx >= TICK_ARRAY_SIZE) return null;
  const o = 12 + idx * TICK_LEN;
  if (u8(d, o) !== 1) return null; // tick não inicializado: dado inconsistente
  return { a: u128(d, o + 33), b: u128(d, o + 49) };
}

export const _test = { tickOutside, i32LE };
