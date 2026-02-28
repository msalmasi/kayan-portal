import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Get investor context from session cookie.
 */
async function getInvestorContext() {
  const cookieStore = cookies();
  const userSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user?.email) return null;

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: investor } = await adminClient
    .from("investors")
    .select("*")
    .ilike("email", user.email)
    .single();

  if (!investor) return null;
  return { investor, adminClient };
}

/**
 * GET /api/investor/payments
 * Returns the investor's outstanding allocations and payment claims.
 */
export async function GET() {
  const ctx = await getInvestorContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investor, adminClient } = ctx;

  // Load payment settings from database
  const { loadPaymentSettings, getMethodList } = await import("@/lib/payment-config");
  const settings = await loadPaymentSettings(adminClient);

  // Fetch outstanding allocations (invoiced or partial, approved only)
  const { data: allocations } = await adminClient
    .from("allocations")
    .select("id, round_id, token_amount, amount_usd, payment_status, amount_received_usd, saft_rounds(id, name, token_price)")
    .eq("investor_id", investor.id)
    .eq("approval_status", "approved")
    .in("payment_status", ["invoiced", "partial"]);

  // Fetch existing payment claims
  const { data: claims } = await adminClient
    .from("payment_claims")
    .select("*")
    .eq("investor_id", investor.id)
    .order("created_at", { ascending: false });

  // Compute per-round balances
  const roundMap: Record<string, any> = {};
  for (const alloc of (allocations || [])) {
    const rid = alloc.round_id;
    if (!roundMap[rid]) {
      roundMap[rid] = {
        round_id: rid,
        round_name: (alloc as any).saft_rounds?.name || "Unknown",
        token_price: Number((alloc as any).saft_rounds?.token_price || 0),
        total_tokens: 0,
        total_due: 0,
        total_received: 0,
        allocations: [],
      };
    }
    const due = Number(alloc.amount_usd) || Number(alloc.token_amount) * roundMap[rid].token_price;
    const received = Number(alloc.amount_received_usd) || 0;
    roundMap[rid].total_tokens += Number(alloc.token_amount);
    roundMap[rid].total_due += due;
    roundMap[rid].total_received += received;
    roundMap[rid].allocations.push(alloc);
  }

  const rounds = Object.values(roundMap).map((r: any) => ({
    ...r,
    balance_due: r.total_due - r.total_received,
  }));

  // Personalize wire reference note
  const wireInstructions = {
    ...settings.wire_instructions,
    reference_note: settings.wire_instructions.reference_note ||
      `Include "${investor.full_name} — Kayan Token" as wire reference`,
  };

  return NextResponse.json({
    rounds,
    claims: claims || [],
    investor_name: investor.full_name,
    // Dynamic settings from DB
    methods: getMethodList(settings.methods),
    wallets: settings.wallets,
    wire_instructions: wireInstructions,
  });
}

/**
 * POST /api/investor/payments
 * Submit a payment claim (wire reference or crypto tx hash).
 *
 * Body: {
 *   round_id: string,
 *   method: "wire" | "usdc_eth" | "usdc_sol" | "usdt_eth",
 *   amount_usd: number,
 *   wire_reference?: string,      — for wire
 *   tx_hash?: string,             — for crypto
 *   from_wallet?: string,         — for crypto (optional, helps admin)
 * }
 */
export async function POST(request: NextRequest) {
  const ctx = await getInvestorContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { investor, adminClient } = ctx;
  const body = await request.json();
  const { round_id, method, amount_usd, wire_reference, tx_hash, from_wallet } = body;

  // ── Validate ──
  if (!round_id || !method || !amount_usd) {
    return NextResponse.json({ error: "round_id, method, and amount_usd are required" }, { status: 400 });
  }

  const validMethods = ["wire", "usdc_eth", "usdc_sol", "usdt_eth"];
  if (!validMethods.includes(method)) {
    return NextResponse.json({ error: `Invalid method: ${method}` }, { status: 400 });
  }

  // Crypto requires tx_hash
  if (method !== "wire" && !tx_hash) {
    return NextResponse.json({ error: "tx_hash is required for crypto payments" }, { status: 400 });
  }

  // Wire requires wire_reference
  if (method === "wire" && !wire_reference) {
    return NextResponse.json({ error: "wire_reference is required for wire payments" }, { status: 400 });
  }

  // Check for duplicate tx_hash
  if (tx_hash) {
    const { data: existing } = await adminClient
      .from("payment_claims")
      .select("id")
      .eq("tx_hash", tx_hash)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: "This transaction has already been submitted" }, { status: 409 });
    }
  }

  // Verify investor has outstanding balance for this round
  const { data: allocations } = await adminClient
    .from("allocations")
    .select("id, amount_usd, token_amount, amount_received_usd, saft_rounds(token_price)")
    .eq("investor_id", investor.id)
    .eq("round_id", round_id)
    .eq("approval_status", "approved")
    .in("payment_status", ["invoiced", "partial"]);

  if (!allocations || allocations.length === 0) {
    return NextResponse.json({ error: "No outstanding balance for this round" }, { status: 400 });
  }

  // Determine chain/token from method
  const chainMap: Record<string, { chain: string; token: string }> = {
    usdc_eth: { chain: "ethereum", token: "usdc" },
    usdt_eth: { chain: "ethereum", token: "usdt" },
    usdc_sol: { chain: "solana", token: "usdc" },
  };

  const chainInfo = chainMap[method] || {};

  // ── Insert claim ──
  const { data: claim, error } = await adminClient
    .from("payment_claims")
    .insert({
      investor_id: investor.id,
      round_id,
      method,
      amount_usd: Number(amount_usd),
      wire_reference: wire_reference || null,
      tx_hash: tx_hash || null,
      from_wallet: from_wallet || null,
      chain: chainInfo.chain || null,
      token: chainInfo.token || null,
      status: method === "wire" ? "pending" : "verifying",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // ── Auto-verify crypto on-chain ──
  if (method !== "wire" && tx_hash) {
    try {
      // Load receiving wallet from DB settings
      const { loadPaymentSettings, getWalletForMethod } = await import("@/lib/payment-config");
      const settings = await loadPaymentSettings(adminClient);
      const receivingWallet = getWalletForMethod(method, settings.wallets);

      const { verifyOnChain } = await import("@/lib/chain-verify");
      const result = await verifyOnChain(method, tx_hash, Number(amount_usd), receivingWallet);

      // Determine if any real transfer was found on-chain
      // "verified" = full amount, "insufficient_amount" = partial but real transfer
      const isOnChainConfirmed = result.verified || result.reason === "insufficient_amount";
      const actualAmount = result.amountTransferred || 0;

      if (isOnChainConfirmed && actualAmount > 0) {
        // ── Auto-apply whatever amount was actually transferred ──

        await adminClient
          .from("payment_claims")
          .update({
            status: "verified",
            amount_usd: actualAmount,            // actual on-chain amount IS the claim
            amount_verified_usd: actualAmount,
            verified_at: new Date().toISOString(),
            verified_by: "auto",
            chain_data: result.chainData,
          })
          .eq("id", claim.id);

        // Apply the actual transferred amount to allocations
        await applyPayment(
          adminClient,
          investor,
          round_id,
          actualAmount,
          method,
          tx_hash
        );

        return NextResponse.json({
          ...claim,
          status: "verified",
          amount_usd: actualAmount,
          amount_verified_usd: actualAmount,
          verification: {
            verified: true,
            detail: `Verified: $${actualAmount.toLocaleString()} received on-chain`,
          },
        });

      } else {
        // Genuinely unverifiable — wrong token, wrong recipient, not found, error
        await adminClient
          .from("payment_claims")
          .update({
            status: "pending",
            chain_data: result.chainData,
          })
          .eq("id", claim.id);

        // Notify admins for manual review
        const { notify } = await import("@/lib/admin-notify");
        await notify(adminClient, {
          eventType: "payment_received",
          priority: "action_required",
          investorId: investor.id,
          investorName: investor.full_name,
          investorEmail: investor.email,
          title: `${investor.full_name} submitted crypto payment — needs manual review`,
          detail: `${method.toUpperCase()} · $${Number(amount_usd).toLocaleString()} · Reason: ${result.detail}`,
          metadata: { method, amount_usd, tx_hash, reason: result.reason },
        });

        return NextResponse.json({
          ...claim,
          status: "pending",
          verification: { verified: false, detail: result.detail },
        });
      }
    } catch (err: any) {
      // Verification error — mark pending for manual review
      console.error("[PAYMENT] On-chain verification error:", err.message);

      await adminClient
        .from("payment_claims")
        .update({ status: "pending", chain_data: { error: err.message } })
        .eq("id", claim.id);

      return NextResponse.json({
        ...claim,
        status: "pending",
        verification: { verified: false, detail: "Auto-verification unavailable. Submitted for manual review." },
      });
    }
  }

  // ── Wire: notify admins for manual verification ──
  if (method === "wire") {
    try {
      const { notify } = await import("@/lib/admin-notify");
      await notify(adminClient, {
        eventType: "payment_received",
        priority: "action_required",
        investorId: investor.id,
        investorName: investor.full_name,
        investorEmail: investor.email,
        title: `${investor.full_name} submitted wire payment claim`,
        detail: `Wire ref: ${wire_reference} · $${Number(amount_usd).toLocaleString()}`,
        metadata: { method: "wire", amount_usd, wire_reference },
      });
    } catch {}
  }

  return NextResponse.json(claim);
}

// ─── Apply verified payment to allocations ──────────────────

/**
 * After a payment is verified, update the allocation's payment fields.
 * Distributes the payment across outstanding allocations for the round.
 */
async function applyPayment(
  supabase: any,
  investor: any,
  roundId: string,
  amountUsd: number,
  method: string,
  txRef: string
) {
  // Map method IDs to the PaymentMethod type in allocations
  const methodMap: Record<string, string> = {
    usdc_eth: "usdc",
    usdc_sol: "usdc",
    usdt_eth: "usdt",
    wire: "wire",
  };

  // Get outstanding allocations for this round
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

    const due = Number(alloc.amount_usd) || Number(alloc.token_amount) * Number(alloc.saft_rounds?.token_price || 0);
    const received = Number(alloc.amount_received_usd) || 0;
    const owed = due - received;

    if (owed <= 0) continue;

    const applying = Math.min(remaining, owed);
    const newReceived = received + applying;
    const fullyPaid = newReceived >= due * (1 - 0.005); // 0.5% tolerance

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

  // ── If fully paid, send confirmation email + notify admins ──
  const { data: freshAllocs } = await supabase
    .from("allocations")
    .select("payment_status, token_amount")
    .eq("investor_id", investor.id)
    .eq("round_id", roundId)
    .eq("approval_status", "approved");

  const allPaid = freshAllocs?.every((a: any) => a.payment_status === "paid" || a.payment_status === "grant");

  if (allPaid) {
    try {
      const { data: round } = await supabase
        .from("saft_rounds")
        .select("name")
        .eq("id", roundId)
        .single();

      const totalTokens = (freshAllocs || []).reduce(
        (s: number, a: any) => s + Number(a.token_amount), 0
      );

      const { sendEmail, composeAllocationConfirmedEmail } = await import("@/lib/email");
      const { subject, html } = composeAllocationConfirmedEmail(
        investor.full_name,
        totalTokens,
        round?.name || "Unknown",
        { isGrant: false, txReference: txRef, amountUsd }
      );
      await sendEmail(investor.email, subject, html);

      await supabase.from("email_events").insert({
        investor_id: investor.id,
        email_type: "allocation_confirmed",
        sent_by: "system",
        metadata: {
          trigger: "auto_verified_payment",
          round_id: roundId,
          round_name: round?.name,
          token_amount: totalTokens,
          tx_reference: txRef,
          method,
        },
      });
    } catch (err: any) {
      console.error("[PAYMENT] Confirmation email failed:", err.message);
    }
  }
}
