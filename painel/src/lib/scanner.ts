// Varre TODAS as fontes suportadas para um endereço (EVM ou Solana) e devolve
// as posições num formato único. Cada fonte falha de forma isolada.

import { isAddress } from "./abi.ts";
import { V3_PROTOCOLS, EVM_CHAINS } from "./chains.ts";
import type { LpPosition } from "./positions.ts";
import { isSolAddress, listNftMints } from "./solana/core.ts";
import { loadMeteoraPositions } from "./solana/meteora.ts";
import { loadOrcaPositions } from "./solana/orca.ts";
import { loadRaydiumPositions } from "./solana/raydium.ts";
import { loadProtocolPositions } from "./uniswap.ts";
import { V4, countV4, lerV4Cache, loadV4Position, scanV4Owners } from "./uniswapV4.ts";
import { PANCAKE_FARMS, VOTERS, loadGaugeStaked, loadPancakeFarm } from "./staked.ts";

export type SourceStatus = { fonte: string; ok: boolean; qtd: number; erro?: string };
export type ScanResult = { positions: LpPosition[]; status: SourceStatus[]; v4Counts: { chain: string; nome: string; count: number; achados: number; buscaCompleta: boolean }[] };

export type AddressKind = "evm" | "solana" | null;
export const addressKind = (a: string): AddressKind => (isAddress(a) ? "evm" : isSolAddress(a) ? "solana" : null);

async function run<T>(fonte: string, status: SourceStatus[], f: () => Promise<T[]>): Promise<T[]> {
  try {
    const r = await f();
    status.push({ fonte, ok: true, qtd: r.length });
    return r;
  } catch (e) {
    status.push({ fonte, ok: false, qtd: 0, erro: (e as Error).message });
    return [];
  }
}

export async function scanAddress(
  address: string,
  opts: { includeClosed: boolean; v4Ids?: { chain: string; id: string }[]; onProgress?: (msg: string) => void },
): Promise<ScanResult> {
  const kind = addressKind(address);
  const status: SourceStatus[] = [];
  const v4Counts: ScanResult["v4Counts"] = [];
  let positions: LpPosition[] = [];

  if (kind === "evm") {
    const tasks = V3_PROTOCOLS.map((p) => {
      const nome = `${p.nome} · ${EVM_CHAINS.find((c) => c.key === p.chain)!.nome}`;
      return run(nome, status, () => loadProtocolPositions(p, address, opts.includeClosed));
    });
    // Uniswap v4: conta os NFTs, descobre os números sozinho (histórico recente)
    // e junta com os que o usuário informou à mão.
    const v4Task = run("Uniswap v4", status, async () => {
      const ids = new Map<string, { chain: string; id: string }>();
      for (const v of opts.v4Ids ?? []) ids.set(`${v.chain}:${v.id}`, v);
      await Promise.all(Object.keys(V4).map(async (chain) => {
        let n = 0;
        try { n = await countV4(chain, address); } catch { return; }
        if (n === 0) return;
        // Só os NFTs novos desde a última busca (rápido). A busca completa é um botão na tela.
        let completa = !!lerV4Cache(chain, address)?.completo;
        if (lerV4Cache(chain, address)) {
          try { const r = await scanV4Owners(chain, address, false); completa = r.completo; for (const id of r.ids) ids.set(`${chain}:${id}`, { chain, id }); } catch { /* segue */ }
        }
        const total = [...ids.values()].filter((v) => v.chain === chain).length;
        v4Counts.push({ chain, nome: EVM_CHAINS.find((c) => c.key === chain)!.nome, count: n, achados: Math.min(total, n), buscaCompleta: completa });
      }));
      const out: LpPosition[] = [];
      for (const { chain, id } of ids.values()) {
        try {
          const p = await loadV4Position(chain, BigInt(id), address);
          if (p.owner === address.toLowerCase() && (opts.includeClosed || !p.closed)) out.push(p);
        } catch { /* NFT inexistente nessa rede */ }
      }
      return out;
    });
    // Posições em stake (o NFT não está na carteira)
    const nomeRede = (k: string) => EVM_CHAINS.find((c) => c.key === k)!.nome;
    const stakeTasks = [
      ...Object.keys(PANCAKE_FARMS).map((k) => run(`Farm PancakeSwap · ${nomeRede(k)}`, status, () => loadPancakeFarm(k, address, opts.includeClosed))),
      ...VOTERS.map((v) => run(`Gauges ${v.nome} · ${nomeRede(v.chain)}`, status, () => loadGaugeStaked(v.chain, address, opts.includeClosed))),
    ];
    opts.onProgress?.(`Lendo ${tasks.length + stakeTasks.length + 1} fontes em ${EVM_CHAINS.length} redes…`);
    const res = await Promise.all([...tasks, ...stakeTasks, v4Task]);
    positions = res.flat();
  } else if (kind === "solana") {
    opts.onProgress?.("Lendo NFTs da carteira Solana…");
    const mints = await run("Carteira Solana (NFTs)", status, () => listNftMints(address));
    const [orca, ray, met] = await Promise.all([
      run("Orca Whirlpools", status, () => loadOrcaPositions(mints)),
      run("Raydium CLMM", status, () => loadRaydiumPositions(mints)),
      run("Meteora DLMM", status, async () => (await loadMeteoraPositions(address)).positions),
    ]);
    positions = [...orca, ...ray, ...met].filter((p) => opts.includeClosed || !p.closed);
  } else {
    throw new Error("Endereço inválido: use 0x… (EVM) ou um endereço Solana.");
  }
  return { positions, status, v4Counts };
}
