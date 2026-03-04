import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import { getEntityConfig } from "@/lib/entity-config";
import { runComplianceChecks } from "@/lib/transfer-compliance";
import { logRegistryChange } from "@/lib/registry-audit";

/**
 * GET /api/admin/transfers
 *
 * List transfers with optional filters:
 *   status, from_investor_id, to_investor_id, round_id, page, limit
 */
export async function GET(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const page = Number(sp.get("page") || "0");
  const limit = Math.min(Number(sp.get("limit") || "25"), 100);
  const status = sp.get("status") || "";
  const fromId = sp.get("from_investor_id") || "";
  const toId = sp.get("to_investor_id") || "";
  const roundId = sp.get("round_id") || "";

  let query = auth.client
    .from("transfers")
    .select(
      "*, from_inv:investors!transfers_from_investor_id_fkey(id, full_name, email), " +
      "to_inv:investors!transfers_to_investor_id_fkey(id, full_name, email), " +
      "saft_rounds!transfers_round_id_fkey(id, name)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (fromId) query = query.eq("from_investor_id", fromId);
  if (toId) query = query.eq("to_investor_id", toId);
  if (roundId) query = query.eq("round_id", roundId);

  query = query.range(page * limit, page * limit + limit - 1);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also compute summary stats
  const { data: allTransfers } = await auth.client
    .from("transfers")
    .select("status, token_amount");
  const stats = {
    total: (allTransfers || []).length,
    pending: (allTransfers || []).filter((t: any) => ["requested", "under_review"].includes(t.status)).length,
    approved: (allTransfers || []).filter((t: any) => t.status === "approved").length,
    completed: (allTransfers || []).filter((t: any) => t.status === "completed").length,
    rejected: (allTransfers || []).filter((t: any) => t.status === "rejected").length,
    total_tokens_transferred: (allTransfers || [])
      .filter((t: any) => t.status === "completed")
      .reduce((s: number, t: any) => s + (Number(t.token_amount) || 0), 0),
  };

  return NextResponse.json({ transfers: data || [], total: count || 0, stats });
}

/**
 * POST /api/admin/transfers
 *
 * Actions: record, review, approve, reject, complete, cancel, set_transferee
 */
export async function POST(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { action } = body;

  // ── RECORD (log an already-executed transfer) ──
  if (action === "record") {
    const { from_investor_id, to_investor_id, allocation_id, token_amount,
      price_per_token, transfer_type, tx_hash, from_wallet, to_wallet, admin_notes } = body;

    if (!from_investor_id || !allocation_id || !token_amount) {
      return NextResponse.json({ error: "from_investor_id, allocation_id, token_amount required" }, { status: 400 });
    }

    // Get allocation to find round_id and validate amount
    const { data: alloc } = await auth.client
      .from("allocations")
      .select("id, round_id, token_amount, investor_id")
      .eq("id", allocation_id)
      .single();

    if (!alloc) return NextResponse.json({ error: "Allocation not found" }, { status: 404 });
    if (Number(token_amount) > Number(alloc.token_amount)) {
      return NextResponse.json({ error: "Transfer amount exceeds allocation balance" }, { status: 400 });
    }

    // Create transfer in recorded → completed
    const { data: transfer, error: insertErr } = await auth.client
      .from("transfers")
      .insert({
        from_investor_id,
        to_investor_id: to_investor_id || null,
        allocation_id,
        round_id: alloc.round_id,
        token_amount: Number(token_amount),
        price_per_token: price_per_token ? Number(price_per_token) : null,
        total_consideration: price_per_token ? Number(token_amount) * Number(price_per_token) : null,
        transfer_type: transfer_type || "sale",
        status: "recorded",
        direction: "recorded",
        tx_hash: tx_hash || null,
        from_wallet: from_wallet || null,
        to_wallet: to_wallet || null,
        admin_notes: admin_notes || null,
        reviewed_by: auth.email,
        reviewed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    // Execute the cap table update
    await executeTransfer(auth.client, transfer, auth.email);

    return NextResponse.json({ success: true, transfer });
  }

  // ── REVIEW (run compliance checks) ──
  if (action === "review") {
    const { transfer_id } = body;
    if (!transfer_id) return NextResponse.json({ error: "transfer_id required" }, { status: 400 });

    const { data: transfer } = await auth.client
      .from("transfers")
      .select("*")
      .eq("id", transfer_id)
      .single();

    if (!transfer) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    if (!["requested", "under_review"].includes(transfer.status)) {
      return NextResponse.json({ error: `Cannot review transfer in "${transfer.status}" status` }, { status: 400 });
    }

    const checks = await buildComplianceChecks(auth.client, transfer);

    await auth.client
      .from("transfers")
      .update({ status: "under_review", compliance_checks: checks })
      .eq("id", transfer_id);

    logRegistryChange({
      action: "transfer_requested", entityType: "allocation", entityId: transfer.allocation_id,
      investorId: transfer.from_investor_id, roundId: transfer.round_id,
      changedBy: auth.email, metadata: { transfer_id, checks_passed: checks.all_passed },
    });

    return NextResponse.json({ success: true, compliance_checks: checks });
  }

  // ── SET TRANSFEREE ──
  if (action === "set_transferee") {
    const { transfer_id, to_investor_id, to_email, to_name } = body;
    if (!transfer_id) return NextResponse.json({ error: "transfer_id required" }, { status: 400 });

    let transfereeId = to_investor_id;

    // Create new investor if email provided but no ID
    if (!transfereeId && to_email) {
      const { data: existing } = await auth.client
        .from("investors")
        .select("id")
        .eq("email", to_email.toLowerCase().trim())
        .single();

      if (existing) {
        transfereeId = existing.id;
      } else {
        const { data: newInv, error: createErr } = await auth.client
          .from("investors")
          .insert({ email: to_email.toLowerCase().trim(), full_name: to_name || to_email })
          .select("id")
          .single();
        if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
        transfereeId = newInv.id;

        // Send onboarding invite
        try {
          const { sendEmail, composeWelcomeEmail } = await import("@/lib/email");
          const { subject, html } = await composeWelcomeEmail(to_name || to_email);
          await sendEmail(to_email.toLowerCase().trim(), subject, html);
        } catch (e: any) {
          console.error("[TRANSFER] Failed to send invite:", e.message);
        }
      }
    }

    if (!transfereeId) {
      return NextResponse.json({ error: "Provide to_investor_id or to_email" }, { status: 400 });
    }

    await auth.client
      .from("transfers")
      .update({ to_investor_id: transfereeId })
      .eq("id", transfer_id);

    // Re-run compliance checks with transferee data
    const { data: transfer } = await auth.client
      .from("transfers")
      .select("*")
      .eq("id", transfer_id)
      .single();

    if (transfer) {
      const checks = await buildComplianceChecks(auth.client, transfer);
      await auth.client
        .from("transfers")
        .update({ compliance_checks: checks })
        .eq("id", transfer_id);
    }

    return NextResponse.json({ success: true, to_investor_id: transfereeId });
  }

  // ── APPROVE ──
  if (action === "approve") {
    const { transfer_id, admin_notes } = body;
    if (!transfer_id) return NextResponse.json({ error: "transfer_id required" }, { status: 400 });

    const { data: transfer } = await auth.client
      .from("transfers")
      .select("*")
      .eq("id", transfer_id)
      .single();

    if (!transfer) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    if (!["under_review", "requested"].includes(transfer.status)) {
      return NextResponse.json({ error: `Cannot approve transfer in "${transfer.status}" status` }, { status: 400 });
    }

    await auth.client
      .from("transfers")
      .update({
        status: "approved",
        admin_notes: admin_notes || transfer.admin_notes,
        reviewed_by: auth.email,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", transfer_id);

    logRegistryChange({
      action: "transfer_approved", entityType: "allocation", entityId: transfer.allocation_id,
      investorId: transfer.from_investor_id, roundId: transfer.round_id,
      changedBy: auth.email, metadata: { transfer_id },
    });

    // Notify transferor
    try {
      const { data: fromInv } = await auth.client.from("investors").select("email, full_name").eq("id", transfer.from_investor_id).single();
      if (fromInv) {
        const { sendEmail, composeTransferEmail } = await import("@/lib/email");
        const { subject, html } = await composeTransferEmail(fromInv.full_name, "approved", Number(transfer.token_amount));
        await sendEmail(fromInv.email, subject, html);
      }
    } catch (e: any) { console.error("[TRANSFER] Email failed:", e.message); }

    return NextResponse.json({ success: true });
  }

  // ── REJECT ──
  if (action === "reject") {
    const { transfer_id, rejection_reason } = body;
    if (!transfer_id) return NextResponse.json({ error: "transfer_id required" }, { status: 400 });

    const { data: transfer } = await auth.client
      .from("transfers")
      .select("*")
      .eq("id", transfer_id)
      .single();

    if (!transfer) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });

    await auth.client
      .from("transfers")
      .update({
        status: "rejected",
        rejection_reason: rejection_reason || "Transfer consent denied",
        reviewed_by: auth.email,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", transfer_id);

    logRegistryChange({
      action: "transfer_rejected", entityType: "allocation", entityId: transfer.allocation_id,
      investorId: transfer.from_investor_id, roundId: transfer.round_id,
      changedBy: auth.email, metadata: { transfer_id, reason: rejection_reason },
    });

    // Notify transferor
    try {
      const { data: fromInv } = await auth.client.from("investors").select("email, full_name").eq("id", transfer.from_investor_id).single();
      if (fromInv) {
        const { sendEmail, composeTransferEmail } = await import("@/lib/email");
        const { subject, html } = await composeTransferEmail(fromInv.full_name, "rejected", Number(transfer.token_amount), rejection_reason);
        await sendEmail(fromInv.email, subject, html);
      }
    } catch (e: any) { console.error("[TRANSFER] Email failed:", e.message); }

    return NextResponse.json({ success: true });
  }

  // ── COMPLETE (confirm on-chain transfer, update cap table) ──
  if (action === "complete") {
    const { transfer_id, tx_hash } = body;
    if (!transfer_id) return NextResponse.json({ error: "transfer_id required" }, { status: 400 });

    const { data: transfer } = await auth.client
      .from("transfers")
      .select("*")
      .eq("id", transfer_id)
      .single();

    if (!transfer) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    if (transfer.status !== "approved") {
      return NextResponse.json({ error: `Cannot complete transfer in "${transfer.status}" status` }, { status: 400 });
    }
    if (!transfer.to_investor_id) {
      return NextResponse.json({ error: "Transferee must be assigned before completing" }, { status: 400 });
    }

    // Update tx_hash if provided
    if (tx_hash) {
      await auth.client.from("transfers").update({ tx_hash }).eq("id", transfer_id);
      transfer.tx_hash = tx_hash;
    }

    await executeTransfer(auth.client, transfer, auth.email);

    return NextResponse.json({ success: true });
  }

  // ── CANCEL ──
  if (action === "cancel") {
    const { transfer_id } = body;
    if (!transfer_id) return NextResponse.json({ error: "transfer_id required" }, { status: 400 });

    await auth.client
      .from("transfers")
      .update({ status: "cancelled" })
      .eq("id", transfer_id)
      .in("status", ["requested", "under_review", "approved"]);

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

/** Build compliance checks for a transfer */
async function buildComplianceChecks(client: any, transfer: any) {
  const config = await getEntityConfig(client);

  // Load transferor
  const { data: fromInv } = await client
    .from("investors")
    .select("kyc_status, pq_status, pq_data")
    .eq("id", transfer.from_investor_id)
    .single();

  // Load allocation
  const { data: alloc } = await client
    .from("allocations")
    .select("token_amount, created_at")
    .eq("id", transfer.allocation_id)
    .single();

  // Load transferee (if assigned)
  let toInvestor = null;
  if (transfer.to_investor_id) {
    const { data: toInv } = await client
      .from("investors")
      .select("kyc_status, pq_status, pq_data")
      .eq("id", transfer.to_investor_id)
      .single();
    if (toInv) {
      toInvestor = { kyc_status: toInv.kyc_status, pq_status: toInv.pq_status, pq_data: toInv.pq_data };
    }
  }

  // Count current holders
  const { data: holderData } = await client
    .from("allocations")
    .select("investor_id")
    .eq("approval_status", "approved")
    .gt("token_amount", 0);
  const holderSet = new Set<string>();
  (holderData || []).forEach((a: any) => holderSet.add(a.investor_id));
  const isNewHolder = transfer.to_investor_id ? !holderSet.has(transfer.to_investor_id) : true;

  return runComplianceChecks({
    token_amount: Number(transfer.token_amount),
    allocation_created_at: alloc?.created_at || transfer.created_at,
    allocation_token_amount: Number(alloc?.token_amount || 0),
    from_kyc_status: fromInv?.kyc_status || "unverified",
    from_pq_status: fromInv?.pq_status || "not_sent",
    from_pq_data: fromInv?.pq_data || {},
    to_investor: toInvestor,
    total_supply: config.total_supply || 100_000_000,
    tge_date: config.tge_date || null,
    current_holder_count: holderSet.size,
    is_new_holder: isNewHolder,
  });
}

/** Execute a transfer: update allocations, audit log, mark completed */
async function executeTransfer(client: any, transfer: any, adminEmail: string) {
  const amount = Number(transfer.token_amount);

  // 1. Reduce source allocation
  const { data: srcAlloc } = await client
    .from("allocations")
    .select("token_amount")
    .eq("id", transfer.allocation_id)
    .single();

  const remaining = Number(srcAlloc?.token_amount || 0) - amount;

  if (remaining <= 0) {
    // Full transfer — mark as transferred out
    await client.from("allocations").update({
      token_amount: 0,
      payment_status: "transferred_out",
    }).eq("id", transfer.allocation_id);
  } else {
    // Partial — reduce balance
    await client.from("allocations").update({
      token_amount: remaining,
    }).eq("id", transfer.allocation_id);
  }

  // 2. Create target allocation for transferee (if identified)
  if (transfer.to_investor_id) {
    await client.from("allocations").insert({
      investor_id: transfer.to_investor_id,
      round_id: transfer.round_id,
      token_amount: amount,
      payment_status: "paid",
      approval_status: "approved",
      transferred_from: transfer.id,
      notes: `Received via transfer from allocation ${transfer.allocation_id}`,
    });
  }

  // 3. Mark transfer completed
  await client.from("transfers").update({
    status: "completed",
    completed_at: new Date().toISOString(),
  }).eq("id", transfer.id);

  // 4. Audit log
  logRegistryChange({
    action: transfer.direction === "recorded" ? "transfer_recorded" : "transfer_completed",
    entityType: "allocation",
    entityId: transfer.allocation_id,
    investorId: transfer.from_investor_id,
    roundId: transfer.round_id,
    changedBy: adminEmail,
    oldValues: { token_amount: Number(srcAlloc?.token_amount || 0) },
    newValues: { token_amount: remaining > 0 ? remaining : 0, transferred: amount, to_investor_id: transfer.to_investor_id },
    metadata: { transfer_id: transfer.id, tx_hash: transfer.tx_hash },
  });

  // 5. Notify both parties
  try {
    const { sendEmail, composeTransferEmail } = await import("@/lib/email");
    const { data: fromInv } = await client.from("investors").select("email, full_name").eq("id", transfer.from_investor_id).single();
    if (fromInv) {
      const { subject, html } = await composeTransferEmail(fromInv.full_name, "completed", amount);
      await sendEmail(fromInv.email, subject, html);
    }
    if (transfer.to_investor_id) {
      const { data: toInv } = await client.from("investors").select("email, full_name").eq("id", transfer.to_investor_id).single();
      if (toInv) {
        const { subject, html } = await composeTransferEmail(toInv.full_name, "received", amount);
        await sendEmail(toInv.email, subject, html);
      }
    }
  } catch (e: any) { console.error("[TRANSFER] Notification failed:", e.message); }
}
