import { NextRequest, NextResponse } from "next/server";
import { processReminders } from "@/lib/reminders";

/**
 * GET /api/cron/reminders
 *
 * Vercel Cron job — runs daily at 8:00 AM UTC.
 * Sends reminder emails for approaching deadlines.
 *
 * Protected by CRON_SECRET to prevent unauthorized triggers.
 * Set CRON_SECRET in your environment variables.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processReminders("cron");

    console.log(
      `[CRON] Reminders processed: ` +
      `${result.round_closing_sent} round closing, ` +
      `${result.payment_sent} payment, ` +
      `${result.skipped_already_sent} skipped (already sent), ` +
      `${result.errors.length} errors`
    );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error("[CRON] Reminder processing failed:", err);
    return NextResponse.json(
      { error: "Reminder processing failed", detail: err.message },
      { status: 500 }
    );
  }
}
