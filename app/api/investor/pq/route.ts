import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Helper: get the current investor's record using their session.
 * Returns { investor, adminClient } or null if not authenticated.
 */
async function getInvestorContext() {
  const cookieStore = cookies();

  // Get the authenticated user
  const userSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user?.email) return null;

  // Use service role to read/write investor data
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: investor } = await adminClient
    .from("investors")
    .select("*")
    .ilike("email", user.email)
    .single();

  if (!investor) return null;

  return { investor, adminClient, userEmail: user.email };
}

/**
 * GET /api/investor/pq
 * Returns the investor's PQ data and status.
 */
export async function GET() {
  const ctx = await getInvestorContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    pq_status: ctx.investor.pq_status,
    pq_data: ctx.investor.pq_data,
    pq_submitted_at: ctx.investor.pq_submitted_at,
    pq_notes: ctx.investor.pq_notes,
    pq_reviewed_at: ctx.investor.pq_reviewed_at,
    pq_update_prompted_at: ctx.investor.pq_update_prompted_at,
    kyc_status: ctx.investor.kyc_status,
    full_name: ctx.investor.full_name,
    email: ctx.investor.email,
  });
}

/**
 * POST /api/investor/pq
 * Submit or update the PQ form. Sets pq_status to "submitted".
 *
 * Investors can resubmit if their PQ was rejected.
 * Cannot submit if PQ is already approved.
 */
export async function POST(request: NextRequest) {
  const ctx = await getInvestorContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Investors can resubmit if rejected or if updating after approval (for re-approval).
  // "submitted" status blocks resubmission to prevent duplicate submissions while under review.
  if (ctx.investor.pq_status === "submitted") {
    return NextResponse.json(
      { error: "Your questionnaire is currently under review" },
      { status: 400 }
    );
  }

  // Block if KYC not verified
  if (ctx.investor.kyc_status !== "verified") {
    return NextResponse.json(
      { error: "KYC verification must be completed before submitting the PQ" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { pq_data } = body;

  if (!pq_data) {
    return NextResponse.json({ error: "pq_data is required" }, { status: 400 });
  }

  // Basic validation — ensure all sections present
  const requiredSections = ["section_a", "section_b", "section_c", "section_d", "section_e", "section_f"];
  for (const section of requiredSections) {
    if (!pq_data[section]) {
      return NextResponse.json(
        { error: `Missing section: ${section}` },
        { status: 400 }
      );
    }
  }

  if (!pq_data.signature_name || !pq_data.signature_date) {
    return NextResponse.json(
      { error: "Signature is required" },
      { status: 400 }
    );
  }

  const wasApproved = ctx.investor.pq_status === "approved";

  // Save the PQ data
  const { error } = await ctx.adminClient
    .from("investors")
    .update({
      pq_data,
      pq_status: "submitted",
      pq_submitted_at: new Date().toISOString(),
      // Clear previous review data on resubmission
      pq_review: null,
      pq_notes: null,
      pq_reviewed_at: null,
      pq_reviewed_by: null,
      pq_update_prompted_at: null,
    })
    .eq("id", ctx.investor.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log the submission event
  await ctx.adminClient.from("email_events").insert({
    investor_id: ctx.investor.id,
    email_type: "pq_submitted_notification",
    sent_by: ctx.userEmail,
    metadata: {
      trigger: wasApproved ? "investor_resubmitted_after_approval" : "investor_submitted",
      is_grant: !!pq_data.section_d?.is_grant,
    },
  });

  // Notify admins — this is action_required (needs review)
  const { notifyPqSubmitted } = await import("@/lib/admin-notify");
  await notifyPqSubmitted(ctx.adminClient, ctx.investor, wasApproved);

  return NextResponse.json({ success: true, pq_status: "submitted" });
}
