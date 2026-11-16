// Redes suportadas. Os RPCs aqui são a ÚNICA lista de nós que o site acessa
// (também travada na Content-Security-Policy em vite.config.ts / public/_headers).

export type EvmChain = {
  key: string;
  nome: string;
  chainId: number;
  rpc: string;
  gecko: string; // id da rede no GeckoTerminal
  explorer: string;
  /** NonfungiblePositionManager oficial da Uniswap v3 nessa rede */
  positionManager: string;
};

export const EVM_CHAINS: EvmChain[] = [
  {
    key: "arbitrum",
    nome: "Arbitrum",
    chainId: 42161,
    rpc: "https://arbitrum-one-rpc.publicnode.com",
    gecko: "arbitrum",
    explorer: "https://arbiscan.io",
    positionManager: "0xc36442b4a4522e871399cd717abdd847ab11fe88",
  },
  {
    key: "eth",
    nome: "Ethereum",
    chainId: 1,
    rpc: "https://ethereum-rpc.publicnode.com",
    gecko: "eth",
    explorer: "https://etherscan.io",
    positionManager: "0xc36442b4a4522e871399cd717abdd847ab11fe88",
  },
  {
    key: "base",
    nome: "Base",
    chainId: 8453,
    rpc: "https://base-rpc.publicnode.com",
    gecko: "base",
    explorer: "https://basescan.org",
    positionManager: "0x03a520b32c04bf3beef7beb72e919cf822ed34f1",
  },
  {
    key: "optimism",
    nome: "Optimism",
    chainId: 10,
    rpc: "https://optimism-rpc.publicnode.com",
    gecko: "optimism",
    explorer: "https://optimistic.etherscan.io",
    positionManager: "0xc36442b4a4522e871399cd717abdd847ab11fe88",
  },
  {
    key: "polygon",
    nome: "Polygon",
    chainId: 137,
    rpc: "https://polygon-bor-rpc.publicnode.com",
    gecko: "polygon_pos",
    explorer: "https://polygonscan.com",
    positionManager: "0xc36442b4a4522e871399cd717abdd847ab11fe88",
  },
  {
    key: "bsc",
    nome: "BNB Chain",
    chainId: 56,
    rpc: "https://bsc-rpc.publicnode.com",
    gecko: "bsc",
    explorer: "https://bscscan.com",
    positionManager: "0x7b8a01b39d58278b5de7e48c8449c9f4f5170613",
  },
];

/** Redes do explorador de pools (inclui Solana, que só tem leitura via GeckoTerminal). */
export const EXPLORER_NETWORKS: { gecko: string; nome: string }[] = [
  ...EVM_CHAINS.map((c) => ({ gecko: c.gecko, nome: c.nome })),
  { gecko: "solana", nome: "Solana" },
];

export function chainByKey(key: string): EvmChain {
  const c = EVM_CHAINS.find((x) => x.key === key);
  if (!c) throw new Error(`Rede desconhecida: ${key}`);
  return c;
}

export function chainById(id: number): EvmChain | undefined {
  return EVM_CHAINS.find((x) => x.chainId === id);
}
