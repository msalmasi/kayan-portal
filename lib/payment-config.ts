/**
 * Payment configuration.
 *
 * Static constants (token contracts, decimals, explorer keys) live here.
 * Dynamic config (method toggles, wallets, wire instructions) is stored
 * in the `payment_settings` DB table and loaded via loadPaymentSettings().
 *
 * Env vars are used as fallbacks during initial setup only.
 */

import { SupabaseClient } from "@supabase/supabase-js";

// ─── Token contract addresses (immutable, never change) ─────

export const TOKEN_CONTRACTS = {
  usdc_eth: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  usdt_eth: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  usdc_sol: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
} as const;

// ─── Token decimals (immutable) ─────────────────────────────

export const TOKEN_DECIMALS: Record<string, number> = {
  usdc_eth: 6,
  usdt_eth: 6,
  usdc_sol: 6,
};

// ─── API keys for blockchain explorers (env-only, sensitive) ─

export const EXPLORER_KEYS = {
  etherscan: process.env.ETHERSCAN_API_KEY || "",
  solana_rpc: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
};

// ─── Types ──────────────────────────────────────────────────

export interface MethodConfig {
  enabled: boolean;
  label: string;
  sublabel: string;
  icon: string;
}

export interface PaymentSettings {
  methods: Record<string, MethodConfig>;
  wallets: { ethereum: string; solana: string };
  wire_instructions: {
    bank_name: string;
    account_name: string;
    account_number: string;
    routing_number: string;
    swift_code: string;
    reference_note: string;
  };
  /** Default business days after capital call issuance for payment deadline */
  capital_call_payment_days: number;
}

// ─── Default config (used if DB row doesn't exist yet) ──────

const DEFAULTS: PaymentSettings = {
  methods: {
    wire:        { enabled: false, label: "Wire Transfer (USD)", sublabel: "Manual verification", icon: "🏦" },
    usdc_eth:    { enabled: true,  label: "USDC on Ethereum",   sublabel: "ERC-20 · auto-verified", icon: "Ξ" },
    usdc_sol:    { enabled: true,  label: "USDC on Solana",     sublabel: "SPL token · auto-verified", icon: "◎" },
    usdt_eth:    { enabled: true,  label: "USDT on Ethereum",   sublabel: "ERC-20 · auto-verified", icon: "Ξ" },
    credit_card: { enabled: false, label: "Credit Card",        sublabel: "Coming soon", icon: "💳" },
  },
  wallets: {
    ethereum: "",
    solana: "",
  },
  wire_instructions: {
    bank_name: "",
    account_name: "",
    account_number: "",
    routing_number: "",
    swift_code: "",
    reference_note: "Include your full name and 'Kayan Token' as reference",
  },
  capital_call_payment_days: 10,
};

// ─── Load from database ─────────────────────────────────────

/**
 * Load payment settings from the database.
 * Falls back to DEFAULTS if the row doesn't exist.
 */
export async function loadPaymentSettings(
  supabase: SupabaseClient
): Promise<PaymentSettings> {
  try {
    const { data } = await supabase
      .from("payment_settings")
      .select("methods, wallets, wire_instructions, capital_call_payment_days")
      .eq("id", "global")
      .single();

    if (!data) return DEFAULTS;

    return {
      methods: { ...DEFAULTS.methods, ...(data.methods || {}) },
      wallets: { ...DEFAULTS.wallets, ...(data.wallets || {}) },
      wire_instructions: { ...DEFAULTS.wire_instructions, ...(data.wire_instructions || {}) },
      capital_call_payment_days: data.capital_call_payment_days ?? DEFAULTS.capital_call_payment_days,
    };
  } catch {
    return DEFAULTS;
  }
}

// ─── Convenience helpers ────────────────────────────────────

/** Get receiving wallet for a method from loaded settings */
export function getWalletForMethod(
  method: string,
  wallets: PaymentSettings["wallets"]
): string {
  if (method === "usdc_eth" || method === "usdt_eth") return wallets.ethereum;
  if (method === "usdc_sol") return wallets.solana;
  return "";
}

/** Get the ordered list of methods for display */
export function getMethodList(
  methods: Record<string, MethodConfig>
): Array<MethodConfig & { id: string }> {
  const ORDER = ["wire", "usdc_eth", "usdc_sol", "usdt_eth", "credit_card"];
  return ORDER
    .filter((id) => methods[id])
    .map((id) => ({ id, ...methods[id] }));
}

/** Get token contract address for a given method */
export function getTokenContract(method: string): string | null {
  return (TOKEN_CONTRACTS as Record<string, string>)[method] || null;
}
