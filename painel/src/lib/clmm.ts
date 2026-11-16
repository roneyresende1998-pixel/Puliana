// Matemática compartilhada de liquidez concentrada (Uniswap v3, forks EVM,
// Orca Whirlpools e Raydium CLMM usam a mesma base de ticks 1.0001^tick).

/** Taxas pendentes a partir dos acumuladores "fee growth" (Q64 ou Q128). */
export function pendingFees(p: {
  liquidity: bigint;
  tickCurrent: number;
  tickLower: number;
  tickUpper: number;
  global: bigint;
  outsideLower: bigint;
  outsideUpper: bigint;
  checkpoint: bigint;
  owed: bigint;
  bits: 64 | 128;
}): bigint {
  const M = (1n << BigInt(p.bits === 64 ? 128 : 256)) - 1n; // Solana usa u128 (wrap em 2^128); EVM uint256
  const sub = (a: bigint, b: bigint) => (a - b) & M;
  const below = p.tickCurrent >= p.tickLower ? p.outsideLower : sub(p.global, p.outsideLower);
  const above = p.tickCurrent < p.tickUpper ? p.outsideUpper : sub(p.global, p.outsideUpper);
  const inside = sub(sub(p.global, below), above);
  return p.owed + ((p.liquidity * sub(inside, p.checkpoint)) >> BigInt(p.bits));
}

export function amountsFromSqrt(liquidity: number, sqrtP: number, tickLower: number, tickUpper: number) {
  const sa = Math.sqrt(Math.pow(1.0001, tickLower));
  const sb = Math.sqrt(Math.pow(1.0001, tickUpper));
  if (sqrtP <= sa) return { a0: liquidity * (1 / sa - 1 / sb), a1: 0 };
  if (sqrtP >= sb) return { a0: 0, a1: liquidity * (sb - sa) };
  return { a0: liquidity * (1 / sqrtP - 1 / sb), a1: liquidity * (sqrtP - sa) };
}

export const tickPrice = (tick: number, dec0: number, dec1: number) => Math.pow(1.0001, tick) * Math.pow(10, dec0 - dec1);
