import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../api/sol.ts";

const req = (body: unknown, origin?: string) =>
  new Request("http://x/api/sol", { method: "POST", body: JSON.stringify(body), headers: origin ? { origin } : {} });

test("retransmissor Solana recusa qualquer método de escrita", async () => {
  let chamou = false;
  globalThis.fetch = (async () => { chamou = true; return new Response("{}"); }) as typeof fetch;
  for (const method of ["sendTransaction", "simulateTransaction", "requestAirdrop", "sendRawTransaction", "x"]) {
    const r = await POST(req({ jsonrpc: "2.0", id: 1, method, params: [] }));
    assert.equal(r.status, 403, method);
  }
  const lote = await POST(req([{ jsonrpc: "2.0", id: 1, method: "getSlot", params: [] }]));
  assert.equal(lote.status, 403, "lotes são recusados");
  assert.equal(chamou, false, "nada pode chegar à RPC");
});

test("retransmissor recusa outros sites e corpo grande; aceita leitura", async () => {
  const destinos: string[] = [];
  globalThis.fetch = (async (u: string) => { destinos.push(u); return new Response('{"result":1}'); }) as typeof fetch;
  assert.equal((await POST(req({ method: "getSlot", params: [] }, "https://site-falso.com"))).status, 403);
  assert.equal((await POST(new Request("http://x", { method: "POST", body: "x".repeat(20000) }))).status, 413);
  const ok = await POST(req({ method: "getMultipleAccounts", params: [["a"]] }, "https://pooliana-painel.vercel.app"));
  assert.equal(ok.status, 200);
  assert.deepEqual(destinos, ["https://api.mainnet-beta.solana.com"]);
});
