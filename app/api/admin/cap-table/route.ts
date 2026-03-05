import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import { getEntityConfig } from "@/lib/entity-config";
import { calculateUnlocked } from "@/lib/vesting";

// ── Fetch all rows from a Supabase table (bypasses 1000 row default) ──
async function fetchAll(
  client: any,
  table: string,
  select: string,
  filters?: { column: string; value: any }[]
): Promise<any[]> {
  const PAGE = 1000;
  let offset = 0;
  let all: any[] = [];
  while (true) {
    let q = client.from(table).select(select).range(offset, offset + PAGE - 1);
    if (filters) {
      for (const f of filters) q = q.eq(f.column, f.value);
    }
    const { data } = await q;
    const rows = (data || []) as any[];
    all = all.concat(rows);
    if (rows.length < PAGE) break; // last page
    offset += PAGE;
  }
  return all;
}

/**
 * GET /api/admin/cap-table
 *
 * Two modes controlled by query params:
 *
 *   No params → returns summary cards, round breakdown, vesting schedule
 *   ?investors=true&page=0&limit=25&search=&round=&view=&sort=tokens&dir=desc
 *     → returns paginated investor ownership rows
 *
 * This split keeps the initial load fast (aggregates only)
 * while the investor table paginates independently.
 */
export async function GET(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;

  // ── Shared data (always needed) ──
  const config = await getEntityConfig(auth.client);
  const totalSupply = config.total_supply || 100_000_000;
  const reservedTokens = config.reserved_tokens || 0;
  const tgeDate = config.tge_date || null;
  const ticker = config.token_ticker || "TOKEN";

  const { data: rounds } = await auth.client
    .from("saft_rounds")
    .select("*")
    .order("created_at", { ascending: true });

  const allocs = await fetchAll(
    auth.client, "allocations",
    "id, investor_id, round_id, token_amount, amount_usd, amount_received_usd, payment_status, approval_status, payment_method",
    [{ column: "approval_status", value: "approved" }]
  );
  const roundList = (rounds || []) as any[];
  const roundMap = new Map<string, any>(roundList.map((r: any) => [r.id, r]));

  // ── INVESTOR LIST MODE ──
  if (sp.get("investors") === "true") {
    return handleInvestorList(auth.client, sp, allocs, roundMap, totalSupply);
  }

  // ── SUMMARY MODE (default) ──
  const roundAggregates = roundList.map((r: any, i: number) => {
    const ra = allocs.filter((a: any) => a.round_id === r.id);
    const tokensAllocated = ra.reduce((s: number, a: any) => s + (Number(a.token_amount) || 0), 0);
    const capitalDue = ra.reduce((s: number, a: any) => s + (Number(a.amount_usd) || 0), 0);
    const capitalReceived = ra.reduce((s: number, a: any) => s + (Number(a.amount_received_usd) || 0), 0);
    const invIds = new Set<string>();
    ra.forEach((a: any) => invIds.add(a.investor_id));

    return {
      id: r.id, name: r.name, token_price: r.token_price,
      tokens_allocated: tokensAllocated,
      pct_of_supply: totalSupply > 0 ? (tokensAllocated / totalSupply) * 100 : 0,
      investor_count: invIds.size,
      capital_due: capitalDue, capital_received: capitalReceived,
      tge_unlock_pct: r.tge_unlock_pct, cliff_months: r.cliff_months,
      vesting_months: r.vesting_months, closing_date: r.closing_date,
    };
  });

  // Totals
  const totalAllocated = allocs.reduce((s: number, a: any) => s + (Number(a.token_amount) || 0), 0);
  const totalCapitalDue = allocs.reduce((s: number, a: any) => s + (Number(a.amount_usd) || 0), 0);
  const totalCapitalReceived = allocs.reduce((s: number, a: any) => s + (Number(a.amount_received_usd) || 0), 0);
  const investorIds = new Set<string>();
  allocs.forEach((a: any) => investorIds.add(a.investor_id));

  // Vesting schedule (aggregated)
  const maxMonth = roundList.reduce((max: number, r: any) =>
    Math.max(max, (r.cliff_months || 0) + (r.vesting_months || 0)), 0
  );

  const vestingSchedule = [];
  for (let month = 0; month <= maxMonth; month++) {
    const perRound: Record<string, number> = {};
    let totalUnlocked = 0;
    for (const r of roundList) {
      const ra = allocs.filter((a: any) => a.round_id === r.id);
      const roundUnlocked = ra.reduce((sum: number, a: any) =>
        sum + calculateUnlocked(
          Number(a.token_amount) || 0,
          r.tge_unlock_pct || 0, r.cliff_months || 0, r.vesting_months || 1, month
        ), 0);
      perRound[r.id] = Math.round(roundUnlocked);
      totalUnlocked += roundUnlocked;
    }
    vestingSchedule.push({ month, total_unlocked: Math.round(totalUnlocked), per_round: perRound });
  }

  // Compute months since TGE (for pool vesting)
  const monthsSinceTGE = tgeDate
    ? Math.max(0, Math.floor((new Date().getTime() - new Date(tgeDate).getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
    : 0;

  // ── Pool data (breaks down reserved bucket) ──
  const { data: pools } = await auth.client
    .from("token_pools")
    .select("*")
    .order("created_at", { ascending: true });

  const { data: poolGrants } = await auth.client
    .from("pool_grants")
    .select("*")
    .neq("status", "cancelled");

  const allPoolGrants = (poolGrants || []) as any[];
  const allPools = (pools || []) as any[];

  const poolSummary = allPools.map((p: any) => {
    const pGrants = allPoolGrants.filter((g: any) => g.pool_id === p.id);
    const tokensGranted = pGrants.reduce((s: number, g: any) => s + (Number(g.token_amount) || 0), 0);
    const tokensVested = pGrants.reduce((s: number, g: any) => {
      const months = getPoolGrantMonths(g, tgeDate, monthsSinceTGE);
      return s + calculateUnlocked(
        Number(g.token_amount) || 0, Number(g.tge_unlock_pct) || 0,
        Number(g.cliff_months) || 0, Number(g.vesting_months) || 1, months
      );
    }, 0);
    return {
      id: p.id, name: p.name, color: p.color,
      token_budget: Number(p.token_budget),
      tokens_granted: tokensGranted,
      tokens_vested: Math.round(tokensVested),
    };
  });

  // Pool vesting schedule (for chart)
  const poolMaxMonth = allPoolGrants.reduce((max: number, g: any) =>
    Math.max(max, (Number(g.cliff_months) || 0) + (Number(g.vesting_months) || 0)), 0
  );
  const poolVestingSchedule = [];
  for (let month = 0; month <= Math.max(maxMonth, poolMaxMonth); month++) {
    const perPool: Record<string, number> = {};
    for (const p of allPools) {
      const pGrants = allPoolGrants.filter((g: any) => g.pool_id === p.id);
      const poolUnlocked = pGrants.reduce((sum: number, g: any) => {
        const m = getPoolGrantMonths(g, tgeDate, month);
        return sum + calculateUnlocked(
          Number(g.token_amount) || 0, Number(g.tge_unlock_pct) || 0,
          Number(g.cliff_months) || 0, Number(g.vesting_months) || 1, m
        );
      }, 0);
      perPool[p.id] = Math.round(poolUnlocked);
    }
    poolVestingSchedule.push({ month, per_pool: perPool });
  }

  return NextResponse.json({
    total_supply: totalSupply, reserved_tokens: reservedTokens,
    tge_date: tgeDate, token_ticker: ticker,
    total_allocated: totalAllocated,
    total_available: totalSupply - totalAllocated - reservedTokens,
    total_capital_due: totalCapitalDue,
    total_capital_received: totalCapitalReceived,
    investor_count: investorIds.size,
    rounds: roundAggregates,
    vesting_schedule: vestingSchedule,
    pools: poolSummary,
    pool_vesting_schedule: poolVestingSchedule,
  });
}

// ═══════════════════════════════════════════════════════════
// PAGINATED INVESTOR LIST
// ═══════════════════════════════════════════════════════════

async function handleInvestorList(
  client: any,
  sp: URLSearchParams,
  allocs: any[],
  roundMap: Map<string, any>,
  totalSupply: number
) {
  const page = Number(sp.get("page") || "0");
  const limit = Math.min(Number(sp.get("limit") || "25"), 100);
  const search = (sp.get("search") || "").toLowerCase();
  const roundFilter = sp.get("round") || "";
  const viewMode = sp.get("view") || "all"; // all | confirmed | pending
  const sortKey = sp.get("sort") || "tokens"; // tokens | pct | due | received | name
  const sortDir = sp.get("dir") || "desc";

  // Load all investors (paginated to bypass 1000 row limit)
  const investorList = await fetchAll(client, "investors", "id, full_name, email, kyc_status, pq_status");
  const investorMap = new Map<string, any>(investorList.map((i: any) => [i.id, i]));

  // Group allocations by investor
  const investorAllocMap = new Map<string, any[]>();
  for (const a of allocs) {
    const arr = investorAllocMap.get(a.investor_id) || [];
    arr.push(a);
    investorAllocMap.set(a.investor_id, arr);
  }

  // Build investor rows
  let rows = Array.from(investorAllocMap.entries()).map(([invId, invAllocs]) => {
    const inv = investorMap.get(invId);
    const totalTokens = invAllocs.reduce((s: number, a: any) => s + (Number(a.token_amount) || 0), 0);
    const totalDue = invAllocs.reduce((s: number, a: any) => s + (Number(a.amount_usd) || 0), 0);
    const totalReceived = invAllocs.reduce((s: number, a: any) => s + (Number(a.amount_received_usd) || 0), 0);
    const hasGrant = invAllocs.some((a: any) => a.payment_status === "grant");

    const statuses = new Set<string>();
    invAllocs.forEach((a: any) => statuses.add(a.payment_status));
    let paymentSummary = "unpaid";
    if (statuses.size === 1) {
      paymentSummary = Array.from(statuses)[0];
    } else {
      paymentSummary = "mixed";
    }

    return {
      id: invId,
      full_name: inv?.full_name || "Unknown",
      email: inv?.email || "",
      kyc_status: inv?.kyc_status || "unverified",
      pq_status: inv?.pq_status || "not_sent",
      total_tokens: totalTokens,
      pct_ownership: totalSupply > 0 ? (totalTokens / totalSupply) * 100 : 0,
      total_usd_due: totalDue,
      total_usd_received: totalReceived,
      payment_summary: paymentSummary,
      has_grant: hasGrant,
      allocations: invAllocs.map((a: any) => ({
        id: a.id,
        round_name: roundMap.get(a.round_id)?.name || "—",
        round_id: a.round_id,
        token_amount: Number(a.token_amount) || 0,
        amount_usd: Number(a.amount_usd) || 0,
        amount_received_usd: Number(a.amount_received_usd) || 0,
        payment_status: a.payment_status,
      })),
    };
  });

  // ── Filters ──
  if (viewMode === "confirmed") {
    rows = rows.filter((i) =>
      i.allocations.every((a: any) => a.payment_status === "paid" || a.payment_status === "grant")
    );
  } else if (viewMode === "pending") {
    rows = rows.filter((i) =>
      i.allocations.some((a: any) => ["unpaid", "invoiced", "partial"].includes(a.payment_status))
    );
  }

  if (roundFilter) {
    rows = rows.filter((i) => i.allocations.some((a: any) => a.round_id === roundFilter));
  }

  if (search) {
    rows = rows.filter((i) =>
      i.full_name.toLowerCase().includes(search) || i.email.toLowerCase().includes(search)
    );
  }

  // ── Totals (computed before pagination, after filters) ──
  const totals = {
    tokens: rows.reduce((s, i) => s + i.total_tokens, 0),
    pct: rows.reduce((s, i) => s + i.pct_ownership, 0),
    due: rows.reduce((s, i) => s + i.total_usd_due, 0),
    received: rows.reduce((s, i) => s + i.total_usd_received, 0),
  };

  // ── Sort ──
  rows.sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "name": cmp = a.full_name.localeCompare(b.full_name); break;
      case "tokens": cmp = a.total_tokens - b.total_tokens; break;
      case "pct": cmp = a.pct_ownership - b.pct_ownership; break;
      case "due": cmp = a.total_usd_due - b.total_usd_due; break;
      case "received": cmp = a.total_usd_received - b.total_usd_received; break;
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  const total = rows.length;
  const paged = rows.slice(page * limit, page * limit + limit);

  return NextResponse.json({ investors: paged, total, totals });
}

// ── Pool grant vesting month helper ──

function getPoolGrantMonths(grant: any, tgeDate: string | null, defaultMonths: number): number {
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
