import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { sendEmail, composeDocsPackageEmail } from "@/lib/email";

/**
 * POST /api/webhooks/sumsub
 *
 * Receives Sumsub verification webhooks. Updates investor KYC status
 * and auto-sends subscription docs when verified.
 *
 * Sumsub event types we handle:
 *   - applicantReviewed  → KYC decision (GREEN/RED)
 *   - applicantPending   → KYC in review
 *   - applicantCreated   → links applicant ID
 *
 * Env vars required:
 *   SUMSUB_WEBHOOK_SECRET — HMAC secret for signature verification
 *   SUPABASE_SERVICE_ROLE_KEY — for bypassing RLS
 *
 * Sumsub identifies investors via externalUserId = investor email.
 */
export async function POST(request: NextRequest) {
  // ── 1. Verify webhook signature ──
  const secret = process.env.SUMSUB_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[SUMSUB] No SUMSUB_WEBHOOK_SECRET configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-payload-digest") || "";

  // Sumsub uses HMAC-SHA1 for webhook signatures
  const expectedSig = crypto
    .createHmac("sha1", secret)
    .update(rawBody)
    .digest("hex");

  if (signature !== expectedSig) {
    console.error("[SUMSUB] Invalid webhook signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // ── 2. Parse the payload ──
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    type: eventType,
    applicantId,
    externalUserId, // We set this to investor email in Sumsub
    reviewResult,
    reviewStatus,
  } = payload;

  console.log(`[SUMSUB] Event: ${eventType}, applicant: ${applicantId}, user: ${externalUserId}`);

  // Need an email to look up the investor
  if (!externalUserId) {
    return NextResponse.json({ ok: true, skipped: "no externalUserId" });
  }

  // ── 3. Connect to Supabase (service role) ──
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Look up investor by email (externalUserId)
  const { data: investor, error: lookupErr } = await supabase
    .from("investors")
    .select("*")
    .ilike("email", externalUserId)
    .single();

  if (lookupErr || !investor) {
    console.error(`[SUMSUB] Investor not found for email: ${externalUserId}`);
    // Return 200 so Sumsub doesn't retry — investor might not exist yet
    return NextResponse.json({ ok: true, skipped: "investor not found" });
  }

  // Always link the Sumsub applicant ID
  if (applicantId && !investor.sumsub_applicant_id) {
    await supabase
      .from("investors")
      .update({ sumsub_applicant_id: applicantId })
      .eq("id", investor.id);
  }

  // ── 4. Handle event types ──
  if (eventType === "applicantPending") {
    // KYC is under review
    await supabase
      .from("investors")
      .update({ kyc_status: "pending" })
      .eq("id", investor.id);

    return NextResponse.json({ ok: true, status: "pending" });
  }

  if (eventType === "applicantReviewed") {
    const answer = reviewResult?.reviewAnswer; // "GREEN" or "RED"

    if (answer === "GREEN") {
      // ── KYC Approved ──
      const updates: Record<string, any> = {
        kyc_status: "verified",
        kyc_verified_at: new Date().toISOString(),
      };

      await supabase
        .from("investors")
        .update(updates)
        .eq("id", investor.id);

      // Auto-send subscription docs if not already sent
      if (!investor.docs_sent_at) {
        const { subject, html } = composeDocsPackageEmail(investor.full_name);
        const sent = await sendEmail(investor.email, subject, html);

        await supabase
          .from("investors")
          .update({
            docs_sent_at: new Date().toISOString(),
            pq_status: investor.pq_status === "not_sent" ? "sent" : investor.pq_status,
          })
          .eq("id", investor.id);

        // Log email event
        await supabase.from("email_events").insert({
          investor_id: investor.id,
          email_type: "docs_package",
          sent_by: "system",
          metadata: {
            trigger: "sumsub_kyc_approved",
            applicant_id: applicantId,
            sent_successfully: sent,
          },
        });
      }

      return NextResponse.json({ ok: true, status: "verified", docs_sent: !investor.docs_sent_at });

    } else if (answer === "RED") {
      // ── KYC Rejected ──
      const rejectLabels = reviewResult?.rejectLabels || [];
      const comment = reviewResult?.moderationComment || "";

      await supabase
        .from("investors")
        .update({ kyc_status: "unverified" })
        .eq("id", investor.id);

      console.log(`[SUMSUB] KYC rejected for ${externalUserId}: ${rejectLabels.join(", ")} — ${comment}`);

      return NextResponse.json({ ok: true, status: "rejected" });
    }
  }

  // Unhandled event type — acknowledge without action
  return NextResponse.json({ ok: true, skipped: `unhandled event: ${eventType}` });
}
