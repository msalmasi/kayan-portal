import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import {
  sendEmail,
  composeWelcomeEmail,
  composeCapitalCallEmail,
} from "@/lib/email";

/**
 * POST /api/admin/emails
 * Send an email to an investor and log the event.
 *
 * Body: { investor_id, email_type: "welcome" | "capital_call" }
 *
 * Welcome emails can be sent by any role (fires after investor creation).
 * Capital call emails require canWrite (manager+).
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

  // Fetch investor with allocations + rounds
  const { data: investor, error: invErr } = await auth.client
    .from("investors")
    .select("*, allocations(*, saft_rounds(*))")
    .eq("id", investor_id)
    .single();

  if (invErr || !investor) {
    return NextResponse.json({ error: "Investor not found" }, { status: 404 });
  }

  let subject: string;
  let html: string;
  let metadata: Record<string, any> = {};

  if (email_type === "welcome") {
    // ── Welcome email ──
    const composed = composeWelcomeEmail(investor.full_name);
    subject = composed.subject;
    html = composed.html;
  } else if (email_type === "capital_call") {
    // ── Capital call email ──
    // Sum all unpaid/invoiced allocations for the capital call
    const unpaidAllocations = (investor.allocations || []).filter(
      (a: any) => a.payment_status === "unpaid" || a.payment_status === "invoiced"
    );

    if (unpaidAllocations.length === 0) {
      return NextResponse.json(
        { error: "No unpaid allocations to issue a capital call for" },
        { status: 400 }
      );
    }

    // Calculate total amount due across all unpaid allocations
    let totalDue = 0;
    const roundNames: string[] = [];

    for (const alloc of unpaidAllocations) {
      const price = alloc.saft_rounds?.token_price || 0;
      const amount = Number(alloc.token_amount) * Number(price);
      totalDue += amount;
      if (alloc.saft_rounds?.name && !roundNames.includes(alloc.saft_rounds.name)) {
        roundNames.push(alloc.saft_rounds.name);
      }

      // Auto-update payment status to "invoiced" if currently "unpaid"
      if (alloc.payment_status === "unpaid") {
        await auth.client
          .from("allocations")
          .update({
            payment_status: "invoiced",
            amount_usd: amount,
          })
          .eq("id", alloc.id);
      }
    }

    const roundLabel = roundNames.join(" + ");

    // Load enabled payment methods for the email
    const { loadPaymentSettings, getMethodList } = await import("@/lib/payment-config");
    const settings = await loadPaymentSettings(auth.client);
    const enabledMethods = getMethodList(settings.methods).filter(m => m.enabled).map(m => m.id);

    const composed = composeCapitalCallEmail(
      investor.full_name,
      totalDue,
      roundLabel,
      enabledMethods
    );
    subject = composed.subject;
    html = composed.html;
    metadata = { total_due: totalDue, rounds: roundNames };
  } else {
    return NextResponse.json(
      { error: "Invalid email_type. Use 'welcome' or 'capital_call'." },
      { status: 400 }
    );
  }

  // Send the email
  const sent = await sendEmail(investor.email, subject, html);

  // Get the admin user's email for audit trail
  const adminUserRes = await auth.client
    .from("admin_users")
    .select("email")
    .limit(1);
  // Use the request context to get sender — fallback to "system"
  const senderEmail = body.sent_by || "system";

  // Log the email event
  await auth.client.from("email_events").insert({
    investor_id,
    email_type,
    sent_by: senderEmail,
    metadata: { ...metadata, sent_successfully: sent },
  });

  return NextResponse.json({
    success: true,
    sent,
    message: sent
      ? `${email_type} email sent to ${investor.email}`
      : `${email_type} email logged (no RESEND_API_KEY configured — set it to enable delivery)`,
  });
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
