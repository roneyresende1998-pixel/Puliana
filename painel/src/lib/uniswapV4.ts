// Uniswap v4: o NFT de posição não é "enumerável" (não dá para listar os IDs
// de uma carteira só com eth_call). Então: contamos quantas a carteira tem
// (balanceOf) e lemos cada uma pelo número do NFT que o usuário informa.

import { calldata, decodeAddress, decodeInt, decodeUint, encodeAddress, encodeInt, encodeUint, normalizeAddress, words, SEL, decodeStringOrBytes32 } from "./abi.ts";
import { chainByKey } from "./chains.ts";
import { amountsFromSqrt, tickPrice } from "./clmm.ts";
import { keccakHex } from "./keccak.ts";
import type { LpPosition, TokenInfo } from "./positions.ts";
import { ethCall } from "./rpc.ts";

export const V4: Record<string, { pm: string; stateView: string }> = {
  eth: { pm: "0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e", stateView: "0x7ffe42c4a5deea5b0fec41c94c136cf115597227" },
  arbitrum: { pm: "0xd88f38f930b7952f2db2432cb002e7abbf3dd869", stateView: "0x76fd297e2d437cd7f76d50f01afe6160f86e9990" },
  base: { pm: "0x7c5f5a4bbd8fd63184577525326123b519429bdc", stateView: "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71" },
  optimism: { pm: "0x3c3ea4b57a46241e54610e5f022e5c45859a1017", stateView: "0xc18a3169788f4f75a170290584eca6395c75ecdb" },
  polygon: { pm: "0x1ec2ebf4f37e7363fdfe3551602425af0b3ceef9", stateView: "0x5ea1bd7974c8a611cbab0bdcafcb1d9cc9b3ba5a" },
  unichain: { pm: "0x4529a01c7a0410167c5740c487a8de60232617bf", stateView: "0x86e8631a016f9068c3f085faf484ee3f5fdee8f2" },
  bsc: { pm: "0x7a4a5c919ae2541aed11041a1aeee68f1287f95b", stateView: "0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4" },
  avalanche: { pm: "0xb74b1f14d2754acfcbbe1a221023a5cf50ab8acd", stateView: "0xc3c9e198c735a4b97e3e683f391ccbdd60b69286" },
};

const S4 = {
  getPoolAndPositionInfo: "0x7ba03aad",
  getPositionLiquidity: "0x1efeed33",
  getSlot0: "0xc815641c",
  getFeeGrowthInside: "0x53e9c1fb",
  getPositionInfo: "0xdacf1d2f",
  ownerOf: "0x6352211e",
};

const NATIVE: Record<string, string> = { eth: "ETH", arbitrum: "ETH", base: "ETH", optimism: "ETH", unichain: "ETH", polygon: "POL", bsc: "BNB", avalanche: "AVAX" };

export async function countV4(chainKey: string, owner: string): Promise<number> {
  const c = chainByKey(chainKey);
  const h = await ethCall(c, V4[chainKey].pm, calldata(SEL.balanceOf, encodeAddress(normalizeAddress(owner))));
  return Number(decodeUint(words(h)[0]));
}

async function token(chainKey: string, addr: string): Promise<TokenInfo> {
  if (/^0x0{40}$/.test(addr)) return { address: addr, symbol: NATIVE[chainKey] ?? "ETH", decimals: 18 };
  const c = chainByKey(chainKey);
  const [s, d] = await Promise.all([ethCall(c, addr, SEL.symbol).catch(() => "0x"), ethCall(c, addr, SEL.decimals).catch(() => "0x")]);
  const dec = Number(decodeUint(words(d)[0] ?? "0"));
  return { address: addr, symbol: decodeStringOrBytes32(s), decimals: dec > 0 && dec <= 36 ? dec : 18 };
}

/** Lê uma posição v4 pelo número do NFT. `owner` serve só para avisar se o NFT não é dessa carteira. */
export async function loadV4Position(chainKey: string, tokenId: bigint, owner?: string): Promise<LpPosition & { owner: string }> {
  const c = chainByKey(chainKey);
  const { pm, stateView } = V4[chainKey];
  const [infoHex, liqHex, ownHex] = await Promise.all([
    ethCall(c, pm, calldata(S4.getPoolAndPositionInfo, encodeUint(tokenId))),
    ethCall(c, pm, calldata(S4.getPositionLiquidity, encodeUint(tokenId))),
    ethCall(c, pm, calldata(S4.ownerOf, encodeUint(tokenId))).catch(() => "0x" + "0".repeat(64)),
  ]);
  const w = words(infoHex);
  // PoolKey: currency0, currency1, fee, tickSpacing, hooks ; depois PositionInfo empacotado
  const poolKeyHex = "0x" + w.slice(0, 5).join("");
  const c0 = decodeAddress(w[0]), c1 = decodeAddress(w[1]);
  const lpFeeStatic = Number(decodeUint(w[2]));
  const info = decodeUint(w[5]);
  const signed24 = (v: bigint) => { const n = Number(v & 0xffffffn); return n >= 0x800000 ? n - 0x1000000 : n; };
  const tickLower = signed24(info >> 8n);
  const tickUpper = signed24(info >> 32n);
  const liquidity = decodeUint(words(liqHex)[0]);
  if (c0 === c1) throw new Error("NFT inexistente nessa rede");

  const poolId = keccakHex(poolKeyHex);
  const pid = poolId.slice(2);
  const salt = encodeUint(tokenId);
  const [slotHex, inside, posInfo, t0, t1] = await Promise.all([
    ethCall(c, stateView, calldata(S4.getSlot0, pid)),
    ethCall(c, stateView, calldata(S4.getFeeGrowthInside, pid, encodeInt(tickLower), encodeInt(tickUpper))),
    ethCall(c, stateView, calldata(S4.getPositionInfo, pid, encodeAddress(pm), encodeInt(tickLower), encodeInt(tickUpper), salt)),
    token(chainKey, c0),
    token(chainKey, c1),
  ]);
  const s = words(slotHex);
  const sqrtPriceX96 = decodeUint(s[0]);
  const tickCurrent = Number(decodeInt(s[1]));
  const lpFee = Number(decodeUint(s[3]));
  const g = words(inside), pi = words(posInfo);
  const M256 = (1n << 256n) - 1n;
  const fees0 = (liquidity * ((decodeUint(g[0]) - decodeUint(pi[1])) & M256)) >> 128n;
  const fees1 = (liquidity * ((decodeUint(g[1]) - decodeUint(pi[2])) & M256)) >> 128n;

  const sqrtP = Number(sqrtPriceX96) / 2 ** 96;
  const { a0, a1 } = amountsFromSqrt(Number(liquidity), sqrtP, tickLower, tickUpper);
  const nftOwner = decodeAddress(words(ownHex)[0]);
  const slug: Record<string, string> = { eth: "ethereum", bsc: "bnb" };
  return {
    key: `v4:${chainKey}:${tokenId}`, id: tokenId.toString(), chainKey, chainName: c.nome, protocol: "Uniswap v4",
    token0: t0, token1: t1,
    fee: (lpFeeStatic & 0x800000 ? lpFee : lpFeeStatic) / 1_000_000, // 0x800000 = taxa dinâmica (hook)
    priceLower: tickPrice(tickLower, t0.decimals, t1.decimals),
    priceUpper: tickPrice(tickUpper, t0.decimals, t1.decimals),
    priceCurrent: sqrtP * sqrtP * 10 ** (t0.decimals - t1.decimals),
    inRange: liquidity > 0n && tickCurrent >= tickLower && tickCurrent < tickUpper,
    closed: liquidity === 0n,
    amount0: a0 / 10 ** t0.decimals, amount1: a1 / 10 ** t1.decimals,
    fees0: Number(fees0) / 10 ** t0.decimals, fees1: Number(fees1) / 10 ** t1.decimals,
    manageUrl: `https://app.uniswap.org/positions/v4/${slug[chainKey] ?? chainKey}/${tokenId}`,
    explorerUrl: `${c.explorer}/nft/${pm}/${tokenId}`,
    gecko: c.gecko,
    owner: owner && nftOwner !== owner.toLowerCase() ? nftOwner : nftOwner,
  };
}
