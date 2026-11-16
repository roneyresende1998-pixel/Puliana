import { useEffect, useState } from "react";
import { isAddress } from "../lib/abi.ts";
import { chainById } from "../lib/chains.ts";
import { shortAddr, store } from "../lib/format.ts";
import { connect, disconnect, getInjected, silentAccount } from "../lib/safeWallet.ts";

type Props = { address: string | null; onAddress: (a: string | null) => void };

export default function WalletBar({ address, onAddress }: Props) {
  const wallet = getInjected();
  const [mode, setMode] = useState<"carteira" | "observar" | null>(() => (store.get("modo") as "carteira" | "observar" | null) ?? null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [watch, setWatch] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!wallet) return;
    const onAcc = (a: unknown) => {
      const acc = (a as string[])?.[0]?.toLowerCase() ?? null;
      if (store.get("modo") === "carteira") onAddress(acc);
    };
    const onChain = (c: unknown) => setChainId(parseInt(String(c), 16));
    wallet.on?.("accountsChanged", onAcc);
    wallet.on?.("chainChanged", onChain);
    wallet.request({ method: "eth_chainId" }).then(onChain).catch(() => {});
    if (store.get("modo") === "carteira") silentAccount(wallet).then(onAddress).catch(() => {});
    return () => {
      wallet.removeListener?.("accountsChanged", onAcc);
      wallet.removeListener?.("chainChanged", onChain);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function conectar() {
    setErro(null);
    if (!wallet) return setErro("Nenhuma carteira detectada no navegador. Use o modo observar.");
    try {
      const a = await connect(wallet);
      setMode("carteira");
      store.set("modo", "carteira");
      onAddress(a);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function sair() {
    if (wallet && mode === "carteira") await disconnect(wallet);
    store.set("modo", null);
    store.set("observar", null);
    setMode(null);
    onAddress(null);
  }

  function observar() {
    const a = watch.trim();
    if (!isAddress(a)) return setErro("Endereço inválido (formato 0x… com 40 caracteres).");
    setErro(null);
    setMode("observar");
    store.set("modo", "observar");
    store.set("observar", a.toLowerCase());
    onAddress(a.toLowerCase());
  }

  const rede = chainId ? chainById(chainId)?.nome ?? `chain ${chainId}` : null;

  return (
    <div className="walletbar">
      <span className="badge ok" title="Este site nunca pede assinatura nem transação">🔒 Somente leitura</span>
      {address ? (
        <>
          <span className="addr" title={address}>
            {mode === "observar" ? "👁 " : "🦊 "}
            {shortAddr(address)}
            {mode === "carteira" && rede ? <small> · {rede}</small> : null}
          </span>
          <button className="ghost" onClick={sair}>Desconectar</button>
        </>
      ) : (
        <>
          <input
            className="watch"
            placeholder="Colar endereço 0x… (modo observar)"
            value={watch}
            onChange={(e) => setWatch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && observar()}
            spellCheck={false}
            autoComplete="off"
          />
          <button className="ghost" onClick={observar}>Observar</button>
          <button onClick={conectar}>Conectar carteira</button>
        </>
      )}
      {erro ? <span className="erro">{erro}</span> : null}
    </div>
  );
}

export function initialAddress(): string | null {
  return store.get("modo") === "observar" ? store.get("observar") : null;
}
