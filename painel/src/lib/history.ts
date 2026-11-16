// Histórico para o backtest com QUALQUER número de dias:
//  - até 41 dias: velas de 1 hora do GeckoTerminal (preço e volume reais)
//  - até ~180 dias: velas diárias do GeckoTerminal (preço e volume reais)
//  - além disso: preço diário da DefiLlama (anos de histórico); o volume desses
//    dias antigos é ESTIMADO pela média diária do período com volume real.

import { fetchOhlcv, type Candle } from "./gecko.ts";
import type { Pool } from "./gecko.ts";

export type HistCandle = Candle & { volumeEstimado?: boolean };
export type History = { candles: HistCandle[]; intervalo: "hora" | "dia"; diasReais: number; diasEstimados: number; inicio: number };

const LLAMA: Record<string, string> = { eth: "ethereum", polygon_pos: "polygon", avax: "avax", bsc: "bsc", arbitrum: "arbitrum", base: "base", optimism: "optimism", solana: "solana", unichain: "unichain", linea: "linea", sonic: "sonic" };
const DIA = 86_400;

async function llamaDaily(coin: string, start: number, end: number): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (let s = start; s < end; s += 500 * DIA) {
    const span = Math.min(500, Math.ceil((end - s) / DIA));
    const r = await fetch(`https://coins.llama.fi/chart/${encodeURIComponent(coin)}?start=${s}&span=${span}&period=1d`, { credentials: "omit", referrerPolicy: "no-referrer" });
    if (!r.ok) throw new Error(`DefiLlama respondeu ${r.status}`);
    const j = (await r.json()) as { coins: Record<string, { prices: { timestamp: number; price: number }[] }> };
    for (const p of Object.values(j.coins)[0]?.prices ?? []) out.set(Math.round(p.timestamp / DIA) * DIA, p.price); // arredonda: pontos chegam perto da meia-noite
  }
  return out;
}

export async function fetchHistory(pool: Pool, dias: number, invertido: boolean): Promise<History> {
  const n = Math.max(1, Math.floor(dias));
  let candles: HistCandle[];
  let intervalo: History["intervalo"];
  if (n <= 41) {
    intervalo = "hora";
    candles = await fetchOhlcv(pool.network, pool.address, "hour", n * 24);
  } else {
    intervalo = "dia";
    candles = await fetchOhlcv(pool.network, pool.address, "day", Math.min(n, 1000));
  }
  if (candles.length < 2) throw new Error("Esta pool não tem histórico suficiente no GeckoTerminal.");
  const diasReais = Math.round((candles[candles.length - 1].t - candles[0].t) / DIA) + 1;

  // Precisa de mais dias do que o GeckoTerminal fornece? Completa com a DefiLlama.
  let diasEstimados = 0;
  if (intervalo === "dia" && n > diasReais + 1) {
    const chain = LLAMA[pool.network] ?? pool.network;
    const fim = candles[0].t;
    const inicio = fim - (n - diasReais) * DIA;
    const [pb, pq] = await Promise.all([
      llamaDaily(`${chain}:${pool.baseAddress}`, inicio, fim),
      llamaDaily(`${chain}:${pool.quoteAddress}`, inicio, fim),
    ]);
    const volMedio = candles.reduce((s, c) => s + c.volumeUsd, 0) / candles.length;
    const antigos: HistCandle[] = [];
    for (let t = Math.floor(inicio / DIA) * DIA; t < fim; t += DIA) {
      const b = pb.get(t), q = pq.get(t);
      if (!b || !q) continue;
      const preco = b / q; // base cotado no quote
      antigos.push({ t, open: preco, high: preco, low: preco, close: preco, volumeUsd: volMedio, volumeEstimado: true });
    }
    diasEstimados = antigos.length;
    candles = [...antigos, ...candles];
  }
  if (invertido) {
    candles = candles.map((c) => ({ ...c, open: 1 / c.open, close: 1 / c.close, high: 1 / c.low, low: 1 / c.high }));
  }
  return { candles, intervalo, diasReais, diasEstimados, inicio: candles[0].t };
}
