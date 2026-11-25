import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeAddress, encodeInt, encodeUint } from "../src/lib/abi.ts";
import { V3_PROTOCOLS } from "../src/lib/chains.ts";
import { loadProtocolPositions } from "../src/lib/uniswap.ts";

const OWNER = "0x00000000000000000000000000000000000000aa";
const T0 = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1"; // WETH
const T1 = "0xaf88d065e77c8cc2239327c5edb3a432268e5831"; // USDC
const POOL = "0xc6962004f452be9203591991d15f6b388e09e8d0";
const FACTORY = "0x1f98431c8ad98523631ae4a59f267346ea31f984";
const str = (s: string) => "0x" + encodeUint(32) + encodeUint(s.length) + Buffer.from(s).toString("hex").padEnd(64, "0");

test("lê posições Uniswap v3 de um endereço só com eth_call", async () => {
  const methods: string[] = [];
  // preço ~ 2000 USDC/WETH → tick ≈ ln(2000e-12)/ln(1.0001)
  const tick = Math.floor(Math.log(2000e-12) / Math.log(1.0001));
  const sqrtX96 = BigInt(Math.floor(Math.sqrt(Math.pow(1.0001, tick)) * 2 ** 96));
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    methods.push(body.method);
    const { to, data } = body.params[0];
    const sel = data.slice(0, 10);
    let result = "0x";
    if (sel === "0x70a08231") result = "0x" + encodeUint(1);
    else if (sel === "0x2f745c59") result = "0x" + encodeUint(777);
    else if (sel === "0x99fbab88")
      result = "0x" + [encodeUint(0), encodeAddress(OWNER), encodeAddress(T0), encodeAddress(T1), encodeUint(500),
        encodeInt(tick - 1000), encodeInt(tick + 1000), encodeUint(10n ** 15n), encodeUint(0), encodeUint(0), encodeUint(0), encodeUint(0)].join("");
    else if (sel === "0xc45a0155") result = "0x" + encodeAddress(FACTORY);
    else if (sel === "0x1698ee82") result = "0x" + encodeAddress(POOL);
    else if (sel === "0x3850c7bd") result = "0x" + encodeUint(sqrtX96) + encodeInt(tick) + encodeUint(0).repeat(5);
    else if (sel === "0x95d89b41") result = str(to === T0 ? "WETH" : "USDC");
    else if (sel === "0x313ce567") result = "0x" + encodeUint(to === T0 ? 18 : 6);
    else if (sel === "0xfc6f7865") result = "0x" + encodeUint(10n ** 15n) + encodeUint(2_500_000);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
  }) as typeof fetch;

  const proto = V3_PROTOCOLS.find((x) => x.chain === "arbitrum" && x.nome === "Uniswap v3")!;
  const [p] = await loadProtocolPositions(proto, OWNER, false);
  assert.equal(p.id, "777");
  assert.equal(p.token0.symbol, "WETH");
  assert.equal(p.token1.symbol, "USDC");
  assert.equal(p.fee, 0.0005);
  assert.ok(p.inRange);
  assert.ok(Math.abs(p.priceCurrent - 2000) / 2000 < 0.001, `preço ${p.priceCurrent}`);
  assert.ok(p.priceLower < 2000 && p.priceUpper > 2000);
  assert.ok(p.amount0 > 0 && p.amount1 > 0);
  assert.equal(p.fees1, 2.5);
  assert.ok(methods.every((m) => m === "eth_call"), "somente eth_call");
});

import { decodeOwnerOfBatch, encodeOwnerOfBatch } from "../src/lib/uniswapV4.ts";
test("multicall ownerOf: codifica e decodifica lotes (inclusive NFT queimado)", () => {
  const pm = "0x7c5f5a4bbd8fd63184577525326123b519429bdc";
  const data = encodeOwnerOfBatch(pm, [1, 2]);
  assert.ok(data.startsWith("0x82ad56cb"));
  assert.ok(data.includes("6352211e" + (1).toString(16).padStart(64, "0")));
  // resposta: [ (true, dono A), (false, vazio) ]
  const W = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");
  const A = "00000000000000000000000000000000000000aa";
  const item1 = W(1) + W(64) + W(32) + A.padStart(64, "0");
  const item2 = W(0) + W(64) + W(0);
  const resp = "0x" + W(32) + W(2) + W(64) + W(64 + item1.length / 2) + item1 + item2;
  assert.deepEqual(decodeOwnerOfBatch(resp, 2), ["0x" + A, null]);
});

import { ethCall } from "../src/lib/rpc.ts";
import { chainByKey as cbk } from "../src/lib/chains.ts";
test("RPC: cai para o nó reserva se o principal falhar, mas não em revert", async () => {
  const chamados: string[] = [];
  globalThis.fetch = (async (u: string) => {
    chamados.push(String(u));
    if (String(u).includes("publicnode")) return new Response("bloqueado", { status: 403 });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x01" }));
  }) as typeof fetch;
  assert.equal(await ethCall(cbk("bsc"), "0x0000000000000000000000000000000000000001", "0x"), "0x01");
  assert.ok(chamados[0].includes("publicnode") && chamados[1].includes("drpc"));
  // revert é resposta legítima: não tenta outro nó
  chamados.length = 0;
  globalThis.fetch = (async (u: string) => { chamados.push(String(u)); return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "execution reverted" } })); }) as typeof fetch;
  await assert.rejects(ethCall(cbk("eth"), "0x0000000000000000000000000000000000000001", "0x"), /revert/);
  assert.equal(chamados.length, 1);
});
