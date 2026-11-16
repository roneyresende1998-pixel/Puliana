import { test } from "node:test";
import assert from "node:assert/strict";
import { loadToken } from "../src/lib/token.ts";

test("panorama do token: só links https seguros, sem HTML na descrição", async () => {
  globalThis.fetch = (async (u: string) => {
    const url = String(u);
    if (url.includes("/info")) return new Response(JSON.stringify({ data: { attributes: {
      websites: ["https://ok.example", "javascript:alert(1)", "http://inseguro.example"], twitter_handle: "x\" onerror=1",
      holders: { count: 1234, distribution_percentage: { top_10: "80" } }, gt_score: 30, mint_authority: "yes", freeze_authority: "no",
    } } }));
    if (url.includes("/pools")) return new Response(JSON.stringify({ data: [], included: [] }));
    if (url.includes("geckoterminal")) return new Response(JSON.stringify({ data: { attributes: { name: "Teste", symbol: "TST", price_usd: "2", coingecko_coin_id: "teste" } } }));
    if (url.includes("coingecko.com/api/v3/coins/teste")) return new Response(JSON.stringify({
      name: "Teste", market_cap_rank: 50, categories: ["Meme"], description: { en: "<a href='https://mal.example'>clique</a> texto <script>x</script>" },
      links: { homepage: ["https://ok.example"] }, image: { large: "javascript:alert(1)" },
      market_data: { current_price: { usd: 2 }, market_cap: { usd: 100 }, fully_diluted_valuation: { usd: 1000 }, total_volume: { usd: 5 },
        ath: { usd: 10 }, ath_change_percentage: { usd: -80 }, ath_date: { usd: "2025-01-01T00:00:00Z" }, atl: { usd: 0.1 }, price_change_percentage_7d: -5 },
    }));
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  const t = await loadToken({ network: "solana", address: "Tst111111111111111111111111111111111111111" });
  assert.ok(t.links.every((l) => l.url.startsWith("https://")), "só https");
  assert.ok(!t.links.some((l) => l.url.includes("javascript")));
  assert.ok(!t.links.some((l) => l.nome === "X / Twitter"), "handle inválido descartado");
  assert.equal(t.imagem, null, "imagem javascript: descartada");
  assert.ok(!/[<>]/.test(t.descricao), "descrição sem tags");
  assert.equal(t.holders, 1234);
  assert.equal(t.mintAuthority, "yes");
  assert.equal(t.rank, 50);
  assert.equal(t.variacao.d7, -5);
});
