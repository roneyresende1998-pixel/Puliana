// Carteira Solana BLINDADA (Phantom, Solflare, Backpack…).
// O painel só usa connect() e disconnect() e lê a chave PÚBLICA. Nenhum método
// de assinatura é chamado nem exposto: o wrapper abaixo é o único acesso.

type RawSol = {
  connect: (o?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey?: { toString(): string } } | void>;
  disconnect?: () => Promise<void>;
  publicKey?: { toString(): string } | null;
  on?: (ev: string, cb: (...a: unknown[]) => void) => void;
  isPhantom?: boolean;
  isSolflare?: boolean;
};

export type SafeSol = Readonly<{
  nome: string;
  connect: (silencioso?: boolean) => Promise<string | null>;
  disconnect: () => Promise<void>;
  onChange: (cb: (addr: string | null) => void) => void;
}>;

export function getSolanaWallet(): SafeSol | null {
  const g = globalThis as Record<string, unknown> & { phantom?: { solana?: RawSol }; solflare?: RawSol; backpack?: RawSol; solana?: RawSol };
  const raw = g.phantom?.solana ?? g.solflare ?? g.backpack ?? g.solana;
  if (!raw || typeof raw.connect !== "function") return null;
  const nome = raw.isPhantom ? "Phantom" : raw.isSolflare ? "Solflare" : g.backpack ? "Backpack" : "Solana";
  const pk = (r: unknown) => {
    const k = (r as { publicKey?: { toString(): string } } | undefined)?.publicKey ?? raw.publicKey;
    return k ? k.toString() : null;
  };
  return Object.freeze({
    nome,
    connect: async (silencioso = false) => pk(await raw.connect(silencioso ? { onlyIfTrusted: true } : undefined)),
    disconnect: async () => { try { await raw.disconnect?.(); } catch { /* ignora */ } },
    onChange: (cb: (a: string | null) => void) => raw.on?.("accountChanged", (k: unknown) => cb(k ? String(k) : null)),
  });
}
