// Codificação/decodificação ABI mínima, feita à mão para NÃO depender de
// bibliotecas de terceiros (menos dependências = menos risco de supply-chain).
// Só suporta o que o painel precisa: address, uint, int e string/bytes32.

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function isAddress(v: string): boolean {
  return ADDRESS_RE.test(v.trim());
}

export function normalizeAddress(v: string): string {
  const a = v.trim();
  if (!isAddress(a)) throw new Error(`Endereço inválido: ${v}`);
  return a.toLowerCase();
}

export function encodeUint(v: bigint | number): string {
  const n = BigInt(v);
  if (n < 0n) throw new Error("uint negativo");
  return n.toString(16).padStart(64, "0");
}

export function encodeInt(v: bigint | number): string {
  let n = BigInt(v);
  if (n < 0n) n = (1n << 256n) + n;
  return n.toString(16).padStart(64, "0");
}

export function encodeAddress(a: string): string {
  return normalizeAddress(a).slice(2).padStart(64, "0");
}

/** Monta calldata: seletor (4 bytes) + palavras de 32 bytes. */
export function calldata(selector: string, ...words: string[]): string {
  if (!/^0x[0-9a-f]{8}$/.test(selector)) throw new Error("seletor inválido");
  return selector + words.join("");
}

export function words(hex: string): string[] {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out: string[] = [];
  for (let i = 0; i + 64 <= h.length; i += 64) out.push(h.slice(i, i + 64));
  return out;
}

export function decodeUint(word: string): bigint {
  return BigInt("0x" + (word || "0"));
}

export function decodeInt(word: string): bigint {
  const n = decodeUint(word);
  return n >= 1n << 255n ? n - (1n << 256n) : n;
}

export function decodeAddress(word: string): string {
  return "0x" + word.slice(24).toLowerCase();
}

/** Decodifica retorno de symbol(): aceita `string` (padrão) ou `bytes32` (ex.: MKR). */
export function decodeStringOrBytes32(hex: string): string {
  const w = words(hex);
  if (w.length === 0) return "?";
  const clean = (s: string) => s.replace(/[^\x20-\x7e]/g, "").trim() || "?";
  if (w.length >= 2 && decodeUint(w[0]) === 32n) {
    const len = Number(decodeUint(w[1]));
    const dataHex = w.slice(2).join("").slice(0, len * 2);
    return clean(hexToUtf8(dataHex));
  }
  return clean(hexToUtf8(w[0].replace(/(00)+$/, "")));
}

function hexToUtf8(h: string): string {
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
}

// Seletores conferidos com keccak256 da assinatura.
export const SEL = {
  balanceOf: "0x70a08231", // balanceOf(address)
  tokenOfOwnerByIndex: "0x2f745c59", // tokenOfOwnerByIndex(address,uint256)
  positions: "0x99fbab88", // positions(uint256)
  factory: "0xc45a0155", // factory()
  getPool: "0x1698ee82", // getPool(address,address,uint24)
  getPoolSlipstream: "0x28af8d0b", // getPool(address,address,int24) — Aerodrome/Velodrome
  fee: "0xddca3f43", // fee()
  slot0: "0x3850c7bd", // slot0()
  symbol: "0x95d89b41", // symbol()
  decimals: "0x313ce567", // decimals()
  collect: "0xfc6f7865", // collect((uint256,address,uint128,uint128)) — usado só via eth_call (simulação)
} as const;

export const MAX_UINT128 = (1n << 128n) - 1n;
