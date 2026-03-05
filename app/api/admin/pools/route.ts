import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import { getEntityConfig } from "@/lib/entity-config";
import { calculateUnlocked } from "@/lib/vesting";

/**
 * GET /api/admin/pools
 *
 * Returns all token pools with aggregate stats and vesting calculations.
 */
export async function GET() {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await getEntityConfig(auth.client);
  const tgeDate = config.tge_date || null;
  const reservedTokens = config.reserved_tokens || 0;

  // Months since TGE (for vesting calc)
  const now = new Date();
  const monthsSinceTGE = tgeDate
    ? Math.max(0, Math.floor((now.getTime() - new Date(tgeDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
    : 0;

  const { data: pools } = await auth.client
    .from("token_pools")
    .select("*")
    .order("created_at", { ascending: true });

  const { data: grants } = await auth.client
    .from("pool_grants")
    .select("*");

  const allGrants = (grants || []) as any[];
  const allPools = (pools || []) as any[];

  // Build per-pool aggregates
  const poolRows = allPools.map((p: any) => {
    const pGrants = allGrants.filter((g: any) => g.pool_id === p.id);
    const activeGrants = pGrants.filter((g: any) => g.status !== "cancelled");

    const tokensGranted = activeGrants.reduce((s: number, g: any) => s + (Number(g.token_amount) || 0), 0);

    // Calculate vested tokens
    const tokensVested = activeGrants.reduce((s: number, g: any) => {
      if (g.status === "cancelled") return s;
      const months = getEffectiveMonths(g, tgeDate, monthsSinceTGE);
      return s + calculateUnlocked(
        Number(g.token_amount) || 0,
        Number(g.tge_unlock_pct) || 0,
        Number(g.cliff_months) || 0,
        Number(g.vesting_months) || 1,
        months
      );
    }, 0);

    return {
      id: p.id,
      name: p.name,
      description: p.description,
      token_budget: Number(p.token_budget),
      color: p.color,
      is_active: p.is_active,
      created_at: p.created_at,
      grants_count: activeGrants.length,
      tokens_granted: tokensGranted,
      tokens_vested: Math.round(tokensVested),
      tokens_available: Math.max(0, Number(p.token_budget) - tokensGranted),
    };
  });

  const totals = {
    total_budget: poolRows.reduce((s, p) => s + p.token_budget, 0),
    total_granted: poolRows.reduce((s, p) => s + p.tokens_granted, 0),
    total_vested: poolRows.reduce((s, p) => s + p.tokens_vested, 0),
    reserved_tokens: reservedTokens,
    budget_remaining: reservedTokens - poolRows.reduce((s, p) => s + p.token_budget, 0),
  };

  return NextResponse.json({ pools: poolRows, totals });
}

/**
 * POST /api/admin/pools
 *
 * Actions: create, update, delete
 */
export async function POST(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { action } = body;

  if (action === "create") {
    const { name, token_budget, color, description } = body;
    if (!name) return NextResponse.json({ error: "Pool name required" }, { status: 400 });

    const { data, error } = await auth.client
      .from("token_pools")
      .insert({
        name,
        token_budget: Number(token_budget) || 0,
        color: color || "8b5cf6",
        description: description || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, pool: data });
  }

  if (action === "update") {
    const { pool_id, name, token_budget, color, description, is_active } = body;
    if (!pool_id) return NextResponse.json({ error: "pool_id required" }, { status: 400 });

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (token_budget !== undefined) updates.token_budget = Number(token_budget);
    if (color !== undefined) updates.color = color;
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.is_active = is_active;

    const { error } = await auth.client
      .from("token_pools")
      .update(updates)
      .eq("id", pool_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === "delete") {
    const { pool_id } = body;
    if (!pool_id) return NextResponse.json({ error: "pool_id required" }, { status: 400 });

    // Check for grants
    const { data: grants } = await auth.client
      .from("pool_grants")
      .select("id")
      .eq("pool_id", pool_id)
      .limit(1);

    if (grants && grants.length > 0) {
      return NextResponse.json({ error: "Cannot delete pool with existing grants. Cancel or remove all grants first." }, { status: 400 });
    }

    const { error } = await auth.client
      .from("token_pools")
      .delete()
      .eq("id", pool_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// ── Helpers ──

/** Get effective vesting months for a grant, accounting for termination */
function getEffectiveMonths(grant: any, tgeDate: string | null, defaultMonths: number): number {
  if (grant.status === "terminated" && grant.termination_date) {
    if (grant.termination_handling === "accelerated") {
      // Full vesting on termination
      return (Number(grant.cliff_months) || 0) + (Number(grant.vesting_months) || 0);
    }
    // Vest to termination date
    const termDate = new Date(grant.termination_date);
    const startDate = tgeDate ? new Date(tgeDate) : new Date(grant.grant_date);
    const months = Math.max(0, Math.floor((termDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));

    if (grant.termination_handling === "cliff_forfeit" && months < (Number(grant.cliff_months) || 0)) {
      return 0; // Terminated before cliff — forfeit all
    }
    return months;
  }
  return defaultMonths;
}
