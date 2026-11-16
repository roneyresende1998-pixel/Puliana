import { useEffect, useState } from "react";
import { shortAddr, store } from "../lib/format.ts";
import { connect, disconnect, getInjected, silentAccount } from "../lib/safeWallet.ts";
import { getSolanaWallet } from "../lib/safeSolana.ts";
import { addressKind } from "../lib/scanner.ts";

export type Wallet = { address: string; origem: "evm" | "solana" | "observar" };
type Props = { wallets: Wallet[]; onChange: (w: Wallet[]) => void };

export function loadWallets(): Wallet[] {
  try {
    const v = JSON.parse(store.get("carteiras") ?? "[]") as Wallet[];
    return Array.isArray(v) ? v.filter((w) => w && typeof w.address === "string" && addressKind(w.address)) : [];
  } catch { return []; }
}
const save = (w: Wallet[]) => store.set("carteiras", JSON.stringify(w));

export default function WalletBar({ wallets, onChange }: Props) {
  const evm = getInjected();
  const sol = getSolanaWallet();
  const [watch, setWatch] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const update = (w: Wallet[]) => { save(w); onChange(w); };
  const add = (address: string, origem: Wallet["origem"]) => {
    const a = addressKind(address) === "evm" ? address.toLowerCase() : address;
    if (wallets.some((w) => w.address === a)) return;
    update([...wallets, { address: a, origem }]);
  };

  // Reconecta em silêncio (sem popup) carteiras já autorizadas antes.
  useEffect(() => {
    if (evm && wallets.some((w) => w.origem === "evm")) silentAccount(evm).catch(() => null);
    if (sol && wallets.some((w) => w.origem === "solana")) sol.connect(true).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function conectarEvm() {
    setErro(null);
    if (!evm) return setErro("Nenhuma carteira EVM (MetaMask, Rabby…) detectada. Use o modo Observar.");
    try { const a = await connect(evm); if (a) add(a, "evm"); } catch (e) { setErro((e as Error).message); }
  }
  async function conectarSol() {
    setErro(null);
    if (!sol) return setErro("Nenhuma carteira Solana (Phantom, Solflare…) detectada. Use o modo Observar.");
    try { const a = await sol.connect(); if (a) add(a, "solana"); } catch (e) { setErro((e as Error).message); }
  }
  function observar() {
    const a = watch.trim();
    if (!addressKind(a)) return setErro("Endereço inválido. Use 0x… (EVM) ou um endereço Solana.");
    setErro(null);
    add(a, "observar");
    setWatch("");
  }
  async function remover(w: Wallet) {
    if (w.origem === "evm" && evm) await disconnect(evm);
    if (w.origem === "solana" && sol) await sol.disconnect();
    update(wallets.filter((x) => x.address !== w.address));
  }

  return (
    <div className="walletbar">
      <span className="badge ok" title="Este site nunca pede assinatura nem transação">🔒 Somente leitura</span>
      {wallets.map((w) => (
        <span key={w.address} className="addr" title={w.address}>
          {w.origem === "observar" ? "👁" : w.origem === "solana" ? "◎" : "🦊"} {shortAddr(w.address)}
          <button className="link x" onClick={() => remover(w)} aria-label="Remover carteira">✕</button>
        </span>
      ))}
      <input
        className="watch"
        placeholder="Colar endereço 0x… ou Solana (observar)"
        value={watch}
        onChange={(e) => setWatch(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && observar()}
        spellCheck={false}
        autoComplete="off"
      />
      <button className="ghost" onClick={observar}>Observar</button>
      <button onClick={conectarEvm}>Conectar EVM</button>
      <button onClick={conectarSol}>Conectar Solana</button>
      {erro ? <span className="erro">{erro}</span> : null}
    </div>
  );
}
