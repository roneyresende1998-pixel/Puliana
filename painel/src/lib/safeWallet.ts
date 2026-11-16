// Carteira BLINDADA (somente leitura).
//
// O painel só precisa saber QUAL é o seu endereço. Por isso todo acesso à
// carteira (window.ethereum / EIP-1193) passa por esta lista branca. Qualquer
// método que poderia mover fundos ou assinar algo é bloqueado ANTES de chegar
// à carteira — mesmo que algum código malicioso fosse injetado na página.
//
// Regra de ouro: este site NUNCA pede assinatura. Se a sua carteira abrir um
// pedido de assinatura/transação enquanto você usa o painel, REJEITE.

export type Eip1193 = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, cb: (...a: unknown[]) => void): void;
  removeListener?(event: string, cb: (...a: unknown[]) => void): void;
};

export const ALLOWED_METHODS = new Set([
  "eth_requestAccounts", // pede para ver o endereço (popup de conexão)
  "eth_accounts", // lê endereço já autorizado, sem popup
  "eth_chainId", // lê a rede atual
  "wallet_revokePermissions", // DESCONECTAR de verdade (reduz permissões)
]);

export class BlockedMethodError extends Error {
  constructor(method: string) {
    super(`Bloqueado pelo painel: o método "${method}" não é permitido (site somente leitura).`);
    this.name = "BlockedMethodError";
  }
}

export function guardProvider(raw: Eip1193): Eip1193 {
  const guarded: Eip1193 = {
    request: (args) => {
      if (!args || typeof args.method !== "string" || !ALLOWED_METHODS.has(args.method)) {
        return Promise.reject(new BlockedMethodError(String(args?.method)));
      }
      return raw.request(args);
    },
    on: raw.on?.bind(raw),
    removeListener: raw.removeListener?.bind(raw),
  };
  return Object.freeze(guarded);
}

export function getInjected(): Eip1193 | null {
  const eth = (globalThis as { ethereum?: Eip1193 }).ethereum;
  return eth && typeof eth.request === "function" ? guardProvider(eth) : null;
}

export async function connect(p: Eip1193): Promise<string | null> {
  const accs = (await p.request({ method: "eth_requestAccounts" })) as string[];
  return accs?.[0]?.toLowerCase() ?? null;
}

export async function silentAccount(p: Eip1193): Promise<string | null> {
  const accs = (await p.request({ method: "eth_accounts" })) as string[];
  return accs?.[0]?.toLowerCase() ?? null;
}

export async function disconnect(p: Eip1193): Promise<void> {
  try {
    await p.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
  } catch {
    // Nem toda carteira suporta; nesse caso basta esquecer o endereço localmente.
  }
}
