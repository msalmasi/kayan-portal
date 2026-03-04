import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import { getEntityConfig } from "@/lib/entity-config";
import { calculateUnlocked } from "@/lib/vesting";

/**
 * GET /api/admin/cap-table
 *
 * Returns the complete cap table:
 *   - Token supply config
 *   - Per-round breakdown
 *   - Per-investor ownership
 *   - Aggregated vesting schedule
 *
 * All joins and math happen server-side so the frontend just renders.
 */
export async function GET() {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Load config ──
  const config = await getEntityConfig(auth.client);
  const totalSupply = config.total_supply || 100_000_000;
  const reservedTokens = config.reserved_tokens || 0;
  const tgeDate = config.tge_date || null;
  const ticker = config.token_ticker || "TOKEN";

  // ── Load rounds ──
  const { data: rounds } = await auth.client
    .from("saft_rounds")
    .select("*")
    .order("created_at", { ascending: true });

  // ── Load all approved allocations with investor data ──
  const { data: allocations } = await auth.client
    .from("allocations")
    .select(
      "id, investor_id, round_id, token_amount, amount_usd, amount_received_usd, " +
      "payment_status, approval_status, payment_method"
    )
    .eq("approval_status", "approved");

  // ── Load investors ──
  const { data: investors } = await auth.client
    .from("investors")
    .select("id, full_name, email, kyc_status, pq_status");

  const allocs = allocations || [];
  const roundList = rounds || [];
  const investorList = investors || [];

  // ── Build investor lookup ──
  const investorMap = new Map(investorList.map((i: any) => [i.id, i]));
  const roundMap = new Map(roundList.map((r: any) => [r.id, r]));

  // ── Per-round aggregates ──
  const roundAggregates = roundList.map((r: any) => {
    const roundAllocs = allocs.filter((a: any) => a.round_id === r.id);
    const tokensAllocated = roundAllocs.reduce((s: number, a: any) => s + (Number(a.token_amount) || 0), 0);
    const capitalDue = roundAllocs.reduce((s: number, a: any) => s + (Number(a.amount_usd) || 0), 0);
    const capitalReceived = roundAllocs.reduce((s: number, a: any) => s + (Number(a.amount_received_usd) || 0), 0);
    const investorIds = new Set(roundAllocs.map((a: any) => a.investor_id));

    return {
      id: r.id,
      name: r.name,
      token_price: r.token_price,
      tokens_allocated: tokensAllocated,
      pct_of_supply: totalSupply > 0 ? (tokensAllocated / totalSupply) * 100 : 0,
      investor_count: investorIds.size,
      capital_due: capitalDue,
      capital_received: capitalReceived,
      tge_unlock_pct: r.tge_unlock_pct,
      cliff_months: r.cliff_months,
      vesting_months: r.vesting_months,
      closing_date: r.closing_date,
    };
  });

  // ── Per-investor aggregates ──
  const investorAllocMap = new Map<string, any[]>();
  for (const a of allocs) {
    const arr = investorAllocMap.get(a.investor_id) || [];
    arr.push(a);
    investorAllocMap.set(a.investor_id, arr);
  }

  const investorRows = Array.from(investorAllocMap.entries()).map(([invId, invAllocs]) => {
    const inv = investorMap.get(invId);
    const totalTokens = invAllocs.reduce((s: number, a: any) => s + (Number(a.token_amount) || 0), 0);
    const totalDue = invAllocs.reduce((s: number, a: any) => s + (Number(a.amount_usd) || 0), 0);
    const totalReceived = invAllocs.reduce((s: number, a: any) => s + (Number(a.amount_received_usd) || 0), 0);
    const hasGrant = invAllocs.some((a: any) => a.payment_status === "grant");

    // Determine aggregate payment status
    const statuses = new Set(invAllocs.map((a: any) => a.payment_status));
    let paymentSummary = "unpaid";
    if (statuses.size === 1) {
      paymentSummary = [...statuses][0];
    } else if (statuses.has("paid") && statuses.size === 1) {
      paymentSummary = "paid";
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
        approval_status: a.approval_status,
      })),
    };
  });

  // Sort by ownership descending
  investorRows.sort((a, b) => b.total_tokens - a.total_tokens);

  // ── Totals ──
  const totalAllocated = allocs.reduce((s: number, a: any) => s + (Number(a.token_amount) || 0), 0);
  const totalCapitalDue = allocs.reduce((s: number, a: any) => s + (Number(a.amount_usd) || 0), 0);
  const totalCapitalReceived = allocs.reduce((s: number, a: any) => s + (Number(a.amount_received_usd) || 0), 0);

  // ── Vesting schedule (aggregated) ──
  // Find longest vesting timeline
  const maxMonth = roundList.reduce((max: number, r: any) =>
    Math.max(max, (r.cliff_months || 0) + (r.vesting_months || 0)), 0
  );

  const vestingSchedule = [];
  for (let month = 0; month <= maxMonth; month++) {
    const perRound: Record<string, number> = {};
    let totalUnlocked = 0;

    for (const r of roundList) {
      const roundAllocs = allocs.filter((a: any) => a.round_id === r.id);
      const roundUnlocked = roundAllocs.reduce((sum: number, a: any) => {
        return sum + calculateUnlocked(
          Number(a.token_amount) || 0,
          r.tge_unlock_pct || 0,
          r.cliff_months || 0,
          r.vesting_months || 1,
          month
        );
      }, 0);

      perRound[r.id] = Math.round(roundUnlocked);
      totalUnlocked += roundUnlocked;
    }

    vestingSchedule.push({
      month,
      total_unlocked: Math.round(totalUnlocked),
      per_round: perRound,
    });
  }

  return NextResponse.json({
    total_supply: totalSupply,
    reserved_tokens: reservedTokens,
    tge_date: tgeDate,
    token_ticker: ticker,

    total_allocated: totalAllocated,
    total_available: totalSupply - totalAllocated - reservedTokens,
    total_capital_due: totalCapitalDue,
    total_capital_received: totalCapitalReceived,
    investor_count: investorAllocMap.size,

    rounds: roundAggregates,
    investors: investorRows,
    vesting_schedule: vestingSchedule,
  });
}
