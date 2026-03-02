import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import { initiateBatchReissuance } from "@/lib/reissuance";

/**
 * GET /api/admin/reissuance
 * List all reissuance batches with summary counts.
 */
export async function GET() {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: batches, error } = await auth.client
    .from("reissuance_batches")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Attach item counts per batch
  const enriched = await Promise.all(
    (batches || []).map(async (batch: any) => {
      const { data: items } = await auth.client
        .from("reissuance_items")
        .select("status")
        .eq("batch_id", batch.id);

      const counts = {
        total: items?.length || 0,
        pending_novation: items?.filter((i: any) => i.status === "pending_novation").length || 0,
        novation_signed: items?.filter((i: any) => i.status === "novation_signed").length || 0,
        pending_new_saft: items?.filter((i: any) => i.status === "pending_new_saft").length || 0,
        complete: items?.filter((i: any) => i.status === "complete").length || 0,
        cancelled: items?.filter((i: any) => i.status === "cancelled").length || 0,
      };

      return { ...batch, counts };
    })
  );

  return NextResponse.json(enriched);
}

/**
 * POST /api/admin/reissuance
 * Initiate a new reissuance batch. Requires admin+ role.
 *
 * Body: {
 *   old_entity_name: string,
 *   new_entity_name: string,
 *   new_entity_jurisdiction?: string,
 *   reason: string,
 *   round_ids?: string[]   // omit = all rounds with signed SAFTs
 * }
 */
export async function POST(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["admin", "super_admin"].includes(auth.role)) {
    return NextResponse.json(
      { error: "Only admins can initiate SAFT re-issuance" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { old_entity_name, new_entity_name, reason, new_entity_jurisdiction, round_ids } = body;

  if (!old_entity_name || !new_entity_name || !reason) {
    return NextResponse.json(
      { error: "old_entity_name, new_entity_name, and reason are required" },
      { status: 400 }
    );
  }

  try {
    const result = await initiateBatchReissuance(
      auth.client,
      { old_entity_name, new_entity_name, new_entity_jurisdiction, reason, round_ids },
      auth.email
    );

    return NextResponse.json({
      success: true,
      batch_id: result.batch_id,
      items_created: result.items_created,
      message: `Re-issuance initiated for ${result.items_created} investor(s). Novation agreements sent.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
