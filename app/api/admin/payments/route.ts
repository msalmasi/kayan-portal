import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";

/**
 * PATCH /api/admin/payments
 * Update payment fields on an allocation. Manager+ only.
 *
 * Body: {
 *   allocation_id: string,
 *   payment_status?: "unpaid" | "invoiced" | "partial" | "paid",
 *   payment_method?: "wire" | "usdt" | "usdc" | "credit_card",
 *   amount_received_usd?: number,
 *   payment_date?: string (ISO),
 *   tx_reference?: string,
 * }
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.canWrite) {
    return NextResponse.json({ error: "Staff cannot update payments" }, { status: 403 });
  }

  const body = await request.json();
  const { allocation_id } = body;

  if (!allocation_id) {
    return NextResponse.json(
      { error: "allocation_id is required" },
      { status: 400 }
    );
  }

  // Only allow payment-related fields
  const allowed = [
    "payment_status",
    "payment_method",
    "amount_usd",
    "amount_received_usd",
    "payment_date",
    "tx_reference",
  ];
  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  // Auto-set payment_date when status changes to "paid"
  if (updates.payment_status === "paid" && !updates.payment_date) {
    updates.payment_date = new Date().toISOString();
  }

  const { data, error } = await auth.client
    .from("allocations")
    .update(updates)
    .eq("id", allocation_id)
    .select("*, saft_rounds(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
