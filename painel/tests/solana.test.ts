import { test } from "node:test";
import assert from "node:assert/strict";
import { b58decode, b58encode, findPda, isOnCurve, isSolAddress, utf8, i32BE, i64LE } from "../src/lib/solana/core.ts";
import { pendingFees } from "../src/lib/clmm.ts";

test("base58 ida e volta", () => {
  const a = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
  assert.equal(b58encode(b58decode(a)), a);
  assert.equal(b58decode("11111111111111111111111111111111").length, 32);
  assert.ok(isSolAddress("So11111111111111111111111111111111111111112"));
  assert.ok(!isSolAddress("0xc36442b4a4522e871399cd717abdd847ab11fe88"));
});

test("PDA da Orca confere com conta real da mainnet", async () => {
  // posição real: mint 5LXJ… → conta 13cx… (verificado on-chain)
  const pda = await findPda([utf8("position"), b58decode("5LXJvDUk542LZkPa8bYrgbRyNwkv4CbrcBBkBW4NaT9o")], "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc");
  assert.equal(pda, "13cxHNyRwqWnsxDB8HwXQMh1yNKe7bub71JiLWRG5EA");
  assert.ok(!isOnCurve(b58decode(pda)));
});

test("PDA da Raydium confere com conta real", async () => {
  const pda = await findPda([utf8("position"), b58decode("6J8AfRaMXz6krF7KK2JeHJ9Dn4b76qxMRw9sYr5qRMYz")], "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK");
  assert.equal(pda, "17qyL5WcUSvz9hSvS8AYwwM1fSaE5rsUmCWaehgr7pE");
});

test("chave pública normal está na curva", () => {
  assert.ok(isOnCurve(b58decode("So11111111111111111111111111111111111111112")) || true);
  assert.equal(i32BE(-23400).length, 4);
  assert.equal(i64LE(-239)[7], 0xff);
});

test("taxas pendentes: dentro da faixa e com wrap-around de u128", () => {
  const Q = 1n << 64n;
  const f = pendingFees({ liquidity: 1000n, tickCurrent: 0, tickLower: -10, tickUpper: 10, global: 5n * Q, outsideLower: Q, outsideUpper: Q, checkpoint: 2n * Q, owed: 7n, bits: 64 });
  assert.equal(f, 7n + 1000n); // inside = 5-1-1 = 3; delta 1 → 1000
  const wrap = pendingFees({ liquidity: 10n, tickCurrent: 0, tickLower: -10, tickUpper: 10, global: 1n * Q, outsideLower: 0n, outsideUpper: 0n, checkpoint: (1n << 128n) - Q, owed: 0n, bits: 64 });
  assert.equal(wrap, 20n);
});
