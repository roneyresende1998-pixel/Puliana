// Primitivas Solana feitas à mão (sem @solana/web3.js, para manter zero
// dependências de terceiros): base58, leitura de bytes, PDA e RPC só leitura.

const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const AMAP = new Map([...ALPHA].map((c, i) => [c, BigInt(i)]));

export function b58decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const v = AMAP.get(c);
    if (v === undefined) throw new Error("base58 inválido");
    n = n * 58n + v;
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  for (const c of s) { if (c === "1") bytes.unshift(0); else break; }
  return Uint8Array.from(bytes);
}

export function b58encode(b: Uint8Array): string {
  let n = 0n;
  for (const x of b) n = (n << 8n) | BigInt(x);
  let s = "";
  while (n > 0n) { s = ALPHA[Number(n % 58n)] + s; n /= 58n; }
  for (const x of b) { if (x === 0) s = "1" + s; else break; }
  return s;
}

export function isSolAddress(s: string): boolean {
  const t = s.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t)) return false;
  try { return b58decode(t).length === 32; } catch { return false; }
}

// ---------- leitura little-endian ----------
export const u8 = (d: Uint8Array, o: number) => d[o];
export const u16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8);
export const u32 = (d: Uint8Array, o: number) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)) + d[o + 3] * 2 ** 24;
export const i32 = (d: Uint8Array, o: number) => { const v = u32(d, o); return v >= 2 ** 31 ? v - 2 ** 32 : v; };
export function uLE(d: Uint8Array, o: number, len: number): bigint {
  let n = 0n;
  for (let i = len - 1; i >= 0; i--) n = (n << 8n) | BigInt(d[o + i]);
  return n;
}
export const u64 = (d: Uint8Array, o: number) => uLE(d, o, 8);
export const u128 = (d: Uint8Array, o: number) => uLE(d, o, 16);
export function i128(d: Uint8Array, o: number): bigint { const v = u128(d, o); return v >= 1n << 127n ? v - (1n << 128n) : v; }
export const pubkey = (d: Uint8Array, o: number) => b58encode(d.subarray(o, o + 32));

export function i32LE(v: number): Uint8Array { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v, true); return b; }
export function i32BE(v: number): Uint8Array { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v, false); return b; }
export function i64LE(v: number): Uint8Array { const b = new Uint8Array(8); new DataView(b.buffer).setBigInt64(0, BigInt(v), true); return b; }
export const utf8 = (s: string) => new TextEncoder().encode(s);

// ---------- PDA (findProgramAddress) ----------
const P = 2n ** 255n - 19n;
const D = (-121665n * inv(121666n)) % P;
function mod(a: bigint) { const r = a % P; return r < 0n ? r + P : r; }
function pow(b: bigint, e: bigint) { let r = 1n; b = mod(b); while (e > 0n) { if (e & 1n) r = (r * b) % P; b = (b * b) % P; e >>= 1n; } return r; }
function inv(a: bigint) { return pow(a, P - 2n); }

/** true se os 32 bytes forem um ponto válido da curva ed25519 (PDA NÃO pode estar na curva). */
export function isOnCurve(bytes: Uint8Array): boolean {
  const b = Uint8Array.from(bytes);
  b[31] &= 0x7f;
  const y = uLE(b, 0, 32);
  if (y >= P) return false;
  const y2 = mod(y * y);
  const u = mod(y2 - 1n), v = mod(D * y2 + 1n);
  const x2 = mod(u * inv(v));
  if (x2 === 0n) return true;
  return pow(x2, (P - 1n) / 2n) === 1n; // existe raiz quadrada?
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data as BufferSource));
}

const PDA_MARKER = utf8("ProgramDerivedAddress");
const pdaCache = new Map<string, string>();

export async function findPda(seeds: Uint8Array[], programId: string): Promise<string> {
  const key = programId + ":" + seeds.map((s) => b58encode(s)).join(",");
  const hit = pdaCache.get(key);
  if (hit) return hit;
  const prog = b58decode(programId);
  for (let bump = 255; bump >= 0; bump--) {
    const parts = [...seeds, Uint8Array.of(bump), prog, PDA_MARKER];
    const buf = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of parts) { buf.set(p, o); o += p.length; }
    const h = await sha256(buf);
    if (!isOnCurve(h)) {
      const addr = b58encode(h);
      pdaCache.set(key, addr);
      return addr;
    }
  }
  throw new Error("PDA não encontrada");
}

// ---------- RPC somente leitura ----------
// No navegador a RPC oficial recusa pedidos diretos (403), então usamos o
// retransmissor só-leitura do próprio site (/api/sol). Fora do navegador (testes), direto.
const PRIMARY = typeof location !== "undefined" && location.protocol.startsWith("http") ? "/api/sol" : "https://api.mainnet-beta.solana.com";
export const SOL_RPCS = [PRIMARY, "https://solana-rpc.publicnode.com"];

export async function solRpc<T>(method: string, params: unknown[], rpcIndex = 0, onlyThis = false): Promise<T> {
  // Lista branca de métodos: só leitura.
  if (!["getMultipleAccounts", "getAccountInfo", "getTokenAccountsByOwner", "getProgramAccounts", "getSlot"].includes(method)) {
    throw new Error("método Solana não permitido");
  }
  let lastErr: unknown;
  for (let i = rpcIndex; i < (onlyThis ? rpcIndex + 1 : SOL_RPCS.length); i++) {
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      try {
        const res = await fetch(SOL_RPCS[i], {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "omit",
          referrerPolicy: "no-referrer",
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        const j = (await res.json().catch(() => ({}))) as { result?: T; error?: { message: string; code?: number } };
        const limite = res.status === 429 || j.error?.code === 429;
        if (limite) throw Object.assign(new Error("RPC Solana ocupado (limite de requisições)"), { retry: true });
        if (j.error) throw new Error(j.error.message);
        if (!res.ok) throw new Error(`RPC Solana ${res.status}`);
        return j.result as T;
      } catch (e) {
        lastErr = e;
        if (!(e as { retry?: boolean }).retry) break; // erro definitivo: tenta o próximo nó
        await new Promise((r) => setTimeout(r, 1200 * (tentativa + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("RPC Solana falhou");
}

type RawAcc = { data: [string, string]; owner: string } | null;

function b64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type Acc = { data: Uint8Array; owner: string };

/** Lê várias contas de uma vez (lotes de 100). Retorna null para contas inexistentes. */
export async function getAccounts(addrs: string[]): Promise<(Acc | null)[]> {
  const out: (Acc | null)[] = [];
  const conv = (a: RawAcc) => (a ? { data: b64(a.data[0]), owner: a.owner } : null);
  for (let i = 0; i < addrs.length; i += 100) {
    const chunk = addrs.slice(i, i + 100);
    try {
      // Nó oficial: até 100 contas por chamada.
      const r = await solRpc<{ value: RawAcc[] }>("getMultipleAccounts", [chunk, { encoding: "base64" }], 0, true);
      out.push(...r.value.map(conv));
    } catch {
      // Reserva (PublicNode): máximo de 10 contas por chamada.
      const parts = [];
      for (let j = 0; j < chunk.length; j += 10) {
        parts.push(solRpc<{ value: RawAcc[] }>("getMultipleAccounts", [chunk.slice(j, j + 10), { encoding: "base64" }], 1));
      }
      for (const r of await Promise.all(parts)) out.push(...r.value.map(conv));
    }
  }
  return out;
}

export function b64decode(s: string): Uint8Array { return b64(s); }

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/** NFTs (saldo 1, 0 casas decimais) da carteira, nos dois programas de token. */
export async function listNftMints(owner: string): Promise<string[]> {
  const mints: string[] = [];
  for (const programId of [TOKEN_PROGRAM, TOKEN_2022]) {
    type R = { value: { account: { data: { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } } } }[] };
    const r = await solRpc<R>("getTokenAccountsByOwner", [owner, { programId }, { encoding: "jsonParsed" }]);
    for (const a of r.value) {
      const info = a.account.data.parsed.info;
      if (info.tokenAmount.decimals === 0 && info.tokenAmount.amount === "1") mints.push(info.mint);
    }
  }
  return mints;
}
