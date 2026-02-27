import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import { sendEmail, composeWelcomeEmail } from "@/lib/email";

/**
 * GET /api/admin/investors
 * Returns paginated, searchable, sortable, filterable investor list.
 *
 * Query params:
 *   search    — text search on name/email
 *   page      — 0-indexed page number
 *   limit     — rows per page (10|20|50|100, default 20)
 *   sort_by   — column to sort (full_name|email|kyc_status|pq_status|created_at)
 *   sort_dir  — asc or desc (default desc)
 *   kyc       — filter by kyc_status (unverified|pending|verified)
 *   pq        — filter by pq_status (not_sent|sent|submitted|approved|rejected)
 *   payment   — filter by payment summary (unpaid|invoiced|partial|paid)
 *   has_alloc — "true" or "false" to filter investors with/without allocations
 *   export    — "csv" to return all matching rows as CSV download
 */
export async function GET(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "0");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
  const sortBy = searchParams.get("sort_by") || "created_at";
  const sortDir = searchParams.get("sort_dir") === "asc" ? true : false; // ascending?
  const kycFilter = searchParams.get("kyc") || "";
  const pqFilter = searchParams.get("pq") || "";
  const paymentFilter = searchParams.get("payment") || "";
  const isExport = searchParams.get("export") === "csv";

  const offset = page * limit;

  // Build query — always fetch allocations for aggregation
  let query = auth.client
    .from("investors")
    .select(
      "id, email, full_name, kyc_status, pq_status, created_at, allocations(token_amount, payment_status, approval_status)",
      { count: "exact" }
    );

  // Text search
  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  // Column filters
  if (kycFilter) query = query.eq("kyc_status", kycFilter);
  if (pqFilter) query = query.eq("pq_status", pqFilter);

  // Sort — only allow safe columns
  const SAFE_SORT_COLS = ["full_name", "email", "kyc_status", "pq_status", "created_at"];
  const sortCol = SAFE_SORT_COLS.includes(sortBy) ? sortBy : "created_at";
  query = query.order(sortCol, { ascending: sortDir });

  // For CSV export, fetch all matching rows (no pagination)
  if (!isExport) {
    query = query.range(offset, offset + limit - 1);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform rows — aggregate allocation data
  const investors = (data || []).map((inv: any) => {
    // Only count approved allocations for tokens/payment
    const approved = (inv.allocations || []).filter(
      (a: any) => a.approval_status === "approved"
    );
    const allAllocs = inv.allocations || [];

    const totalTokens = approved.reduce(
      (sum: number, a: any) => sum + Number(a.token_amount),
      0
    );
    const pendingCount = allAllocs.filter(
      (a: any) => a.approval_status === "pending"
    ).length;

    // Aggregate payment summary from approved allocations
    // "grant" counts as complete (same tier as "paid")
    const paymentSummary = (() => {
      if (approved.length === 0) return "none";
      const allComplete = approved.every(
        (a: any) => a.payment_status === "paid" || a.payment_status === "grant"
      );
      if (allComplete) {
        // If ALL are grants, show "grant"; if mixed or all paid, show "paid"
        return approved.every((a: any) => a.payment_status === "grant") ? "grant" : "paid";
      }
      if (approved.some((a: any) => a.payment_status === "paid" || a.payment_status === "partial"))
        return "partial";
      if (approved.some((a: any) => a.payment_status === "invoiced")) return "invoiced";
      return "unpaid";
    })();

    return {
      id: inv.id,
      email: inv.email,
      full_name: inv.full_name,
      kyc_status: inv.kyc_status,
      pq_status: inv.pq_status || "not_sent",
      total_tokens: totalTokens,
      round_count: approved.length,
      pending_allocations: pendingCount,
      payment_summary: paymentSummary,
      created_at: inv.created_at,
    };
  });

  // Client-side payment filter (can't do this in PostgREST since it's aggregated)
  const filtered = paymentFilter
    ? investors.filter((inv: any) => inv.payment_summary === paymentFilter)
    : investors;

  // ── CSV Export ──
  if (isExport) {
    const headers = "Name,Email,KYC,PQ,Payment,Tokens,Rounds,Date Added";
    const rows = filtered.map((inv: any) =>
      [
        `"${inv.full_name}"`,
        inv.email,
        inv.kyc_status,
        inv.pq_status,
        inv.payment_summary,
        inv.total_tokens,
        inv.round_count,
        new Date(inv.created_at).toLocaleDateString(),
      ].join(",")
    );
    const csv = [headers, ...rows].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="investors-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  // If payment filter is active, the count from Supabase won't match
  // so we need to report the filtered total
  const finalTotal = paymentFilter ? filtered.length : (count || 0);

  return NextResponse.json({
    investors: paymentFilter ? filtered.slice(offset, offset + limit) : filtered,
    total: finalTotal,
  });
}

/**
 * POST /api/admin/investors
 * Manually create a new investor. All admin roles including staff can access.
 */
export async function POST(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const email = body.email?.toLowerCase().trim();
  const fullName = body.full_name?.trim();

  if (!email || !fullName) {
    return NextResponse.json(
      { error: "Email and full name are required" },
      { status: 400 }
    );
  }

  const { data, error } = await auth.client
    .from("investors")
    .insert({ email, full_name: fullName })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "An investor with this email already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // ── Auto-send welcome email ──
  const { subject, html } = composeWelcomeEmail(fullName);
  const emailSent = await sendEmail(email, subject, html);

  await auth.client.from("email_events").insert({
    investor_id: data.id,
    email_type: "welcome",
    sent_by: "system",
    metadata: { trigger: "investor_created", sent_successfully: emailSent },
  });

  return NextResponse.json({ ...data, welcome_email_sent: emailSent });
}
