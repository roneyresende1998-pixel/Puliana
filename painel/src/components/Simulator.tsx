import { useEffect, useMemo, useState } from "react";
import { runBacktest, type BacktestResult } from "../lib/backtest.ts";
import { fmtNum, fmtPct, fmtUsd } from "../lib/format.ts";
import type { Pool } from "../lib/gecko.ts";
import { TokenLink } from "./TokenPanel.tsx";
import { fetchHistory, type History } from "../lib/history.ts";
import { amountsAt, capitalEfficiency, impermanentLoss, impermanentLossV2, liquidityForValue, poolFeeApr } from "../lib/v3math.ts";

const PRESETS = [2, 5, 10, 20, 35, 50];

export default function Simulator({ pool }: { pool: Pool | null }) {
  const [preco, setPreco] = useState(2000);
  const [minPct, setMinPct] = useState(10);
  const [maxPct, setMaxPct] = useState(10);
  const [deposito, setDeposito] = useState(1000);
  const [taxa, setTaxa] = useState(0.05);
  const [vol, setVol] = useState(10_000_000);
  const [tvl, setTvl] = useState(20_000_000);
  const [quoteUsd, setQuoteUsd] = useState(1);
  const [dias, setDias] = useState(90);
  const [hist, setHist] = useState<History | null>(null);
  const [bt, setBt] = useState<BacktestResult | null>(null);
  const [btErro, setBtErro] = useState<string | null>(null);
  const [btLoading, setBtLoading] = useState(false);
  const [invertido, setInvertido] = useState(false);

  useEffect(() => {
    if (!pool) return;
    // Mostra o par no sentido "natural" (ex.: USDC por WETH, e não WETH por USDC).
    const inv = pool.priceBaseInQuote > 0 && pool.priceBaseInQuote < 1;
    setInvertido(inv);
    setPreco(inv ? 1 / pool.priceBaseInQuote : pool.priceBaseInQuote || 1);
    setQuoteUsd((inv ? pool.baseUsd : pool.quoteUsd) || 1);
    if (pool.feeTier !== null) setTaxa(pool.feeTier * 100);
    setVol(Math.round(pool.volume24h));
    setTvl(Math.round(pool.tvl));
    setBt(null);
  }, [pool]);

  const pa = preco * (1 - minPct / 100);
  const pb = preco * (1 + maxPct / 100);
  const valido = preco > 0 && pa > 0 && pb > pa && deposito > 0;

  const r = useMemo(() => {
    if (!valido) return null;
    const valorQuote = deposito / quoteUsd;
    const L = liquidityForValue(valorQuote, preco, pa, pb);
    const { x, y } = amountsAt(L, preco, pa, pb);
    const eff = capitalEfficiency(preco, pa, pb);
    const aprPool = poolFeeApr(vol, taxa / 100, tvl);
    const aprPos = aprPool * eff;
    const taxasDia = (deposito * aprPos) / 365;
    const cenarios = [-50, -30, -20, -10, -5, 0, 5, 10, 20, 30, 50].map((c) => {
      const p1 = preco * (1 + c / 100);
      const il = impermanentLoss(preco, p1, pa, pb);
      return { c, il, ilV2: impermanentLossV2(preco, p1), diasEmpate: il < 0 && taxasDia > 0 ? (-il * deposito) / taxasDia : 0 };
    });
    return { x, y, eff, aprPool, aprPos, taxasDia, cenarios };
  }, [valido, preco, pa, pb, deposito, quoteUsd, vol, taxa, tvl]);

  async function backtest() {
    if (!pool) return;
    setBtLoading(true);
    setBtErro(null);
    try {
      if (!(dias >= 1)) throw new Error("Digite um número de dias (1 ou mais).");
      const h = await fetchHistory(pool, dias, invertido);
      setHist(h);
      setBt(runBacktest({ candles: h.candles, depositUsd: deposito, quoteUsd, pa, pb, feeTier: taxa / 100, tvlUsd: tvl }));
    } catch (e) {
      setBtErro((e as Error).message);
    } finally {
      setBtLoading(false);
    }
  }

  const [X, Y] = pool ? (invertido ? [pool.quote, pool.base] : [pool.base, pool.quote]) : ["Token X", "Token Y"];

  function inverter() {
    if (!pool) return;
    setInvertido(!invertido);
    setPreco(1 / preco);
    setQuoteUsd((!invertido ? pool.baseUsd : pool.quoteUsd) || 1);
    setBt(null);
  }

  return (
    <section className="sim">
      <div className="card">
        <h2>Simulador de faixa {pool ? <small>· <TokenLink network={pool.network} address={pool.baseAddress} symbol={pool.base} />/<TokenLink network={pool.network} address={pool.quoteAddress} symbol={pool.quote} /> ({pool.dex})</small> : <small>· escolha uma pool no Explorador ou preencha à mão</small>}</h2>
        <div className="form">
          <label>Preço atual ({Y} por {X})<input type="number" value={preco} min={0} step="any" onChange={(e) => setPreco(Number(e.target.value))} /></label>
          <label>Depósito (USD)<input type="number" value={deposito} min={0} onChange={(e) => setDeposito(Number(e.target.value))} /></label>
          <label>Taxa da pool (%)<input type="number" value={taxa} min={0} step="0.01" onChange={(e) => setTaxa(Number(e.target.value))} /></label>
          <label>Volume 24h (USD)<input type="number" value={vol} min={0} onChange={(e) => setVol(Number(e.target.value))} /></label>
          <label>TVL (USD)<input type="number" value={tvl} min={0} onChange={(e) => setTvl(Number(e.target.value))} /></label>
          <label>Preço do {Y} em USD<input type="number" value={quoteUsd} min={0} step="any" onChange={(e) => setQuoteUsd(Number(e.target.value))} /></label>
          <label>Abaixo do preço (−%)<input type="number" value={minPct} min={0.1} max={99} step="0.5" onChange={(e) => setMinPct(Number(e.target.value))} /></label>
          <label>Acima do preço (+%)<input type="number" value={maxPct} min={0.1} step="0.5" onChange={(e) => setMaxPct(Number(e.target.value))} /></label>
        </div>
        <div className="presets">
          {pool ? <button className="small ghost" onClick={inverter}>⇄ Inverter par</button> : null}
          Faixa rápida: {PRESETS.map((p) => <button key={p} className="small ghost" onClick={() => { setMinPct(p); setMaxPct(p); }}>±{p}%</button>)}
        </div>
        {!valido ? <p className="erro">Preencha preço, faixa e depósito válidos.</p> : null}
      </div>

      {r ? (
        <>
          <div className="cards resumo">
            <div className="card"><span>Faixa</span><strong>{fmtNum(pa)} – {fmtNum(pb)}</strong></div>
            <div className="card"><span>Eficiência vs. full-range</span><strong>{r.eff.toFixed(1)}x</strong></div>
            <div className="card"><span>APR taxas (na faixa)*</span><strong className={r.aprPos > 2 ? "alerta" : "pos"} title={r.aprPos > 2 ? "APR acima de 200%: geralmente pool rasa/arriscada ou volume que não vai se manter" : undefined}>{fmtPct(r.aprPos, 1)}</strong></div>
            <div className="card"><span>Taxas/dia estimadas</span><strong className="pos">{fmtUsd(r.taxasDia)}</strong></div>
          </div>
          <div className="card">
            <h3>Composição do depósito</h3>
            <p>{fmtNum(r.x)} {X} ({fmtUsd(r.x * preco * quoteUsd)}) + {fmtNum(r.y)} {Y} ({fmtUsd(r.y * quoteUsd)})</p>
            <h3>Perda impermanente por cenário de preço</h3>
            <div className="tablewrap">
              <table>
                <thead><tr><th className="num">Variação {X}</th><th className="num">Preço</th><th className="num">IL nesta faixa</th><th className="num">IL full-range</th><th className="num">Em USD</th><th className="num">Dias de taxas p/ empatar*</th></tr></thead>
                <tbody>
                  {r.cenarios.map((c) => (
                    <tr key={c.c}>
                      <td className={`num ${c.c >= 0 ? "pos" : "neg"}`}>{c.c > 0 ? "+" : ""}{c.c}%</td>
                      <td className="num">{fmtNum(preco * (1 + c.c / 100))}</td>
                      <td className="num neg">{fmtPct(c.il)}</td>
                      <td className="num muted">{fmtPct(c.ilV2)}</td>
                      <td className="num neg">{fmtUsd(c.il * deposito)}</td>
                      <td className="num">{c.diasEmpate ? (c.diasEmpate < 1 ? "< 1" : c.diasEmpate.toFixed(0)) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="nota">* Considera que o preço fica dentro da faixa e que o volume/TVL atuais se mantêm. Fora da faixa a posição não rende taxas e fica 100% em um token só.</p>
          </div>

          <div className="card">
            <h3>Backtest com histórico real</h3>
            {pool ? (
              <div className="toolbar">
                <label className="inline">Período
                  <input className="dias" type="number" min={1} max={3650} step={1} value={dias}
                    onChange={(e) => setDias(Math.max(0, Math.floor(Number(e.target.value))))}
                    onKeyDown={(e) => e.key === "Enter" && backtest()} aria-label="Dias de backtest" /> dias
                </label>
                {[7, 30, 90, 180, 365, 730, 1095].map((d) => (
                  <button key={d} className={`small ghost ${dias === d ? "ativo" : ""}`} onClick={() => setDias(d)}>{d < 365 ? `${d}d` : `${d / 365} ano${d > 365 ? "s" : ""}`}</button>
                ))}
                <button onClick={backtest} disabled={btLoading}>{btLoading ? "Buscando histórico…" : "Rodar backtest"}</button>
              </div>
            ) : <p className="muted">Selecione uma pool no Explorador (botão “Simular”) para rodar o backtest com histórico real.</p>}
            {pool ? <p className="muted pequeno">Até 41 dias: velas de 1 hora (preço e volume reais). Até ~6 meses: velas diárias reais. Mais que isso: preço real da DefiLlama e volume estimado pela média do período real.</p> : null}
            {btErro ? <p className="erro">{btErro}</p> : null}
            {bt ? (
              <>
                <div className="cards resumo">
                  <div className="card"><span>Taxas ganhas</span><strong className="pos">{fmtUsd(bt.feesUsd)}</strong></div>
                  <div className="card"><span>Valor final da posição</span><strong>{fmtUsd(bt.finalValueUsd)}</strong></div>
                  <div className="card"><span>vs. só segurar (HODL)</span><strong className={bt.ilPct < 0 ? "neg" : "pos"}>{fmtPct(bt.ilPct)}</strong></div>
                  <div className="card"><span>Resultado total</span><strong className={bt.pnlUsd >= 0 ? "pos" : "neg"}>{fmtUsd(bt.pnlUsd)}</strong></div>
                  <div className="card"><span>Tempo na faixa</span><strong>{fmtNum(bt.daysInRange, 3)}/{fmtNum(bt.days, 4)} dias ({fmtPct(bt.daysInRange / bt.days, 0)})</strong></div>
                  <div className="card"><span>APR taxas realizado</span><strong>{fmtPct(bt.aprFees, 1)}</strong></div>
                </div>
                {hist ? (
                  <p className="muted pequeno">
                    Período analisado: {new Date(hist.inicio * 1000).toLocaleDateString("pt-BR")} até hoje · {hist.candles.length.toLocaleString("pt-BR")} velas de 1 {hist.intervalo}
                    {hist.diasEstimados > 0 ? <> · <span className="alerta">{hist.diasEstimados} dias com volume estimado</span> ({hist.diasReais} com volume real)</> : null}
                    {bt.days + 1 < dias ? <> · <span className="alerta">a pool/token não tem histórico para os {dias} dias pedidos; usei todo o disponível</span></> : null}
                  </p>
                ) : null}
                <Chart bt={bt} pa={pa} pb={pb} />
                <p className="nota">Faixa fixa centrada no preço de HOJE aplicada ao período. Participação aproximada por capital × eficiência ÷ TVL atual. Serve para comparar faixas, não como promessa de retorno.</p>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function Chart({ bt, pa, pb }: { bt: BacktestResult; pa: number; pb: number }) {
  const W = 800, H = 220, pad = 8;
  const ps = bt.series.map((s) => s.price);
  const min = Math.min(...ps, pa) * 0.98, max = Math.max(...ps, pb) * 1.02;
  const x = (i: number) => pad + (i / (bt.series.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / (max - min)) * (H - 2 * pad);
  const linha = bt.series.map((s, i) => `${x(i).toFixed(1)},${y(s.price).toFixed(1)}`).join(" ");
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Preço no período versus a faixa escolhida">
      <rect x={pad} y={y(pb)} width={W - 2 * pad} height={Math.max(1, y(pa) - y(pb))} className="chart-faixa" />
      <polyline points={linha} className="chart-linha" fill="none" />
      <text x={W - pad} y={y(pb) - 4} textAnchor="end" className="chart-txt">máx {fmtNum(pb)}</text>
      <text x={W - pad} y={y(pa) + 14} textAnchor="end" className="chart-txt">mín {fmtNum(pa)}</text>
    </svg>
  );
}
