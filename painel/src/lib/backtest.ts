// Backtest simplificado de uma faixa de liquidez com candles diários.
// Premissas (mostradas na tela): a participação da posição na liquidez ativa é
// aproximada por (capital × eficiência) / TVL, e as taxas só entram nos dias em
// que o preço de fechamento ficou dentro da faixa.

import type { Candle } from "./gecko.ts";
import { amountsAt, capitalEfficiency, liquidityForValue, valueAt } from "./v3math.ts";

export type BacktestInput = {
  candles: Candle[];
  depositUsd: number;
  quoteUsd: number; // preço do token quote em USD (assumido constante)
  pa: number;
  pb: number;
  feeTier: number;
  tvlUsd: number;
};

export type BacktestResult = {
  days: number;
  daysInRange: number;
  feesUsd: number;
  finalValueUsd: number;
  hodlValueUsd: number;
  pnlUsd: number;
  ilPct: number;
  aprFees: number;
  series: { t: number; price: number; valueUsd: number; feesUsd: number; inRange: boolean }[];
};

export function runBacktest(i: BacktestInput): BacktestResult {
  if (i.candles.length < 2) throw new Error("Histórico insuficiente para backtest");
  if (!(i.pa > 0 && i.pb > i.pa)) throw new Error("Faixa inválida");
  const p0 = i.candles[0].open || i.candles[0].close;
  const valorQuote = i.depositUsd / i.quoteUsd;
  const L = liquidityForValue(valorQuote, p0, i.pa, i.pb);
  const ini = amountsAt(L, p0, i.pa, i.pb);

  let fees = 0;
  let inRangeDays = 0;
  const series: BacktestResult["series"] = [];
  for (const c of i.candles) {
    const inRange = c.close >= i.pa && c.close <= i.pb;
    if (inRange && i.tvlUsd > 0) {
      const eff = capitalEfficiency(c.close, i.pa, i.pb);
      const share = Math.min(1, (i.depositUsd * eff) / i.tvlUsd);
      fees += c.volumeUsd * i.feeTier * share;
      inRangeDays++;
    }
    series.push({ t: c.t, price: c.close, valueUsd: valueAt(L, c.close, i.pa, i.pb) * i.quoteUsd, feesUsd: fees, inRange });
  }
  const pEnd = i.candles[i.candles.length - 1].close;
  const finalValueUsd = valueAt(L, pEnd, i.pa, i.pb) * i.quoteUsd;
  const hodlValueUsd = (ini.x * pEnd + ini.y) * i.quoteUsd;
  const days = i.candles.length;
  return {
    days,
    daysInRange: inRangeDays,
    feesUsd: fees,
    finalValueUsd,
    hodlValueUsd,
    pnlUsd: finalValueUsd + fees - i.depositUsd,
    ilPct: finalValueUsd / hodlValueUsd - 1,
    aprFees: (fees / i.depositUsd) * (365 / days),
    series,
  };
}
