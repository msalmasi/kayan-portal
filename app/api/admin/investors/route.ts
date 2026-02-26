import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import { sendEmail, composeWelcomeEmail } from "@/lib/email";

/**
 * GET /api/admin/investors
 * Returns paginated, searchable investor list with aggregated allocation data.
 */
export async function GET(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || "";
  const page = parseInt(searchParams.get("page") || "0");
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = page * limit;

  let query = auth.client
    .from("investors")
    .select("id, email, full_name, kyc_status, pq_status, allocations(token_amount, payment_status)", {
      count: "exact",
    });

  if (search) {
    query = query.or(
      `full_name.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const investors = (data || []).map((inv: any) => ({
    id: inv.id,
    email: inv.email,
    full_name: inv.full_name,
    kyc_status: inv.kyc_status,
    pq_status: inv.pq_status || "not_sent",
    total_tokens: (inv.allocations || []).reduce(
      (sum: number, a: any) => sum + Number(a.token_amount),
      0
    ),
    round_count: (inv.allocations || []).length,
    // Aggregate payment: "paid" if all paid, "partial" if any partial/mixed, "unpaid" otherwise
    payment_summary: (() => {
      const allocs = inv.allocations || [];
      if (allocs.length === 0) return "none";
      if (allocs.every((a: any) => a.payment_status === "paid")) return "paid";
      if (allocs.some((a: any) => a.payment_status === "paid" || a.payment_status === "partial")) return "partial";
      if (allocs.some((a: any) => a.payment_status === "invoiced")) return "invoiced";
      return "unpaid";
    })(),
  }));

  return NextResponse.json({ investors, total: count || 0 });
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
  // No canWrite check — staff can create new investors

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

  // Log the email event
  await auth.client.from("email_events").insert({
    investor_id: data.id,
    email_type: "welcome",
    sent_by: "system",
    metadata: { trigger: "investor_created", sent_successfully: emailSent },
  });

  return NextResponse.json({ ...data, welcome_email_sent: emailSent });
}
