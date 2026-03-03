import { SupabaseClient } from "@supabase/supabase-js";
import {
  sendEmail,
  composeCapitalCallEmail,
  composeAllocationConfirmedEmail,
} from "@/lib/email";
import { addBusinessDays } from "@/lib/business-days";

/**
 * Capital call readiness status.
 * Returned to callers so UI can show exactly what's pending.
 */
export interface CapitalCallStatus {
  /** Whether any capital call was sent during this check */
  sent: boolean;
  /** Whether all conditions are met */
  ready: boolean;
  /** Human-readable reasons why capital calls can't be sent yet */
  pending: string[];
  /** Number of grant confirmations sent */
  grants_confirmed: number;
  /** Number of capital calls sent (one per round) */
  capital_calls_sent: number;
  /** Per-round details */
  rounds: {
    round_id: string;
    round_name: string;
    action: "capital_call" | "resent" | "grant_confirmed" | "already_paid" | "skipped";
    amount_due?: number;
    skip_reason?: string;
  }[];
}

/**
 * Check all capital call prerequisites and send if ready.
 *
 * Three gates must ALL be true per round:
 *   1. PQ status = "approved"
 *   2. Approved allocation(s) exist for this round
 *   3. SAFT is signed for this round
 *
 * These gates are checked CONTINUOUSLY — even for already-invoiced rounds.
 * If conditions change (e.g. PQ resubmitted), previously-issued capital
 * calls will NOT be resent until gates are satisfied again.
 *
 * Behaviour by payment status:
 *   - "unpaid"            → send capital call email, mark as invoiced
 *   - "invoiced"/"partial"→ re-send capital call email (reminder)
 *   - "grant"             → send grant confirmation email, no capital call
 *   - "paid"              → fully complete, skip
 *
 * Capital calls are sent PER ROUND (not batched) for clean tracking.
 */
export async function checkAndSendCapitalCall(
  supabase: SupabaseClient,
  investorId: string,
  trigger: string,
  triggeredBy: string
): Promise<CapitalCallStatus> {
  const pending: string[] = [];

  // ── Fetch investor ──
  const { data: investor } = await supabase
    .from("investors")
    .select("id, full_name, email, pq_status")
    .eq("id", investorId)
    .single();

  if (!investor) {
    return { sent: false, ready: false, pending: ["Investor not found"], grants_confirmed: 0, capital_calls_sent: 0, rounds: [] };
  }

  // ── Gate 1: PQ approved ──
  if (investor.pq_status !== "approved") {
    pending.push("Purchaser Questionnaire not yet approved");
  }

  // ── Fetch approved allocations ──
  const { data: allocations } = await supabase
    .from("allocations")
    .select("id, round_id, token_amount, payment_status, amount_usd, amount_received_usd, saft_rounds(id, name, token_price, closing_date)")
    .eq("investor_id", investorId)
    .eq("approval_status", "approved");

  if (!allocations || allocations.length === 0) {
    pending.push("No allocations assigned");
  }

  // ── Gate 3: Signed SAFTs ──
  const { data: signedDocs } = await supabase
    .from("investor_documents")
    .select("id, round_id, status")
    .eq("investor_id", investorId)
    .eq("doc_type", "saft")
    .eq("status", "signed");

  const signedRoundIds = new Set((signedDocs || []).map((d: any) => d.round_id));

  if (!signedDocs || signedDocs.length === 0) {
    pending.push("SAFT not yet signed");
  }

  // ── If PQ not approved, nothing can fire ──
  if (investor.pq_status !== "approved") {
    return { sent: false, ready: false, pending, grants_confirmed: 0, capital_calls_sent: 0, rounds: [] };
  }

  // ── Group allocations by round ──
  const roundMap: Record<string, any[]> = {};
  for (const alloc of (allocations || [])) {
    const rid = alloc.round_id;
    if (!roundMap[rid]) roundMap[rid] = [];
    roundMap[rid].push(alloc);
  }

  let grantsConfirmed = 0;
  let capitalCallsSent = 0;
  const roundResults: CapitalCallStatus["rounds"] = [];

  // ── Process each round independently ──
  for (const [roundId, roundAllocs] of Object.entries(roundMap)) {
    const roundName = (roundAllocs[0] as any).saft_rounds?.name || "Unknown";
    const tokenPrice = Number((roundAllocs[0] as any).saft_rounds?.token_price || 0);
    const closingDate = (roundAllocs[0] as any).saft_rounds?.closing_date;
    const hasSigned = signedRoundIds.has(roundId);

    // Gate: SAFT must be signed for this round
    if (!hasSigned) {
      roundResults.push({ round_id: roundId, round_name: roundName, action: "skipped", skip_reason: "SAFT not signed" });
      continue;
    }

    // Gate: Reissuance freeze — block capital calls while entity change in progress
    const { hasActiveReissuance } = await import("@/lib/reissuance");
    const reissuanceActive = await hasActiveReissuance(supabase, investorId, roundId);
    if (reissuanceActive) {
      roundResults.push({ round_id: roundId, round_name: roundName, action: "skipped", skip_reason: "SAFT re-issuance in progress" });
      continue;
    }

    // Gate: Round closing only blocks NEW capital calls.
    // Resends for already-invoiced allocations are allowed (investor may have missed the email).
    const roundClosed = closingDate && new Date(closingDate) < new Date();

    // Check allocation states
    const allGrants = roundAllocs.every((a: any) => a.payment_status === "grant");
    const allComplete = roundAllocs.every(
      (a: any) => a.payment_status === "paid" || a.payment_status === "grant"
    );
    const hasUnpaid = roundAllocs.some((a: any) => a.payment_status === "unpaid");
    const hasInvoicedOrPartial = roundAllocs.some(
      (a: any) => a.payment_status === "invoiced" || a.payment_status === "partial"
    );

    if (roundClosed && hasUnpaid) {
      // Can't issue new capital calls for closed rounds
      roundResults.push({ round_id: roundId, round_name: roundName, action: "skipped", skip_reason: "Round closed — cannot issue new capital calls" });
      continue;
    }

    // ── Grant round: send confirmation, no capital call ──
    if (allGrants) {
      const totalTokens = roundAllocs.reduce(
        (sum: number, a: any) => sum + Number(a.token_amount), 0
      );

      const { subject, html } = await composeAllocationConfirmedEmail(
        investor.full_name,
        totalTokens,
        roundName,
        { isGrant: true }
      );
      const emailSent = await sendEmail(investor.email, subject, html);

      await supabase.from("email_events").insert({
        investor_id: investorId,
        email_type: "allocation_confirmed",
        sent_by: triggeredBy,
        metadata: {
          trigger,
          is_grant: true,
          round_id: roundId,
          round_name: roundName,
          token_amount: totalTokens,
          sent_successfully: emailSent,
        },
      });

      grantsConfirmed++;
      roundResults.push({ round_id: roundId, round_name: roundName, action: "grant_confirmed" });
      continue;
    }

    // ── Already fully paid ──
    if (allComplete) {
      roundResults.push({ round_id: roundId, round_name: roundName, action: "already_paid" });
      continue;
    }

    // ── Closed round with nothing actionable → skip ──
    // Resends for invoiced/partial are still allowed (investor may have missed the email).
    if (roundClosed && !hasUnpaid && !hasInvoicedOrPartial) {
      roundResults.push({ round_id: roundId, round_name: roundName, action: "skipped", skip_reason: "Round closed — no outstanding payments" });
      continue;
    }

    // ── Load payment settings (shared across new + resend paths) ──
    const { loadPaymentSettings, getMethodList } = await import("@/lib/payment-config");
    const settings = await loadPaymentSettings(supabase);
    const enabledMethods = getMethodList(settings.methods).filter(m => m.enabled).map(m => m.id);

    // ── Process unpaid allocations: mark as invoiced + set deadline ──
    if (hasUnpaid) {
      const paymentDays = settings.capital_call_payment_days || 10;
      const paymentDeadline = addBusinessDays(new Date(), paymentDays);
      const paymentDeadlineISO = paymentDeadline.toISOString();

      for (const alloc of roundAllocs) {
        if (alloc.payment_status === "unpaid") {
          const amount = Number(alloc.amount_usd) || Number(alloc.token_amount) * tokenPrice;

          await supabase
            .from("allocations")
            .update({
              payment_status: "invoiced",
              amount_usd: amount,
              payment_deadline: paymentDeadlineISO,
            })
            .eq("id", alloc.id);
        }
      }
    }

    // ── Compute total due for email (invoiced + partial + newly invoiced) ──
    const totalDueRound = roundAllocs.reduce(
      (s: number, a: any) => {
        if (a.payment_status === "paid" || a.payment_status === "grant") return s;
        const due = Number(a.amount_usd) || Number(a.token_amount) * tokenPrice;
        const received = Number(a.amount_received_usd) || 0;
        return s + (due - received);
      }, 0
    );

    // ── Find earliest active payment deadline for the email ──
    const deadlines = roundAllocs
      .filter((a: any) => a.payment_deadline && a.payment_status !== "paid" && a.payment_status !== "grant")
      .map((a: any) => a.payment_deadline);

    // For newly invoiced (just set above), re-fetch to get the deadline
    const { data: freshAllocs } = await supabase
      .from("allocations")
      .select("payment_deadline")
      .eq("investor_id", investorId)
      .eq("round_id", roundId)
      .eq("approval_status", "approved")
      .in("payment_status", ["invoiced", "partial"]);

    const allDeadlines = (freshAllocs || [])
      .map((a: any) => a.payment_deadline)
      .filter(Boolean);
    const earliestDeadline = allDeadlines.length > 0
      ? allDeadlines.sort()[0]
      : null;

    // ── Send the capital call email ──
    const { subject, html } = await composeCapitalCallEmail(
      investor.full_name,
      totalDueRound,
      roundName,
      enabledMethods,
      earliestDeadline
    );
    const emailSent = await sendEmail(investor.email, subject, html);

    const isResend = !hasUnpaid && hasInvoicedOrPartial;

    await supabase.from("email_events").insert({
      investor_id: investorId,
      email_type: "capital_call",
      sent_by: triggeredBy,
      metadata: {
        trigger,
        is_resend: isResend,
        round_id: roundId,
        round_name: roundName,
        total_due: totalDueRound,
        allocations: roundAllocs.map((a: any) => a.id),
        sent_successfully: emailSent,
      },
    });

    capitalCallsSent++;
    roundResults.push({
      round_id: roundId,
      round_name: roundName,
      action: isResend ? "resent" : "capital_call",
      amount_due: totalDueRound,
    });
  }

  return {
    sent: capitalCallsSent > 0 || grantsConfirmed > 0,
    ready: pending.length === 0,
    pending,
    grants_confirmed: grantsConfirmed,
    capital_calls_sent: capitalCallsSent,
    rounds: roundResults,
  };
}
