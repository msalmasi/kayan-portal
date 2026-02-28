import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";

/**
 * PATCH /api/admin/payments/claims
 * Review a payment claim: approve or reject. Manager+ only.
 *
 * Body: {
 *   claim_id: string,
 *   action: "approve" | "reject",
 *   approved_amount?: number,      — for partial wire approvals (defaults to claim.amount_usd)
 *   rejection_reason?: string,
 * }
 *
 * On approve:
 *   - Marks claim as "verified"
 *   - Applies approved_amount (or full claim amount) to outstanding allocations
 *   - Sends confirmation email if round is fully paid
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!auth.canWrite) {
    return NextResponse.json({ error: "Staff cannot review payment claims" }, { status: 403 });
  }

  const body = await request.json();
  const { claim_id, action, approved_amount, rejection_reason } = body;

  if (!claim_id || !["approve", "reject", "recheck"].includes(action)) {
    return NextResponse.json({ error: "claim_id and action (approve|reject|recheck) required" }, { status: 400 });
  }

  // Fetch the claim
  const { data: claim, error: fetchErr } = await auth.client
    .from("payment_claims")
    .select("*, investors(id, full_name, email)")
    .eq("id", claim_id)
    .single();

  if (fetchErr || !claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }

  // ── RECHECK — re-run on-chain verification for pending crypto claims ──
  if (action === "recheck") {
    if (!claim.tx_hash) {
      return NextResponse.json({ error: "No transaction hash — cannot re-verify wire claims" }, { status: 400 });
    }
    if (claim.status === "verified") {
      return NextResponse.json({ error: "Claim already verified" }, { status: 400 });
    }

    const investor = claim.investors as any;

    // Load wallet from DB settings
    const { loadPaymentSettings, getWalletForMethod } = await import("@/lib/payment-config");
    const settings = await loadPaymentSettings(auth.client);
    const receivingWallet = getWalletForMethod(claim.method, settings.wallets);

    const { verifyOnChain } = await import("@/lib/chain-verify");
    const result = await verifyOnChain(claim.method, claim.tx_hash, Number(claim.amount_usd), receivingWallet);

    // Determine if a real transfer was found
    const isOnChainConfirmed = result.verified || result.reason === "insufficient_amount";
    const actualAmount = result.amountTransferred || 0;

    if (isOnChainConfirmed && actualAmount > 0) {
      // Auto-apply the verified amount
      await auth.client
        .from("payment_claims")
        .update({
          status: "verified",
          amount_usd: actualAmount,            // on-chain amount IS the claim
          amount_verified_usd: actualAmount,
          verified_at: new Date().toISOString(),
          verified_by: "auto",
          chain_data: result.chainData,
        })
        .eq("id", claim_id);

      await applyPayment(
        auth.client, investor, claim.round_id,
        actualAmount, claim.method,
        claim.tx_hash
      );

      return NextResponse.json({
        success: true,
        action: "recheck",
        verified: true,
        amount_applied: actualAmount,
        detail: result.detail,
      });
    }

    // Still not verifiable — update chain_data with latest attempt
    await auth.client
      .from("payment_claims")
      .update({ chain_data: result.chainData || { error: result.detail } })
      .eq("id", claim_id);

    return NextResponse.json({
      success: true,
      action: "recheck",
      verified: false,
      detail: result.detail || "Transaction still not confirmed on-chain",
    });
  }

  if (claim.status === "verified") {
    return NextResponse.json({ error: "Claim already verified" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const investor = claim.investors as any;

  // ── REJECT ──
  if (action === "reject") {
    await auth.client
      .from("payment_claims")
      .update({
        status: "rejected",
        verified_at: now,
        verified_by: auth.email,
        rejection_reason: rejection_reason || null,
      })
      .eq("id", claim_id);

    return NextResponse.json({ success: true, action: "rejected" });
  }

  // ── APPROVE ──
  // Use approved_amount if provided (partial wire), otherwise full claim amount
  const amountToApply = approved_amount
    ? Math.min(Number(approved_amount), Number(claim.amount_usd))
    : Number(claim.amount_usd);

  await auth.client
    .from("payment_claims")
    .update({
      status: "verified",
      amount_verified_usd: amountToApply,
      verified_at: now,
      verified_by: auth.email,
    })
    .eq("id", claim_id);

  // Apply the approved amount to allocations
  await applyPayment(
    auth.client,
    investor,
    claim.round_id,
    amountToApply,
    claim.method,
    claim.tx_hash || claim.wire_reference || `claim-${claim_id}`
  );

  return NextResponse.json({
    success: true,
    action: "approved",
    amount_applied: amountToApply,
  });
}

// ─── Apply payment to allocations ───────────────────────────

async function applyPayment(
  supabase: any,
  investor: any,
  roundId: string,
  amountUsd: number,
  method: string,
  txRef: string
) {
  const methodMap: Record<string, string> = {
    usdc_eth: "usdc", usdc_sol: "usdc", usdt_eth: "usdt", wire: "wire",
  };

  const { data: allocations } = await supabase
    .from("allocations")
    .select("id, amount_usd, amount_received_usd, token_amount, saft_rounds(token_price)")
    .eq("investor_id", investor.id)
    .eq("round_id", roundId)
    .eq("approval_status", "approved")
    .in("payment_status", ["invoiced", "partial"]);

  if (!allocations || allocations.length === 0) return;

  let remaining = amountUsd;

  for (const alloc of allocations) {
    if (remaining <= 0) break;

    const due = Number(alloc.amount_usd) ||
      Number(alloc.token_amount) * Number(alloc.saft_rounds?.token_price || 0);
    const received = Number(alloc.amount_received_usd) || 0;
    const owed = due - received;
    if (owed <= 0) continue;

    const applying = Math.min(remaining, owed);
    const newReceived = received + applying;
    const fullyPaid = newReceived >= due * 0.995; // 0.5% tolerance

    await supabase
      .from("allocations")
      .update({
        payment_status: fullyPaid ? "paid" : "partial",
        payment_method: methodMap[method] || method,
        amount_received_usd: newReceived,
        tx_reference: txRef,
        payment_date: fullyPaid ? new Date().toISOString() : null,
      })
      .eq("id", alloc.id);

    remaining -= applying;
  }

  // Send confirmation email if all allocations for round are now paid
  const { data: freshAllocs } = await supabase
    .from("allocations")
    .select("payment_status, token_amount")
    .eq("investor_id", investor.id)
    .eq("round_id", roundId)
    .eq("approval_status", "approved");

  const allPaid = freshAllocs?.every(
    (a: any) => a.payment_status === "paid" || a.payment_status === "grant"
  );

  if (allPaid && investor) {
    try {
      const { data: round } = await supabase
        .from("saft_rounds").select("name").eq("id", roundId).single();

      const totalTokens = (freshAllocs || []).reduce(
        (s: number, a: any) => s + Number(a.token_amount), 0
      );

      const { sendEmail, composeAllocationConfirmedEmail } = await import("@/lib/email");
      const { subject, html } = composeAllocationConfirmedEmail(
        investor.full_name, totalTokens, round?.name || "Unknown",
        { isGrant: false, txReference: txRef, amountUsd }
      );
      await sendEmail(investor.email, subject, html);

      await supabase.from("email_events").insert({
        investor_id: investor.id,
        email_type: "allocation_confirmed",
        sent_by: "system",
        metadata: {
          trigger: "admin_approved_claim",
          round_id: roundId, round_name: round?.name,
          token_amount: totalTokens, tx_reference: txRef, method,
        },
      });
    } catch (err: any) {
      console.error("[CLAIM-APPROVE] Confirmation email failed:", err.message);
    }
  }
}
