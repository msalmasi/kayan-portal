import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import { getBatchProgress } from "@/lib/reissuance";

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
 * Cancel a batch or individual items. Admin+ only.
 *
 * Body: { action: "cancel_batch" }
 *    or { action: "cancel_item", item_id: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { batchId: string } }
) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["admin", "super_admin"].includes(auth.role)) {
    return NextResponse.json(
      { error: "Only admins can modify reissuance batches" },
      { status: 403 }
    );
  }

  const { action, item_id } = await request.json();

  if (action === "cancel_batch") {
    // Cancel all non-complete items
    await auth.client
      .from("reissuance_items")
      .update({ status: "cancelled" })
      .eq("batch_id", params.batchId)
      .not("status", "eq", "complete");

    await auth.client
      .from("reissuance_batches")
      .update({ status: "cancelled" })
      .eq("id", params.batchId);

    return NextResponse.json({ success: true, message: "Batch cancelled" });
  }

  if (action === "cancel_item" && item_id) {
    await auth.client
      .from("reissuance_items")
      .update({ status: "cancelled" })
      .eq("id", item_id)
      .eq("batch_id", params.batchId);

    return NextResponse.json({ success: true, message: "Item cancelled" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
