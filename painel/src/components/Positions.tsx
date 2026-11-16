import { useEffect, useState } from "react";
import { EVM_CHAINS, chainByKey, type EvmChain } from "../lib/chains.ts";
import { fmtNum, fmtPct, fmtUsd } from "../lib/format.ts";
import { fetchTokenPrices } from "../lib/gecko.ts";
import { loadPositions, type Position } from "../lib/uniswap.ts";

const UNI_SLUG: Record<string, string> = { eth: "ethereum", bsc: "bnb" };

type Row = Position & { chain: EvmChain; valueUsd: number | null; feesUsd: number | null };

export default function Positions({ address }: { address: string | null }) {
  const [rede, setRede] = useState<string>("todas");
  const [fechadas, setFechadas] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [inverter, setInverter] = useState<Record<string, boolean>>({});

  async function carregar() {
    if (!address) return;
    setLoading(true);
    setRows([]);
    const chains = rede === "todas" ? EVM_CHAINS : [chainByKey(rede)];
    const falhas: string[] = [];
    const all: Row[] = [];
    await Promise.all(
      chains.map(async (c) => {
        try {
          setStatus(`Lendo ${c.nome}…`);
          const ps = await loadPositions(c, address, fechadas);
          let prices = new Map<string, number>();
          try {
            prices = await fetchTokenPrices(c.gecko, ps.flatMap((p) => [p.token0.address, p.token1.address]));
          } catch { /* sem preço: mostra só quantidades */ }
          for (const p of ps) {
            const p0 = prices.get(p.token0.address), p1 = prices.get(p.token1.address);
            const ok = p0 !== undefined && p1 !== undefined;
            all.push({
              ...p,
              chain: c,
              valueUsd: ok ? p.amount0 * p0! + p.amount1 * p1! : null,
              feesUsd: ok ? p.fees0 * p0! + p.fees1 * p1! : null,
            });
          }
        } catch (e) {
          falhas.push(`${c.nome}: ${(e as Error).message}`);
        }
      }),
    );
    all.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
    setRows(all);
    setStatus(falhas.length ? `Algumas redes falharam — ${falhas.join(" | ")}` : null);
    setLoading(false);
  }

  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [address, rede, fechadas]);

  if (!address) {
    return (
      <section className="vazio">
        <h2>Minhas posições</h2>
        <p>Conecte a carteira (somente leitura) <b>ou</b> cole qualquer endereço no modo <b>Observar</b> — não precisa conectar nada para ver posições.</p>
      </section>
    );
  }

  const semPreco = rows.some((r) => r.valueUsd === null);
  const total = rows.reduce((s, r) => s + (r.valueUsd ?? 0), 0);
  const totalFees = rows.reduce((s, r) => s + (r.feesUsd ?? 0), 0);
  const ativas = rows.filter((r) => r.liquidity > 0n);
  const dentro = ativas.filter((r) => r.inRange).length;

  return (
    <section>
      <div className="toolbar">
        <select value={rede} onChange={(e) => setRede(e.target.value)} aria-label="Rede">
          <option value="todas">Todas as redes</option>
          {EVM_CHAINS.map((c) => <option key={c.key} value={c.key}>{c.nome}</option>)}
        </select>
        <label className="inline"><input type="checkbox" checked={fechadas} onChange={(e) => setFechadas(e.target.checked)} /> mostrar fechadas</label>
        <button onClick={carregar} disabled={loading}>{loading ? "Lendo blockchain…" : "Atualizar"}</button>
      </div>

      <div className="cards resumo">
        <div className="card"><span>Valor em posições</span><strong>{fmtUsd(total)}{semPreco ? "*" : ""}</strong></div>
        <div className="card"><span>Taxas não coletadas</span><strong className="pos">{fmtUsd(totalFees)}</strong></div>
        <div className="card"><span>Posições ativas</span><strong>{ativas.length}</strong></div>
        <div className="card"><span>Dentro da faixa</span><strong className={dentro === ativas.length ? "pos" : "alerta"}>{dentro}/{ativas.length}</strong></div>
      </div>

      {semPreco ? <p className="muted">* Algum token ficou sem preço (limite do GeckoTerminal ou token sem liquidez) — clique em Atualizar em 1 minuto.</p> : null}
      {status ? <p className="muted">{status}</p> : null}
      {!loading && rows.length === 0 ? <p className="muted">Nenhuma posição Uniswap v3 encontrada para este endereço.</p> : null}

      <div className="posgrid">
        {rows.map((r) => {
          const k = `${r.chain.key}-${r.tokenId}`;
          const inv = inverter[k] ?? (r.priceCurrent < 1);
          const [base, quote] = inv ? [r.token1.symbol, r.token0.symbol] : [r.token0.symbol, r.token1.symbol];
          const f = (x: number) => (inv ? 1 / x : x);
          const lo = Math.min(f(r.priceLower), f(r.priceUpper)), hi = Math.max(f(r.priceLower), f(r.priceUpper));
          const cur = f(r.priceCurrent);
          return (
            <article className="posicao card" key={k}>
              <header>
                <strong>{r.token0.symbol} / {r.token1.symbol}</strong>
                <span className="badge">{fmtPct(r.fee, 2)}</span>
                <span className="badge">{r.chain.nome}</span>
                {r.liquidity === 0n ? <span className="badge">Fechada</span> : r.inRange ? <span className="badge ok">Na faixa</span> : <span className="badge warn">Fora da faixa</span>}
              </header>
              <RangeBar lo={lo} hi={hi} cur={cur} />
              <div className="range-legend">
                <span>Mín {fmtNum(lo)}</span>
                <button className="link" onClick={() => setInverter({ ...inverter, [k]: !inv })}>atual {fmtNum(cur)} {quote}/{base} ⇄</button>
                <span>Máx {fmtNum(hi)}</span>
              </div>
              <dl>
                <dt>Valor</dt><dd>{r.valueUsd === null ? "—" : fmtUsd(r.valueUsd)}</dd>
                <dt>Composição</dt><dd>{fmtNum(r.amount0)} {r.token0.symbol} + {fmtNum(r.amount1)} {r.token1.symbol}</dd>
                <dt>Taxas a coletar</dt><dd className="pos">{r.feesUsd === null ? "" : fmtUsd(r.feesUsd) + " · "}{fmtNum(r.fees0)} {r.token0.symbol} + {fmtNum(r.fees1)} {r.token1.symbol}</dd>
                <dt>NFT</dt><dd>#{r.tokenId.toString()}</dd>
              </dl>
              <footer>
                <a href={`https://app.uniswap.org/positions/v3/${UNI_SLUG[r.chain.key] ?? r.chain.key}/${r.tokenId}`} target="_blank" rel="noopener noreferrer">Gerenciar na Uniswap ↗</a>
                <a href={`${r.chain.explorer}/address/${r.pool}`} target="_blank" rel="noopener noreferrer">Pool no explorer ↗</a>
              </footer>
            </article>
          );
        })}
      </div>
      <p className="nota">Leitura direta da blockchain (contrato oficial NonfungiblePositionManager da Uniswap v3). As taxas são obtidas <b>simulando</b> uma coleta via eth_call — nada é enviado nem assinado. Para coletar/fechar, use o site oficial da Uniswap.</p>
    </section>
  );
}

function RangeBar({ lo, hi, cur }: { lo: number; hi: number; cur: number }) {
  const span = hi - lo;
  const min = Math.min(lo - span * 0.5, cur), max = Math.max(hi + span * 0.5, cur);
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div className="rangebar">
      <div className="faixa" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />
      <div className="atual" style={{ left: pos(cur) }} />
    </div>
  );
}
