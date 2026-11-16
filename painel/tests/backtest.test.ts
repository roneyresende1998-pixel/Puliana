import { test } from "node:test";
import assert from "node:assert/strict";
import { runBacktest } from "../src/lib/backtest.ts";

test("backtest: preço parado dentro da faixa só acumula taxas", () => {
  const candles = Array.from({ length: 30 }, (_, i) => ({ t: i * 86400, open: 2000, high: 2010, low: 1990, close: 2000, volumeUsd: 1_000_000 }));
  const r = runBacktest({ candles, depositUsd: 1000, quoteUsd: 1, pa: 1800, pb: 2200, feeTier: 0.003, tvlUsd: 10_000_000 });
  assert.equal(r.daysInRange, 30);
  assert.equal(r.days, 30);
  assert.ok(r.feesUsd > 0);
  assert.ok(Math.abs(r.finalValueUsd - 1000) < 1e-6);
  assert.ok(Math.abs(r.ilPct) < 1e-9);
});

test("backtest: preço sai da faixa → sem taxas nesses dias e IL negativa", () => {
  const candles = Array.from({ length: 10 }, (_, i) => ({ t: i * 86400, open: 2000, high: 0, low: 0, close: i < 2 ? 2000 : 2600, volumeUsd: 1e6 }));
  const r = runBacktest({ candles, depositUsd: 1000, quoteUsd: 1, pa: 1800, pb: 2200, feeTier: 0.003, tvlUsd: 1e7 });
  assert.ok(Math.abs(r.daysInRange - 2) < 1e-9);
  assert.equal(r.days, 10);
  assert.ok(r.ilPct < 0);
});

import { mergeCandles } from "../src/lib/gecko.ts";
test("candles: preço em token + volume em USD, alinhados por timestamp", () => {
  const tok = [[2, 1, 1, 1, 1.1, 5], [1, 1, 1, 1, 1.0, 4], [3, 1, 1, 1, 1.2, 6]];
  const usd = [[1, 0, 0, 0, 0, 4000], [2, 0, 0, 0, 0, 5000]];
  const c = mergeCandles(tok, usd);
  assert.deepEqual(c.map((x) => [x.t, x.close, x.volumeUsd]), [[1, 1.0, 4000], [2, 1.1, 5000]]);
});

test("backtest com velas de 1 hora: período e APR em dias corretos", () => {
  const candles = Array.from({ length: 48 }, (_, i) => ({ t: i * 3600, open: 2000, high: 2000, low: 2000, close: 2000, volumeUsd: 1e6 / 24 }));
  const r = runBacktest({ candles, depositUsd: 1000, quoteUsd: 1, pa: 1800, pb: 2200, feeTier: 0.003, tvlUsd: 1e7 });
  assert.equal(r.days, 2);
  const diario = runBacktest({ candles: [0, 1].map((d) => ({ t: d * 86400, open: 2000, high: 2000, low: 2000, close: 2000, volumeUsd: 1e6 })), depositUsd: 1000, quoteUsd: 1, pa: 1800, pb: 2200, feeTier: 0.003, tvlUsd: 1e7 });
  assert.ok(Math.abs(r.feesUsd - diario.feesUsd) < 1e-6, "mesmo volume total → mesmas taxas");
  assert.ok(Math.abs(r.aprFees - diario.aprFees) < 1e-9);
});
