import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import {
  processReminders,
  sendPaymentReminderToInvestor,
  sendRoundClosingReminderToInvestor,
} from "@/lib/reminders";

/**
 * POST /api/admin/reminders
 *
 * Manually trigger reminders. Admin+ only.
 *
 * Body options:
 *   { action: "process_all" }
 *     — Run the full reminder sweep (same as cron)
 *
 *   { action: "payment_reminder", investor_id, allocation_id }
 *     — Send a payment reminder to a specific investor
 *
 *   { action: "round_closing_reminder", investor_id, round_id }
 *     — Send a round-closing reminder listing pending actions
 */
export async function POST(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["admin", "super_admin"].includes(auth.role)) {
    return NextResponse.json(
      { error: "Only admins can trigger reminders" },
      { status: 403 }
    );
  }

  const { action, investor_id, allocation_id, round_id } = await request.json();

  if (action === "process_all") {
    const result = await processReminders(auth.email);
    return NextResponse.json({
      success: true,
      message: `Sent ${result.round_closing_sent} round closing + ${result.payment_sent} payment reminder(s). ${result.skipped_already_sent} skipped (already sent).`,
      ...result,
    });
  }

  if (action === "payment_reminder" && investor_id && allocation_id) {
    const result = await sendPaymentReminderToInvestor(
      investor_id,
      allocation_id,
      auth.email
    );
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, message: "Payment reminder sent" });
  }

  if (action === "round_closing_reminder" && investor_id && round_id) {
    const result = await sendRoundClosingReminderToInvestor(
      investor_id,
      round_id,
      auth.email
    );
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true, message: "Round closing reminder sent" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
