// Retransmissor SOMENTE LEITURA para a RPC oficial da Solana.
// Motivo: api.mainnet-beta.solana.com recusa (403) pedidos vindos de navegador.
// Segurança: só métodos de consulta, corpo pequeno, um único destino fixo,
// nenhuma chave ou dado guardado, e só atende o próprio site.

const UPSTREAM = "https://api.mainnet-beta.solana.com";
const METODOS = new Set(["getMultipleAccounts", "getAccountInfo", "getTokenAccountsByOwner", "getProgramAccounts", "getSlot"]);
const ORIGENS = [/^https:\/\/pooliana-painel(-[a-z0-9-]+)?\.vercel\.app$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && !ORIGENS.some((re) => re.test(origin))) return json(403, { error: { code: 403, message: "origem não permitida" } });
  const texto = await request.text();
  if (texto.length > 16_384) return json(413, { error: { code: 413, message: "pedido grande demais" } });
  let corpo: { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown };
  try { corpo = JSON.parse(texto); } catch { return json(400, { error: { code: 400, message: "JSON inválido" } }); }
  if (Array.isArray(corpo) || typeof corpo.method !== "string" || !METODOS.has(corpo.method) || !Array.isArray(corpo.params)) {
    return json(403, { error: { code: 403, message: "método não permitido (somente leitura)" } });
  }
  const r = await fetch(UPSTREAM, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: corpo.method, params: corpo.params }),
  });
  return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
