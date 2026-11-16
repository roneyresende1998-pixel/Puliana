import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Content-Security-Policy: o navegador só deixa o site carregar scripts do
// próprio domínio e só conversar com os hosts abaixo. Se alguém conseguir
// injetar código, ele não consegue mandar seus dados para fora nem carregar
// scripts de terceiros. Mantenha em sincronia com public/_headers e vercel.json.
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://api.geckoterminal.com https://*.publicnode.com",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

// Só no build de produção (o servidor de dev do Vite precisa de scripts inline).
function cspMeta(): Plugin {
  return {
    name: "csp-meta",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

export default defineConfig({
  plugins: [react(), cspMeta()],
  server: { port: 5174 },
  build: { sourcemap: false, modulePreload: { polyfill: false } },
});
