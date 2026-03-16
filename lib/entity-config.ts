// ============================================================
// Entity Configuration — white-label branding system
//
// All branding, logos, colors, and contact info live here.
// Server code calls getEntityConfig() to read from DB.
// Client code reads from /api/entity-config or EntityConfigProvider.
//
// Defaults are baked in so the portal works without any DB setup.
// Admins override via Entity Settings page.
// ============================================================

import { SupabaseClient, createClient } from "@supabase/supabase-js";

// ─── Type ────────────────────────────────────────────────────

export interface EntityConfig {
  // Identity
  entity_name: string;        // Legal name, e.g. "Kayan International Inc."
  project_name: string;       // Product/token name, e.g. "Kayan Token"
  token_ticker: string;       // Token symbol, e.g. "KAYAN"
  portal_title: string;       // Browser tab title
  issuer_jurisdiction: string; // ISO code, e.g. "LB" (Labuan), "KY" (Cayman), "VG" (BVI)

  // URLs
  portal_url: string;         // Full portal URL
  website_url: string;        // Marketing site
  logo_url: string;           // Logo on dark backgrounds (sidebar, login)
  logo_light_url: string;     // Logo on light backgrounds (emails)
  favicon_url: string;        // Favicon

  // Contact
  support_email: string;
  email_from_name: string;    // "Kayan Forest"
  email_from_address: string; // "noreply@kayanforest.com"

  // Colors (hex, no #)
  brand_primary: string;      // Main brand color (e.g. "1a3c2a")
  brand_accent: string;       // Lighter accent (e.g. "2d5f3f")
  scrollbar_color: string;    // Scrollbar thumb (e.g. "b3d7c1")
  scrollbar_hover: string;    // Scrollbar thumb on hover (e.g. "7dba97")

  // Legal
  footer_text: string;        // Email footer, e.g. "Kayan International Inc. • Confidential"
  disclaimer_entity: string;  // Entity name in disclaimer modal
  entity_address: string;     // Registered address for legal footer
  privacy_url: string;        // Privacy policy URL

  // Token supply (used by cap table)
  total_supply: number;       // Maximum token supply
  reserved_tokens: number;    // Tokens reserved (treasury, team, ecosystem)
  tge_date: string | null;    // Token Generation Event date (ISO string)

  // Labuan FSA
  labuan_net_worth_min: number;       // Minimum net worth (USD) for Labuan FSA qualification
  labuan_annual_income_min: number;   // Minimum annual income (USD) for Labuan FSA qualification

  // Compliance
  annual_recert_date: string | null;  // "MM-DD" for annual re-certification trigger
}

// ─── Defaults ────────────────────────────────────────────────

export const DEFAULT_ENTITY_CONFIG: EntityConfig = {
  entity_name: "Kayan International Inc.",
  project_name: "Kayan Token",
  token_ticker: "KAYAN",
  portal_title: "Kayan Token — Investor Portal",
  issuer_jurisdiction: "",

  portal_url: "https://kayan.panoptes.io",
  website_url: "https://www.kayanforest.com",
  logo_url: "https://kayanforest.com/wp-content/uploads/2025/06/kayan-white-logo-01.png",
  logo_light_url: "https://vwhnytgyjfrexekegkql.supabase.co/storage/v1/object/public/assets/kayan-white-logo-01.png",
  favicon_url: "/favicon.ico",

  support_email: "support@kayanforest.com",
  email_from_name: "Kayan Forest",
  email_from_address: "noreply@kayanforest.com",

  brand_primary: "1a3c2a",
  brand_accent: "2d5f3f",
  scrollbar_color: "b3d7c1",
  scrollbar_hover: "7dba97",

  footer_text: "Kayan International Inc. • Confidential",
  disclaimer_entity: "Kayan Token Investor Portal",
  entity_address: "",
  privacy_url: "",

  total_supply: 100_000_000,
  reserved_tokens: 0,
  tge_date: null,

  labuan_net_worth_min: 0,
  labuan_annual_income_min: 0,
  annual_recert_date: null,
};

// ─── Server-side reader ──────────────────────────────────────

let _cachedConfig: EntityConfig | null = null;
let _cacheTimestamp = 0;
const CACHE_TTL = 60_000; // 1 minute

/**
 * Read entity config from platform_settings.entity_config JSONB column.
 * Falls back to defaults for any missing keys.
 * Caches for 1 minute to avoid repeated DB reads.
 */
export async function getEntityConfig(
  supabase?: SupabaseClient
): Promise<EntityConfig> {
  const now = Date.now();

  // Return cached if fresh
  if (_cachedConfig && now - _cacheTimestamp < CACHE_TTL) {
    return _cachedConfig;
  }

  // Build client if not provided
  const client = supabase || createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const { data } = await client
      .from("platform_settings")
      .select("entity_config")
      .eq("id", true)
      .single();

    if (data?.entity_config && typeof data.entity_config === "object") {
      // Merge DB values over defaults (missing keys fall back)
      _cachedConfig = { ...DEFAULT_ENTITY_CONFIG, ...data.entity_config };
    } else {
      _cachedConfig = { ...DEFAULT_ENTITY_CONFIG };
    }
  } catch {
    _cachedConfig = { ...DEFAULT_ENTITY_CONFIG };
  }

  _cacheTimestamp = now;
  return _cachedConfig!;
}

/** Bust the cache (call after admin updates settings) */
export function invalidateEntityConfigCache() {
  _cachedConfig = null;
  _cacheTimestamp = 0;
}

// ─── Color palette generator ─────────────────────────────────

/**
 * Generate a 50–900 shade palette from a single hex color.
 * The input color maps to the 600 shade.
 * Lighter shades mix toward white, darker toward black.
 */
export function generatePalette(hex: string): Record<string, string> {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  const mix = (c: number, target: number, amount: number) =>
    Math.round(c + (target - c) * amount);

  const toHex = (r: number, g: number, b: number) =>
    [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");

  // Shade weights: how much to mix toward white (positive) or black (negative)
  // 600 = the input color (0 mixing)
  const shades: [string, number, number][] = [
    ["50",  255, 0.92],  // very light
    ["100", 255, 0.82],
    ["200", 255, 0.65],
    ["300", 255, 0.45],
    ["400", 255, 0.25],
    ["500", 255, 0.10],
    ["600", 0,   0.00],  // base color
    ["700", 0,   0.20],
    ["800", 0,   0.40],
    ["900", 0,   0.60],
  ];

  const palette: Record<string, string> = {};
  for (const [shade, target, amount] of shades) {
    palette[shade] = toHex(
      mix(r, target, amount),
      mix(g, target, amount),
      mix(b, target, amount)
    );
  }

  return palette;
}
