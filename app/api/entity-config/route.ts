import { NextRequest, NextResponse } from "next/server";
import { getEntityConfig, invalidateEntityConfigCache, generatePalette } from "@/lib/entity-config";

/**
 * GET /api/entity-config
 *
 * Public endpoint — returns branding config + generated color palette.
 * Used by EntityConfigProvider to set CSS variables and branding.
 * No auth required (it's just logos, names, and colors).
 *
 * ?fresh=1 — bypass server cache (used by settings page after saves)
 */
export async function GET(request: NextRequest) {
  // Bust cache if requested
  if (request.nextUrl.searchParams.has("t")) {
    invalidateEntityConfigCache();
  }

  const config = await getEntityConfig();
  const palette = generatePalette(config.brand_primary);

  return NextResponse.json({
    ...config,
    palette,
  });
}
