import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeAggregate3, encodeAggregate3 } from "../src/lib/multicall.ts";

const W = (n: bigint | number) => BigInt(n).toString(16).padStart(64, "0");

test("multicall genérico: calldata de tamanhos variados e resultados uint256[]", () => {
  const enc = encodeAggregate3([
    { target: "0x00000000000000000000000000000000000000a1", data: "0x4b937763" + W(0xabc) },
    { target: "0x00000000000000000000000000000000000000a2", data: "0x1f7b6d32" },
  ]);
  assert.ok(enc.startsWith("0x82ad56cb"));
  assert.equal((enc.length - 10) % 64, 0, "codificação alinhada em palavras de 32 bytes");
  // resposta: item 1 = (true, abi.encode(uint256[]{7, 9})), item 2 = (false, "")
  const arr = W(32) + W(2) + W(7) + W(9);
  const item1 = W(1) + W(64) + W(arr.length / 2) + arr;
  const item2 = W(0) + W(64) + W(0);
  const resp = "0x" + W(32) + W(2) + W(64) + W(64 + item1.length / 2) + item1 + item2;
  const [a, b] = decodeAggregate3(resp, 2);
  assert.equal(a.ok, true);
  assert.equal(BigInt("0x" + a.data.slice(64, 128)), 2n);
  assert.equal(BigInt("0x" + a.data.slice(128, 192)), 7n);
  assert.equal(BigInt("0x" + a.data.slice(192, 256)), 9n);
  assert.equal(b.ok, false);
});
