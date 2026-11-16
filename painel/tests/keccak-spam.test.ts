import { test } from "node:test";
import assert from "node:assert/strict";
import { keccakHex } from "../src/lib/keccak.ts";
import { isSuspicious, safeSymbol } from "../src/lib/spam.ts";

test("keccak256 com vetores conhecidos", () => {
  assert.equal(keccakHex("0x"), "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
  // seletor balanceOf(address)
  assert.equal(keccakHex("0x" + Buffer.from("balanceOf(address)").toString("hex")).slice(0, 10), "0x70a08231");
  assert.equal(keccakHex("0x" + Buffer.from("getPoolAndPositionInfo(uint256)").toString("hex")).slice(0, 10), "0x7ba03aad");
});

test("detecta tokens-golpe de airdrop", () => {
  for (const s of ["www`discord`gg/DCPrime", "Visit uni-claim.com", "t.me/freeeth", "$ CLAIM REWARD"]) assert.ok(isSuspicious(s), s);
  for (const s of ["WETH", "USDC", "cbBTC", "SOL", "RENDER"]) assert.ok(!isSuspicious(s), s);
  assert.equal(safeSymbol("<script>"), "script");
});
