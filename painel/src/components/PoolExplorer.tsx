import { useEffect, useMemo, useState } from "react";
import { fmtPct, fmtUsd, store } from "../lib/format.ts";
import { fetchDexes, fetchDexPools, fetchNetworks, fetchTopPools, fetchTrendingAll, searchPools, type Pool } from "../lib/gecko.ts";
import { fetchYields, type YieldPool } from "../lib/llama.ts";
import REDES_FIXAS from "../lib/networks.json";
import { TokenLink } from "./TokenPanel.tsx";

type Props = { onSimular: (p: Pool) => void };

export default function PoolExplorer({ onSimular }: Props) {
  const [modo, setModo] = useState<"dex" | "todas">(() => (store.get("explorer.modo") as "dex" | "todas") ?? "dex");
  return (
    <section>
      <div className="seg">
        <button className={`tab ${modo === "dex" ? "ativa" : ""}`} onClick={() => { setModo("dex"); store.set("explorer.modo", "dex"); }}>Pools de DEX · 220+ redes</button>
        <button className={`tab ${modo === "todas" ? "ativa" : ""}`} onClick={() => { setModo("todas"); store.set("explorer.modo", "todas"); }}>Todas as pools de rendimento · DefiLlama</button>
      </div>
      {modo === "dex" ? <DexPools onSimular={onSimular} /> : <AllYields />}
    </section>
  );
}

// ------------------------------------------------------------------ GeckoTerminal
type SortKey = "tvl" | "volume24h" | "feeApr" | "volRatio" | "change24h" | "txs24h";
const POPULARES = ["solana", "eth", "base", "arbitrum", "bsc", "polygon_pos", "optimism", "avax", "unichain", "linea", "sonic", "hyperevm", "sui-network", "ton", "tron"];

function DexPools({ onSimular }: Props) {
  const ordena = (r: { id: string; nome: string }[]) => [...r].sort((a, b) => a.nome.localeCompare(b.nome));
  // Lista embutida (223 redes) — atualizada da API em segundo plano, sem depender dela.
  const [redes, setRedes] = useState<{ id: string; nome: string }[]>(() => ordena(REDES_FIXAS));
  const [network, setNetwork] = useState(() => store.get("explorer.rede") ?? "todas");
  const [dexes, setDexes] = useState<{ id: string; nome: string }[]>([]);
  const [dex, setDex] = useState("todas");
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [minTvl, setMinTvl] = useState(50_000);
  const [sort, setSort] = useState<SortKey>("volume24h");
  const [desc, setDesc] = useState(true);
  const [paginas, setPaginas] = useState(2);

  useEffect(() => { fetchNetworks().then((r) => r.length > REDES_FIXAS.length && setRedes(ordena(r))).catch(() => {}); }, []);
  useEffect(() => {
    setDex("todas");
    setDexes([]);
    store.set("explorer.rede", network);
    if (network !== "todas") fetchDexes(network).then(setDexes).catch(() => {});
  }, [network]);

  async function carregar(q?: string) {
    setLoading(true);
    setErro(null);
    try {
      if (q && q.trim()) {
        setPools(await searchPools(q, network === "todas" ? undefined : network));
      } else {
        const pages = Array.from({ length: paginas }, (_, i) => i + 1);
        const ps = await Promise.all(pages.map((pg) =>
          network === "todas" ? fetchTrendingAll(pg) : dex === "todas" ? fetchTopPools(network, pg) : fetchDexPools(network, dex, pg)));
        const seen = new Set<string>();
        setPools(ps.flat().filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))));
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [network, dex, paginas]);

  const lista = useMemo(() => {
    const val = (p: Pool): number => sort === "volRatio" ? (p.tvl > 0 ? p.volume24h / p.tvl : 0) : ((p[sort] as number | null) ?? -Infinity);
    return pools.filter((p) => p.tvl >= minTvl).sort((a, b) => (desc ? val(b) - val(a) : val(a) - val(b)));
  }, [pools, minTvl, sort, desc]);

  const th = (k: SortKey, label: string, title?: string) => (
    <th className="num clicavel" title={title} onClick={() => (sort === k ? setDesc(!desc) : (setSort(k), setDesc(true)))}>{label} {sort === k ? (desc ? "▼" : "▲") : ""}</th>
  );
  const nomeRede = (id: string) => redes.find((r) => r.id === id)?.nome ?? id;
  const populares = POPULARES.filter((id) => redes.some((r) => r.id === id));

  return (
    <>
      <div className="toolbar">
        <select value={network} onChange={(e) => setNetwork(e.target.value)} aria-label="Rede">
          <option value="todas">🔥 Em alta em todas as redes</option>
          {populares.length ? <optgroup label="Populares">{populares.map((id) => <option key={"p" + id} value={id}>{nomeRede(id)}</option>)}</optgroup> : null}
          <optgroup label={`Todas as redes (${redes.length})`}>{redes.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}</optgroup>
        </select>
        {network !== "todas" ? (
          <select value={dex} onChange={(e) => setDex(e.target.value)} aria-label="DEX">
            <option value="todas">Todas as DEXs{dexes.length ? ` (${dexes.length})` : ""}</option>
            {dexes.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        ) : null}
        <input placeholder="Buscar par, token ou endereço (ex.: SOL USDC)" value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === "Enter" && carregar(busca)} />
        <button onClick={() => carregar(busca)} disabled={loading}>{loading ? "Carregando…" : "Buscar"}</button>
        <label className="inline">TVL mín.
          <select value={minTvl} onChange={(e) => setMinTvl(Number(e.target.value))}>
            {[0, 10_000, 50_000, 100_000, 500_000, 1_000_000, 10_000_000].map((v) => <option key={v} value={v}>{v === 0 ? "qualquer" : fmtUsd(v)}</option>)}
          </select>
        </label>
        <label className="inline">Pools
          <select value={paginas} onChange={(e) => setPaginas(Number(e.target.value))}>
            {[1, 2, 5, 10].map((v) => <option key={v} value={v}>top {v * 20}</option>)}
          </select>
        </label>
      </div>
      {erro ? <p className="erro">{erro}</p> : null}
      <div className="tablewrap">
        <table>
          <thead><tr>
            <th>Pool</th><th>DEX</th>{network === "todas" ? <th>Rede</th> : null}<th className="num">Taxa</th>
            {th("tvl", "TVL")}{th("volume24h", "Volume 24h")}
            {th("volRatio", "Vol/TVL", "Giro diário do capital: quanto maior, mais taxas por dólar depositado")}
            {th("feeApr", "APR taxas*", "Estimativa: volume 24h × taxa ÷ TVL × 365 (média da pool, full-range)")}
            {th("change24h", "Preço 24h")}{th("txs24h", "Txs 24h")}<th></th>
          </tr></thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id}>
                <td><strong><TokenLink network={p.network} address={p.baseAddress} symbol={p.base} /> / <TokenLink network={p.network} address={p.quoteAddress} symbol={p.quote} /></strong></td>
                <td className="muted">{p.dex}</td>
                {network === "todas" ? <td className="muted">{nomeRede(p.network)}</td> : null}
                <td className="num">{p.feeTier === null ? "—" : fmtPct(p.feeTier, 2)}</td>
                <td className="num">{fmtUsd(p.tvl)}</td>
                <td className="num">{fmtUsd(p.volume24h)}</td>
                <td className="num">{p.tvl > 0 ? (p.volume24h / p.tvl).toFixed(2) + "x" : "—"}</td>
                <td className={`num ${p.feeApr && p.feeApr > 2 ? "alerta" : "pos"}`} title={p.feeApr && p.feeApr > 2 ? "APR muito alto costuma indicar pool rasa, token arriscado ou volume artificial" : undefined}>{fmtPct(p.feeApr, 1)}</td>
                <td className={`num ${p.change24h >= 0 ? "pos" : "neg"}`}>{p.change24h.toFixed(2)}%</td>
                <td className="num muted">{p.txs24h.toLocaleString("pt-BR")}</td>
                <td className="acoes">
                  <button className="small" onClick={() => onSimular(p)}>Simular</button>
                  <a className="small" href={`https://www.geckoterminal.com/${p.network}/pools/${p.address}`} target="_blank" rel="noopener noreferrer">Gráfico ↗</a>
                </td>
              </tr>
            ))}
            {!loading && lista.length === 0 ? <tr><td colSpan={11} className="muted">Nenhuma pool com esses filtros.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="nota">* APR de taxas estimado com as últimas 24h e a média da pool. Posições concentradas podem ganhar bem mais (ou nada, fora da faixa). Não inclui perda impermanente. Dados: GeckoTerminal (limite gratuito ~30 consultas/min).</p>
    </>
  );
}

// ------------------------------------------------------------------ DefiLlama
type YSort = "tvlUsd" | "apy" | "apyBase" | "apyMean30d" | "volumeUsd1d";

function AllYields() {
  const [all, setAll] = useState<YieldPool[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chain, setChain] = useState("todas");
  const [project, setProject] = useState("todos");
  const [busca, setBusca] = useState("");
  const [minTvl, setMinTvl] = useState(100_000);
  const [tipo, setTipo] = useState<"todos" | "lp" | "stable" | "single">("lp");
  const [semOutlier, setSemOutlier] = useState(true);
  const [sort, setSort] = useState<YSort>("apyBase");
  const [desc, setDesc] = useState(true);
  const [limite, setLimite] = useState(100);

  useEffect(() => { fetchYields().then(setAll).catch((e) => setErro((e as Error).message)).finally(() => setLoading(false)); }, []);

  const chains = useMemo(() => countBy(all, (p) => p.chain), [all]);
  const projects = useMemo(() => countBy(all.filter((p) => chain === "todas" || p.chain === chain), (p) => p.project), [all, chain]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return all
      .filter((p) => chain === "todas" || p.chain === chain)
      .filter((p) => project === "todos" || p.project === project)
      .filter((p) => p.tvlUsd >= minTvl)
      .filter((p) => tipo === "todos" || (tipo === "lp" ? p.exposure === "multi" : tipo === "stable" ? p.stablecoin : p.exposure === "single"))
      .filter((p) => !semOutlier || !p.outlier)
      .filter((p) => !q || p.symbol.toLowerCase().includes(q) || p.project.includes(q))
      .sort((a, b) => { const x = (a[sort] ?? -1) as number, y = (b[sort] ?? -1) as number; return desc ? y - x : x - y; });
  }, [all, chain, project, busca, minTvl, tipo, semOutlier, sort, desc]);

  const th = (k: YSort, label: string, title?: string) => (
    <th className="num clicavel" title={title} onClick={() => (sort === k ? setDesc(!desc) : (setSort(k), setDesc(true)))}>{label} {sort === k ? (desc ? "▼" : "▲") : ""}</th>
  );
  const pct = (v: number | null) => (v === null || v === undefined ? "—" : fmtPct(v / 100, 1));

  return (
    <>
      <div className="toolbar">
        <select value={chain} onChange={(e) => { setChain(e.target.value); setProject("todos"); }} aria-label="Rede">
          <option value="todas">Todas as redes ({chains.length})</option>
          {chains.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
        </select>
        <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Protocolo">
          <option value="todos">Todos os protocolos ({projects.length})</option>
          {projects.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} aria-label="Tipo">
          <option value="lp">Pools de liquidez (2+ tokens)</option><option value="stable">Só stablecoins</option><option value="single">Token único (staking/lending)</option><option value="todos">Tudo</option>
        </select>
        <input placeholder="Buscar token ou protocolo" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <label className="inline">TVL mín.
          <select value={minTvl} onChange={(e) => setMinTvl(Number(e.target.value))}>
            {[0, 10_000, 100_000, 1_000_000, 10_000_000].map((v) => <option key={v} value={v}>{v === 0 ? "qualquer" : fmtUsd(v)}</option>)}
          </select>
        </label>
        <label className="inline"><input type="checkbox" checked={semOutlier} onChange={(e) => setSemOutlier(e.target.checked)} /> esconder APY anormal</label>
      </div>
      {erro ? <p className="erro">{erro}</p> : null}
      {loading ? <p className="muted">Carregando ~15 mil pools de todas as redes…</p> : <p className="muted">{lista.length.toLocaleString("pt-BR")} pools encontradas</p>}
      <div className="tablewrap">
        <table>
          <thead><tr>
            <th>Pool</th><th>Protocolo</th><th>Rede</th>
            {th("tvlUsd", "TVL")}{th("volumeUsd1d", "Volume 24h")}
            {th("apyBase", "APY taxas", "Rendimento só das taxas de negociação/juros")}
            <th className="num" title="Incentivos em tokens (podem acabar a qualquer hora)">APY incentivo</th>
            {th("apy", "APY total")}{th("apyMean30d", "Média 30d", "Média do APY total nos últimos 30 dias — mais confiável que o valor de hoje")}
            <th>Risco IL</th>
          </tr></thead>
          <tbody>
            {lista.slice(0, limite).map((p) => (
              <tr key={p.id}>
                <td><strong>{p.symbol}</strong>{p.poolMeta ? <small className="muted"> · {p.poolMeta}</small> : null}</td>
                <td className="muted">{p.project}</td>
                <td className="muted">{p.chain}</td>
                <td className="num">{fmtUsd(p.tvlUsd)}</td>
                <td className="num">{p.volumeUsd1d ? fmtUsd(p.volumeUsd1d) : "—"}</td>
                <td className="num pos">{pct(p.apyBase)}</td>
                <td className="num muted">{pct(p.apyReward)}</td>
                <td className={`num ${(p.apy ?? 0) > 200 ? "alerta" : ""}`}>{pct(p.apy)}</td>
                <td className="num">{pct(p.apyMean30d)}</td>
                <td className={p.ilRisk === "yes" ? "alerta" : "pos"}>{p.ilRisk === "yes" ? "sim" : "não"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lista.length > limite ? <p><button className="ghost" onClick={() => setLimite(limite + 200)}>Mostrar mais ({(lista.length - limite).toLocaleString("pt-BR")} restantes)</button></p> : null}
      <p className="nota">Dados: DefiLlama Yields (atualiza ~1x por hora). "APY anormal" = valores estatisticamente fora do padrão, geralmente insustentáveis. Rendimento passado não garante futuro.</p>
    </>
  );
}

function countBy<T>(arr: T[], f: (x: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const x of arr) m.set(f(x), (m.get(f(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
