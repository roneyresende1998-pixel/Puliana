// Cliente JSON-RPC SOMENTE LEITURA. Só existe `eth_call` aqui — este arquivo
// não tem (e não deve ter) nenhuma forma de enviar transação.
//
// Cada rede tem um nó principal (PublicNode) e um reserva (dRPC). Se o
// principal falhar por rede, limite de uso ou bloqueio, a mesma leitura é
// repetida no reserva. Um "revert" do contrato NÃO troca de nó (é resposta válida).

import { EVM_CHAINS, type EvmChain } from "./chains.ts";

const RESERVA: Record<string, string> = {
  eth: "https://eth.drpc.org", arbitrum: "https://arbitrum.drpc.org", base: "https://base.drpc.org",
  optimism: "https://optimism.drpc.org", polygon: "https://polygon.drpc.org", bsc: "https://bsc.drpc.org",
  avalanche: "https://avalanche.drpc.org", unichain: "https://unichain.drpc.org", linea: "https://linea.drpc.org",
};
const ALLOWED_RPCS = new Set([...EVM_CHAINS.map((c) => c.rpc), ...Object.values(RESERVA)]);
let nextId = 1;
// Depois de uma falha, o principal fica "de castigo" por 60s e vamos direto ao reserva.
const castigo = new Map<string, number>();

class RevertError extends Error {}

// Fila por nó: no máximo 4 consultas ao mesmo tempo para cada endereço, para
// não estourar o limite de uso dos nós públicos quando há muitas fontes.
const MAX_SIMULTANEAS = 4;
const ativos = new Map<string, number>();
const fila = new Map<string, (() => void)[]>();
async function vez(url: string) {
  if ((ativos.get(url) ?? 0) >= MAX_SIMULTANEAS) await new Promise<void>((ok) => { const f = fila.get(url) ?? []; f.push(ok); fila.set(url, f); });
  ativos.set(url, (ativos.get(url) ?? 0) + 1);
}
function liberar(url: string) {
  ativos.set(url, (ativos.get(url) ?? 1) - 1);
  fila.get(url)?.shift()?.();
}

async function tentar(url: string, body: string): Promise<string> {
  for (let t = 0; ; t++) {
    await vez(url);
    try {
      return await tentarUma(url, body);
    } catch (e) {
      // 429 = "devagar": espera e tenta de novo no mesmo nó antes de desistir dele
      if (t < 2 && e instanceof Error && /429|rate limit/i.test(e.message)) {
        await new Promise((ok) => setTimeout(ok, 1500 * (t + 1)));
        continue;
      }
      throw e;
    } finally {
      liberar(url);
    }
  }
}

async function tentarUma(url: string, body: string): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "omit",
    referrerPolicy: "no-referrer",
    body,
  });
  if (!res.ok) throw new Error(`RPC respondeu ${res.status}`);
  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) {
    const m = json.error.message ?? "erro";
    // revert/execution = resposta legítima do contrato; o resto é problema do nó
    if (/revert|execution|invalid opcode|out of gas/i.test(m)) throw new RevertError(m);
    throw new Error(m);
  }
  if (typeof json.result !== "string" || !/^0x[0-9a-fA-F]*$/.test(json.result)) throw new Error("Resposta de RPC inválida");
  return json.result;
}

export async function ethCall(chain: EvmChain, to: string, data: string, from?: string): Promise<string> {
  if (!ALLOWED_RPCS.has(chain.rpc)) throw new Error("RPC fora da lista permitida");
  const tx: Record<string, string> = { to, data };
  if (from) tx.from = from;
  const body = JSON.stringify({ jsonrpc: "2.0", id: nextId++, method: "eth_call", params: [tx, "latest"] });
  const reserva = RESERVA[chain.key];
  const ordem = (castigo.get(chain.rpc) ?? 0) > Date.now() && reserva ? [reserva, chain.rpc] : [chain.rpc, reserva].filter(Boolean);
  let ultimo: unknown;
  for (const url of ordem) {
    try {
      return await tentar(url, body);
    } catch (e) {
      if (e instanceof RevertError) throw e;
      ultimo = e;
      if (url === chain.rpc) castigo.set(chain.rpc, Date.now() + 60_000);
    }
  }
  throw new Error(`Nós da rede ${chain.nome} indisponíveis: ${(ultimo as Error)?.message ?? "erro"}`);
}
