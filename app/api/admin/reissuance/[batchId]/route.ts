import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import { getBatchProgress } from "@/lib/reissuance";
import { sendEmail, composeNovationEmail } from "@/lib/email";

/**
 * GET /api/admin/reissuance/[batchId]
 * Detailed progress for a single reissuance batch.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const progress = await getBatchProgress(auth.client, params.batchId);
  if (!progress) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  return NextResponse.json(progress);
}

/**
 * PATCH /api/admin/reissuance/[batchId]
 * Resend novation emails. Admin+ only.
 *
 * Body: { action: "resend_item", item_id: string }
 *    or { action: "resend_all_pending" }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["admin", "super_admin"].includes(auth.role)) {
    return NextResponse.json(
      { error: "Only admins can manage reissuance batches" },
      { status: 403 }
    );
  }

  const { action, item_id } = await request.json();

  // ── Fetch batch info for email composition ──
  const { data: batch } = await auth.client
    .from("reissuance_batches")
    .select("old_entity_name, new_entity_name, reason")
    .eq("id", params.batchId)
    .single();

  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  // ── Resend a single investor's novation email ──
  if (action === "resend_item" && item_id) {
    const { data: item } = await auth.client
      .from("reissuance_items")
      .select("*, investors(full_name, email), saft_rounds(name)")
      .eq("id", item_id)
      .eq("batch_id", params.batchId)
      .single();

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (item.status !== "pending_novation") {
      return NextResponse.json(
        { error: "Can only resend for items awaiting novation signing" },
        { status: 400 }
      );
    }

    const investor = item.investors as any;
    const round = item.saft_rounds as any;

    const { subject, html } = await composeNovationEmail(
      investor.full_name,
      round.name,
      batch.old_entity_name,
      batch.new_entity_name,
      batch.reason
    );
    await sendEmail(investor.email, subject, html);

    await auth.client.from("email_events").insert({
      investor_id: item.investor_id,
      email_type: "novation_reminder",
      sent_by: auth.email,
      metadata: {
        batch_id: params.batchId,
        round_id: item.round_id,
        resent: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Novation email resent to ${investor.full_name}`,
    });
  }

  // ── Resend to ALL investors still awaiting novation ──
  if (action === "resend_all_pending") {
    const { data: items } = await auth.client
      .from("reissuance_items")
      .select("*, investors(full_name, email), saft_rounds(name)")
      .eq("batch_id", params.batchId)
      .eq("status", "pending_novation");

    if (!items || items.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No pending items to resend",
        resent_count: 0,
      });
    }

    let sentCount = 0;
    for (const item of items) {
      const investor = item.investors as any;
      const round = item.saft_rounds as any;

      const { subject, html } = await composeNovationEmail(
        investor.full_name,
        round.name,
        batch.old_entity_name,
        batch.new_entity_name,
        batch.reason
      );
      await sendEmail(investor.email, subject, html);

      await auth.client.from("email_events").insert({
        investor_id: item.investor_id,
        email_type: "novation_reminder",
        sent_by: auth.email,
        metadata: {
          batch_id: params.batchId,
          round_id: item.round_id,
          resent: true,
        },
      });

      sentCount++;
    }

    return NextResponse.json({
      success: true,
      message: `Novation emails resent to ${sentCount} investor(s)`,
      resent_count: sentCount,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
