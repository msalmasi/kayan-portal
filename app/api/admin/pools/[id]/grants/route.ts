import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import { getEntityConfig } from "@/lib/entity-config";
import { calculateUnlocked } from "@/lib/vesting";

/**
 * GET /api/admin/pools/[id]/grants
 *
 * List grants for a pool with computed vesting data.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const poolId = params.id;
  const sp = request.nextUrl.searchParams;
  const status = sp.get("status") || "";
  const page = Number(sp.get("page") || "0");
  const limit = Math.min(Number(sp.get("limit") || "50"), 200);

  const config = await getEntityConfig(auth.client);
  const tgeDate = config.tge_date || null;
  const now = new Date();
  const monthsSinceTGE = tgeDate
    ? Math.max(0, Math.floor((now.getTime() - new Date(tgeDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
    : 0;

  let query = auth.client
    .from("pool_grants")
    .select("*", { count: "exact" })
    .eq("pool_id", poolId)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  query = query.range(page * limit, page * limit + limit - 1);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with vesting calculations
  const grants = ((data || []) as any[]).map((g) => {
    const months = getEffectiveMonths(g, tgeDate, monthsSinceTGE);
    const tokenAmount = Number(g.token_amount) || 0;
    const vested = calculateUnlocked(
      tokenAmount,
      Number(g.tge_unlock_pct) || 0,
      Number(g.cliff_months) || 0,
      Number(g.vesting_months) || 1,
      months
    );
    const totalVestingMonths = (Number(g.cliff_months) || 0) + (Number(g.vesting_months) || 0);
    const monthsRemaining = Math.max(0, totalVestingMonths - monthsSinceTGE);

    return {
      ...g,
      tokens_vested: Math.round(vested),
      tokens_unvested: Math.round(tokenAmount - vested),
      pct_vested: tokenAmount > 0 ? Math.min(100, (vested / tokenAmount) * 100) : 0,
      months_until_fully_vested: g.status === "terminated" ? 0 : monthsRemaining,
    };
  });

  return NextResponse.json({ grants, total: count || 0 });
}

/**
 * POST /api/admin/pools/[id]/grants
 *
 * Actions: create, update, terminate, cancel, delete
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const poolId = params.id;
  const body = await request.json();
  const { action } = body;

  // ── CREATE ──
  if (action === "create") {
    const {
      recipient_name, recipient_email, recipient_role, recipient_type,
      token_amount, grant_date, exercise_price,
      tge_unlock_pct, cliff_months, vesting_months,
      wallet_address, notes,
    } = body;

    if (!recipient_name || !token_amount) {
      return NextResponse.json({ error: "recipient_name and token_amount required" }, { status: 400 });
    }

    // Validate against pool budget
    const { data: pool } = await auth.client
      .from("token_pools")
      .select("token_budget")
      .eq("id", poolId)
      .single();

    if (!pool) return NextResponse.json({ error: "Pool not found" }, { status: 404 });

    const { data: existing } = await auth.client
      .from("pool_grants")
      .select("token_amount")
      .eq("pool_id", poolId)
      .neq("status", "cancelled");

    const totalGranted = ((existing || []) as any[]).reduce((s, g) => s + (Number(g.token_amount) || 0), 0);
    const available = Number(pool.token_budget) - totalGranted;

    if (Number(token_amount) > available) {
      return NextResponse.json({ error: `Exceeds pool budget. Available: ${available.toLocaleString()} tokens` }, { status: 400 });
    }

    const { data: grant, error } = await auth.client
      .from("pool_grants")
      .insert({
        pool_id: poolId,
        recipient_name,
        recipient_email: recipient_email || null,
        recipient_role: recipient_role || null,
        recipient_type: recipient_type || "employee",
        token_amount: Number(token_amount),
        grant_date: grant_date || new Date().toISOString().split("T")[0],
        exercise_price: exercise_price ? Number(exercise_price) : null,
        tge_unlock_pct: Number(tge_unlock_pct) || 0,
        cliff_months: cliff_months !== undefined ? Number(cliff_months) : 12,
        vesting_months: vesting_months !== undefined ? Number(vesting_months) : 36,
        wallet_address: wallet_address || null,
        notes: notes || null,
        created_by: auth.email,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, grant });
  }

  // ── UPDATE ──
  if (action === "update") {
    const { grant_id, ...fields } = body;
    if (!grant_id) return NextResponse.json({ error: "grant_id required" }, { status: 400 });

    const allowed = [
      "recipient_name", "recipient_email", "recipient_role", "recipient_type",
      "token_amount", "grant_date", "exercise_price",
      "tge_unlock_pct", "cliff_months", "vesting_months",
      "wallet_address", "notes",
    ];

    const updates: any = {};
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates[key] = ["token_amount", "exercise_price", "tge_unlock_pct", "cliff_months", "vesting_months"]
          .includes(key) ? (fields[key] !== null ? Number(fields[key]) : null) : fields[key];
      }
    }

    const { error } = await auth.client
      .from("pool_grants")
      .update(updates)
      .eq("id", grant_id)
      .eq("pool_id", poolId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // ── TERMINATE ──
  if (action === "terminate") {
    const { grant_id, termination_date, termination_handling, notes } = body;
    if (!grant_id || !termination_handling) {
      return NextResponse.json({ error: "grant_id and termination_handling required" }, { status: 400 });
    }

    const { error } = await auth.client
      .from("pool_grants")
      .update({
        status: "terminated",
        termination_date: termination_date || new Date().toISOString().split("T")[0],
        termination_handling,
        notes: notes || null,
      })
      .eq("id", grant_id)
      .eq("pool_id", poolId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // ── CANCEL ──
  if (action === "cancel") {
    const { grant_id } = body;
    if (!grant_id) return NextResponse.json({ error: "grant_id required" }, { status: 400 });

    const { error } = await auth.client
      .from("pool_grants")
      .update({ status: "cancelled" })
      .eq("id", grant_id)
      .eq("pool_id", poolId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // ── DELETE (cancelled grants only) ──
  if (action === "delete") {
    const { grant_id } = body;
    if (!grant_id) return NextResponse.json({ error: "grant_id required" }, { status: 400 });

    const { error } = await auth.client
      .from("pool_grants")
      .delete()
      .eq("id", grant_id)
      .eq("pool_id", poolId)
      .eq("status", "cancelled");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// ── Helpers ──

function getEffectiveMonths(grant: any, tgeDate: string | null, defaultMonths: number): number {
  if (grant.status === "terminated" && grant.termination_date) {
    if (grant.termination_handling === "accelerated") {
      return (Number(grant.cliff_months) || 0) + (Number(grant.vesting_months) || 0);
    }
    const termDate = new Date(grant.termination_date);
    const startDate = tgeDate ? new Date(tgeDate) : new Date(grant.grant_date);
    const months = Math.max(0, Math.floor((termDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
    if (grant.termination_handling === "cliff_forfeit" && months < (Number(grant.cliff_months) || 0)) {
      return 0;
    }
    return months;
  }
  return defaultMonths;
}
