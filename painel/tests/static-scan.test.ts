// Varredura estática: garante que o código do site nunca passe a pedir
// assinatura/transação ou a usar APIs perigosas de injeção de HTML.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const PROIBIDO = [
  /eth_send/i, /eth_sign/i, /personal_sign/i, /signTypedData/i, /signTransaction/i,
  /wallet_sendCalls/i, /wallet_switchEthereumChain/i, /approve\s*\(/i, /setApprovalForAll/i,
  /dangerouslySetInnerHTML/, /innerHTML/, /\beval\s*\(/, /new Function\s*\(/,
  /privateKey|mnemonic|seed phrase|seedPhrase/i,
];

test("nenhum arquivo do site contém chamadas de assinatura, aprovação ou injeção de HTML", () => {
  const src = new URL("../src", import.meta.url).pathname;
  const api = new URL("../api", import.meta.url).pathname;
  for (const f of [...files(src), ...files(api)]) {
    const txt = readFileSync(f, "utf8");
    for (const re of PROIBIDO) assert.ok(!re.test(txt), `${f} contém padrão proibido ${re}`);
  }
});

test("fetch só para hosts permitidos", () => {
  const src = new URL("../src", import.meta.url).pathname;
  const hosts = new Set<string>();
  for (const f of files(src)) {
    for (const m of readFileSync(f, "utf8").matchAll(/"https:\/\/([a-z0-9.-]+)/g)) hosts.add(m[1]);
  }
  const permitidos = /([a-z]+\.drpc\.org|api\.coingecko\.com|www\.coingecko\.com|x\.com|t\.me|\.publicnode\.com|api\.mainnet-beta\.solana\.com|coins\.llama\.fi|yields\.llama\.fi|solscan\.io|www\.orca\.so|raydium\.io|app\.meteora\.ag|pancakeswap\.finance|www\.sushi\.com|aerodrome\.finance|velodrome\.finance|snowtrace\.io|uniscan\.xyz|lineascan\.build|optimistic\.etherscan\.io|api\.geckoterminal\.com|scan\.(io|org|com)|etherscan\.io|polygonscan\.com|bscscan\.com|arbiscan\.io|basescan\.org|revoke\.cash|app\.uniswap\.org|www\.geckoterminal\.com)$/;
  for (const h of hosts) assert.match(h, permitidos, `host não previsto: ${h}`);
});
