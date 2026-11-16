// Formato único de posição, usado por todos os leitores (EVM e Solana).

export type TokenInfo = { address: string; symbol: string; decimals: number };

export type LpPosition = {
  key: string;
  id: string;
  chainKey: string;
  chainName: string;
  protocol: string;
  token0: TokenInfo;
  token1: TokenInfo;
  fee: number | null; // ex.: 0.003
  /** preços de token0 cotado em token1 */
  priceLower: number;
  priceUpper: number;
  priceCurrent: number;
  inRange: boolean;
  closed: boolean;
  amount0: number;
  amount1: number;
  fees0: number;
  fees1: number;
  /** true quando só deu para ler as taxas já registradas (pode estar abaixo do real) */
  feesApprox?: boolean;
  manageUrl?: string;
  explorerUrl?: string;
  /** endereço do token0/1 para buscar preço (rede no GeckoTerminal) */
  gecko: string;
};
