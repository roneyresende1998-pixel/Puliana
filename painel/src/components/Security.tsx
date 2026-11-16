const DOMINIO = (import.meta.env.VITE_DOMINIO_OFICIAL as string | undefined)?.trim();

export function DomainWarning() {
  const host = location.hostname;
  if (!DOMINIO || host === DOMINIO || host === "localhost" || host === "127.0.0.1") return null;
  return (
    <div className="banner perigo">
      ⚠️ Você está em <b>{host}</b>, mas o endereço oficial deste painel é <b>{DOMINIO}</b>. Pode ser um site falso (phishing). Feche esta aba e NÃO conecte sua carteira.
    </div>
  );
}

export default function Security() {
  return (
    <section className="seguranca">
      <div className="card">
        <h2>🔒 Como este painel protege sua carteira</h2>
        <ul className="check">
          <li><b>Somente leitura, por construção.</b> Na carteira EVM (MetaMask, Rabby…) o código só consegue pedir o seu endereço e a rede: assinatura, transação, aprovação de token e troca de rede são <b>bloqueadas antes de chegar à carteira</b> (lista branca em <code>safeWallet.ts</code>, com teste). Na carteira Solana (Phantom, Solflare…) o painel só chama “conectar” e lê a chave pública. Nenhuma função de assinatura existe no código, e um teste automático falha se alguém tentar colocar.</li>
          <li><b>Não precisa conectar.</b> O modo <b>Observar</b> lê qualquer endereço público direto da blockchain. Para acompanhar suas pools no dia a dia, prefira ele: zero permissão concedida.</li>
          <li><b>Nenhuma chave privada, nenhuma seed.</b> O site não tem campo para isso e um teste falha se alguém tentar adicionar. Quem pedir sua seed é golpista — sempre.</li>
          <li><b>Sem banco de dados.</b> Tudo roda no seu navegador. Só ficam salvos (no próprio navegador) os endereços públicos que você escolheu acompanhar. A única peça no servidor é um retransmissor da RPC oficial da Solana (que recusa navegadores), e ele só aceita métodos de <b>consulta</b>. Envio de transação é recusado ali também.</li>
          <li><b>Conexões travadas.</b> A Content-Security-Policy só permite falar com o GeckoTerminal e o DefiLlama (dados de pools e preços), os nós públicos PublicNode (blockchains EVM) e o retransmissor do próprio site (Solana). Scripts externos, iframes e envio de formulários são proibidos — isso barra a maioria dos ataques de injeção.</li>
          <li><b>Alerta de token-golpe.</b> Posições com tokens cujo nome traz link ou convite (“visite site X para resgatar”) são marcadas em vermelho e ficam fora do total. Esse é um golpe comum para levar você a um site falso que pede assinatura.</li>
          <li><b>Poucas dependências, versões fixas.</b> Só React em produção; nada de bibliotecas de carteira de terceiros (vetor comum de roubo em ataques de supply-chain).</li>
        </ul>
      </div>
      <div className="card">
        <h2>✅ Sua parte (checklist)</h2>
        <ul className="check">
          <li><b>Este site nunca vai pedir assinatura.</b> Se a carteira abrir um pedido de assinatura ou transação enquanto você usa o painel, <b>rejeite</b> — algo está errado.</li>
          <li>Acesse sempre pelo <b>favorito</b> salvo, nunca por link de Telegram/Discord/Google Ads. Confira o domínio na barra do navegador.</li>
          <li>Use uma <b>carteira de hardware</b> (Ledger/Trezor) para o patrimônio principal, e uma carteira separada para experimentar sites novos.</li>
          <li>Revise e revogue aprovações antigas periodicamente em <a href="https://revoke.cash" target="_blank" rel="noopener noreferrer">revoke.cash ↗</a> — aprovações infinitas são o maior vetor de roubo em DeFi.</li>
          <li>Para coletar taxas ou mexer em posições, use o site oficial da Uniswap, conferindo o domínio <code>app.uniswap.org</code>.</li>
          <li>"Deixar conectada" aqui é seguro porque a conexão só revela seu endereço. O perigo real está em <b>assinar</b> mensagens/aprovações em sites desconhecidos.</li>
        </ul>
      </div>
      <div className="card">
        <h2>🚧 O que o Revert tem e este painel não faz (de propósito)</h2>
        <p>Auto-compound, auto-range, Revert Lend e ações em 1 clique exigem que você <b>aprove ou deposite seu NFT de posição em contratos inteligentes</b>. Isso só é seguro com contratos auditados profissionalmente — e mesmo o Revert já sofreu exploits. Um contrato caseiro sem auditoria seria exatamente o tipo de risco que você quer evitar. Por isso este painel analisa e simula; a execução fica com a interface oficial da Uniswap.</p>
      </div>
    </section>
  );
}
