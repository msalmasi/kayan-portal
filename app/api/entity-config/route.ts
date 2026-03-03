import { NextResponse } from "next/server";
import { getEntityConfig, generatePalette } from "@/lib/entity-config";

/**
 * GET /api/entity-config
 *
 * Public endpoint — returns branding config + generated color palette.
 * Used by EntityConfigProvider to set CSS variables and branding.
 * No auth required (it's just logos, names, and colors).
 */
export async function GET() {
  const config = await getEntityConfig();
  const palette = generatePalette(config.brand_primary);

  return NextResponse.json({
    ...config,
    palette,
  });
}
