import { useState } from "react";
import PoolExplorer from "./components/PoolExplorer.tsx";
import Positions from "./components/Positions.tsx";
import Security, { DomainWarning } from "./components/Security.tsx";
import Simulator from "./components/Simulator.tsx";
import { TokenProvider } from "./components/TokenPanel.tsx";
import WalletBar, { loadWallets, type Wallet } from "./components/WalletBar.tsx";
import type { Pool } from "./lib/gecko.ts";

type Aba = "pools" | "posicoes" | "simulador" | "seguranca";
const ABAS: { id: Aba; label: string }[] = [
  { id: "pools", label: "Explorar pools" },
  { id: "posicoes", label: "Minhas posições" },
  { id: "simulador", label: "Simulador" },
  { id: "seguranca", label: "Segurança" },
];

export default function App() {
  const [aba, setAba] = useState<Aba>("pools");
  const [wallets, setWallets] = useState<Wallet[]>(loadWallets);
  const [pool, setPool] = useState<Pool | null>(null);

  const simular = (p: Pool) => { setPool(p); setAba("simulador"); };
  return (
    <TokenProvider onSimular={simular}>
    <div className="app">
      <DomainWarning />
      <header className="topo">
        <div className="marca">◈ Pooliana <span>Painel</span></div>
        <nav>
          {ABAS.map((a) => (
            <button key={a.id} className={`tab ${aba === a.id ? "ativa" : ""}`} onClick={() => setAba(a.id)}>{a.label}</button>
          ))}
        </nav>
        <WalletBar wallets={wallets} onChange={setWallets} />
      </header>
      <main>
        {aba === "pools" && <PoolExplorer onSimular={simular} />}
        {aba === "posicoes" && <Positions wallets={wallets} />}
        {aba === "simulador" && <Simulator pool={pool} />}
        {aba === "seguranca" && <Security />}
      </main>
      <footer className="rodape">Ferramenta de análise. Não é recomendação de investimento. Este site nunca pede assinatura — se pedir, rejeite.</footer>
    </div>
    </TokenProvider>
  );
}
