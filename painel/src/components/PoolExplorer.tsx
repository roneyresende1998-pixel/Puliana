import { useEffect, useMemo, useState } from "react";
import { EXPLORER_NETWORKS } from "../lib/chains.ts";
import { fmtPct, fmtUsd } from "../lib/format.ts";
import { fetchTopPools, searchPools, type Pool } from "../lib/gecko.ts";

type SortKey = "tvl" | "volume24h" | "feeApr" | "volRatio" | "change24h" | "txs24h";
type Props = { onSimular: (p: Pool) => void };

export default function PoolExplorer({ onSimular }: Props) {
  const [network, setNetwork] = useState("arbitrum");
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [minTvl, setMinTvl] = useState(100_000);
  const [sort, setSort] = useState<SortKey>("feeApr");
  const [desc, setDesc] = useState(true);
  const [paginas, setPaginas] = useState(2);

  async function carregar(q?: string) {
    setLoading(true);
    setErro(null);
    try {
      if (q && q.trim()) {
        setPools(await searchPools(q, network));
      } else {
        const ps = await Promise.all(Array.from({ length: paginas }, (_, i) => fetchTopPools(network, i + 1)));
        const seen = new Set<string>();
        setPools(ps.flat().filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))));
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [network, paginas]);

  const lista = useMemo(() => {
    const val = (p: Pool): number =>
      sort === "volRatio" ? (p.tvl > 0 ? p.volume24h / p.tvl : 0) : ((p[sort] as number | null) ?? -Infinity);
    return pools
      .filter((p) => p.tvl >= minTvl)
      .sort((a, b) => (desc ? val(b) - val(a) : val(a) - val(b)));
  }, [pools, minTvl, sort, desc]);

  const th = (k: SortKey, label: string, title?: string) => (
    <th className="num clicavel" title={title} onClick={() => (sort === k ? setDesc(!desc) : (setSort(k), setDesc(true)))}>
      {label} {sort === k ? (desc ? "▼" : "▲") : ""}
    </th>
  );

  return (
    <section>
      <div className="toolbar">
        <select value={network} onChange={(e) => setNetwork(e.target.value)} aria-label="Rede">
          {EXPLORER_NETWORKS.map((n) => <option key={n.gecko} value={n.gecko}>{n.nome}</option>)}
        </select>
        <input
          placeholder="Buscar par ou token (ex.: WETH USDC)"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && carregar(busca)}
        />
        <button onClick={() => carregar(busca)} disabled={loading}>{loading ? "Carregando…" : "Buscar"}</button>
        <label className="inline">
          TVL mín.
          <select value={minTvl} onChange={(e) => setMinTvl(Number(e.target.value))}>
            {[0, 10_000, 100_000, 500_000, 1_000_000, 10_000_000].map((v) => <option key={v} value={v}>{v === 0 ? "qualquer" : fmtUsd(v)}</option>)}
          </select>
        </label>
        <label className="inline">
          Pools
          <select value={paginas} onChange={(e) => setPaginas(Number(e.target.value))}>
            {[1, 2, 5].map((v) => <option key={v} value={v}>top {v * 20}</option>)}
          </select>
        </label>
      </div>
      {erro ? <p className="erro">{erro}</p> : null}
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Pool</th>
              <th>DEX</th>
              <th className="num">Taxa</th>
              {th("tvl", "TVL")}
              {th("volume24h", "Volume 24h")}
              {th("volRatio", "Vol/TVL", "Giro diário do capital: quanto maior, mais taxas por dólar depositado")}
              {th("feeApr", "APR taxas*", "Estimativa: volume 24h × taxa ÷ TVL × 365 (média da pool, full-range)")}
              {th("change24h", "Preço 24h")}
              {th("txs24h", "Txs 24h")}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.base} / {p.quote}</strong></td>
                <td className="muted">{p.dex}</td>
                <td className="num">{p.feeTier === null ? "—" : fmtPct(p.feeTier, 2)}</td>
                <td className="num">{fmtUsd(p.tvl)}</td>
                <td className="num">{fmtUsd(p.volume24h)}</td>
                <td className="num">{p.tvl > 0 ? (p.volume24h / p.tvl).toFixed(2) + "x" : "—"}</td>
                <td className={`num ${p.feeApr && p.feeApr > 2 ? "alerta" : "pos"}`} title={p.feeApr && p.feeApr > 2 ? "APR muito alto costuma indicar pool rasa, token arriscado ou volume artificial" : undefined}>
                  {fmtPct(p.feeApr, 1)}
                </td>
                <td className={`num ${p.change24h >= 0 ? "pos" : "neg"}`}>{p.change24h.toFixed(2)}%</td>
                <td className="num muted">{p.txs24h.toLocaleString("pt-BR")}</td>
                <td className="acoes">
                  <button className="small" onClick={() => onSimular(p)}>Simular</button>
                  <a className="small" href={`https://www.geckoterminal.com/${p.network}/pools/${p.address}`} target="_blank" rel="noopener noreferrer">Gráfico ↗</a>
                </td>
              </tr>
            ))}
            {!loading && lista.length === 0 ? <tr><td colSpan={10} className="muted">Nenhuma pool com esses filtros.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="nota">* APR de taxas é uma estimativa baseada nas últimas 24h e na média da pool. Posições concentradas podem ganhar bem mais (ou nada, fora da faixa). Não inclui perda impermanente. Dados: GeckoTerminal.</p>
    </section>
  );
}
