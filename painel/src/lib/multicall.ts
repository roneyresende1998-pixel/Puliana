// Multicall3 genérico (somente eth_call): várias leituras numa única chamada.
// Endereço idêntico em todas as redes EVM suportadas.

import type { EvmChain } from "./chains.ts";
import { ethCall } from "./rpc.ts";

export const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
const w = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");

export type Call = { target: string; data: string };
export type CallResult = { ok: boolean; data: string }; // data em hex sem 0x

export function encodeAggregate3(calls: Call[]): string {
  const items = calls.map((c) => {
    const d = c.data.replace(/^0x/, "");
    const len = d.length / 2;
    const padded = d.padEnd(Math.ceil(len / 32) * 64, "0");
    return w(BigInt(c.target)) + w(1) + w(96) + w(len) + padded;
  });
  let head = "", off = calls.length * 32;
  for (const it of items) { head += w(off); off += it.length / 2; }
  return "0x82ad56cb" + w(32) + w(calls.length) + head + items.join("");
}

export function decodeAggregate3(hex: string, n: number): CallResult[] {
  const h = hex.replace(/^0x/, "");
  const W = (i: number) => h.slice(i * 64, i * 64 + 64);
  const out: CallResult[] = [];
  for (let i = 0; i < n; i++) {
    const o = parseInt(W(2 + i), 16) / 32 + 2;
    const ok = parseInt(W(o), 16) === 1;
    const d = parseInt(W(o + 1), 16) / 32 + o;
    const len = parseInt(W(d), 16);
    out.push({ ok, data: h.slice((d + 1) * 64, (d + 1) * 64 + len * 2) });
  }
  return out;
}

/** Executa muitas leituras em lotes (padrão 500 por chamada, 6 em paralelo). */
export async function multicall(chain: EvmChain, calls: Call[], lote = 500): Promise<CallResult[]> {
  const out: CallResult[] = new Array(calls.length);
  const starts: number[] = [];
  for (let s = 0; s < calls.length; s += lote) starts.push(s);
  for (let i = 0; i < starts.length; i += 6) {
    await Promise.all(starts.slice(i, i + 6).map(async (s) => {
      const part = calls.slice(s, s + lote);
      let r: string | null = null;
      let erro: unknown = null;
      for (let t = 0; t < 3 && r === null; t++) {
        try { r = await ethCall(chain, MULTICALL3, encodeAggregate3(part)); } catch (e) { erro = e; await new Promise((ok) => setTimeout(ok, 700 * (t + 1))); }
      }
      // Nunca devolver "vazio" calado: se o lote inteiro falhou, a fonte tem que aparecer como erro.
      if (r === null) throw erro instanceof Error ? erro : new Error("falha no Multicall");
      const dec = decodeAggregate3(r, part.length);
      dec.forEach((x, k) => { out[s + k] = x; });
    }));
  }
  return out;
}
