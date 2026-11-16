// Leitura de posições Uniswap v3 direto da blockchain (somente eth_call).
// Funciona com qualquer endereço — não precisa conectar carteira.

import {
  SEL, MAX_UINT128, calldata, decodeAddress, decodeInt, decodeStringOrBytes32,
  decodeUint, encodeAddress, encodeUint, normalizeAddress, words,
} from "./abi.ts";
import type { EvmChain } from "./chains.ts";
import { ethCall } from "./rpc.ts";
import { amountsForLiquidity, tickToPrice } from "./v3math.ts";

export type Token = { address: string; symbol: string; decimals: number };

export type Position = {
  tokenId: bigint;
  token0: Token;
  token1: Token;
  fee: number; // ex.: 0.0005
  tickLower: number;
  tickUpper: number;
  tickCurrent: number;
  liquidity: bigint;
  inRange: boolean;
  /** preços em token1 por token0 */
  priceLower: number;
  priceUpper: number;
  priceCurrent: number;
  amount0: number;
  amount1: number;
  fees0: number;
  fees1: number;
  pool: string;
};

const tokenCache = new Map<string, Promise<Token>>();

function loadToken(chain: EvmChain, address: string): Promise<Token> {
  const k = `${chain.key}:${address}`;
  let p = tokenCache.get(k);
  if (!p) {
    p = (async () => {
      const [sym, dec] = await Promise.all([
        ethCall(chain, address, SEL.symbol).catch(() => "0x"),
        ethCall(chain, address, SEL.decimals).catch(() => "0x"),
      ]);
      const d = Number(decodeUint(words(dec)[0] ?? "0"));
      return { address, symbol: decodeStringOrBytes32(sym), decimals: d > 0 && d <= 36 ? d : 18 };
    })();
    tokenCache.set(k, p);
  }
  return p;
}

export async function listTokenIds(chain: EvmChain, owner: string, max = 60): Promise<bigint[]> {
  const o = normalizeAddress(owner);
  const bal = decodeUint(words(await ethCall(chain, chain.positionManager, calldata(SEL.balanceOf, encodeAddress(o))))[0]);
  const n = Number(bal > BigInt(max) ? BigInt(max) : bal);
  const ids = await Promise.all(
    Array.from({ length: n }, (_, i) =>
      ethCall(chain, chain.positionManager, calldata(SEL.tokenOfOwnerByIndex, encodeAddress(o), encodeUint(i))),
    ),
  );
  return ids.map((h) => decodeUint(words(h)[0]));
}

let factoryCache = new Map<string, Promise<string>>();
function factoryOf(chain: EvmChain): Promise<string> {
  let f = factoryCache.get(chain.key);
  if (!f) {
    f = ethCall(chain, chain.positionManager, SEL.factory).then((h) => decodeAddress(words(h)[0]));
    factoryCache.set(chain.key, f);
  }
  return f;
}

export async function loadPosition(chain: EvmChain, owner: string, tokenId: bigint): Promise<Position> {
  const w = words(await ethCall(chain, chain.positionManager, calldata(SEL.positions, encodeUint(tokenId))));
  const token0Addr = decodeAddress(w[2]);
  const token1Addr = decodeAddress(w[3]);
  const feeRaw = Number(decodeUint(w[4]));
  const tickLower = Number(decodeInt(w[5]));
  const tickUpper = Number(decodeInt(w[6]));
  const liquidity = decodeUint(w[7]);
  const owed0 = decodeUint(w[10]);
  const owed1 = decodeUint(w[11]);

  const factory = await factoryOf(chain);
  const [token0, token1, poolHex] = await Promise.all([
    loadToken(chain, token0Addr),
    loadToken(chain, token1Addr),
    ethCall(chain, factory, calldata(SEL.getPool, encodeAddress(token0Addr), encodeAddress(token1Addr), encodeUint(feeRaw))),
  ]);
  const pool = decodeAddress(words(poolHex)[0]);
  const s0 = words(await ethCall(chain, pool, SEL.slot0));
  const sqrtPriceX96 = decodeUint(s0[0]);
  const tickCurrent = Number(decodeInt(s0[1]));

  // Taxas não coletadas: SIMULA collect() via eth_call (nada é enviado/assinado).
  let fee0Raw = owed0, fee1Raw = owed1;
  try {
    const o = normalizeAddress(owner);
    const r = words(
      await ethCall(
        chain,
        chain.positionManager,
        calldata(SEL.collect, encodeUint(tokenId), encodeAddress(o), encodeUint(MAX_UINT128), encodeUint(MAX_UINT128)),
        o,
      ),
    );
    fee0Raw = decodeUint(r[0]);
    fee1Raw = decodeUint(r[1]);
  } catch {
    /* fallback: tokensOwed já registrados */
  }

  const sqrtP = Number(sqrtPriceX96) / 2 ** 96;
  const { amount0, amount1 } = amountsForLiquidity(Number(liquidity), sqrtP, tickLower, tickUpper);
  const d0 = 10 ** token0.decimals, d1 = 10 ** token1.decimals;

  return {
    tokenId,
    token0,
    token1,
    fee: feeRaw / 1_000_000,
    tickLower,
    tickUpper,
    tickCurrent,
    liquidity,
    inRange: liquidity > 0n && tickCurrent >= tickLower && tickCurrent < tickUpper,
    priceLower: tickToPrice(tickLower, token0.decimals, token1.decimals),
    priceUpper: tickToPrice(tickUpper, token0.decimals, token1.decimals),
    priceCurrent: (sqrtP * sqrtP) * 10 ** (token0.decimals - token1.decimals),
    amount0: amount0 / d0,
    amount1: amount1 / d1,
    fees0: Number(fee0Raw) / d0,
    fees1: Number(fee1Raw) / d1,
    pool,
  };
}

export async function loadPositions(chain: EvmChain, owner: string, includeClosed: boolean): Promise<Position[]> {
  const ids = await listTokenIds(chain, owner);
  const out: Position[] = [];
  // Em lotes pequenos para não estourar o limite do RPC público.
  for (let i = 0; i < ids.length; i += 5) {
    const batch = await Promise.all(ids.slice(i, i + 5).map((id) => loadPosition(chain, owner, id).catch(() => null)));
    for (const p of batch) if (p && (includeClosed || p.liquidity > 0n)) out.push(p);
  }
  return out.sort((a, b) => Number(b.liquidity > 0n) - Number(a.liquidity > 0n));
}

export function _resetCachesForTests() {
  tokenCache.clear();
  factoryCache = new Map();
}
