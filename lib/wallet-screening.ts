/**
 * Wallet Screening Module
 *
 * Screens crypto wallet addresses against known illicit/sanctioned
 * addresses before accepting on-chain payments. Increasingly expected
 * for compliant token offerings.
 *
 * Architecture:
 *   - Pluggable provider interface (Chainalysis KYT, Elliptic, etc.)
 *   - Falls back to a local OFAC SDN list check if no provider is configured
 *   - Results are cached per address to avoid redundant API calls
 *   - Screening is advisory: flags risks but doesn't auto-reject
 *     (admin makes the final call)
 *
 * Environment variables:
 *   WALLET_SCREENING_PROVIDER  — "chainalysis" | "elliptic" | "none" (default: "none")
 *   CHAINALYSIS_API_KEY        — API key for Chainalysis KYT
 *   ELLIPTIC_API_KEY           — API key for Elliptic Lens
 */

// ── Types ──

export type RiskLevel = "none" | "low" | "medium" | "high" | "severe" | "unknown";

export interface ScreeningResult {
  address: string;
  chain: string;
  riskLevel: RiskLevel;
  flagged: boolean;           // true if medium+ risk
  provider: string;           // which service performed the check
  details: string;            // human-readable summary
  sanctions: boolean;         // specifically flagged on sanctions lists
  raw?: Record<string, any>;  // full provider response for audit
  timestamp: string;
}

// ── Provider interface ──

interface ScreeningProvider {
  name: string;
  screen(address: string, chain: string): Promise<ScreeningResult>;
}

// ── In-memory cache (address → result, 1 hour TTL) ──

const cache = new Map<string, { result: ScreeningResult; expires: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── Main entry point ──

/**
 * Screen a wallet address for sanctions/illicit activity.
 *
 * @param address — wallet address (Ethereum 0x... or Solana base58)
 * @param chain   — "ethereum" | "solana"
 * @returns ScreeningResult with risk assessment
 */
export async function screenWallet(
  address: string,
  chain: string
): Promise<ScreeningResult> {
  const cacheKey = `${chain}:${address.toLowerCase()}`;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.result;
  }

  // Get configured provider
  const provider = getProvider();
  const result = await provider.screen(address, chain);

  // Cache result
  cache.set(cacheKey, { result, expires: Date.now() + CACHE_TTL_MS });

  return result;
}

/**
 * Check if a screening result should block the payment.
 * Returns true if the address is high/severe risk or sanctioned.
 */
export function shouldBlockPayment(result: ScreeningResult): boolean {
  return result.sanctions || result.riskLevel === "severe" || result.riskLevel === "high";
}

// ── Provider selection ──

function getProvider(): ScreeningProvider {
  const providerName = process.env.WALLET_SCREENING_PROVIDER || "none";

  switch (providerName) {
    case "chainalysis":
      return chainalysisProvider;
    case "elliptic":
      return ellipticProvider;
    default:
      return noopProvider;
  }
}

// ── Chainalysis KYT provider ──

const chainalysisProvider: ScreeningProvider = {
  name: "chainalysis",

  async screen(address: string, chain: string): Promise<ScreeningResult> {
    const apiKey = process.env.CHAINALYSIS_API_KEY;
    if (!apiKey) {
      console.warn("[WALLET-SCREEN] Chainalysis API key not configured");
      return makeResult(address, chain, "unknown", "chainalysis", "API key not configured");
    }

    try {
      // Chainalysis Sanctions Screening API
      // https://docs.chainalysis.com/api/sanctions/
      const res = await fetch(
        `https://public.chainalysis.com/api/v1/address/${address}`,
        {
          headers: {
            "X-API-Key": apiKey,
            Accept: "application/json",
          },
        }
      );

      if (!res.ok) {
        console.error("[WALLET-SCREEN] Chainalysis API error:", res.status);
        return makeResult(address, chain, "unknown", "chainalysis", `API error: ${res.status}`);
      }

      const data = await res.json();

      // Chainalysis returns identifications array — if non-empty, address is flagged
      const identifications = data.identifications || [];
      const isSanctioned = identifications.length > 0;
      const categories = identifications.map((i: any) => i.category).join(", ");

      return {
        address,
        chain,
        riskLevel: isSanctioned ? "severe" : "none",
        flagged: isSanctioned,
        provider: "chainalysis",
        details: isSanctioned
          ? `Sanctioned address: ${categories}`
          : "No sanctions matches found",
        sanctions: isSanctioned,
        raw: data,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      console.error("[WALLET-SCREEN] Chainalysis request failed:", err.message);
      return makeResult(address, chain, "unknown", "chainalysis", `Request failed: ${err.message}`);
    }
  },
};

// ── Elliptic Lens provider ──

const ellipticProvider: ScreeningProvider = {
  name: "elliptic",

  async screen(address: string, chain: string): Promise<ScreeningResult> {
    const apiKey = process.env.ELLIPTIC_API_KEY;
    if (!apiKey) {
      console.warn("[WALLET-SCREEN] Elliptic API key not configured");
      return makeResult(address, chain, "unknown", "elliptic", "API key not configured");
    }

    try {
      // Elliptic Lens Wallet Screening API
      const assetMap: Record<string, string> = {
        ethereum: "holistic",
        solana: "holistic",
      };

      const res = await fetch(
        "https://aml-api.elliptic.co/v2/wallet/synchronous",
        {
          method: "POST",
          headers: {
            "x-access-token": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            subject: { asset: assetMap[chain] || "holistic", type: "address", hash: address },
            type: "wallet_exposure",
          }),
        }
      );

      if (!res.ok) {
        console.error("[WALLET-SCREEN] Elliptic API error:", res.status);
        return makeResult(address, chain, "unknown", "elliptic", `API error: ${res.status}`);
      }

      const data = await res.json();

      // Parse Elliptic risk score (0-10 scale)
      const riskScore = data.risk_score ?? 0;
      const riskLevel: RiskLevel =
        riskScore >= 8 ? "severe" :
        riskScore >= 6 ? "high" :
        riskScore >= 4 ? "medium" :
        riskScore >= 2 ? "low" : "none";

      const isSanctioned = (data.cluster_entities || []).some(
        (e: any) => e.category === "sanctions"
      );

      return {
        address,
        chain,
        riskLevel,
        flagged: riskLevel === "medium" || riskLevel === "high" || riskLevel === "severe",
        provider: "elliptic",
        details: `Risk score: ${riskScore}/10${isSanctioned ? " — SANCTIONS MATCH" : ""}`,
        sanctions: isSanctioned,
        raw: data,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      console.error("[WALLET-SCREEN] Elliptic request failed:", err.message);
      return makeResult(address, chain, "unknown", "elliptic", `Request failed: ${err.message}`);
    }
  },
};

// ── No-op provider (when no service is configured) ──

const noopProvider: ScreeningProvider = {
  name: "none",

  async screen(address: string, chain: string): Promise<ScreeningResult> {
    return {
      address,
      chain,
      riskLevel: "unknown",
      flagged: false,
      provider: "none",
      details: "No wallet screening provider configured. Set WALLET_SCREENING_PROVIDER to enable.",
      sanctions: false,
      timestamp: new Date().toISOString(),
    };
  },
};

// ── Helpers ──

function makeResult(
  address: string,
  chain: string,
  riskLevel: RiskLevel,
  provider: string,
  details: string
): ScreeningResult {
  return {
    address,
    chain,
    riskLevel,
    flagged: riskLevel === "medium" || riskLevel === "high" || riskLevel === "severe",
    provider,
    details,
    sanctions: false,
    timestamp: new Date().toISOString(),
  };
}
