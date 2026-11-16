import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amountsAt, capitalEfficiency, impermanentLoss, impermanentLossV2, liquidityForValue,
  parseFeeFromName, poolFeeApr, tickToPrice, valueAt,
} from "../src/lib/v3math.ts";

const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} ≈ ${b}`);

test("tick → preço (WETH/USDC, decimais 18/6)", () => {
  // tick 0 com dec0=18, dec1=6 → 1e12
  close(tickToPrice(0, 18, 6), 1e12);
  close(tickToPrice(-200000, 18, 6), Math.pow(1.0001, -200000) * 1e12);
});

test("depósito vale exatamente o valor depositado no preço inicial", () => {
  const L = liquidityForValue(1000, 2000, 1500, 2500);
  close(valueAt(L, 2000, 1500, 2500), 1000);
  const { x, y } = amountsAt(L, 1400, 1500, 2500);
  assert.ok(x > 0 && y === 0, "abaixo da faixa fica 100% no token X");
});

test("faixa muito larga ≈ v2 (eficiência ~1 e IL ~ v2)", () => {
  close(capitalEfficiency(2000, 2000 / 1e6, 2000 * 1e6), 1, 1e-2);
  close(impermanentLoss(2000, 3000, 2000 / 1e8, 2000 * 1e8), impermanentLossV2(2000, 3000), 1e-3);
});

test("faixa estreita: mais eficiência e mais IL", () => {
  assert.ok(capitalEfficiency(2000, 1900, 2100) > 10);
  assert.ok(impermanentLoss(2000, 2100, 1900, 2100) < impermanentLossV2(2000, 2100));
});

test("APR da pool e parse da taxa", () => {
  close(poolFeeApr(1_000_000, 0.003, 10_000_000), 0.1095);
  assert.equal(parseFeeFromName("USDC / WETH 0.05%"), 0.0005);
  assert.equal(parseFeeFromName("SOL / USDC"), null);
});
