// Meteora DLMM: posições não são NFTs — são contas do programa com o campo
// "owner" = carteira. Quantidades e taxas vêm dos bins (BinArray).
// Layouts conferidos contra contas reais (pool SOL/USDC).

import type { LpPosition } from "../positions.ts";
import { b58decode, findPda, getAccounts, i32, i64LE, pubkey, solRpc, u128, u16, u64, u8, utf8 } from "./core.ts";
import { solTokenInfo } from "./tokens.ts";

export const METEORA_DLMM = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
const POSITION_V2_SIZE = 8120;
const BINS_PER_ARRAY = 70;
const BIN_ARRAY_LEN = 10136;
const BIN_LEN = 144;
const EXT_BIN_LEN = 112; // liquidity_share(16) + reward_info(48) + fee_info(48)

/** Offsets da cota e do fee_info do i-ésimo bin da posição (base ou estendido). */
function binSlots(i: number) {
  if (i < BINS_PER_ARRAY) return { share: 72 + i * 16, fee: 4552 + i * 48 };
  const o = POSITION_V2_SIZE + (i - BINS_PER_ARRAY) * EXT_BIN_LEN;
  return { share: o, fee: o + 64 };
}

const arrIdx = (bin: number) => Math.floor(bin / BINS_PER_ARRAY);

export async function loadMeteoraPositions(owner: string): Promise<{ positions: LpPosition[]; unsupported: number }> {
  type R = { pubkey: string }[];
  const found = await solRpc<R>("getProgramAccounts", [
    METEORA_DLMM,
    { encoding: "base64", dataSlice: { offset: 0, length: 0 }, filters: [{ memcmp: { offset: 40, bytes: owner } }] },
  ]);
  if (found.length === 0) return { positions: [], unsupported: 0 };
  const addrs = found.map((f) => f.pubkey);
  const accs = await getAccounts(addrs);
  let unsupported = 0;
  const pos = accs.flatMap((a, i) => {
    if (!a || a.owner !== METEORA_DLMM) return [];
    const d = a.data;
    const lo = i32(d, 7912), hi = i32(d, 7916);
    // Posições estendidas: 8120 bytes + 112 bytes por bin além dos 70 primeiros.
    const extra = (d.length - POSITION_V2_SIZE) / EXT_BIN_LEN;
    if (d.length < POSITION_V2_SIZE || !Number.isInteger(extra) || hi - lo + 1 > BINS_PER_ARRAY + extra) { unsupported++; return []; }
    return [{ addr: addrs[i], pair: pubkey(d, 8), lo, hi, d }];
  });

  const pairAddrs = [...new Set(pos.map((p) => p.pair))];
  const pairAccs = await getAccounts(pairAddrs);
  const pairs = new Map<string, { active: number; binStep: number; fee: number; mintX: string; mintY: string }>();
  pairAccs.forEach((a, i) => {
    if (!a) return;
    const d = a.data;
    const binStep = u16(d, 80);
    pairs.set(pairAddrs[i], {
      active: i32(d, 76), binStep,
      fee: (u16(d, 8) * binStep * 10 * 10 ** u8(d, 34)) / 1e9, // taxa base (sem a parte variável)
      mintX: pubkey(d, 88), mintY: pubkey(d, 120),
    });
  });

  const keys: string[] = [];
  for (const p of pos) for (let k = arrIdx(p.lo); k <= arrIdx(p.hi); k++) if (!keys.includes(`${p.pair}:${k}`)) keys.push(`${p.pair}:${k}`);
  const binAddrs = await Promise.all(keys.map((k) => { const [pair, idx] = k.split(":"); return findPda([utf8("bin_array"), b58decode(pair), i64LE(Number(idx))], METEORA_DLMM); }));
  const binAccs = binAddrs.length ? await getAccounts(binAddrs) : [];
  const arrays = new Map(keys.map((k, i) => [k, binAccs[i]?.data.length === BIN_ARRAY_LEN ? binAccs[i]!.data : null]));

  const tokens = await solTokenInfo([...pairs.values()].flatMap((p) => [p.mintX, p.mintY]));
  const out: LpPosition[] = [];
  for (const p of pos) {
    const pr = pairs.get(p.pair);
    if (!pr) continue;
    const tx = tokens.get(pr.mintX)!, ty = tokens.get(pr.mintY)!;
    let ax = 0, ay = 0, fx = 0n, fy = 0n, hasLiq = false, ok = true;
    for (let b = p.lo; b <= p.hi; b++) {
      const slot = binSlots(b - p.lo);
      const share = u128(p.d, slot.share);
      const fo = slot.fee;
      fx += u64(p.d, fo + 32);
      fy += u64(p.d, fo + 40);
      if (share === 0n) continue;
      hasLiq = true;
      const arr = arrays.get(`${p.pair}:${arrIdx(b)}`);
      if (!arr) { ok = false; continue; }
      const o = 56 + (b - arrIdx(b) * BINS_PER_ARRAY) * BIN_LEN;
      const supply = u128(arr, o + 32);
      if (supply > 0n) {
        ax += (Number(u64(arr, o)) * Number(share)) / Number(supply);
        ay += (Number(u64(arr, o + 8)) * Number(share)) / Number(supply);
      }
      // cotas da posição são escaladas por 2^64; acumulador de taxa também (Q64)
      const s = share >> 64n;
      const dX = u128(arr, o + 80) - u128(p.d, fo), dY = u128(arr, o + 96) - u128(p.d, fo + 16);
      if (dX > 0n) fx += (s * dX) >> 64n;
      if (dY > 0n) fy += (s * dY) >> 64n;
    }
    const price = (bin: number) => Math.pow(1 + pr.binStep / 10_000, bin) * 10 ** (tx.decimals - ty.decimals);
    out.push({
      key: `meteora:${p.addr}`, id: p.addr, chainKey: "solana", chainName: "Solana", protocol: "Meteora DLMM",
      token0: tx, token1: ty, fee: pr.fee,
      priceLower: price(p.lo), priceUpper: price(p.hi + 1), priceCurrent: price(pr.active),
      inRange: hasLiq && pr.active >= p.lo && pr.active <= p.hi, closed: !hasLiq,
      amount0: ax / 10 ** tx.decimals, amount1: ay / 10 ** ty.decimals,
      fees0: Number(fx) / 10 ** tx.decimals, fees1: Number(fy) / 10 ** ty.decimals, feesApprox: !ok,
      manageUrl: `https://app.meteora.ag/dlmm/${p.pair}`, explorerUrl: `https://solscan.io/account/${p.addr}`, gecko: "solana",
    });
  }
  return { positions: out, unsupported };
}
