import { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, composeCapitalCallEmail } from "@/lib/email";

/**
 * Capital call readiness status.
 * Returned to callers so UI can show exactly what's pending.
 */
export interface CapitalCallStatus {
  /** Whether the capital call was sent during this check */
  sent: boolean;
  /** Whether all conditions are met (may already have been sent before) */
  ready: boolean;
  /** Human-readable reasons why the capital call can't be sent yet */
  pending: string[];
  /** Metadata about what was sent (if sent) */
  details?: {
    total_due: number;
    rounds: string[];
    trigger: string;
  };
}

/**
 * Check all capital call prerequisites and send if ready.
 *
 * Three gates must ALL be true:
 *   1. PQ status = "approved"
 *   2. At least one allocation exists (with an unpaid/invoiced status)
 *   3. SAFT is signed for at least one round
 *
 * If already sent (no unpaid allocations remain), returns { ready: true, sent: false }.
 * If conditions aren't met, returns { ready: false, pending: [...reasons] }.
 *
 * Called from:
 *   - Admin PATCH (on PQ approval)
 *   - Investor signing POST (on SAFT signed)
 *   - Can be called from anywhere as a safe idempotent check
 *
 * @param supabase   - Service role client
 * @param investorId - Investor UUID
 * @param trigger    - What triggered this check (e.g., "pq_approved", "saft_signed")
 * @param triggeredBy - Who triggered (admin email or "system")
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
    return { sent: false, ready: false, pending: ["Investor not found"] };
  }

  // ── Gate 1: PQ approved ──
  if (investor.pq_status !== "approved") {
    pending.push("Purchaser Questionnaire not yet approved");
  }

  // ── Gate 2: Allocations exist ──
  const { data: allocations } = await supabase
    .from("allocations")
    .select("id, round_id, token_amount, payment_status, amount_usd, saft_rounds(name, token_price)")
    .eq("investor_id", investorId);

  if (!allocations || allocations.length === 0) {
    pending.push("No allocations assigned");
  }

  // ── Gate 3: SAFT signed ──
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

  // ── If any gate is open, return pending status ──
  if (pending.length > 0) {
    return { sent: false, ready: false, pending };
  }

  // ── All gates cleared — find allocations that need capital calls ──
  // Only send for rounds where the SAFT is signed AND allocation is unpaid/invoiced
  const eligibleAllocations = (allocations || []).filter((a: any) => {
    const isUnpaid = a.payment_status === "unpaid" || a.payment_status === "invoiced";
    const isSigned = signedRoundIds.has(a.round_id);
    return isUnpaid && isSigned;
  });

  if (eligibleAllocations.length === 0) {
    // All gates met but no unpaid allocations — capital call already sent or paid
    return { sent: false, ready: true, pending: [] };
  }

  // ── Calculate total and send ──
  let totalDue = 0;
  const roundNames: string[] = [];

  for (const alloc of eligibleAllocations) {
    const price = (alloc as any).saft_rounds?.token_price || 0;
    const amount = Number(alloc.token_amount) * Number(price);
    totalDue += amount;

    const rName = (alloc as any).saft_rounds?.name;
    if (rName && !roundNames.includes(rName)) roundNames.push(rName);

    // Mark as invoiced
    if (alloc.payment_status === "unpaid") {
      await supabase
        .from("allocations")
        .update({ payment_status: "invoiced", amount_usd: amount })
        .eq("id", alloc.id);
    }
  }

  // ── Send capital call email ──
  const roundLabel = roundNames.join(" + ");
  const { subject, html } = composeCapitalCallEmail(
    investor.full_name,
    totalDue,
    roundLabel
  );
  const emailSent = await sendEmail(investor.email, subject, html);

  // ── Log email event ──
  await supabase.from("email_events").insert({
    investor_id: investorId,
    email_type: "capital_call",
    sent_by: triggeredBy,
    metadata: {
      total_due: totalDue,
      rounds: roundNames,
      trigger,
      sent_successfully: emailSent,
      allocations: eligibleAllocations.map((a: any) => a.id),
    },
  });

  return {
    sent: true,
    ready: true,
    pending: [],
    details: { total_due: totalDue, rounds: roundNames, trigger },
  };
}
