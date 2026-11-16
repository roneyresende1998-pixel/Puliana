// Detecta tokens-golpe: nomes com links/convites ("visite site X para resgatar")
// são usados para atrair a vítima a um site falso que pede assinatura.
const RE = /(https?:|www\.|www`|\.com|\.io\b|\.xyz|\.org|t\.me|discord|claim|reward|airdrop|visit|\.gg|telegram|voucher)/i;

export function isSuspicious(symbol: string): boolean {
  return RE.test(symbol) || symbol.length > 20;
}

/** Símbolo seguro para exibir (corta e remove caracteres estranhos). */
export function safeSymbol(symbol: string): string {
  const s = symbol.replace(/[^\p{L}\p{N}.\-_$+ ]/gu, "").trim();
  return (s.length > 14 ? s.slice(0, 12) + "…" : s) || "?";
}
