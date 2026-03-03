import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import { getEntityConfig, invalidateEntityConfigCache, DEFAULT_ENTITY_CONFIG, EntityConfig } from "@/lib/entity-config";

/**
 * GET /api/admin/entity-config
 * Read current entity config (admin only).
 */
export async function GET() {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await getEntityConfig(auth.client);
  return NextResponse.json(config);
}

/**
 * PUT /api/admin/entity-config
 * Update entity config. Admin+ only.
 *
 * Body: partial EntityConfig — only provided keys are updated.
 * Merges with defaults so incomplete configs still work.
 */
export async function PUT(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["admin", "super_admin"].includes(auth.role)) {
    return NextResponse.json(
      { error: "Only admins can update entity settings" },
      { status: 403 }
    );
  }

  const updates = await request.json() as Partial<EntityConfig>;

  // Read current config, merge updates
  const current = await getEntityConfig(auth.client);
  const merged = { ...current, ...updates };

  // Strip out any keys that match defaults (store only overrides)
  const overrides: Record<string, any> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value !== (DEFAULT_ENTITY_CONFIG as any)[key]) {
      overrides[key] = value;
    }
  }

  const { error } = await auth.client
    .from("platform_settings")
    .update({ entity_config: Object.keys(overrides).length > 0 ? overrides : null })
    .eq("id", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Bust the server cache so subsequent reads pick up changes
  invalidateEntityConfigCache();

  return NextResponse.json({
    ...DEFAULT_ENTITY_CONFIG,
    ...overrides,
    message: "Entity settings updated",
  });
}
