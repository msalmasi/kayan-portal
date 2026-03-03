// ============================================================
// Automated Reminder Engine
//
// Sends reminder emails at 7, 3, and 1 day(s) before deadlines:
//   1. Round closing — investor has pending actions (unsigned docs, KYC, PQ)
//   2. Payment deadline — capital call unpaid or partially paid
//
// Deduplicates via email_events so the same reminder is never sent twice.
// Can be triggered by Vercel Cron (daily) or manually by an admin.
// ============================================================

import { createClient } from "@supabase/supabase-js";
import {
  sendEmail,
  composeRoundClosingReminderEmail,
  composePaymentReminderEmail,
} from "@/lib/email";

// Reminder thresholds — days before deadline
const REMINDER_DAYS = [7, 3, 1];

/** Create a service-role client for background jobs */
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Calculate days between now and a future date (rounded down) */
function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/** Dedup key to prevent repeat sends */
function dedupeKey(
  type: string,
  investorId: string,
  targetId: string,
  daysLeft: number
): string {
  return `${type}:${investorId}:${targetId}:${daysLeft}d`;
}

// ─── Results ─────────────────────────────────────────────────

interface ReminderResult {
  round_closing_sent: number;
  payment_sent: number;
  skipped_already_sent: number;
  errors: string[];
}

// ─── Main entry point ────────────────────────────────────────

/**
 * Process all pending reminders.
 * Called by the cron job or manually by an admin.
 *
 * @param triggeredBy - "cron" or an admin email address
 */
export async function processReminders(
  triggeredBy: string = "cron"
): Promise<ReminderResult> {
  const supabase = getServiceClient();
  const result: ReminderResult = {
    round_closing_sent: 0,
    payment_sent: 0,
    skipped_already_sent: 0,
    errors: [],
  };

  // ── 1. Round closing reminders ─────────────────────────────

  // Fetch rounds with a closing date in the next 7 days
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + Math.max(...REMINDER_DAYS) + 1);

  const { data: closingRounds } = await supabase
    .from("saft_rounds")
    .select("id, name, closing_date")
    .not("closing_date", "is", null)
    .gt("closing_date", new Date().toISOString())
    .lt("closing_date", maxDate.toISOString());

  for (const round of closingRounds || []) {
    const daysLeft = daysUntil(round.closing_date!);
    // Only send on exact threshold days
    const threshold = REMINDER_DAYS.find((d) => daysLeft <= d && daysLeft >= d - 0.99);
    if (threshold === undefined) continue;

    // Find investors with pending actions for this round
    const investors = await findInvestorsWithPendingActions(supabase, round.id);

    for (const inv of investors) {
      const key = dedupeKey("round_closing", inv.id, round.id, threshold);

      // Check if already sent
      const { data: existing } = await supabase
        .from("email_events")
        .select("id")
        .eq("investor_id", inv.id)
        .eq("email_type", "round_closing_reminder")
        .contains("metadata", { dedupe_key: key })
        .limit(1);

      if (existing && existing.length > 0) {
        result.skipped_already_sent++;
        continue;
      }

      try {
        const { subject, html } = await composeRoundClosingReminderEmail(
          inv.full_name,
          round.name,
          round.closing_date!,
          Math.max(1, Math.ceil(daysLeft)),
          inv.pending_actions
        );
        await sendEmail(inv.email, subject, html);

        // Log for deduplication
        await supabase.from("email_events").insert({
          investor_id: inv.id,
          email_type: "round_closing_reminder",
          sent_by: triggeredBy,
          metadata: {
            dedupe_key: key,
            round_id: round.id,
            round_name: round.name,
            days_before: threshold,
            pending_actions: inv.pending_actions,
          },
        });
        result.round_closing_sent++;
      } catch (err: any) {
        result.errors.push(`Round reminder to ${inv.email}: ${err.message}`);
      }
    }
  }

  // ── 2. Payment deadline reminders ──────────────────────────

  // Fetch allocations with approaching payment deadlines
  const { data: dueAllocations } = await supabase
    .from("allocations")
    .select(`
      id, investor_id, round_id, amount_usd, token_amount,
      amount_received_usd, payment_status, payment_deadline,
      investors(id, full_name, email),
      saft_rounds(name, token_price)
    `)
    .eq("approval_status", "approved")
    .in("payment_status", ["invoiced", "partial"])
    .not("payment_deadline", "is", null)
    .gt("payment_deadline", new Date().toISOString())
    .lt("payment_deadline", maxDate.toISOString());

  for (const alloc of dueAllocations || []) {
    const daysLeft = daysUntil(alloc.payment_deadline!);
    const threshold = REMINDER_DAYS.find((d) => daysLeft <= d && daysLeft >= d - 0.99);
    if (threshold === undefined) continue;

    const investor = alloc.investors as any;
    const round = alloc.saft_rounds as any;
    if (!investor?.email) continue;

    const key = dedupeKey("payment", investor.id, alloc.id, threshold);

    // Check if already sent
    const { data: existing } = await supabase
      .from("email_events")
      .select("id")
      .eq("investor_id", investor.id)
      .eq("email_type", "payment_reminder")
      .contains("metadata", { dedupe_key: key })
      .limit(1);

    if (existing && existing.length > 0) {
      result.skipped_already_sent++;
      continue;
    }

    try {
      const totalDue =
        Number(alloc.amount_usd) ||
        Number(alloc.token_amount) * Number(round?.token_price || 0);
      const received = Number(alloc.amount_received_usd) || 0;
      const balanceDue = totalDue - received;

      if (balanceDue <= 0) continue;

      const { subject, html } = await composePaymentReminderEmail(
        investor.full_name,
        round?.name || "Unknown",
        balanceDue,
        alloc.payment_deadline!,
        Math.max(1, Math.ceil(daysLeft)),
        alloc.payment_status === "partial"
      );
      await sendEmail(investor.email, subject, html);

      await supabase.from("email_events").insert({
        investor_id: investor.id,
        email_type: "payment_reminder",
        sent_by: triggeredBy,
        metadata: {
          dedupe_key: key,
          allocation_id: alloc.id,
          round_id: alloc.round_id,
          round_name: round?.name,
          days_before: threshold,
          balance_due: balanceDue,
        },
      });
      result.payment_sent++;
    } catch (err: any) {
      result.errors.push(`Payment reminder to ${investor.email}: ${err.message}`);
    }
  }

  return result;
}

// ─── Helpers ─────────────────────────────────────────────────

interface InvestorWithPendingActions {
  id: string;
  email: string;
  full_name: string;
  pending_actions: string[];
}

/**
 * For a given round, find investors who have allocations
 * but still have incomplete steps.
 */
async function findInvestorsWithPendingActions(
  supabase: ReturnType<typeof createClient>,
  roundId: string
): Promise<InvestorWithPendingActions[]> {
  // Get all investors with approved allocations in this round
  const { data: allocations } = await supabase
    .from("allocations")
    .select("investor_id, investors(id, email, full_name, kyc_status, pq_status)")
    .eq("round_id", roundId)
    .eq("approval_status", "approved");

  if (!allocations || allocations.length === 0) return [];

  // Dedupe investors
  const investorMap = new Map<string, any>();
  for (const alloc of allocations) {
    const inv = alloc.investors as any;
    if (inv?.id && !investorMap.has(inv.id)) {
      investorMap.set(inv.id, inv);
    }
  }

  const results: InvestorWithPendingActions[] = [];

  for (const [investorId, inv] of investorMap) {
    const actions: string[] = [];

    // Check KYC
    if (inv.kyc_status !== "verified") {
      actions.push("Complete identity verification (KYC)");
    }

    // Check PQ
    if (inv.pq_status !== "approved") {
      if (inv.pq_status === "not_sent" || inv.pq_status === "sent") {
        actions.push("Complete and submit the Purchaser Questionnaire");
      } else if (inv.pq_status === "rejected") {
        actions.push("Resubmit the Purchaser Questionnaire (revisions requested)");
      }
      // "submitted" = under review, not an investor action
    }

    // Check unsigned SAFT docs for this round
    const { data: unsignedDocs } = await supabase
      .from("investor_documents")
      .select("id")
      .eq("investor_id", investorId)
      .eq("round_id", roundId)
      .eq("doc_type", "saft")
      .in("status", ["pending", "viewed"])
      .limit(1);

    if (unsignedDocs && unsignedDocs.length > 0) {
      actions.push("Review and sign the SAFT agreement");
    }

    // Only include investors who have actual pending actions
    if (actions.length > 0) {
      results.push({
        id: investorId,
        email: inv.email,
        full_name: inv.full_name,
        pending_actions: actions,
      });
    }
  }

  return results;
}

// ─── Single-investor manual resend ───────────────────────────

/**
 * Send a payment reminder to a specific investor for a specific allocation.
 * Used by the admin manual trigger.
 */
export async function sendPaymentReminderToInvestor(
  investorId: string,
  allocationId: string,
  triggeredBy: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServiceClient();

  const { data: alloc } = await supabase
    .from("allocations")
    .select(`
      id, amount_usd, token_amount, amount_received_usd,
      payment_status, payment_deadline,
      investors(id, full_name, email),
      saft_rounds(name, token_price)
    `)
    .eq("id", allocationId)
    .eq("investor_id", investorId)
    .single();

  if (!alloc) return { success: false, error: "Allocation not found" };

  const investor = alloc.investors as any;
  const round = alloc.saft_rounds as any;
  const totalDue =
    Number(alloc.amount_usd) ||
    Number(alloc.token_amount) * Number(round?.token_price || 0);
  const received = Number(alloc.amount_received_usd) || 0;
  const balanceDue = totalDue - received;

  if (balanceDue <= 0) return { success: false, error: "No balance due" };

  const daysLeft = alloc.payment_deadline
    ? Math.max(0, Math.ceil(daysUntil(alloc.payment_deadline)))
    : 0;

  const { subject, html } = await composePaymentReminderEmail(
    investor.full_name,
    round?.name || "Unknown",
    balanceDue,
    alloc.payment_deadline || new Date().toISOString(),
    daysLeft,
    alloc.payment_status === "partial"
  );

  await sendEmail(investor.email, subject, html);

  await supabase.from("email_events").insert({
    investor_id: investorId,
    email_type: "payment_reminder",
    sent_by: triggeredBy,
    metadata: {
      allocation_id: allocationId,
      round_name: round?.name,
      balance_due: balanceDue,
      manual: true,
    },
  });

  return { success: true };
}
