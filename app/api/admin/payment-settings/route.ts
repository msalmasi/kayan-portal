import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import { loadPaymentSettings } from "@/lib/payment-config";

const ROLE_RANK: Record<string, number> = {
  staff: 0, manager: 1, admin: 2, super_admin: 3,
};

/**
 * GET /api/admin/payment-settings
 * Returns the current payment configuration. All admin roles can read.
 */
export async function GET() {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = await loadPaymentSettings(auth.client);
  return NextResponse.json(settings);
}

/**
 * PATCH /api/admin/payment-settings
 * Update payment configuration. Admin+ only.
 *
 * Body (all fields optional — partial merge):
 *   { methods?: {...}, wallets?: {...}, wire_instructions?: {...} }
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only admin and super_admin can change payment settings
  if ((ROLE_RANK[auth.role] ?? 0) < ROLE_RANK.admin) {
    return NextResponse.json(
      { error: "Only admins can modify payment settings" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const current = await loadPaymentSettings(auth.client);

  // Deep-merge each section: incoming values override, everything else preserved
  const updated: Record<string, any> = {
    updated_at: new Date().toISOString(),
    updated_by: auth.email,
  };

  if (body.methods) {
    // Merge per-method: preserve unmentioned methods, merge mentioned ones
    const merged: Record<string, any> = { ...current.methods };
    for (const [id, val] of Object.entries(body.methods)) {
      merged[id] = { ...merged[id], ...(val as any) };
    }
    updated.methods = merged;
  }

  if (body.wallets) {
    updated.wallets = { ...current.wallets, ...body.wallets };
  }

  if (body.wire_instructions) {
    updated.wire_instructions = {
      ...current.wire_instructions,
      ...body.wire_instructions,
    };
  }

  // Upsert the single global row
  const { error } = await auth.client
    .from("payment_settings")
    .upsert({ id: "global", ...updated });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Return the fully merged settings
  const fresh = await loadPaymentSettings(auth.client);
  return NextResponse.json(fresh);
}
