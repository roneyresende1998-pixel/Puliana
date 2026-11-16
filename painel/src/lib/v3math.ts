// Matemática de liquidez concentrada (Uniswap v3). Tudo em ponto flutuante
// para exibição — precisão suficiente para análise, não para contratos.

/** Preço "humano" de token0 cotado em token1 para um tick. */
export function tickToPrice(tick: number, dec0: number, dec1: number): number {
  return Math.pow(1.0001, tick) * Math.pow(10, dec0 - dec1);
}

export function sqrtPriceX96ToPrice(sqrtPriceX96: bigint, dec0: number, dec1: number): number {
  const s = Number(sqrtPriceX96) / 2 ** 96;
  return s * s * Math.pow(10, dec0 - dec1);
}

/** Quantidades brutas (menor unidade) de token0/token1 para uma liquidez L. */
export function amountsForLiquidity(
  liquidity: number,
  sqrtP: number,
  tickLower: number,
  tickUpper: number,
): { amount0: number; amount1: number } {
  const sa = Math.sqrt(Math.pow(1.0001, tickLower));
  const sb = Math.sqrt(Math.pow(1.0001, tickUpper));
  if (sqrtP <= sa) return { amount0: liquidity * (1 / sa - 1 / sb), amount1: 0 };
  if (sqrtP >= sb) return { amount0: 0, amount1: liquidity * (sb - sa) };
  return { amount0: liquidity * (1 / sqrtP - 1 / sb), amount1: liquidity * (sqrtP - sa) };
}

// ---------- Funções do simulador (preço P = token Y por token X) ----------

/** Liquidez obtida depositando `valor` (em unidades de Y) na faixa [pa, pb] com preço p. */
export function liquidityForValue(valor: number, p: number, pa: number, pb: number): number {
  const sp = Math.sqrt(p), sa = Math.sqrt(pa), sb = Math.sqrt(pb);
  if (p <= pa) return valor / (p * (1 / sa - 1 / sb)); // 100% em X
  if (p >= pb) return valor / (sb - sa); // 100% em Y
  return valor / (p * (1 / sp - 1 / sb) + (sp - sa));
}

export function amountsAt(L: number, p: number, pa: number, pb: number): { x: number; y: number } {
  const sp = Math.sqrt(Math.min(Math.max(p, pa), pb));
  const sa = Math.sqrt(pa), sb = Math.sqrt(pb);
  return { x: L * (1 / sp - 1 / sb), y: L * (sp - sa) };
}

export function valueAt(L: number, p: number, pa: number, pb: number): number {
  const { x, y } = amountsAt(L, p, pa, pb);
  return x * p + y;
}

/**
 * Eficiência de capital: quantas vezes mais liquidez (e portanto taxas, enquanto
 * dentro da faixa) a posição concentrada gera em relação a uma posição full-range
 * (v2) com o mesmo capital.
 */
export function capitalEfficiency(p: number, pa: number, pb: number): number {
  const lv2 = 1 / (2 * Math.sqrt(p)); // L de v2 por unidade de valor
  return liquidityForValue(1, p, pa, pb) / lv2;
}

/** Perda impermanente da posição v3 vs. segurar os tokens (negativo = perda). */
export function impermanentLoss(p0: number, p1: number, pa: number, pb: number): number {
  const L = liquidityForValue(1, p0, pa, pb);
  const { x, y } = amountsAt(L, p0, pa, pb);
  const hodl = x * p1 + y;
  return valueAt(L, p1, pa, pb) / hodl - 1;
}

/** IL clássica de full-range (v2), para comparação. */
export function impermanentLossV2(p0: number, p1: number): number {
  const r = p1 / p0;
  return (2 * Math.sqrt(r)) / (1 + r) - 1;
}

/** APR de taxas estimado da pool inteira: volume diário × taxa / TVL × 365. */
export function poolFeeApr(volume24h: number, feeTier: number, tvl: number): number {
  if (!(tvl > 0) || !(feeTier >= 0)) return 0;
  return ((volume24h * feeTier) / tvl) * 365;
}

/** Extrai a taxa de nomes como "USDC / WETH 0.05%" → 0.0005. */
export function parseFeeFromName(name: string): number | null {
  const m = name.match(/(\d+(?:\.\d+)?)%\s*$/);
  return m ? Number(m[1]) / 100 : null;
}
