import { test } from "node:test";
import assert from "node:assert/strict";
import { calldata, decodeInt, decodeStringOrBytes32, encodeAddress, encodeInt, encodeUint, isAddress, words } from "../src/lib/abi.ts";

test("encode/decode de inteiros com sinal (ticks negativos)", () => {
  assert.equal(decodeInt(encodeInt(-887220)), -887220n);
  assert.equal(decodeInt(encodeInt(12345)), 12345n);
  assert.equal(encodeUint(255), "0".repeat(62) + "ff");
});

test("symbol() como string ABI", () => {
  const hex = "0x" + encodeUint(32) + encodeUint(4) + Buffer.from("WETH").toString("hex").padEnd(64, "0");
  assert.equal(decodeStringOrBytes32(hex), "WETH");
});

test("symbol() como bytes32 (estilo MKR)", () => {
  assert.equal(decodeStringOrBytes32("0x" + Buffer.from("MKR").toString("hex").padEnd(64, "0")), "MKR");
});

test("validação de endereço e calldata", () => {
  assert.ok(isAddress("0xC36442b4a4522E871399CD717aBDD847Ab11FE88"));
  assert.ok(!isAddress("0x123"));
  assert.throws(() => encodeAddress("nao-e-endereco"));
  const d = calldata("0x70a08231", encodeAddress("0xc36442b4a4522e871399cd717abdd847ab11fe88"));
  assert.equal(d.length, 2 + 8 + 64);
  assert.equal(words("0x" + "00".repeat(64)).length, 2);
});
