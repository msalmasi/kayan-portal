import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import { getEntityConfig } from "@/lib/entity-config";

/**
 * GET /api/admin/reports/fsa
 *
 * Returns FSA report data: token stats, investor breakdown, and editable fields.
 */
export async function GET() {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await getEntityConfig(auth.client);
  const totalSupply = config.total_supply || 100_000_000;

  // Load allocations
  const { data: allocations } = await auth.client
    .from("allocations")
    .select("token_amount, amount_usd, amount_received_usd, payment_status, approval_status, investor_id")
    .eq("approval_status", "approved");

  const allocs = (allocations || []) as any[];

  // Load investors with PQ data for jurisdiction/qualification grouping
  const { data: investors } = await auth.client
    .from("investors")
    .select("id, pq_data, pq_status, kyc_status")
    .limit(10000);

  const invMap = new Map<string, any>();
  ((investors || []) as any[]).forEach((inv) => invMap.set(inv.id, inv));

  // Tokens in circulation
  const tokensAllocated = allocs.reduce((s: number, a: any) => s + (Number(a.token_amount) || 0), 0);
  const tokensUnissued = totalSupply - tokensAllocated - (config.reserved_tokens || 0);

  // Proceeds
  const totalProceeds = allocs.reduce((s: number, a: any) => s + (Number(a.amount_received_usd) || 0), 0);
  const totalDue = allocs.reduce((s: number, a: any) => s + (Number(a.amount_usd) || 0), 0);

  // Group by qualification type
  const qualificationBreakdown: Record<string, { count: number; tokens: number }> = {};
  const jurisdictionBreakdown: Record<string, { count: number; tokens: number }> = {};
  const investorIds = new Set<string>();

  for (const a of allocs) {
    if (investorIds.has(a.investor_id)) continue; // count each investor once
    investorIds.add(a.investor_id);

    const inv = invMap.get(a.investor_id);
    const pq = inv?.pq_data || {};
    const isNested = !!pq.section_a;

    const jurisdiction = isNested ? pq.section_a?.jurisdiction_of_residence : pq.jurisdiction_of_residence;
    const qualification = isNested ? pq.section_c?.qualification_type : pq.qualification_type;

    const invAllocs = allocs.filter((al: any) => al.investor_id === a.investor_id);
    const invTokens = invAllocs.reduce((s: number, al: any) => s + (Number(al.token_amount) || 0), 0);

    const jKey = jurisdiction || "Unknown";
    if (!jurisdictionBreakdown[jKey]) jurisdictionBreakdown[jKey] = { count: 0, tokens: 0 };
    jurisdictionBreakdown[jKey].count++;
    jurisdictionBreakdown[jKey].tokens += invTokens;

    const qKey = qualification || "Unknown";
    if (!qualificationBreakdown[qKey]) qualificationBreakdown[qKey] = { count: 0, tokens: 0 };
    qualificationBreakdown[qKey].count++;
    qualificationBreakdown[qKey].tokens += invTokens;
  }

  // Malaysian investor summary
  const myInvestors = Array.from(investorIds).filter((id) => {
    const inv = invMap.get(id);
    const pq = inv?.pq_data || {};
    const isNested = !!pq.section_a;
    const j = isNested ? pq.section_a?.jurisdiction_of_residence : pq.jurisdiction_of_residence;
    return j === "MY";
  });

  const myTokens = myInvestors.reduce((s, id) => {
    const invAllocs = allocs.filter((a: any) => a.investor_id === id);
    return s + invAllocs.reduce((ss: number, a: any) => ss + (Number(a.token_amount) || 0), 0);
  }, 0);

  // Load editable fields from platform_settings
  const { data: settings } = await auth.client
    .from("platform_settings")
    .select("fsa_proceeds_utilization, fsa_project_performance")
    .eq("id", 1)
    .single();

  return NextResponse.json({
    report: {
      total_supply: totalSupply,
      tokens_allocated: tokensAllocated,
      tokens_reserved: config.reserved_tokens || 0,
      tokens_unissued: tokensUnissued,
      total_proceeds_received: totalProceeds,
      total_proceeds_due: totalDue,
      investor_count: investorIds.size,
      jurisdiction_breakdown: jurisdictionBreakdown,
      qualification_breakdown: qualificationBreakdown,
      malaysian_summary: {
        count: myInvestors.length,
        tokens: myTokens,
      },
    },
    editable: {
      proceeds_utilization: settings?.fsa_proceeds_utilization || {},
      project_performance: settings?.fsa_project_performance || "",
    },
  });
}

/**
 * POST /api/admin/reports/fsa
 *
 * Save editable report fields (proceeds utilization, project performance).
 */
export async function POST(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { proceeds_utilization, project_performance } = body;

  const updates: any = {};
  if (proceeds_utilization !== undefined) updates.fsa_proceeds_utilization = proceeds_utilization;
  if (project_performance !== undefined) updates.fsa_project_performance = project_performance;

  const { error } = await auth.client
    .from("platform_settings")
    .update(updates)
    .eq("id", 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
