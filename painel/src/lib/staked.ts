// Posições EM STAKE: o NFT sai da carteira e fica na farm/gauge.
//  - PancakeSwap: MasterChef v3 é "enumerável" por usuário (balanceOf/tokenOfOwnerByIndex).
//  - Aerodrome/Velodrome: cada pool tem um gauge; stakedValues(usuário) lista os NFTs.
// Tudo só leitura (eth_call / Multicall3).

import { SEL, calldata, decodeAddress, decodeUint, encodeAddress, encodeUint, normalizeAddress, words } from "./abi.ts";
import { V3_PROTOCOLS, chainByKey } from "./chains.ts";
import { multicall } from "./multicall.ts";
import type { LpPosition } from "./positions.ts";
import { ethCall } from "./rpc.ts";
import { loadPosition } from "./uniswap.ts";

const S = {
  length: "0x1f7b6d32", // length()
  pools: "0xac4afa38", // pools(uint256)
  gauges: "0xb9a09fd5", // gauges(address)
  stakedValues: "0x4b937763", // stakedValues(address)
  earned: "0x3e491d47", // earned(address,uint256)
  pendingCake: "0xce5f39c6", // pendingCake(uint256)
  CAKE: "0x4ca6ef28", // CAKE()
  rewardToken: "0xf7c618c1", // rewardToken()
  nft: "0x47ccca02", // nft() — gerenciador de posições usado pelo gauge
};

export const PANCAKE_FARMS: Record<string, string> = {
  bsc: "0x556b9306565093c855aea9ae92a594704c2cd59e",
  eth: "0x556b9306565093c855aea9ae92a594704c2cd59e",
  base: "0xc6a2db661d5a5690172d8eb0a7dea2d3008665a3",
  arbitrum: "0x5e09acf80c0296740ec5d6f643005a4ef8daa694",
  linea: "0x22e2f236065b780fa33ec8c4e58b99ebc8b55c57",
};

export const VOTERS: { chain: string; nome: string; voter: string; reward: string }[] = [
  { chain: "base", nome: "Aerodrome", voter: "0x16613524e02ad97edfef371bc883f2f5d6c480a5", reward: "AERO" },
  { chain: "optimism", nome: "Velodrome", voter: "0x41c914ee0c7e1a5edcd0295623e6dc557b5abf3c", reward: "VELO" },
];

const proto = (chain: string, nome: string, npm?: string) =>
  V3_PROTOCOLS.find((p) => p.chain === chain && p.nome === nome && (!npm || p.positionManager === npm))!;
const addr = (hex: string) => decodeAddress(words("0x" + hex)[0] ?? "0".repeat(64));

/** Posições da PancakeSwap depositadas na farm (MasterChef v3). */
export async function loadPancakeFarm(chainKey: string, owner: string, includeClosed: boolean): Promise<LpPosition[]> {
  const c = chainByKey(chainKey);
  const mc = PANCAKE_FARMS[chainKey];
  const o = normalizeAddress(owner);
  const n = Number(decodeUint(words(await ethCall(c, mc, calldata(SEL.balanceOf, encodeAddress(o))))[0]));
  if (n === 0) return [];
  const idsRes = await multicall(c, Array.from({ length: Math.min(n, 100) }, (_, i) => ({ target: mc, data: calldata(SEL.tokenOfOwnerByIndex, encodeAddress(o), encodeUint(i)) })));
  const ids = idsRes.filter((r) => r.ok).map((r) => decodeUint(r.data.slice(0, 64)));
  const cakeAddr = decodeAddress(words(await ethCall(c, mc, S.CAKE))[0]);
  const pend = await multicall(c, ids.map((id) => ({ target: mc, data: calldata(S.pendingCake, encodeUint(id)) })));
  const p = proto(chainKey, "PancakeSwap v3");
  const out: LpPosition[] = [];
  for (let i = 0; i < ids.length; i++) {
    try {
      const pos = await loadPosition(p, mc, ids[i]); // taxas simuladas como se a farm coletasse
      if (!includeClosed && pos.closed) continue;
      out.push({
        ...pos, key: `farm:${pos.key}`, staked: "Farm PancakeSwap",
        rewards: [{ symbol: "CAKE", address: cakeAddr, amount: pend[i]?.ok ? Number(decodeUint(pend[i].data.slice(0, 64))) / 1e18 : 0 }],
      });
    } catch { /* posição inválida */ }
  }
  return out;
}

const gaugeCache = new Map<string, Promise<string[]>>();
/** Todos os gauges da Aerodrome/Velodrome (lista muda pouco; fica em memória). */
function allGauges(chainKey: string, voter: string): Promise<string[]> {
  let g = gaugeCache.get(chainKey);
  if (!g) {
    g = (async () => {
      const c = chainByKey(chainKey);
      const n = Number(decodeUint(words(await ethCall(c, voter, S.length))[0]));
      const pools = await multicall(c, Array.from({ length: n }, (_, i) => ({ target: voter, data: calldata(S.pools, encodeUint(i)) })));
      const poolAddrs = pools.filter((r) => r.ok).map((r) => addr(r.data));
      const gauges = await multicall(c, poolAddrs.map((p) => ({ target: voter, data: calldata(S.gauges, encodeAddress(p)) })));
      return gauges.filter((r) => r.ok).map((r) => addr(r.data)).filter((a) => !/^0x0{40}$/.test(a));
    })();
    gaugeCache.set(chainKey, g);
    g.catch(() => gaugeCache.delete(chainKey));
  }
  return g;
}

/** Posições Slipstream depositadas em gauges (Aerodrome / Velodrome). */
export async function loadGaugeStaked(chainKey: string, owner: string, includeClosed: boolean): Promise<LpPosition[]> {
  const v = VOTERS.find((x) => x.chain === chainKey)!;
  const c = chainByKey(chainKey);
  const o = normalizeAddress(owner);
  const gauges = await allGauges(chainKey, v.voter);
  // stakedValues só existe em gauges de liquidez concentrada; nos outros a chamada falha (ok).
  const res = await multicall(c, gauges.map((g) => ({ target: g, data: calldata(S.stakedValues, encodeAddress(o)) })));
  const achados: { gauge: string; id: bigint }[] = [];
  res.forEach((r, i) => {
    if (!r.ok || r.data.length < 128) return;
    const ws = words("0x" + r.data);
    const len = Number(decodeUint(ws[1]));
    for (let k = 0; k < len && k < 200; k++) achados.push({ gauge: gauges[i], id: decodeUint(ws[2 + k]) });
  });
  if (achados.length === 0) return [];
  const rewardTok = addr((await multicall(c, [{ target: achados[0].gauge, data: S.rewardToken }]))[0].data);
  const earned = await multicall(c, achados.map((a) => ({ target: a.gauge, data: calldata(S.earned, encodeAddress(o), encodeUint(a.id)) })));
  const gs = [...new Set(achados.map((a) => a.gauge))];
  const nfts = await multicall(c, gs.map((g) => ({ target: g, data: S.nft })));
  const npmDe = new Map(gs.map((g, i) => [g, nfts[i].ok ? addr(nfts[i].data) : ""]));
  const out: LpPosition[] = [];
  for (let i = 0; i < achados.length; i++) {
    try {
      const p = proto(chainKey, v.nome, npmDe.get(achados[i].gauge)) ?? proto(chainKey, v.nome);
      const pos = await loadPosition(p, achados[i].gauge, achados[i].id);
      if (!includeClosed && pos.closed) continue;
      out.push({
        ...pos, key: `gauge:${pos.key}`, staked: `Gauge ${v.nome}`,
        // em stake no gauge, as taxas de negociação vão para os eleitores; você recebe o token de emissão
        fees0: 0, fees1: 0, feesApprox: false,
        rewards: [{ symbol: v.reward, address: rewardTok, amount: earned[i]?.ok ? Number(decodeUint(earned[i].data.slice(0, 64))) / 1e18 : 0 }],
      });
    } catch { /* posição inválida */ }
  }
  return out;
}
