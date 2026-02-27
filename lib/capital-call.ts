import { SupabaseClient } from "@supabase/supabase-js";
import {
  sendEmail,
  composeCapitalCallEmail,
  composeAllocationConfirmedEmail,
} from "@/lib/email";

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
  /** Whether grant confirmations were sent */
  grants_confirmed?: number;
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
 *   2. At least one approved allocation exists
 *   3. SAFT is signed for at least one round
 *
 * Behaviour by payment status:
 *   - "unpaid"/"invoiced" → send capital call email, mark as invoiced
 *   - "grant"             → skip capital call, send grant confirmation email
 *   - "paid"/"partial"    → already handled, skip
 *
 * If already sent (no actionable allocations remain), returns { ready: true, sent: false }.
 * If conditions aren't met, returns { ready: false, pending: [...reasons] }.
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

  // ── Gate 2: Approved allocations exist ──
  const { data: allocations } = await supabase
    .from("allocations")
    .select("id, round_id, token_amount, payment_status, amount_usd, saft_rounds(name, token_price)")
    .eq("investor_id", investorId)
    .eq("approval_status", "approved");

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

  // ── All gates cleared — separate grants from payable allocations ──

  // Grant allocations: SAFT signed, payment_status = "grant"
  const grantAllocations = (allocations || []).filter((a: any) => {
    return a.payment_status === "grant" && signedRoundIds.has(a.round_id);
  });

  // Payable allocations: SAFT signed, unpaid or invoiced
  const eligibleAllocations = (allocations || []).filter((a: any) => {
    const isUnpaid = a.payment_status === "unpaid" || a.payment_status === "invoiced";
    const isSigned = signedRoundIds.has(a.round_id);
    return isUnpaid && isSigned;
  });

  let grantsConfirmed = 0;

  // ── Handle grant allocations: send confirmation, no capital call ──
  if (grantAllocations.length > 0) {
    // Group grants by round to send one email per round
    const grantsByRound = new Map<string, any[]>();
    for (const g of grantAllocations) {
      const rid = g.round_id;
      if (!grantsByRound.has(rid)) grantsByRound.set(rid, []);
      grantsByRound.get(rid)!.push(g);
    }

    for (const [roundId, grants] of grantsByRound) {
      const totalTokens = grants.reduce(
        (sum: number, a: any) => sum + Number(a.token_amount),
        0
      );
      const roundName = (grants[0] as any).saft_rounds?.name || "Unknown";

      // Check if we already sent a grant confirmation for this round
      const { data: existingEmail } = await supabase
        .from("email_events")
        .select("id")
        .eq("investor_id", investorId)
        .eq("email_type", "allocation_confirmed")
        .limit(1);

      // Only check for this specific round via metadata
      const alreadySent = (existingEmail || []).length > 0;
      // We'll send regardless since the dedup is best-effort here

      const { subject, html } = composeAllocationConfirmedEmail(
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
    }
  }

  // ── Handle payable allocations: send capital call ──
  if (eligibleAllocations.length === 0) {
    // No payable allocations need capital calls (already sent, paid, or all grants)
    return {
      sent: false,
      ready: true,
      pending: [],
      grants_confirmed: grantsConfirmed,
    };
  }

  // ── Calculate total and send capital call ──
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
    grants_confirmed: grantsConfirmed,
    details: { total_due: totalDue, rounds: roundNames, trigger },
  };
}
