import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import { sendEmail, composeWelcomeEmail } from "@/lib/email";

/**
 * POST /api/admin/emails
 * Send an email to an investor and log the event.
 *
 * Body: { investor_id, email_type: "welcome" | "capital_call" }
 *
 * Welcome emails can be sent by any role.
 * Capital call emails require canWrite (manager+) and route through
 * checkAndSendCapitalCall() which enforces all three gates:
 *   1. PQ approved
 *   2. SAFT signed for the round
 *   3. Round not closed
 */
export async function POST(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { investor_id, email_type } = body;

  if (!investor_id || !email_type) {
    return NextResponse.json(
      { error: "investor_id and email_type are required" },
      { status: 400 }
    );
  }

  // Capital call requires write access
  if (email_type === "capital_call" && !auth.canWrite) {
    return NextResponse.json(
      { error: "Staff cannot send capital call emails" },
      { status: 403 }
    );
  }

  // Fetch investor
  const { data: investor, error: invErr } = await auth.client
    .from("investors")
    .select("*")
    .eq("id", investor_id)
    .single();

  if (invErr || !investor) {
    return NextResponse.json({ error: "Investor not found" }, { status: 404 });
  }

  if (email_type === "welcome") {
    // ── Welcome email ──
    const { subject, html } = composeWelcomeEmail(investor.full_name);
    const sent = await sendEmail(investor.email, subject, html);

    await auth.client.from("email_events").insert({
      investor_id,
      email_type,
      sent_by: body.sent_by || "system",
      metadata: { sent_successfully: sent },
    });

    return NextResponse.json({
      success: true,
      sent,
      message: sent
        ? `Welcome email sent to ${investor.email}`
        : `Welcome email logged (no RESEND_API_KEY configured)`,
    });

  } else if (email_type === "capital_call") {
    // ── Capital call — delegate to gated flow ──
    // checkAndSendCapitalCall enforces: PQ approved, SAFT signed, round not closed.
    // It sends per-round emails, sets payment_deadline, and logs everything.
    const { checkAndSendCapitalCall } = await import("@/lib/capital-call");

    const result = await checkAndSendCapitalCall(
      auth.client,
      investor_id,
      "admin_resend",
      body.sent_by || "system"
    );

    if (!result.sent) {
      const reason = result.pending.length > 0
        ? result.pending.join("; ")
        : "No eligible allocations (already invoiced, paid, or round closed)";
      return NextResponse.json({ error: reason }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      sent: true,
      message: `Capital call issued: ${result.capital_calls_sent} call(s), ${result.grants_confirmed} grant confirmation(s)`,
      details: result.rounds,
    });

  } else {
    return NextResponse.json(
      { error: "Invalid email_type. Use 'welcome' or 'capital_call'." },
      { status: 400 }
    );
  }
}

/**
 * GET /api/admin/emails?investor_id=<id>
 * Fetch email history for an investor.
 */
export async function GET(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const investorId = searchParams.get("investor_id");

  if (!investorId) {
    return NextResponse.json(
      { error: "investor_id is required" },
      { status: 400 }
    );
  }

  const { data, error } = await auth.client
    .from("email_events")
    .select("*")
    .eq("investor_id", investorId)
    .order("sent_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}
