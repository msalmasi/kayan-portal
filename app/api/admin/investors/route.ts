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
 *   sort_by   — column to sort (any column including aggregated ones)
 *   sort_dir  — asc or desc (default desc)
 *   kyc       — filter by kyc_status
 *   pq        — filter by pq_status
 *   payment   — filter by payment summary
 *   docs      — filter by doc_status (none|pending|signed)
 *   action    — "true" to show only investors needing admin action
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
  const sortDir = searchParams.get("sort_dir") || "desc";
  const kycFilter = searchParams.get("kyc") || "";
  const pqFilter = searchParams.get("pq") || "";
  const paymentFilter = searchParams.get("payment") || "";
  const docsFilter = searchParams.get("docs") || "";
  const actionFilter = searchParams.get("action") === "true";
  const isExport = searchParams.get("export") === "csv";

  // ── Fetch ALL matching investors in batches ──
  // Supabase PostgREST caps at 1000 rows per request.
  // We page through in batches of 1000, then aggregate/sort/paginate in JS.
  const BATCH_SIZE = 1000;
  let allData: any[] = [];
  let batchOffset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = auth.client
      .from("investors")
      .select(
        "id, email, full_name, kyc_status, pq_status, created_at, " +
        "allocations(token_amount, payment_status, approval_status, round_id), " +
        "investor_documents(doc_type, status, round_id)"
      )
      .order("created_at", { ascending: false })
      .range(batchOffset, batchOffset + BATCH_SIZE - 1);

    // DB-level filters (applied to every batch)
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    if (kycFilter) query = query.eq("kyc_status", kycFilter);
    if (pqFilter) query = query.eq("pq_status", pqFilter);

    const { data: batch, error: batchError } = await query;

    if (batchError) {
      return NextResponse.json({ error: batchError.message }, { status: 500 });
    }

    const rows = batch || [];
    allData = allData.concat(rows);

    // If we got fewer rows than batch size, we've reached the end
    hasMore = rows.length === BATCH_SIZE;
    batchOffset += BATCH_SIZE;
  }

  const data = allData;

  // ── Transform rows — compute all aggregated fields ──
  let investors = (data || []).map((inv: any) => {
    const allAllocs = inv.allocations || [];
    const approved = allAllocs.filter((a: any) => a.approval_status === "approved");
    const docs = inv.investor_documents || [];

    // Tokens: sum of approved allocations
    const totalTokens = approved.reduce(
      (sum: number, a: any) => sum + Number(a.token_amount), 0
    );

    // Pending allocation proposals
    const pendingAllocations = allAllocs.filter(
      (a: any) => a.approval_status === "pending"
    ).length;

    // Payment summary
    const paymentSummary = (() => {
      if (approved.length === 0) return "none";
      const allComplete = approved.every(
        (a: any) => a.payment_status === "paid" || a.payment_status === "grant"
      );
      if (allComplete) {
        return approved.every((a: any) => a.payment_status === "grant") ? "grant" : "paid";
      }
      if (approved.some((a: any) => a.payment_status === "paid" || a.payment_status === "partial"))
        return "partial";
      if (approved.some((a: any) => a.payment_status === "invoiced")) return "invoiced";
      return "unpaid";
    })();

    // Document status
    // Cross-reference approved allocations with signed SAFT documents per round.
    // "signed" only if every approved allocation has a signed SAFT for its round.
    const docStatus = (() => {
      if (docs.length === 0) return "none";
      const safts = docs.filter((d: any) => d.doc_type === "saft");
      if (safts.length === 0) return "none";

      // Build set of round IDs that have a signed SAFT
      const signedRoundIds = new Set(
        safts.filter((d: any) => d.status === "signed").map((d: any) => d.round_id)
      );

      // Check if any approved allocation is missing a signed SAFT
      const approvedAllocs = allAllocs.filter((a: any) => a.approval_status === "approved");
      if (approvedAllocs.length > 0) {
        const allCovered = approvedAllocs.every((a: any) => signedRoundIds.has(a.round_id));
        if (!allCovered) return "pending";
      }

      // All existing safts signed and all allocations covered
      if (safts.every((d: any) => d.status === "signed")) return "signed";
      return "pending";
    })();

    // Action needed — investor requires admin/manager attention
    // Reasons: PQ submitted (needs review), pending allocations (need approval)
    const actionReasons: string[] = [];
    if (inv.pq_status === "submitted") actionReasons.push("PQ needs review");
    if (pendingAllocations > 0) actionReasons.push(`${pendingAllocations} allocation(s) pending`);

    return {
      id: inv.id,
      email: inv.email,
      full_name: inv.full_name,
      kyc_status: inv.kyc_status,
      pq_status: inv.pq_status || "not_sent",
      total_tokens: totalTokens,
      round_count: approved.length,
      pending_allocations: pendingAllocations,
      payment_summary: paymentSummary,
      doc_status: docStatus,
      action_needed: actionReasons.length > 0,
      action_reasons: actionReasons,
      created_at: inv.created_at,
    };
  });

  // ── Client-side filters (aggregated fields) ──
  if (paymentFilter) {
    investors = investors.filter((inv: any) => inv.payment_summary === paymentFilter);
  }
  if (docsFilter) {
    investors = investors.filter((inv: any) => inv.doc_status === docsFilter);
  }
  if (actionFilter) {
    investors = investors.filter((inv: any) => inv.action_needed);
  }

  // ── Sort ──
  // Rank maps for sorting status columns meaningfully
  const PAYMENT_RANK: Record<string, number> = {
    none: 0, unpaid: 1, invoiced: 2, partial: 3, paid: 4, grant: 5,
  };
  const DOC_RANK: Record<string, number> = {
    none: 0, pending: 1, signed: 2,
  };

  const dir = sortDir === "asc" ? 1 : -1;
  investors.sort((a: any, b: any) => {
    let av: any, bv: any;
    switch (sortBy) {
      case "full_name":
      case "email":
        av = (a[sortBy] || "").toLowerCase();
        bv = (b[sortBy] || "").toLowerCase();
        return av < bv ? -dir : av > bv ? dir : 0;
      case "kyc_status":
      case "pq_status":
        av = (a[sortBy] || "").toLowerCase();
        bv = (b[sortBy] || "").toLowerCase();
        return av < bv ? -dir : av > bv ? dir : 0;
      case "total_tokens":
        return (a.total_tokens - b.total_tokens) * dir;
      case "payment_summary":
        return ((PAYMENT_RANK[a.payment_summary] || 0) - (PAYMENT_RANK[b.payment_summary] || 0)) * dir;
      case "doc_status":
        return ((DOC_RANK[a.doc_status] || 0) - (DOC_RANK[b.doc_status] || 0)) * dir;
      case "action_needed":
        return ((a.action_needed ? 1 : 0) - (b.action_needed ? 1 : 0)) * dir;
      case "created_at":
      default:
        return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
    }
  });

  const total = investors.length;

  // ── CSV Export ──
  if (isExport) {
    const headers = "Name,Email,KYC,PQ,Payment,Tokens,Docs,Action Needed,Date Added";
    const rows = investors.map((inv: any) =>
      [
        `"${inv.full_name}"`,
        inv.email,
        inv.kyc_status,
        inv.pq_status,
        inv.payment_summary,
        inv.total_tokens,
        inv.doc_status,
        inv.action_needed ? `"${inv.action_reasons.join("; ")}"` : "",
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

  // ── Paginate ──
  const offset = page * limit;
  const paged = investors.slice(offset, offset + limit);

  return NextResponse.json({ investors: paged, total });
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
