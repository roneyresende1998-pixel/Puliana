const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const usdCompact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });

export const fmtUsd = (v: number) => (Number.isFinite(v) ? (Math.abs(v) >= 1e6 ? usdCompact.format(v) : usd.format(v)) : "—");

export const fmtPct = (v: number | null | undefined, digits = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;

export function fmtNum(v: number, sig = 6): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e9 || a < 1e-6) return v.toExponential(3);
  if (a >= 1000) return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return v.toLocaleString("pt-BR", { maximumSignificantDigits: sig });
}

export const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** localStorage com try/catch (modo anônimo / bloqueado não quebra o site). Só guarda dados PÚBLICOS. */
export const store = {
  get(k: string): string | null {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k: string, v: string | null) {
    try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* ignora */ }
  },
};
