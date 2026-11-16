import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fmtNum, fmtPct, fmtUsd } from "../lib/format.ts";
import type { Pool } from "../lib/gecko.ts";
import { loadToken, tokenChart, type TokenOverview, type TokenRef } from "../lib/token.ts";

// Contexto: qualquer lugar do app pode abrir o panorama de um token.
const Ctx = createContext<(t: TokenRef) => void>(() => {});
export const useOpenToken = () => useContext(Ctx);

export function TokenProvider({ children, onSimular }: { children: ReactNode; onSimular: (p: Pool) => void }) {
  const [ref, setRef] = useState<TokenRef | null>(null);
  return (
    <Ctx.Provider value={setRef}>
      {children}
      {ref ? <TokenPanel tref={ref} onClose={() => setRef(null)} onSimular={(p) => { setRef(null); onSimular(p); }} /> : null}
    </Ctx.Provider>
  );
}

/** Nome de token clicável. */
export function TokenLink({ network, address, symbol, children }: TokenRef & { children?: ReactNode }) {
  const open = useOpenToken();
  if (!address) return <>{children ?? symbol}</>;
  return (
    <button className="tokenlink" title={`Ver panorama de ${symbol ?? "token"}`} onClick={(e) => { e.stopPropagation(); open({ network, address, symbol }); }}>
      {children ?? symbol}
    </button>
  );
}

const pctCls = (v: number | null) => (v === null ? "muted" : v >= 0 ? "pos" : "neg");
const pctTxt = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`);
const compacto = (v: number | null) => (v === null ? "—" : v.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 2 }));
const preco = (v: number | null) => (v === null ? "—" : v >= 1 ? fmtUsd(v) : "US$ " + fmtNum(v, 4));

function TokenPanel({ tref, onClose, onSimular }: { tref: TokenRef; onClose: () => void; onSimular: (p: Pool) => void }) {
  const [t, setT] = useState<TokenOverview | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [dias, setDias] = useState(30);
  const [serie, setSerie] = useState<{ t: number; p: number }[] | null>(null);
  const [descAberta, setDescAberta] = useState(false);

  useEffect(() => {
    setT(null); setErro(null);
    loadToken(tref).then(setT).catch((e) => setErro((e as Error).message));
  }, [tref]);
  useEffect(() => {
    setSerie(null);
    tokenChart(tref.network, tref.address, dias).then(setSerie).catch(() => setSerie([]));
  }, [tref, dias]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const alertas: string[] = [];
  if (t) {
    if (t.mintAuthority && t.mintAuthority !== "no") alertas.push("Emissão (mint) ativa: alguém pode criar mais tokens e diluir o preço.");
    if (t.freezeAuthority && t.freezeAuthority !== "no") alertas.push("Congelamento (freeze) ativo: o criador pode travar carteiras.");
    if (t.honeypot === "yes") alertas.push("Possível honeypot: pode não ser possível vender.");
    if (t.top10 !== null && t.top10 > 50) alertas.push(`Concentração alta: 10 maiores carteiras têm ${t.top10.toFixed(0)}% da oferta.`);
    if (t.devPct !== null && t.devPct > 10) alertas.push(`Desenvolvedor detém ${t.devPct.toFixed(1)}% da oferta.`);
    if (t.marketCap && t.fdv && t.fdv / t.marketCap > 2) alertas.push(`Só ${fmtPct(t.marketCap / t.fdv, 0)} da oferta está em circulação: desbloqueios futuros podem pressionar o preço.`);
  }

  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Panorama do token">
      <aside className="tokenpanel" onClick={(e) => e.stopPropagation()}>
        <button className="fechar ghost" onClick={onClose} aria-label="Fechar">✕</button>
        {erro ? <p className="erro">{erro}</p> : null}
        {!t && !erro ? <p className="muted">Carregando panorama de {tref.symbol ?? "token"}…</p> : null}
        {t ? (
          <>
            <header className="tk-topo">
              {t.imagem ? <img src={t.imagem} alt="" width={44} height={44} referrerPolicy="no-referrer" /> : null}
              <div>
                <h2>{t.nome} <span className="muted">{t.simbolo}</span></h2>
                <div className="tk-badges">
                  {t.rank ? <span className="badge">#{t.rank} em valor de mercado</span> : null}
                  <span className="badge">{t.network}</span>
                  {t.verificado ? <span className="badge ok">verificado GT</span> : null}
                </div>
              </div>
              <div className="tk-preco">
                <strong>{preco(t.precoUsd)}</strong>
                <span className={pctCls(t.variacao.h24)}>{pctTxt(t.variacao.h24)} 24h</span>
              </div>
            </header>

            <div className="tk-var">
              {([["24h", t.variacao.h24], ["7 dias", t.variacao.d7], ["30 dias", t.variacao.d30], ["1 ano", t.variacao.a1]] as const).map(([k, v]) => (
                <div key={k}><span>{k}</span><b className={pctCls(v)}>{pctTxt(v)}</b></div>
              ))}
            </div>

            <div className="tk-grafico">
              <div className="presets">
                {[1, 7, 30, 90, 365, 1095].map((d) => (
                  <button key={d} className={`small ghost ${dias === d ? "ativo" : ""}`} onClick={() => setDias(d)}>{d === 1 ? "24h" : d < 365 ? `${d}d` : `${d / 365}a`}</button>
                ))}
              </div>
              {serie === null ? <p className="muted">Carregando gráfico…</p> : serie.length < 2 ? <p className="muted">Sem histórico de preço para este token.</p> : <MiniChart serie={serie} />}
            </div>

            {alertas.length ? (
              <div className="tk-alertas">
                <b>⚠️ Pontos de atenção</b>
                <ul>{alertas.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            ) : null}

            <dl className="tk-dados">
              <dt>Valor de mercado</dt><dd>{t.marketCap ? fmtUsd(t.marketCap) : "—"}</dd>
              <dt>Valor totalmente diluído</dt><dd>{t.fdv ? fmtUsd(t.fdv) : "—"}</dd>
              <dt>Volume 24h</dt><dd>{t.volume24h !== null ? fmtUsd(t.volume24h) : "—"}</dd>
              <dt>Máxima histórica</dt><dd>{preco(t.ath)}{t.athDistancia !== null ? <span className="neg"> ({t.athDistancia.toFixed(1)}%)</span> : null}{t.athData ? <small className="muted"> em {new Date(t.athData).toLocaleDateString("pt-BR")}</small> : null}</dd>
              <dt>Mínima histórica</dt><dd>{preco(t.atl)}</dd>
              <dt>Em circulação</dt><dd>{compacto(t.circulante)} {t.simbolo}</dd>
              <dt>Oferta total / máxima</dt><dd>{compacto(t.total)} / {t.maximo ? compacto(t.maximo) : "sem limite"}</dd>
              {t.holders !== null ? <><dt>Carteiras (holders)</dt><dd>{t.holders.toLocaleString("pt-BR")}{t.top10 !== null ? <small className="muted"> · top 10 com {t.top10.toFixed(1)}%</small> : null}</dd></> : null}
              {t.gtScore !== null ? <><dt>Nota de confiança GT</dt><dd className={t.gtScore >= 70 ? "pos" : t.gtScore >= 40 ? "alerta" : "neg"}>{t.gtScore.toFixed(0)}/100</dd></> : null}
              {t.mintAuthority ? <><dt>Emissão / congelamento</dt><dd>{t.mintAuthority === "no" ? "desativada" : "ATIVA"} / {t.freezeAuthority === "no" ? "desativado" : t.freezeAuthority ? "ATIVO" : "—"}</dd></> : null}
              <dt>Contrato</dt><dd className="mono" title={t.address}>{t.address.slice(0, 8)}…{t.address.slice(-6)}</dd>
            </dl>

            {t.categorias.length ? <p className="tk-cats">{t.categorias.map((c) => <span key={c} className="badge">{c}</span>)}</p> : null}

            {t.descricao ? (
              <div className="tk-desc">
                <h3>Sobre</h3>
                <p>{descAberta ? t.descricao : t.descricao.slice(0, 380) + (t.descricao.length > 380 ? "…" : "")}</p>
                {t.descricao.length > 380 ? <button className="link" onClick={() => setDescAberta(!descAberta)}>{descAberta ? "ver menos" : "ver mais"}</button> : null}
              </div>
            ) : null}

            {t.links.length ? (
              <div className="tk-links">
                {t.links.map((l) => <a key={l.url} className="small" href={l.url} target="_blank" rel="noopener noreferrer">{l.nome} ↗</a>)}
                <p className="muted pequeno">Links de terceiros. Confira o endereço antes de conectar a carteira em qualquer site.</p>
              </div>
            ) : null}

            {t.pools.length ? (
              <div className="tk-pools">
                <h3>Principais pools de {t.simbolo}</h3>
                <div className="tablewrap"><table>
                  <thead><tr><th>Pool</th><th>DEX</th><th className="num">TVL</th><th className="num">Volume 24h</th><th className="num">APR taxas*</th><th></th></tr></thead>
                  <tbody>{t.pools.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.base}/{p.quote}</strong> <small className="muted">{p.feeTier !== null ? fmtPct(p.feeTier, 2) : ""}</small></td>
                      <td className="muted">{p.dex}</td>
                      <td className="num">{fmtUsd(p.tvl)}</td>
                      <td className="num">{fmtUsd(p.volume24h)}</td>
                      <td className={`num ${p.feeApr && p.feeApr > 2 ? "alerta" : "pos"}`}>{fmtPct(p.feeApr, 1)}</td>
                      <td><button className="small" onClick={() => onSimular(p)}>Simular</button></td>
                    </tr>
                  ))}</tbody>
                </table></div>
              </div>
            ) : null}
            <p className="nota">Dados: CoinGecko (mercado), GeckoTerminal (on-chain, holders, segurança, pools) e DefiLlama (gráfico). Não é recomendação de investimento.</p>
          </>
        ) : null}
      </aside>
    </div>
  );
}

function MiniChart({ serie }: { serie: { t: number; p: number }[] }) {
  const W = 640, H = 180, pad = 6;
  const ps = serie.map((s) => s.p);
  const min = Math.min(...ps), max = Math.max(...ps);
  const x = (i: number) => pad + (i / (serie.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - 2 * pad);
  const pts = serie.map((s, i) => `${x(i).toFixed(1)},${y(s.p).toFixed(1)}`).join(" ");
  const subiu = ps[ps.length - 1] >= ps[0];
  const varp = (ps[ps.length - 1] / ps[0] - 1) * 100;
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gráfico de preço">
        <polyline points={`${pad},${H - pad} ${pts} ${W - pad},${H - pad}`} className={subiu ? "area-pos" : "area-neg"} />
        <polyline points={pts} fill="none" className={subiu ? "linha-pos" : "linha-neg"} />
        <text x={W - pad} y={14} textAnchor="end" className="chart-txt">máx {preco(max)}</text>
        <text x={W - pad} y={H - 10} textAnchor="end" className="chart-txt">mín {preco(min)}</text>
      </svg>
      <p className="muted pequeno">No período: <b className={subiu ? "pos" : "neg"}>{varp >= 0 ? "+" : ""}{varp.toFixed(2)}%</b> · de {new Date(serie[0].t * 1000).toLocaleDateString("pt-BR")} a {new Date(serie[serie.length - 1].t * 1000).toLocaleDateString("pt-BR")}</p>
    </>
  );
}
