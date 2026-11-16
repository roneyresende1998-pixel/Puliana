// Redes e protocolos suportados na leitura de posições. Os RPCs aqui são os
// únicos nós que o site acessa (também travados na Content-Security-Policy).
// Todos os endereços de contrato foram conferidos on-chain (name() e factory()).

export type EvmChain = {
  key: string;
  nome: string;
  chainId: number;
  rpc: string;
  gecko: string; // id da rede no GeckoTerminal
  explorer: string;
};

export type V3Protocol = {
  chain: string;
  nome: string;
  kind: "v3" | "slipstream"; // slipstream = Aerodrome/Velodrome (tickSpacing no lugar da taxa)
  positionManager: string;
  manage: (chainKey: string, id: string) => string;
};

export const EVM_CHAINS: EvmChain[] = [
  { key: "eth", nome: "Ethereum", chainId: 1, rpc: "https://ethereum-rpc.publicnode.com", gecko: "eth", explorer: "https://etherscan.io" },
  { key: "arbitrum", nome: "Arbitrum", chainId: 42161, rpc: "https://arbitrum-one-rpc.publicnode.com", gecko: "arbitrum", explorer: "https://arbiscan.io" },
  { key: "base", nome: "Base", chainId: 8453, rpc: "https://base-rpc.publicnode.com", gecko: "base", explorer: "https://basescan.org" },
  { key: "optimism", nome: "Optimism", chainId: 10, rpc: "https://optimism-rpc.publicnode.com", gecko: "optimism", explorer: "https://optimistic.etherscan.io" },
  { key: "polygon", nome: "Polygon", chainId: 137, rpc: "https://polygon-bor-rpc.publicnode.com", gecko: "polygon_pos", explorer: "https://polygonscan.com" },
  { key: "bsc", nome: "BNB Chain", chainId: 56, rpc: "https://bsc-rpc.publicnode.com", gecko: "bsc", explorer: "https://bscscan.com" },
  { key: "avalanche", nome: "Avalanche", chainId: 43114, rpc: "https://avalanche-c-chain-rpc.publicnode.com", gecko: "avax", explorer: "https://snowtrace.io" },
  { key: "unichain", nome: "Unichain", chainId: 130, rpc: "https://unichain-rpc.publicnode.com", gecko: "unichain", explorer: "https://uniscan.xyz" },
  { key: "linea", nome: "Linea", chainId: 59144, rpc: "https://linea-rpc.publicnode.com", gecko: "linea", explorer: "https://lineascan.build" },
];

const UNI_SLUG: Record<string, string> = { eth: "ethereum", bsc: "bnb", avalanche: "avalanche" };
const uni = (c: string, id: string) => `https://app.uniswap.org/positions/v3/${UNI_SLUG[c] ?? c}/${id}`;
const PANCAKE_SLUG: Record<string, string> = { eth: "eth", bsc: "bsc", arbitrum: "arb", base: "base", linea: "linea" };
const pancake = (c: string, id: string) => `https://pancakeswap.finance/liquidity/${id}?chain=${PANCAKE_SLUG[c] ?? c}`;
const sushi = () => `https://www.sushi.com/portfolio`;

const UNI_NPM = "0xc36442b4a4522e871399cd717abdd847ab11fe88";
const PANCAKE_NPM = "0x46a15b0b27311cedf172ab29e4f4766fbe7f4364";

export const V3_PROTOCOLS: V3Protocol[] = [
  // Uniswap v3
  ...["eth", "arbitrum", "optimism", "polygon"].map((chain) => ({ chain, nome: "Uniswap v3", kind: "v3" as const, positionManager: UNI_NPM, manage: uni })),
  { chain: "base", nome: "Uniswap v3", kind: "v3", positionManager: "0x03a520b32c04bf3beef7beb72e919cf822ed34f1", manage: uni },
  { chain: "bsc", nome: "Uniswap v3", kind: "v3", positionManager: "0x7b8a01b39d58278b5de7e48c8449c9f4f5170613", manage: uni },
  { chain: "avalanche", nome: "Uniswap v3", kind: "v3", positionManager: "0x655c406ebfa14ee2006250925e54ec43ad184f8b", manage: uni },
  { chain: "unichain", nome: "Uniswap v3", kind: "v3", positionManager: "0x943e6e07a7e8e791dafc44083e54041d743c46e9", manage: uni },
  // PancakeSwap v3 (mesmo endereço em todas)
  ...["bsc", "eth", "arbitrum", "base", "linea"].map((chain) => ({ chain, nome: "PancakeSwap v3", kind: "v3" as const, positionManager: PANCAKE_NPM, manage: pancake })),
  // SushiSwap v3
  { chain: "arbitrum", nome: "SushiSwap v3", kind: "v3", positionManager: "0xf0cbce1942a68beb3d1b73f0dd86c8dcc363ef49", manage: sushi },
  { chain: "base", nome: "SushiSwap v3", kind: "v3", positionManager: "0x80c7dd17b01855a6d2347444a0fcc36136a314de", manage: sushi },
  { chain: "eth", nome: "SushiSwap v3", kind: "v3", positionManager: "0x2214a42d8e2a1d20635c2cb0664422c528b6a432", manage: sushi },
  { chain: "polygon", nome: "SushiSwap v3", kind: "v3", positionManager: "0xb7402ee99f0a008e461098ac3a27f4957df89a40", manage: sushi },
  { chain: "bsc", nome: "SushiSwap v3", kind: "v3", positionManager: "0xf70c086618dcf2b1a461311275e00d6b722ef914", manage: sushi },
  { chain: "optimism", nome: "SushiSwap v3", kind: "v3", positionManager: "0x1af415a1eba07a4986a52b6f2e7de7003d82231e", manage: sushi },
  // Slipstream
  { chain: "base", nome: "Aerodrome", kind: "slipstream", positionManager: "0x827922686190790b37229fd06084350e74485b72", manage: () => "https://aerodrome.finance/dash" },
  { chain: "optimism", nome: "Velodrome", kind: "slipstream", positionManager: "0x416b433906b1b72fa758e166e239c43d68dc6f29", manage: () => "https://velodrome.finance/dash" },
];

export function chainByKey(key: string): EvmChain {
  const c = EVM_CHAINS.find((x) => x.key === key);
  if (!c) throw new Error(`Rede desconhecida: ${key}`);
  return c;
}

export function chainById(id: number): EvmChain | undefined {
  return EVM_CHAINS.find((x) => x.chainId === id);
}
