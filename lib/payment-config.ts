/**
 * Payment configuration — receiving wallets, wire instructions, and
 * token contract addresses for on-chain verification.
 *
 * All wallet addresses and instructions are loaded from env vars
 * so they can be changed without redeploying.
 */

// ─── Receiving wallets ──────────────────────────────────────

export const WALLETS = {
  /** EVM wallet (Ethereum mainnet) — receives USDC and USDT */
  ethereum: process.env.RECEIVING_WALLET_ETH || "",
  /** Solana wallet — receives USDC SPL */
  solana: process.env.RECEIVING_WALLET_SOL || "",
} as const;

// ─── Token contract addresses ───────────────────────────────

export const TOKEN_CONTRACTS = {
  /** USDC on Ethereum (ERC-20) */
  usdc_eth: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  /** USDT on Ethereum (ERC-20) */
  usdt_eth: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  /** USDC on Solana (SPL token mint) */
  usdc_sol: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
} as const;

// ─── Token decimals (for converting on-chain amounts) ───────

export const TOKEN_DECIMALS: Record<string, number> = {
  usdc_eth: 6,
  usdt_eth: 6,
  usdc_sol: 6,
};

// ─── API keys for blockchain explorers ──────────────────────

export const EXPLORER_KEYS = {
  etherscan: process.env.ETHERSCAN_API_KEY || "",
  // Solana uses public RPC, no key required for basic queries
  solana_rpc: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
};

// ─── Wire transfer instructions ─────────────────────────────

export const WIRE_INSTRUCTIONS = {
  bank_name: process.env.WIRE_BANK_NAME || "To be provided",
  account_name: process.env.WIRE_ACCOUNT_NAME || "To be provided",
  account_number: process.env.WIRE_ACCOUNT_NUMBER || "",
  routing_number: process.env.WIRE_ROUTING_NUMBER || "",
  swift_code: process.env.WIRE_SWIFT_CODE || "",
  reference_note: "Include your full name and 'Kayan Token' as reference",
};

// ─── Payment method display config ──────────────────────────

export interface PaymentMethodConfig {
  id: string;
  label: string;
  sublabel: string;
  enabled: boolean;
  icon: string;         // emoji or short label
  chain?: string;
  token?: string;
}

export const PAYMENT_METHODS: PaymentMethodConfig[] = [
  {
    id: "wire",
    label: "Wire Transfer (USD)",
    sublabel: "Manual verification",
    enabled: true,
    icon: "🏦",
  },
  {
    id: "usdc_eth",
    label: "USDC on Ethereum",
    sublabel: "ERC-20 · auto-verified",
    enabled: true,
    icon: "Ξ",
    chain: "ethereum",
    token: "usdc",
  },
  {
    id: "usdc_sol",
    label: "USDC on Solana",
    sublabel: "SPL token · auto-verified",
    enabled: true,
    icon: "◎",
    chain: "solana",
    token: "usdc",
  },
  {
    id: "usdt_eth",
    label: "USDT on Ethereum",
    sublabel: "ERC-20 · auto-verified",
    enabled: true,
    icon: "Ξ",
    chain: "ethereum",
    token: "usdt",
  },
  {
    id: "credit_card",
    label: "Credit Card",
    sublabel: "Coming soon",
    enabled: false,
    icon: "💳",
  },
];

/**
 * Get the receiving wallet address for a given payment method.
 */
export function getReceivingWallet(method: string): string | null {
  if (method === "usdc_eth" || method === "usdt_eth") return WALLETS.ethereum;
  if (method === "usdc_sol") return WALLETS.solana;
  return null;
}

/**
 * Get the token contract address for a given payment method.
 */
export function getTokenContract(method: string): string | null {
  return (TOKEN_CONTRACTS as Record<string, string>)[method] || null;
}
