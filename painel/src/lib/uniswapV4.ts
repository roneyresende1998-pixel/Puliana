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
export async function loadV4Position(chainKey: string, tokenId: bigint, _owner?: string): Promise<LpPosition & { owner: string }> {
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
    owner: nftOwner,
  };
}

// ---------------------------------------------------------------------------
// Descoberta dos NFTs v4 sem histórico: pergunta ao contrato o dono de cada NFT
// (ownerOf) em lotes de 1000 via Multicall3. Funciona para posições de qualquer
// idade. A primeira busca completa é demorada (a Base tem milhões de NFTs); o
// resultado fica salvo no navegador e depois só os NFTs novos são conferidos.

const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
const LOTE = 1000;
const w64 = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");

/** aggregate3((address,bool,bytes)[]) com ownerOf(id) para cada id. */
export function encodeOwnerOfBatch(pm: string, ids: number[]): string {
  const item = (id: number) => w64(BigInt(pm)) + w64(1) + w64(96) + w64(36) + (S4.ownerOf.slice(2) + w64(id)).padEnd(128, "0");
  const items = ids.map(item);
  let head = "", off = ids.length * 32;
  for (const it of items) { head += w64(off); off += it.length / 2; }
  return "0x82ad56cb" + w64(32) + w64(ids.length) + head + items.join("");
}

export function decodeOwnerOfBatch(hex: string, n: number): (string | null)[] {
  const h = hex.slice(2);
  const W = (i: number) => h.slice(i * 64, i * 64 + 64);
  const out: (string | null)[] = [];
  for (let i = 0; i < n; i++) {
    const o = parseInt(W(2 + i), 16) / 32 + 2;
    const ok = parseInt(W(o), 16) === 1;
    const d = parseInt(W(o + 1), 16) / 32 + o;
    out.push(ok && parseInt(W(d), 16) === 32 ? "0x" + W(d + 1).slice(24) : null);
  }
  return out;
}

type V4Cache = { ids: string[]; ate: number; completo: boolean };
const cacheKey = (chain: string, owner: string) => `v4scan:${chain}:${owner.toLowerCase()}`;
export function lerV4Cache(chain: string, owner: string): V4Cache | null {
  try { const v = JSON.parse(localStorage.getItem(cacheKey(chain, owner)) ?? "null"); return v && Array.isArray(v.ids) ? v : null; } catch { return null; }
}
function salvarV4Cache(chain: string, owner: string, v: V4Cache) { try { localStorage.setItem(cacheKey(chain, owner), JSON.stringify(v)); } catch { /* ignora */ } }

/**
 * Varre os NFTs v4 de `desde` até o último criado e devolve os da carteira.
 * `completa` = começa do NFT 1 (busca profunda); senão só os novos desde o cache.
 */
export async function scanV4Owners(chainKey: string, owner: string, completa: boolean, onProgress?: (pct: number) => void, sinal?: { cancelado: boolean }): Promise<{ ids: string[]; completo: boolean }> {
  const c = chainByKey(chainKey);
  const pm = V4[chainKey].pm;
  const o = normalizeAddress(owner);
  const cache = lerV4Cache(chainKey, o);
  const next = Number(decodeUint(words(await ethCall(c, pm, "0x75794a3c"))[0])); // nextTokenId()
  const inicio = completa ? 1 : (cache?.ate ?? next - 1) + 1;
  const achados = new Set(completa ? [] : cache?.ids ?? []);
  const lotes: number[] = [];
  for (let s = inicio; s < next; s += LOTE) lotes.push(s);
  let feitos = 0, falhas = 0;
  for (let i = 0; i < lotes.length; i += 8) {
    if (sinal?.cancelado) break;
    await Promise.all(lotes.slice(i, i + 8).map(async (s) => {
      const ids = Array.from({ length: Math.min(LOTE, next - s) }, (_, k) => s + k);
      for (let t = 0; t < 3; t++) {
        try {
          const r = await ethCall(c, MULTICALL3, encodeOwnerOfBatch(pm, ids));
          decodeOwnerOfBatch(r, ids.length).forEach((dono, k) => { if (dono === o) achados.add(String(ids[k])); });
          return;
        } catch { await new Promise((ok) => setTimeout(ok, 800 * (t + 1))); }
      }
      falhas++;
    }));
    feitos = Math.min(lotes.length, i + 8);
    onProgress?.(Math.round((feitos * 100) / Math.max(1, lotes.length)));
  }
  const terminou = !sinal?.cancelado && falhas === 0;
  // confere de novo os já conhecidos (podem ter sido vendidos/transferidos)
  const ids: string[] = [];
  for (const id of achados) {
    try { if (decodeAddress(words(await ethCall(c, pm, calldata(S4.ownerOf, encodeUint(BigInt(id)))))[0]) === o) ids.push(id); } catch { /* queimado */ }
  }
  const completoAgora = completa ? terminou : !!cache?.completo && terminou;
  if (terminou || !cache) salvarV4Cache(chainKey, o, { ids, ate: terminou ? next - 1 : cache?.ate ?? next - 1, completo: completoAgora });
  return { ids, completo: completoAgora };
}
