import { test } from "node:test";
import assert from "node:assert/strict";
import { BlockedMethodError, guardProvider } from "../src/lib/safeWallet.ts";

function fakeWallet() {
  const calls: string[] = [];
  return {
    calls,
    provider: {
      request: async ({ method }: { method: string }) => {
        calls.push(method);
        return method === "eth_chainId" ? "0xa4b1" : ["0xAbC0000000000000000000000000000000000001"];
      },
    },
  };
}

const PERIGOSOS = [
  "eth_sendTransaction", "eth_sendRawTransaction", "eth_sign", "personal_sign",
  "eth_signTypedData", "eth_signTypedData_v3", "eth_signTypedData_v4", "eth_signTransaction",
  "wallet_sendCalls", "wallet_addEthereumChain", "wallet_switchEthereumChain", "wallet_watchAsset",
  "wallet_requestPermissions", "eth_call", "qualquer_coisa", "",
];

test("bloqueia TODO método que assina ou move fundos — sem nem chegar na carteira", async () => {
  const w = fakeWallet();
  const g = guardProvider(w.provider);
  for (const m of PERIGOSOS) {
    await assert.rejects(g.request({ method: m }), BlockedMethodError, m);
  }
  assert.deepEqual(w.calls, [], "nenhuma chamada perigosa pode vazar para a carteira");
});

test("permite apenas leitura do endereço/rede e desconexão", async () => {
  const w = fakeWallet();
  const g = guardProvider(w.provider);
  await g.request({ method: "eth_accounts" });
  await g.request({ method: "eth_requestAccounts" });
  await g.request({ method: "eth_chainId" });
  await g.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
  assert.deepEqual(w.calls, ["eth_accounts", "eth_requestAccounts", "eth_chainId", "wallet_revokePermissions"]);
});

test("wrapper é imutável (não dá para trocar o request depois)", () => {
  const g = guardProvider(fakeWallet().provider);
  assert.throws(() => { (g as { request: unknown }).request = () => 1; });
});
