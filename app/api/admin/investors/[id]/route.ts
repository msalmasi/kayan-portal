import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import {
  sendEmail,
  composeCapitalCallEmail,
  composeDocsPackageEmail,
} from "@/lib/email";

/**
 * GET /api/admin/investors/[id]
 * Fetch a single investor with allocations, round details, and email history.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: investor, error } = await auth.client
    .from("investors")
    .select("*, allocations(*, saft_rounds(*))")
    .eq("id", params.id)
    .single();

  if (error || !investor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Also fetch email history
  const { data: emails } = await auth.client
    .from("email_events")
    .select("*")
    .eq("investor_id", params.id)
    .order("sent_at", { ascending: false });

  // Fetch investor documents
  const { data: documents } = await auth.client
    .from("investor_documents")
    .select("*, saft_rounds(name)")
    .eq("investor_id", params.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    ...investor,
    email_events: emails || [],
    investor_documents: documents || [],
  });
}

/**
 * PATCH /api/admin/investors/[id]
 * Update investor fields including PQ review. Staff cannot access.
 *
 * When pq_status changes to "approved", auto-sends capital call email
 * if there are unpaid allocations.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.canWrite) {
    return NextResponse.json({ error: "Staff have view-only access" }, { status: 403 });
  }

  const body = await request.json();

  // Fields that can be updated
  const allowed = [
    "full_name", "email", "kyc_status",
    "pq_status", "pq_reviewed_by", "pq_reviewed_at", "pq_notes",
    "pq_review", "docs_sent_at",
  ];
  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  // Auto-set review timestamp when PQ status changes to approved/rejected
  if (
    updates.pq_status &&
    (updates.pq_status === "approved" || updates.pq_status === "rejected") &&
    !updates.pq_reviewed_at
  ) {
    updates.pq_reviewed_at = new Date().toISOString();
  }

  const { data, error } = await auth.client
    .from("investors")
    .update(updates)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // ── Auto-send subscription docs when KYC changes to verified ──
  let docsSent = false;
  if (updates.kyc_status === "verified") {
    // Check if docs haven't been sent yet
    const { data: freshInv } = await auth.client
      .from("investors")
      .select("docs_sent_at, pq_status, email, full_name")
      .eq("id", params.id)
      .single();

    if (freshInv && !freshInv.docs_sent_at) {
      const { subject, html } = composeDocsPackageEmail(freshInv.full_name);
      const sent = await sendEmail(freshInv.email, subject, html);

      await auth.client
        .from("investors")
        .update({
          docs_sent_at: new Date().toISOString(),
          pq_status: freshInv.pq_status === "not_sent" ? "sent" : freshInv.pq_status,
        })
        .eq("id", params.id);

      await auth.client.from("email_events").insert({
        investor_id: params.id,
        email_type: "docs_package",
        sent_by: updates.pq_reviewed_by || "system",
        metadata: { trigger: "kyc_verified_manual", sent_successfully: sent },
      });

      docsSent = true;
    }
  }

  // ── Auto-send capital call on PQ approval ──
  // Only fires if pq_status was just set to "approved"
  let capitalCallSent = false;
  if (updates.pq_status === "approved") {
    // Fetch investor with allocations for the capital call
    const { data: fullInvestor } = await auth.client
      .from("investors")
      .select("*, allocations(*, saft_rounds(*))")
      .eq("id", params.id)
      .single();

    if (fullInvestor) {
      const unpaid = (fullInvestor.allocations || []).filter(
        (a: any) => a.payment_status === "unpaid" || a.payment_status === "invoiced"
      );

      if (unpaid.length > 0) {
        // Calculate total and compose email
        let totalDue = 0;
        const roundNames: string[] = [];

        for (const alloc of unpaid) {
          const price = alloc.saft_rounds?.token_price || 0;
          const amount = Number(alloc.token_amount) * Number(price);
          totalDue += amount;
          if (alloc.saft_rounds?.name && !roundNames.includes(alloc.saft_rounds.name)) {
            roundNames.push(alloc.saft_rounds.name);
          }

          // Mark as invoiced
          if (alloc.payment_status === "unpaid") {
            await auth.client
              .from("allocations")
              .update({ payment_status: "invoiced", amount_usd: amount })
              .eq("id", alloc.id);
          }
        }

        const roundLabel = roundNames.join(" + ");
        const { subject, html } = composeCapitalCallEmail(
          fullInvestor.full_name,
          totalDue,
          roundLabel
        );

        const sent = await sendEmail(fullInvestor.email, subject, html);
        capitalCallSent = true;

        // Log the email event
        await auth.client.from("email_events").insert({
          investor_id: params.id,
          email_type: "capital_call",
          sent_by: updates.pq_reviewed_by || "system",
          metadata: {
            total_due: totalDue,
            rounds: roundNames,
            trigger: "pq_approved",
            sent_successfully: sent,
          },
        });
      }
    }
  }

  return NextResponse.json({ ...data, capital_call_sent: capitalCallSent, docs_sent: docsSent });
}

/**
 * DELETE /api/admin/investors/[id]
 * Remove an investor and all their allocations. Staff cannot access.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.canWrite) {
    return NextResponse.json({ error: "Staff have view-only access" }, { status: 403 });
  }

  const { error } = await auth.client
    .from("investors")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
