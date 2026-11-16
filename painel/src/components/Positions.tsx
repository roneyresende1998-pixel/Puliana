import { useEffect, useMemo, useRef, useState } from "react";
import { EVM_CHAINS } from "../lib/chains.ts";
import { fmtNum, fmtPct, fmtUsd, shortAddr, store } from "../lib/format.ts";
import type { LpPosition } from "../lib/positions.ts";
import { fetchPrices } from "../lib/prices.ts";
import { scanAddress, type ScanResult, type SourceStatus } from "../lib/scanner.ts";
import { isSuspicious, safeSymbol } from "../lib/spam.ts";
import type { Wallet } from "./WalletBar.tsx";

type Row = LpPosition & { wallet: string; valueUsd: number | null; feesUsd: number | null; suspeita: boolean };
type V4Id = { chain: string; id: string };

function loadV4Ids(): V4Id[] {
  try { const v = JSON.parse(store.get("v4ids") ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

export default function Positions({ wallets }: { wallets: Wallet[] }) {
  const [fechadas, setFechadas] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<(SourceStatus & { wallet: string })[]>([]);
  const [v4Counts, setV4Counts] = useState<(ScanResult["v4Counts"][number] & { wallet: string })[]>([]);
  const [v4Ids, setV4Ids] = useState<V4Id[]>(loadV4Ids);
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [fRede, setFRede] = useState("todas");
  const [fProto, setFProto] = useState("todos");
  const [fStatus, setFStatus] = useState<"todas" | "dentro" | "fora">("todas");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<"valor" | "taxas">("valor");
  const [inverter, setInverter] = useState<Record<string, boolean>>({});
  const [verFontes, setVerFontes] = useState(false);
  const geracao = useRef(0); // descarta resultados de buscas antigas

  async function carregar() {
    if (wallets.length === 0) return;
    const minha = ++geracao.current;
    const atual = () => minha === geracao.current;
    setLoading(true);
    setRows([]);
    setStatus([]);
    setV4Counts([]);
    const all: Row[] = [];
    const st: (SourceStatus & { wallet: string })[] = [];
    const v4c: (ScanResult["v4Counts"][number] & { wallet: string })[] = [];
    await Promise.all(wallets.map(async (w) => {
      try {
        const r = await scanAddress(w.address, { includeClosed: fechadas, v4Ids, onProgress: (m) => atual() && setProgresso(m) });
        st.push(...r.status.map((s) => ({ ...s, wallet: w.address })));
        v4c.push(...r.v4Counts.map((c) => ({ ...c, wallet: w.address })));
        all.push(...r.positions.map((p) => ({ ...p, wallet: w.address, valueUsd: null, feesUsd: null, suspeita: isSuspicious(p.token0.symbol) || isSuspicious(p.token1.symbol) })));
      } catch (e) {
        st.push({ fonte: "Carteira", ok: false, qtd: 0, erro: (e as Error).message, wallet: w.address });
      }
    }));
    if (!atual()) return;
    setProgresso("Buscando preços…");
    const prices = await fetchPrices(all.flatMap((p) => [{ chainKey: p.chainKey, address: p.token0.address }, { chainKey: p.chainKey, address: p.token1.address }]));
    for (const r of all) {
      const a = prices.get(`${r.chainKey}:${r.token0.address.toLowerCase()}`);
      const b = prices.get(`${r.chainKey}:${r.token1.address.toLowerCase()}`);
      if (a !== undefined && b !== undefined && !r.suspeita) {
        r.valueUsd = r.amount0 * a + r.amount1 * b;
        r.feesUsd = r.fees0 * a + r.fees1 * b;
      }
    }
    if (!atual()) return;
    // remove duplicadas (mesma posição lida duas vezes)
    const seen = new Set<string>();
    setRows(all.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true))));
    setStatus(st);
    setV4Counts(v4c);
    setProgresso(null);
    setLoading(false);
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [wallets, fechadas, v4Ids]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows
      .filter((r) => fRede === "todas" || r.chainKey === fRede)
      .filter((r) => fProto === "todos" || r.protocol === fProto)
      .filter((r) => fStatus === "todas" || (fStatus === "dentro" ? r.inRange : !r.inRange && !r.closed))
      .filter((r) => !q || `${r.token0.symbol}/${r.token1.symbol}`.toLowerCase().includes(q))
      .sort((a, b) => (ordem === "valor" ? (b.valueUsd ?? -1) - (a.valueUsd ?? -1) : (b.feesUsd ?? -1) - (a.feesUsd ?? -1)));
  }, [rows, fRede, fProto, fStatus, busca, ordem]);

  if (wallets.length === 0) {
    return (
      <section className="vazio">
        <h2>Minhas posições</h2>
        <p>Conecte uma carteira <b>EVM</b> ou <b>Solana</b> (somente leitura), ou cole qualquer endereço no campo <b>Observar</b>.</p>
        <p>Pode adicionar várias carteiras: tudo aparece somado aqui.</p>
        <p className="muted">Lê: Uniswap v3 e v4, PancakeSwap v3, SushiSwap v3, Aerodrome, Velodrome (9 redes EVM) e Orca, Raydium CLMM e Meteora DLMM (Solana).</p>
      </section>
    );
  }

  const validas = lista.filter((r) => !r.suspeita);
  const total = validas.reduce((s, r) => s + (r.valueUsd ?? 0), 0);
  const totalFees = validas.reduce((s, r) => s + (r.feesUsd ?? 0), 0);
  const ativas = validas.filter((r) => !r.closed);
  const dentro = ativas.filter((r) => r.inRange).length;
  const semPreco = validas.some((r) => r.valueUsd === null);
  const redes = [...new Set(rows.map((r) => r.chainKey))];
  const protos = [...new Set(rows.map((r) => r.protocol))];
  const falhas = status.filter((s) => !s.ok);
  const porRede = redes.map((k) => ({ k, nome: rows.find((r) => r.chainKey === k)!.chainName, v: validas.filter((r) => r.chainKey === k).reduce((s, r) => s + (r.valueUsd ?? 0), 0) })).sort((a, b) => b.v - a.v);

  return (
    <section>
      <div className="toolbar">
        <select value={fRede} onChange={(e) => setFRede(e.target.value)} aria-label="Rede">
          <option value="todas">Todas as redes</option>
          {redes.map((k) => <option key={k} value={k}>{rows.find((r) => r.chainKey === k)!.chainName}</option>)}
        </select>
        <select value={fProto} onChange={(e) => setFProto(e.target.value)} aria-label="Protocolo">
          <option value="todos">Todos os protocolos</option>
          {protos.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value as typeof fStatus)} aria-label="Status">
          <option value="todas">Todas</option><option value="dentro">Na faixa</option><option value="fora">Fora da faixa</option>
        </select>
        <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)} aria-label="Ordenar">
          <option value="valor">Maior valor</option><option value="taxas">Mais taxas</option>
        </select>
        <input placeholder="Buscar par (ex.: SOL/USDC)" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <label className="inline"><input type="checkbox" checked={fechadas} onChange={(e) => setFechadas(e.target.checked)} /> fechadas</label>
        <button onClick={carregar} disabled={loading}>{loading ? "Lendo blockchains…" : "Atualizar"}</button>
      </div>

      <div className="cards resumo">
        <div className="card"><span>Valor em posições</span><strong>{fmtUsd(total)}{semPreco ? "*" : ""}</strong></div>
        <div className="card"><span>Taxas não coletadas</span><strong className="pos">{fmtUsd(totalFees)}</strong></div>
        <div className="card"><span>Posições ativas</span><strong>{ativas.length}</strong></div>
        <div className="card"><span>Dentro da faixa</span><strong className={dentro === ativas.length ? "pos" : "alerta"}>{dentro}/{ativas.length}</strong></div>
      </div>
      {porRede.length > 1 ? (
        <p className="muted porrede">{porRede.map((r) => <span key={r.k}>{r.nome}: <b>{fmtUsd(r.v)}</b></span>)}</p>
      ) : null}

      {progresso ? <p className="muted">⏳ {progresso}</p> : null}
      {semPreco ? <p className="muted">* Alguns tokens estão sem preço (pouca liquidez) e ficaram fora do total.</p> : null}

      <V4Box counts={v4Counts} ids={v4Ids} onIds={(v) => { store.set("v4ids", JSON.stringify(v)); setV4Ids(v); }} />

      {!loading && lista.length === 0 ? <p className="muted">Nenhuma posição encontrada com esses filtros.</p> : null}

      <div className="posgrid">
        {lista.map((r) => {
          const inv = inverter[r.key] ?? (r.priceCurrent > 0 && r.priceCurrent < 1);
          const s0 = safeSymbol(r.token0.symbol), s1 = safeSymbol(r.token1.symbol);
          const [base, quote] = inv ? [s1, s0] : [s0, s1];
          const f = (x: number) => (inv ? 1 / x : x);
          const lo = Math.min(f(r.priceLower), f(r.priceUpper)), hi = Math.max(f(r.priceLower), f(r.priceUpper));
          const cur = f(r.priceCurrent);
          return (
            <article className={`posicao card ${r.suspeita ? "suspeita" : ""}`} key={r.key + r.wallet}>
              <header>
                <strong>{s0} / {s1}</strong>
                {r.fee !== null ? <span className="badge">{fmtPct(r.fee, r.fee < 0.0005 ? 3 : 2)}</span> : null}
                <span className="badge">{r.protocol}</span>
                <span className="badge">{r.chainName}</span>
                {r.closed ? <span className="badge">Fechada</span> : r.inRange ? <span className="badge ok">Na faixa</span> : <span className="badge warn">Fora da faixa</span>}
              </header>
              {r.suspeita ? <p className="erro pequeno">⚠️ Token suspeito (nome com link/convite). Provável golpe de airdrop: NÃO visite sites citados nem assine nada. Fora do total.</p> : null}
              <RangeBar lo={lo} hi={hi} cur={cur} />
              <div className="range-legend">
                <span>Mín {fmtNum(lo)}</span>
                <button className="link" onClick={() => setInverter({ ...inverter, [r.key]: !inv })}>atual {fmtNum(cur)} {quote}/{base} ⇄</button>
                <span>Máx {fmtNum(hi)}</span>
              </div>
              <dl>
                <dt>Valor</dt><dd>{r.valueUsd === null ? "—" : fmtUsd(r.valueUsd)}</dd>
                <dt>Composição</dt><dd>{fmtNum(r.amount0)} {s0} + {fmtNum(r.amount1)} {s1}</dd>
                <dt>Taxas a coletar{r.feesApprox ? "*" : ""}</dt>
                <dd className="pos">{r.feesUsd === null ? "" : fmtUsd(r.feesUsd) + " · "}{fmtNum(r.fees0)} {s0} + {fmtNum(r.fees1)} {s1}</dd>
                {wallets.length > 1 ? <><dt>Carteira</dt><dd>{shortAddr(r.wallet)}</dd></> : null}
                <dt>ID</dt><dd title={r.id}>{r.id.length > 14 ? shortAddr(r.id) : "#" + r.id}</dd>
              </dl>
              {r.feesApprox ? <p className="muted pequeno">* só as taxas já registradas; o valor real pode ser maior.</p> : null}
              <footer>
                {r.manageUrl ? <a href={r.manageUrl} target="_blank" rel="noopener noreferrer">Gerenciar no site oficial ↗</a> : <span />}
                {r.explorerUrl ? <a href={r.explorerUrl} target="_blank" rel="noopener noreferrer">Explorer ↗</a> : null}
              </footer>
            </article>
          );
        })}
      </div>

      <p className="nota">
        Leitura direta das blockchains (contratos oficiais de cada DEX). As taxas são calculadas pelos acumuladores on-chain ou <b>simulando</b> uma coleta via eth_call. Nada é enviado nem assinado.{" "}
        <button className="link" onClick={() => setVerFontes(!verFontes)}>{verFontes ? "ocultar" : "ver"} fontes consultadas ({status.length}{falhas.length ? `, ${falhas.length} com erro` : ""})</button>
      </p>
      {verFontes ? (
        <div className="tablewrap"><table><thead><tr><th>Fonte</th><th>Carteira</th><th className="num">Posições</th><th>Situação</th></tr></thead><tbody>
          {status.map((s, i) => <tr key={i}><td>{s.fonte}</td><td className="muted">{shortAddr(s.wallet)}</td><td className="num">{s.qtd}</td><td className={s.ok ? "pos" : "neg"}>{s.ok ? "ok" : s.erro}</td></tr>)}
        </tbody></table></div>
      ) : null}
      <p className="nota">Ainda não lidas: posições "em stake" (NFT depositado em gauge/farm da Aerodrome, Velodrome ou PancakeSwap, que sai da sua carteira), Orca "position bundles" e pools comuns não concentradas (v2).</p>
    </section>
  );
}

function V4Box({ counts, ids, onIds }: { counts: { chain: string; nome: string; count: number; wallet: string }[]; ids: V4Id[]; onIds: (v: V4Id[]) => void }) {
  const [chain, setChain] = useState(counts[0]?.chain ?? "base");
  const [txt, setTxt] = useState("");
  if (counts.length === 0 && ids.length === 0) return null;
  const adicionar = () => {
    const novos = txt.split(/[\s,;]+/).map((s) => s.replace(/^#/, "")).filter((s) => /^\d{1,12}$/.test(s));
    const merged = [...ids, ...novos.map((id) => ({ chain, id }))].filter((v, i, a) => a.findIndex((x) => x.chain === v.chain && x.id === v.id) === i);
    onIds(merged);
    setTxt("");
  };
  return (
    <div className="card v4box">
      <strong>Uniswap v4</strong>{" "}
      {counts.length ? <span>· encontrado: {counts.map((c) => `${c.count} em ${c.nome}`).join(", ")}</span> : null}
      <p className="muted pequeno">A v4 não deixa listar as posições de uma carteira pelos nós públicos. Cole uma vez os números dos NFTs (aparecem no site da Uniswap, em “Posições”, ou no explorer da rede) e o painel lembra deles.</p>
      <div className="toolbar">
        <select value={chain} onChange={(e) => setChain(e.target.value)}>
          {EVM_CHAINS.filter((c) => ["eth", "arbitrum", "base", "optimism", "polygon", "unichain", "bsc", "avalanche"].includes(c.key)).map((c) => <option key={c.key} value={c.key}>{c.nome}</option>)}
        </select>
        <input placeholder="Números dos NFTs, ex.: 123456, 123789" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && adicionar()} />
        <button className="ghost" onClick={adicionar}>Adicionar</button>
      </div>
      {ids.length ? (
        <p className="pequeno">{ids.map((v) => (
          <span key={v.chain + v.id} className="badge">{v.chain} #{v.id} <button className="link x" onClick={() => onIds(ids.filter((x) => x !== v))}>✕</button></span>
        ))}</p>
      ) : null}
    </div>
  );
}

function RangeBar({ lo, hi, cur }: { lo: number; hi: number; cur: number }) {
  const span = hi - lo || hi * 0.01 || 1;
  const min = Math.min(lo - span * 0.5, cur), max = Math.max(hi + span * 0.5, cur);
  const pos = (v: number) => `${((v - min) / (max - min || 1)) * 100}%`;
  return (
    <div className="rangebar">
      <div className="faixa" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />
      <div className="atual" style={{ left: pos(cur) }} />
    </div>
  );
}
