import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin notification priorities.
 *
 * action_required — admin needs to do something (e.g. review PQ)
 * info            — awareness only (e.g. KYC verified, SAFT signed)
 */
export type NotificationPriority = "action_required" | "info";

export interface CreateNotificationParams {
  eventType: string;
  priority: NotificationPriority;
  investorId: string;
  investorName: string;
  investorEmail: string;
  title: string;
  detail?: string;
  metadata?: Record<string, any>;
}

/**
 * Create an admin notification + email subscribed admins.
 *
 * Fire-and-forget — failures are logged but don't break the calling flow.
 * Deduplicates by checking for an identical unread notification
 * for the same investor + event_type within the last hour.
 */
export async function notify(
  supabase: SupabaseClient,
  params: CreateNotificationParams
): Promise<void> {
  try {
    // Deduplicate: skip if identical unread notification exists within 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from("admin_notifications")
      .select("id")
      .eq("investor_id", params.investorId)
      .eq("event_type", params.eventType)
      .eq("is_read", false)
      .gte("created_at", oneHourAgo)
      .limit(1);

    if (existing && existing.length > 0) return; // Already notified recently

    await supabase.from("admin_notifications").insert({
      event_type: params.eventType,
      priority: params.priority,
      investor_id: params.investorId,
      investor_name: params.investorName,
      investor_email: params.investorEmail,
      title: params.title,
      detail: params.detail || null,
      metadata: params.metadata || {},
    });

    // ── Email subscribed admins (fire-and-forget) ──
    await emailSubscribedAdmins(supabase, params);
  } catch (err: any) {
    console.error("[NOTIFY] Failed to create notification:", err.message);
  }
}

/**
 * Send email alerts to admins who have subscribed to this event type.
 * Looks up admin_alert_subscriptions and dispatches emails in parallel.
 */
async function emailSubscribedAdmins(
  supabase: SupabaseClient,
  params: CreateNotificationParams
): Promise<void> {
  try {
    const { data: subs } = await supabase
      .from("admin_alert_subscriptions")
      .select("email, event_types")
      .eq("enabled", true)
      .contains("event_types", [params.eventType]);

    if (!subs || subs.length === 0) return;

    const { sendEmail } = await import("@/lib/email");
    const { composeAdminAlertEmail } = await import("@/lib/email");

    const { subject, html } = composeAdminAlertEmail(params);

    await Promise.allSettled(
      subs.map((sub: any) => sendEmail(sub.email, subject, html))
    );

    console.log(
      `[NOTIFY] Emailed ${subs.length} admin(s) for ${params.eventType}`
    );
  } catch (err: any) {
    // Non-fatal — portal notification was already created
    console.error("[NOTIFY] Email dispatch failed:", err.message);
  }
}

// ─── Convenience wrappers for common events ─────────────────

/**
 * Resolve all unresolved action_required notifications for an investor + event type.
 * Called when the underlying action is completed (e.g. PQ reviewed, allocation approved).
 */
export async function resolveNotifications(
  supabase: SupabaseClient,
  investorId: string,
  eventType: string,
  resolvedBy: string
): Promise<void> {
  try {
    await supabase
      .from("admin_notifications")
      .update({
        is_resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy,
      })
      .eq("investor_id", investorId)
      .eq("event_type", eventType)
      .eq("is_resolved", false);
  } catch (err: any) {
    console.error("[NOTIFY] Failed to resolve notifications:", err.message);
  }
}

// ─── Convenience wrappers for common events (continued) ─────

/** KYC approved via Sumsub or manual admin toggle */
export function notifyKycVerified(
  supabase: SupabaseClient,
  investor: { id: string; full_name: string; email: string },
  docsGenerated: number
) {
  return notify(supabase, {
    eventType: "kyc_verified",
    priority: "info",
    investorId: investor.id,
    investorName: investor.full_name,
    investorEmail: investor.email,
    title: `${investor.full_name} passed KYC verification`,
    detail: docsGenerated > 0
      ? `${docsGenerated} document set(s) auto-generated and sent.`
      : "No allocations found — documents will be generated once an allocation is added.",
    metadata: { docs_generated: docsGenerated },
  });
}

/** KYC rejected */
export function notifyKycRejected(
  supabase: SupabaseClient,
  investor: { id: string; full_name: string; email: string },
  reasons: string[]
) {
  return notify(supabase, {
    eventType: "kyc_rejected",
    priority: "info",
    investorId: investor.id,
    investorName: investor.full_name,
    investorEmail: investor.email,
    title: `${investor.full_name} KYC rejected`,
    detail: reasons.length > 0 ? `Reasons: ${reasons.join(", ")}` : undefined,
    metadata: { reasons },
  });
}

/** Investor submitted their Purchaser Questionnaire — needs review */
export function notifyPqSubmitted(
  supabase: SupabaseClient,
  investor: { id: string; full_name: string; email: string }
) {
  return notify(supabase, {
    eventType: "pq_submitted",
    priority: "action_required",
    investorId: investor.id,
    investorName: investor.full_name,
    investorEmail: investor.email,
    title: `${investor.full_name} submitted their Purchaser Questionnaire`,
    detail: "Review and approve or reject in the investor detail page.",
  });
}

/** SAFT signed by investor */
export function notifySaftSigned(
  supabase: SupabaseClient,
  investor: { id: string; full_name: string; email: string },
  roundName: string,
  capitalCallSent: boolean
) {
  return notify(supabase, {
    eventType: "saft_signed",
    priority: "info",
    investorId: investor.id,
    investorName: investor.full_name,
    investorEmail: investor.email,
    title: `${investor.full_name} signed SAFT for ${roundName}`,
    detail: capitalCallSent
      ? "Capital call was auto-sent (all conditions met)."
      : "Capital call pending — PQ approval or other conditions still needed.",
    metadata: { round_name: roundName, capital_call_sent: capitalCallSent },
  });
}

/** Payment received / confirmed by admin */
export function notifyPaymentReceived(
  supabase: SupabaseClient,
  investor: { id: string; full_name: string; email: string },
  amount: number,
  roundName: string,
  status: string
) {
  return notify(supabase, {
    eventType: "payment_received",
    priority: "info",
    investorId: investor.id,
    investorName: investor.full_name,
    investorEmail: investor.email,
    title: `${investor.full_name} payment ${status === "paid" ? "confirmed" : "partially received"} — $${amount.toLocaleString()}`,
    detail: `Round: ${roundName}`,
    metadata: { amount, round_name: roundName, status },
  });
}

/** Staff proposed an allocation — needs manager approval */
export function notifyAllocationProposed(
  supabase: SupabaseClient,
  investor: { id: string; full_name: string; email: string },
  roundName: string,
  tokenAmount: number,
  proposedBy: string
) {
  return notify(supabase, {
    eventType: "allocation_proposed",
    priority: "action_required",
    investorId: investor.id,
    investorName: investor.full_name,
    investorEmail: investor.email,
    title: `Allocation proposed for ${investor.full_name}`,
    detail: `${tokenAmount.toLocaleString()} tokens in ${roundName} — proposed by ${proposedBy}. Awaiting manager approval.`,
    metadata: { round_name: roundName, token_amount: tokenAmount, proposed_by: proposedBy },
  });
}

/** Allocation approved by manager */
export function notifyAllocationApproved(
  supabase: SupabaseClient,
  investor: { id: string; full_name: string; email: string },
  roundName: string,
  tokenAmount: number,
  approvedBy: string
) {
  return notify(supabase, {
    eventType: "allocation_approved",
    priority: "info",
    investorId: investor.id,
    investorName: investor.full_name,
    investorEmail: investor.email,
    title: `Allocation approved for ${investor.full_name}`,
    detail: `${tokenAmount.toLocaleString()} tokens in ${roundName} — approved by ${approvedBy}.`,
    metadata: { round_name: roundName, token_amount: tokenAmount, approved_by: approvedBy },
  });
}

/** Allocation rejected by manager */
export function notifyAllocationRejected(
  supabase: SupabaseClient,
  investor: { id: string; full_name: string; email: string },
  roundName: string,
  tokenAmount: number,
  rejectedBy: string,
  reason: string
) {
  return notify(supabase, {
    eventType: "allocation_rejected",
    priority: "info",
    investorId: investor.id,
    investorName: investor.full_name,
    investorEmail: investor.email,
    title: `Allocation rejected for ${investor.full_name}`,
    detail: `${tokenAmount.toLocaleString()} tokens in ${roundName} — rejected by ${rejectedBy}. Reason: ${reason || "No reason given."}`,
    metadata: { round_name: roundName, token_amount: tokenAmount, rejected_by: rejectedBy, reason },
  });
}
