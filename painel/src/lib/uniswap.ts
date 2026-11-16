// Leitura de posições de liquidez concentrada em EVM (Uniswap v3 e forks:
// PancakeSwap, SushiSwap, Aerodrome/Velodrome Slipstream) — somente eth_call.

import {
  SEL, MAX_UINT128, calldata, decodeAddress, decodeInt, decodeStringOrBytes32,
  decodeUint, encodeAddress, encodeInt, encodeUint, normalizeAddress, words,
} from "./abi.ts";
import { chainByKey, type EvmChain, type V3Protocol } from "./chains.ts";
import { amountsFromSqrt, tickPrice } from "./clmm.ts";
import type { LpPosition, TokenInfo } from "./positions.ts";
import { ethCall } from "./rpc.ts";

const tokenCache = new Map<string, Promise<TokenInfo>>();

function loadToken(chain: EvmChain, address: string): Promise<TokenInfo> {
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

const once = new Map<string, Promise<string>>();
function cached(key: string, f: () => Promise<string>) {
  let v = once.get(key);
  if (!v) { v = f(); once.set(key, v); v.catch(() => once.delete(key)); }
  return v;
}

export async function listTokenIds(chain: EvmChain, npm: string, owner: string, max = 100): Promise<bigint[]> {
  const o = normalizeAddress(owner);
  const bal = decodeUint(words(await ethCall(chain, npm, calldata(SEL.balanceOf, encodeAddress(o))))[0]);
  const n = Number(bal > BigInt(max) ? BigInt(max) : bal);
  const ids: bigint[] = [];
  for (let i = 0; i < n; i += 10) {
    const part = await Promise.all(
      Array.from({ length: Math.min(10, n - i) }, (_, j) =>
        ethCall(chain, npm, calldata(SEL.tokenOfOwnerByIndex, encodeAddress(o), encodeUint(i + j))),
      ),
    );
    ids.push(...part.map((h) => decodeUint(words(h)[0])));
  }
  return ids;
}

export async function loadPosition(proto: V3Protocol, owner: string, tokenId: bigint): Promise<LpPosition> {
  const chain = chainByKey(proto.chain);
  const npm = proto.positionManager;
  const w = words(await ethCall(chain, npm, calldata(SEL.positions, encodeUint(tokenId))));
  const token0Addr = decodeAddress(w[2]);
  const token1Addr = decodeAddress(w[3]);
  const feeOrSpacing = Number(decodeInt(w[4]));
  const tickLower = Number(decodeInt(w[5]));
  const tickUpper = Number(decodeInt(w[6]));
  const liquidity = decodeUint(w[7]);
  const owed0 = decodeUint(w[10]);
  const owed1 = decodeUint(w[11]);

  const factory = await cached(`f:${chain.key}:${npm}`, () => ethCall(chain, npm, SEL.factory).then((h) => decodeAddress(words(h)[0])));
  const getPoolData = proto.kind === "slipstream"
    ? calldata(SEL.getPoolSlipstream, encodeAddress(token0Addr), encodeAddress(token1Addr), encodeInt(feeOrSpacing))
    : calldata(SEL.getPool, encodeAddress(token0Addr), encodeAddress(token1Addr), encodeUint(feeOrSpacing));
  const [token0, token1, pool] = await Promise.all([
    loadToken(chain, token0Addr),
    loadToken(chain, token1Addr),
    cached(`p:${chain.key}:${factory}:${getPoolData}`, () => ethCall(chain, factory, getPoolData).then((h) => decodeAddress(words(h)[0]))),
  ]);
  const [s0hex, feeHex] = await Promise.all([
    ethCall(chain, pool, SEL.slot0),
    proto.kind === "slipstream" ? cached(`fee:${chain.key}:${pool}`, () => ethCall(chain, pool, SEL.fee)) : Promise.resolve(""),
  ]);
  const s0 = words(s0hex);
  const sqrtPriceX96 = decodeUint(s0[0]);
  const tickCurrent = Number(decodeInt(s0[1]));
  const feePips = proto.kind === "slipstream" ? Number(decodeUint(words(feeHex)[0] ?? "0")) : feeOrSpacing;

  // Taxas não coletadas: SIMULA collect() via eth_call (nada é enviado/assinado).
  let fee0Raw = owed0, fee1Raw = owed1, approx = true;
  try {
    const o = normalizeAddress(owner);
    const r = words(await ethCall(chain, npm,
      calldata(SEL.collect, encodeUint(tokenId), encodeAddress(o), encodeUint(MAX_UINT128), encodeUint(MAX_UINT128)), o));
    fee0Raw = decodeUint(r[0]);
    fee1Raw = decodeUint(r[1]);
    approx = false;
  } catch { /* fallback: tokensOwed já registrados */ }

  const sqrtP = Number(sqrtPriceX96) / 2 ** 96;
  const { a0, a1 } = amountsFromSqrt(Number(liquidity), sqrtP, tickLower, tickUpper);
  return {
    key: `${proto.nome}:${chain.key}:${tokenId}`,
    id: tokenId.toString(),
    chainKey: chain.key,
    chainName: chain.nome,
    protocol: proto.nome,
    token0, token1,
    fee: feePips / 1_000_000,
    priceLower: tickPrice(tickLower, token0.decimals, token1.decimals),
    priceUpper: tickPrice(tickUpper, token0.decimals, token1.decimals),
    priceCurrent: sqrtP * sqrtP * 10 ** (token0.decimals - token1.decimals),
    inRange: liquidity > 0n && tickCurrent >= tickLower && tickCurrent < tickUpper,
    closed: liquidity === 0n,
    amount0: a0 / 10 ** token0.decimals,
    amount1: a1 / 10 ** token1.decimals,
    fees0: Number(fee0Raw) / 10 ** token0.decimals,
    fees1: Number(fee1Raw) / 10 ** token1.decimals,
    feesApprox: approx,
    manageUrl: proto.manage(chain.key, tokenId.toString()),
    explorerUrl: `${chain.explorer}/address/${pool}`,
    gecko: chain.gecko,
  };
}

export async function loadProtocolPositions(proto: V3Protocol, owner: string, includeClosed: boolean): Promise<LpPosition[]> {
  const chain = chainByKey(proto.chain);
  const ids = await listTokenIds(chain, proto.positionManager, owner);
  const out: LpPosition[] = [];
  for (let i = 0; i < ids.length; i += 5) {
    const batch = await Promise.all(ids.slice(i, i + 5).map((id) => loadPosition(proto, owner, id).catch(() => null)));
    for (const p of batch) if (p && (includeClosed || !p.closed)) out.push(p);
  }
  return out;
}

export function _resetCachesForTests() {
  tokenCache.clear();
  once.clear();
}
