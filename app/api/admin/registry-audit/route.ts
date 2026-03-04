import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";

/**
 * GET /api/admin/registry-audit
 *
 * Query the registry audit log. Admin-only.
 *
 * Query params:
 *   ?investor_id=uuid   — filter by investor
 *   ?round_id=uuid      — filter by round
 *   ?action=string      — filter by action type
 *   ?limit=50           — max rows (default 50, max 200)
 *   ?offset=0           — pagination offset
 */
export async function GET(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const investorId = sp.get("investor_id");
  const roundId = sp.get("round_id");
  const action = sp.get("action");
  const limit = Math.min(Number(sp.get("limit")) || 50, 200);
  const offset = Number(sp.get("offset")) || 0;

  let query = auth.client
    .from("registry_audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (investorId) query = query.eq("investor_id", investorId);
  if (roundId) query = query.eq("round_id", roundId);
  if (action) query = query.eq("action", action);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data || [], total: count || 0 });
}
