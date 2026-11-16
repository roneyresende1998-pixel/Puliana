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
import { V4, countV4, loadV4Position } from "./uniswapV4.ts";

export type SourceStatus = { fonte: string; ok: boolean; qtd: number; erro?: string };
export type ScanResult = { positions: LpPosition[]; status: SourceStatus[]; v4Counts: { chain: string; nome: string; count: number }[] };

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
    const v4Tasks = Object.keys(V4).map(async (chain) => {
      try {
        const n = await countV4(chain, address);
        if (n > 0) v4Counts.push({ chain, nome: EVM_CHAINS.find((c) => c.key === chain)!.nome, count: n });
      } catch { /* ignora */ }
    });
    const manual = run("Uniswap v4 (NFTs informados)", status, async () => {
      const out: LpPosition[] = [];
      for (const { chain, id } of opts.v4Ids ?? []) {
        const p = await loadV4Position(chain, BigInt(id), address);
        if (opts.includeClosed || !p.closed) out.push(p);
      }
      return out;
    });
    opts.onProgress?.(`Lendo ${tasks.length + 1} protocolos em ${EVM_CHAINS.length} redes…`);
    const res = await Promise.all([...tasks, manual]);
    await Promise.all(v4Tasks);
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
