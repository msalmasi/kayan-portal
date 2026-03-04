import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// ── Auth helper (same pattern as other investor endpoints) ──

async function getInvestorContext() {
  const cookieStore = cookies();
  const userSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user?.email) return null;

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
 * GET /api/investor/transfers
 * Returns the investor's transfer history (as sender and receiver).
 */
export async function GET() {
  const ctx = await getInvestorContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: sent } = await ctx.adminClient
    .from("transfers")
    .select("*, to_inv:investors!transfers_to_investor_id_fkey(full_name, email), saft_rounds!transfers_round_id_fkey(name)")
    .eq("from_investor_id", ctx.investor.id)
    .order("created_at", { ascending: false });

  const { data: received } = await ctx.adminClient
    .from("transfers")
    .select("*, from_inv:investors!transfers_from_investor_id_fkey(full_name, email), saft_rounds!transfers_round_id_fkey(name)")
    .eq("to_investor_id", ctx.investor.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    sent: sent || [],
    received: received || [],
  });
}

/**
 * POST /api/investor/transfers
 * Request consent to transfer tokens.
 */
export async function POST(request: NextRequest) {
  const ctx = await getInvestorContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { allocation_id, token_amount, transfer_type, reason, price_per_token,
    transferee_email, transferee_name, to_wallet } = body;

  // Validate required fields
  if (!allocation_id || !token_amount || !transfer_type) {
    return NextResponse.json({ error: "allocation_id, token_amount, transfer_type required" }, { status: 400 });
  }

  // Validate investor eligibility
  if (ctx.investor.kyc_status !== "verified") {
    return NextResponse.json({ error: "KYC must be verified to request transfers" }, { status: 400 });
  }
  if (ctx.investor.pq_status !== "approved") {
    return NextResponse.json({ error: "PQ must be approved to request transfers" }, { status: 400 });
  }

  // Validate allocation ownership and balance
  const { data: alloc } = await ctx.adminClient
    .from("allocations")
    .select("id, round_id, token_amount, payment_status, approval_status, investor_id")
    .eq("id", allocation_id)
    .eq("investor_id", ctx.investor.id)
    .single();

  if (!alloc) return NextResponse.json({ error: "Allocation not found" }, { status: 404 });
  if (alloc.approval_status !== "approved") {
    return NextResponse.json({ error: "Allocation must be approved" }, { status: 400 });
  }
  if (!["paid", "grant"].includes(alloc.payment_status)) {
    return NextResponse.json({ error: "Allocation must be fully paid or a grant" }, { status: 400 });
  }
  if (Number(token_amount) > Number(alloc.token_amount)) {
    return NextResponse.json({ error: "Transfer amount exceeds your allocation balance" }, { status: 400 });
  }

  // If transferee email provided, find or create investor
  let toInvestorId = null;
  if (transferee_email) {
    const email = transferee_email.toLowerCase().trim();
    const { data: existing } = await ctx.adminClient
      .from("investors")
      .select("id")
      .eq("email", email)
      .single();

    if (existing) {
      toInvestorId = existing.id;
    } else {
      const { data: newInv } = await ctx.adminClient
        .from("investors")
        .insert({ email, full_name: transferee_name || email })
        .select("id")
        .single();
      toInvestorId = newInv?.id || null;

      // Send onboarding invite
      if (newInv) {
        try {
          const { sendEmail, composeWelcomeEmail } = await import("@/lib/email");
          const { subject, html } = await composeWelcomeEmail(transferee_name || email);
          await sendEmail(email, subject, html);
        } catch (e: any) { console.error("[TRANSFER] Invite failed:", e.message); }
      }
    }
  }

  // Create transfer request
  const { data: transfer, error: insertErr } = await ctx.adminClient
    .from("transfers")
    .insert({
      from_investor_id: ctx.investor.id,
      to_investor_id: toInvestorId,
      allocation_id,
      round_id: alloc.round_id,
      token_amount: Number(token_amount),
      price_per_token: price_per_token ? Number(price_per_token) : null,
      total_consideration: price_per_token ? Number(token_amount) * Number(price_per_token) : null,
      transfer_type,
      status: "requested",
      direction: "pre_approved",
      to_wallet: to_wallet || null,
      reason: reason || null,
      initiated_by: "investor",
    })
    .select()
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Notify admin
  try {
    const { sendEmail, composeTransferEmail } = await import("@/lib/email");
    // Get admin emails
    const { data: admins } = await ctx.adminClient.from("admin_users").select("email").in("role", ["super_admin", "admin"]);
    if (admins && admins.length > 0) {
      const { subject, html } = await composeTransferEmail(
        ctx.investor.full_name, "admin_request", Number(token_amount)
      );
      await Promise.allSettled(admins.map((a: any) => sendEmail(a.email, subject, html)));
    }
  } catch (e: any) { console.error("[TRANSFER] Admin notification failed:", e.message); }

  return NextResponse.json({ success: true, transfer });
}
