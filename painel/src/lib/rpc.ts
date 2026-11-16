// Cliente JSON-RPC SOMENTE LEITURA. Só existe `eth_call` aqui — este arquivo
// não tem (e não deve ter) nenhuma forma de enviar transação.

import { EVM_CHAINS, type EvmChain } from "./chains.ts";

const ALLOWED_RPCS = new Set(EVM_CHAINS.map((c) => c.rpc));
let nextId = 1;

export async function ethCall(
  chain: EvmChain,
  to: string,
  data: string,
  from?: string,
): Promise<string> {
  if (!ALLOWED_RPCS.has(chain.rpc)) throw new Error("RPC fora da lista permitida");
  const tx: Record<string, string> = { to, data };
  if (from) tx.from = from;
  const res = await fetch(chain.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "omit",
    referrerPolicy: "no-referrer",
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method: "eth_call", params: [tx, "latest"] }),
  });
  if (!res.ok) throw new Error(`RPC ${chain.nome} respondeu ${res.status}`);
  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  if (typeof json.result !== "string" || !/^0x[0-9a-fA-F]*$/.test(json.result)) {
    throw new Error("Resposta de RPC inválida");
  }
  return json.result;
}

