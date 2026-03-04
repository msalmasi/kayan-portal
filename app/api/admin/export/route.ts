import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";

// ── Fetch all rows (bypasses Supabase 1000 row default) ──
async function fetchAll(
  client: any, table: string, select: string,
  filters?: { column: string; value: any }[]
): Promise<any[]> {
  const PAGE = 1000;
  let offset = 0;
  let all: any[] = [];
  while (true) {
    let q = client.from(table).select(select).range(offset, offset + PAGE - 1);
    if (filters) { for (const f of filters) q = q.eq(f.column, f.value); }
    const { data } = await q;
    const rows = (data || []) as any[];
    all = all.concat(rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

// ── CSV helpers ──

/** Escape a value for CSV (wrap in quotes if it contains commas, quotes, or newlines) */
function csvEscape(val: any): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Convert array of objects to CSV string */
function toCsv(rows: Record<string, any>[], columns: { key: string; label: string }[]): string {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => csvEscape(row[c.key])).join(",")
  );
  return [header, ...body].join("\n");
}

/**
 * GET /api/admin/export
 *
 * Export data as CSV. Admin-only.
 *
 * Query params:
 *   type=audit_log | investors
 *
 * For audit_log:
 *   ?investor_id=uuid   — filter by investor
 *   ?round_id=uuid      — filter by round
 *   ?action=string      — filter by action type
 *
 * For investors:
 *   ?kyc=status          — filter by KYC status
 *   ?pq=status           — filter by PQ status
 */
export async function GET(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const type = sp.get("type");

  if (type === "audit_log") {
    return exportAuditLog(auth.client, sp);
  }

  if (type === "investors") {
    return exportInvestors(auth.client, sp);
  }

  if (type === "cap_table") {
    return exportCapTable(auth.client);
  }

  return NextResponse.json({ error: "Invalid export type. Use ?type=audit_log, investors, or cap_table" }, { status: 400 });
}

// ── Audit Log Export ──

async function exportAuditLog(client: any, sp: URLSearchParams) {
  let query = client
    .from("registry_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10000);

  const investorId = sp.get("investor_id");
  const roundId = sp.get("round_id");
  const action = sp.get("action");

  if (investorId) query = query.eq("investor_id", investorId);
  if (roundId) query = query.eq("round_id", roundId);
  if (action) query = query.eq("action", action);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const columns = [
    { key: "created_at", label: "Timestamp" },
    { key: "action", label: "Action" },
    { key: "entity_type", label: "Entity Type" },
    { key: "entity_id", label: "Entity ID" },
    { key: "investor_id", label: "Investor ID" },
    { key: "round_id", label: "Round ID" },
    { key: "changed_by", label: "Changed By" },
    { key: "ip_address", label: "IP Address" },
    { key: "old_values_json", label: "Old Values" },
    { key: "new_values_json", label: "New Values" },
    { key: "metadata_json", label: "Metadata" },
  ];

  // Flatten JSON columns
  const rows = (data || []).map((row: any) => ({
    ...row,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : "",
    old_values_json: JSON.stringify(row.old_values || {}),
    new_values_json: JSON.stringify(row.new_values || {}),
    metadata_json: JSON.stringify(row.metadata || {}),
  }));

  const csv = toCsv(rows, columns);
  const filename = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// ── Investor Profiles Export ──

async function exportInvestors(client: any, sp: URLSearchParams) {
  let query = client
    .from("investors")
    .select(
      "id, email, full_name, kyc_status, pq_status, pq_submitted_at, pq_reviewed_at, " +
      "pq_reviewed_by, pq_data, pq_notes, created_at, " +
      "allocations(id, round_id, token_amount, amount_usd, amount_received_usd, payment_status, approval_status)"
    )
    .order("created_at", { ascending: false })
    .limit(10000);

  const kycFilter = sp.get("kyc");
  const pqFilter = sp.get("pq");
  const investorId = sp.get("investor_id");
  if (kycFilter) query = query.eq("kyc_status", kycFilter);
  if (pqFilter) query = query.eq("pq_status", pqFilter);
  if (investorId) query = query.eq("id", investorId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const columns = [
    { key: "id", label: "Investor ID" },
    { key: "email", label: "Email" },
    { key: "full_name", label: "Full Name" },
    { key: "kyc_status", label: "KYC Status" },
    { key: "pq_status", label: "PQ Status" },
    { key: "pq_submitted_at", label: "PQ Submitted" },
    { key: "pq_reviewed_at", label: "PQ Reviewed" },
    { key: "pq_reviewed_by", label: "PQ Reviewed By" },
    { key: "pq_notes", label: "PQ Notes" },
    { key: "investor_type", label: "Investor Type" },
    { key: "legal_name", label: "Legal Name (PQ)" },
    { key: "jurisdiction", label: "Jurisdiction" },
    { key: "qualification_type", label: "Qualification" },
    { key: "source_of_funds", label: "Source of Funds" },
    { key: "investment_amount", label: "PQ Investment Amount" },
    { key: "total_tokens", label: "Total Tokens Allocated" },
    { key: "total_usd_due", label: "Total USD Due" },
    { key: "total_usd_received", label: "Total USD Received" },
    { key: "allocation_count", label: "Allocation Count" },
    { key: "created_at", label: "Registered" },
  ];

  const rows = (data || []).map((inv: any) => {
    // Extract PQ fields (handle both flat and nested formats)
    const pq = inv.pq_data || {};
    const isNested = !!pq.section_a;
    const flat = isNested
      ? { ...pq.section_a, ...pq.section_c, ...pq.section_d }
      : pq;

    // Aggregate allocations
    const allocs = inv.allocations || [];
    const totalTokens = allocs.reduce((s: number, a: any) => s + (Number(a.token_amount) || 0), 0);
    const totalDue = allocs.reduce((s: number, a: any) => s + (Number(a.amount_usd) || 0), 0);
    const totalReceived = allocs.reduce((s: number, a: any) => s + (Number(a.amount_received_usd) || 0), 0);

    return {
      id: inv.id,
      email: inv.email,
      full_name: inv.full_name,
      kyc_status: inv.kyc_status,
      pq_status: inv.pq_status,
      pq_submitted_at: inv.pq_submitted_at || "",
      pq_reviewed_at: inv.pq_reviewed_at || "",
      pq_reviewed_by: inv.pq_reviewed_by || "",
      pq_notes: inv.pq_notes || "",
      investor_type: flat.investor_type || "",
      legal_name: flat.legal_name || "",
      jurisdiction: flat.jurisdiction_of_residence || "",
      qualification_type: flat.qualification_type || "",
      source_of_funds: flat.source_of_funds || "",
      investment_amount: flat.investment_amount_usd || "",
      total_tokens: totalTokens,
      total_usd_due: totalDue,
      total_usd_received: totalReceived,
      allocation_count: allocs.length,
      created_at: inv.created_at ? new Date(inv.created_at).toISOString() : "",
    };
  });

  const csv = toCsv(rows, columns);
  const filename = `investors-${new Date().toISOString().split("T")[0]}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// ── Cap Table Export ──

async function exportCapTable(client: any) {
  const { getEntityConfig } = await import("@/lib/entity-config");
  const config = await getEntityConfig(client);
  const totalSupply = config.total_supply || 100_000_000;

  const { data: rounds } = await client
    .from("saft_rounds")
    .select("id, name, token_price, tge_unlock_pct, cliff_months, vesting_months");

  const allocations = await fetchAll(
    client, "allocations",
    "id, investor_id, round_id, token_amount, amount_usd, amount_received_usd, payment_status, approval_status, created_at",
    [{ column: "approval_status", value: "approved" }]
  );

  const investors = await fetchAll(
    client, "investors",
    "id, full_name, email, kyc_status, pq_status, created_at"
  );

  const roundMap = new Map<string, any>((rounds || []).map((r: any) => [r.id, r]));
  const investorMap = new Map<string, any>(investors.map((i: any) => [i.id, i]));

  const columns = [
    { key: "investor_name", label: "Investor Name" },
    { key: "email", label: "Email" },
    { key: "round_name", label: "Round" },
    { key: "token_amount", label: "Token Amount" },
    { key: "pct_of_supply", label: "% of Supply" },
    { key: "token_price", label: "Token Price" },
    { key: "amount_usd", label: "USD Due" },
    { key: "amount_received_usd", label: "USD Received" },
    { key: "payment_status", label: "Payment Status" },
    { key: "vesting_terms", label: "Vesting Terms" },
    { key: "kyc_status", label: "KYC Status" },
    { key: "pq_status", label: "PQ Status" },
    { key: "registered", label: "Registration Date" },
  ];

  const rows = allocations.map((a: any) => {
    const inv = investorMap.get(a.investor_id);
    const round = roundMap.get(a.round_id);
    const tokens = Number(a.token_amount) || 0;

    return {
      investor_name: inv?.full_name || "Unknown",
      email: inv?.email || "",
      round_name: round?.name || "—",
      token_amount: tokens,
      pct_of_supply: totalSupply > 0 ? ((tokens / totalSupply) * 100).toFixed(4) : "0",
      token_price: round?.token_price ? `$${round.token_price}` : "—",
      amount_usd: Number(a.amount_usd) || 0,
      amount_received_usd: Number(a.amount_received_usd) || 0,
      payment_status: a.payment_status,
      vesting_terms: round
        ? `${round.tge_unlock_pct}% TGE / ${round.cliff_months}mo cliff / ${round.vesting_months}mo linear`
        : "—",
      kyc_status: inv?.kyc_status || "",
      pq_status: inv?.pq_status || "",
      registered: inv?.created_at ? new Date(inv.created_at).toISOString() : "",
    };
  });

  // Sort by token amount descending
  rows.sort((a: any, b: any) => Number(b.token_amount) - Number(a.token_amount));

  const csv = toCsv(rows, columns);
  const filename = `cap-table-${new Date().toISOString().split("T")[0]}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
