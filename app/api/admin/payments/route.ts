import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";

/**
 * PATCH /api/admin/payments
 * Update payment fields on an allocation. Manager+ only.
 *
 * Body: {
 *   allocation_id: string,
 *   payment_status?: "unpaid" | "invoiced" | "partial" | "paid" | "grant",
 *   payment_method?: "wire" | "usdt" | "usdc" | "credit_card",
 *   amount_received_usd?: number,
 *   payment_date?: string (ISO),
 *   tx_reference?: string,
 * }
 *
 * When status changes to "paid":
 *   - Auto-sets payment_date if not provided
 *   - Sends allocation confirmed email to investor (with tx ref details)
 *   - Notifies subscribed admins
 *
 * When status changes to "grant":
 *   - Auto-sets payment_date
 *   - Sends grant confirmation email to investor (no payment required)
 *   - Notifies subscribed admins
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.canWrite) {
    return NextResponse.json({ error: "Staff cannot update payments" }, { status: 403 });
  }

  const body = await request.json();
  const { allocation_id } = body;

  if (!allocation_id) {
    return NextResponse.json(
      { error: "allocation_id is required" },
      { status: 400 }
    );
  }

  // Only allow payment-related fields
  const allowed = [
    "payment_status",
    "payment_method",
    "amount_usd",
    "amount_received_usd",
    "payment_date",
    "tx_reference",
  ];
  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  // Auto-set payment_date when status changes to "paid" or "grant"
  if ((updates.payment_status === "paid" || updates.payment_status === "grant") && !updates.payment_date) {
    updates.payment_date = new Date().toISOString();
  }

  const { data, error } = await auth.client
    .from("allocations")
    .update(updates)
    .eq("id", allocation_id)
    .select("*, saft_rounds(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // ── Fetch investor for emails + notifications ──
  let investor: any = null;
  if (updates.payment_status === "paid" || updates.payment_status === "partial" || updates.payment_status === "grant") {
    try {
      const { data: inv } = await auth.client
        .from("investors")
        .select("id, full_name, email")
        .eq("id", data.investor_id)
        .single();
      investor = inv;
    } catch {}
  }

  // ── Notify admins on paid / partial / grant ──
  if (investor && (updates.payment_status === "paid" || updates.payment_status === "partial" || updates.payment_status === "grant")) {
    try {
      const { notifyPaymentReceived } = await import("@/lib/admin-notify");
      await notifyPaymentReceived(
        auth.client,
        investor,
        Number(updates.amount_received_usd || data.amount_received_usd || 0),
        data.saft_rounds?.name || "Unknown",
        updates.payment_status
      );
    } catch (err: any) {
      console.error("[PAYMENTS] Admin notification failed:", err.message);
    }
  }

  // ── Email investor when payment confirmed ("paid") ──
  if (investor && updates.payment_status === "paid") {
    try {
      const { sendEmail, composeAllocationConfirmedEmail } = await import("@/lib/email");

      // Sum all approved allocations for this round to get total tokens
      const { data: roundAllocs } = await auth.client
        .from("allocations")
        .select("token_amount")
        .eq("investor_id", data.investor_id)
        .eq("round_id", data.round_id)
        .eq("approval_status", "approved");

      const totalTokens = (roundAllocs || []).reduce(
        (sum: number, a: any) => sum + Number(a.token_amount), 0
      );

      const PAYMENT_METHOD_LABELS: Record<string, string> = {
        wire: "Wire Transfer",
        usdt: "USDT",
        usdc: "USDC",
        credit_card: "Credit Card",
      };

      const { subject, html } = await composeAllocationConfirmedEmail(
        investor.full_name,
        totalTokens,
        data.saft_rounds?.name || "Unknown",
        {
          isGrant: false,
          txReference: data.tx_reference || undefined,
          paymentMethod: data.payment_method
            ? PAYMENT_METHOD_LABELS[data.payment_method] || data.payment_method
            : undefined,
          amountUsd: Number(data.amount_received_usd || data.amount_usd || 0) || undefined,
        }
      );

      const emailSent = await sendEmail(investor.email, subject, html);

      await auth.client.from("email_events").insert({
        investor_id: data.investor_id,
        email_type: "allocation_confirmed",
        sent_by: auth.email,
        metadata: {
          trigger: "payment_confirmed",
          round_id: data.round_id,
          round_name: data.saft_rounds?.name,
          token_amount: totalTokens,
          amount_usd: data.amount_received_usd || data.amount_usd,
          tx_reference: data.tx_reference,
          sent_successfully: emailSent,
        },
      });
    } catch (err: any) {
      console.error("[PAYMENTS] Investor confirmation email failed:", err.message);
    }
  }

  // ── Email investor when grant is set ──
  if (investor && updates.payment_status === "grant") {
    try {
      const { sendEmail, composeAllocationConfirmedEmail } = await import("@/lib/email");

      const { data: roundAllocs } = await auth.client
        .from("allocations")
        .select("token_amount")
        .eq("investor_id", data.investor_id)
        .eq("round_id", data.round_id)
        .eq("approval_status", "approved");

      const totalTokens = (roundAllocs || []).reduce(
        (sum: number, a: any) => sum + Number(a.token_amount), 0
      );

      const { subject, html } = await composeAllocationConfirmedEmail(
        investor.full_name,
        totalTokens,
        data.saft_rounds?.name || "Unknown",
        { isGrant: true }
      );

      const emailSent = await sendEmail(investor.email, subject, html);

      await auth.client.from("email_events").insert({
        investor_id: data.investor_id,
        email_type: "allocation_confirmed",
        sent_by: auth.email,
        metadata: {
          trigger: "grant_confirmed",
          is_grant: true,
          round_id: data.round_id,
          round_name: data.saft_rounds?.name,
          token_amount: totalTokens,
          sent_successfully: emailSent,
        },
      });
    } catch (err: any) {
      console.error("[PAYMENTS] Grant confirmation email failed:", err.message);
    }
  }

  return NextResponse.json(data);
}
