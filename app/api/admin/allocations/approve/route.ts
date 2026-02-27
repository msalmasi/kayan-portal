import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";

const ROLE_RANK: Record<string, number> = {
  staff: 0,
  manager: 1,
  admin: 2,
  super_admin: 3,
};

/**
 * PATCH /api/admin/allocations/approve
 * Approve or reject a pending allocation. Manager+ only.
 *
 * Body: {
 *   allocation_id: string,
 *   action: "approve" | "reject",
 *   reason?: string          — required for rejections
 * }
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if ((ROLE_RANK[auth.role] ?? 0) < ROLE_RANK.manager) {
    return NextResponse.json(
      { error: "Only managers and above can approve allocations" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { allocation_id, action, reason } = body;

  if (!allocation_id || !["approve", "reject"].includes(action)) {
    return NextResponse.json(
      { error: "allocation_id and action (approve|reject) are required" },
      { status: 400 }
    );
  }

  // Fetch the allocation to verify it's pending
  const { data: alloc, error: fetchErr } = await auth.client
    .from("allocations")
    .select("*, saft_rounds(name), investors(id, full_name, email)")
    .eq("id", allocation_id)
    .single();

  if (fetchErr || !alloc) {
    return NextResponse.json({ error: "Allocation not found" }, { status: 404 });
  }

  if (alloc.approval_status !== "pending") {
    return NextResponse.json(
      { error: `Allocation is already ${alloc.approval_status}` },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const investor = alloc.investors as any;

  if (action === "approve") {
    // ── Approve the allocation ──
    const { data, error } = await auth.client
      .from("allocations")
      .update({
        approval_status: "approved",
        approved_by: auth.email,
        approved_at: now,
      })
      .eq("id", allocation_id)
      .select("*, saft_rounds(*)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Notify
    if (investor) {
      const { notifyAllocationApproved } = await import("@/lib/admin-notify");
      await notifyAllocationApproved(
        auth.client,
        investor,
        alloc.saft_rounds?.name || "Unknown",
        Number(alloc.token_amount),
        auth.email
      );
    }

    // Check if this approval triggers doc generation
    // (investor is KYC verified + now has an approved allocation)
    if (investor) {
      try {
        const { data: inv } = await auth.client
          .from("investors")
          .select("*")
          .eq("id", investor.id)
          .single();

        if (inv?.kyc_status === "verified") {
          const { data: existingDoc } = await auth.client
            .from("investor_documents")
            .select("id")
            .eq("investor_id", investor.id)
            .eq("round_id", alloc.round_id)
            .eq("doc_type", "saft");

          if (!existingDoc || existingDoc.length === 0) {
            const { data: tmpl } = await auth.client
              .from("doc_templates")
              .select("id")
              .eq("doc_type", "saft")
              .eq("round_id", alloc.round_id)
              .eq("is_active", true)
              .single();

            if (tmpl) {
              const { generateDocsForInvestor } = await import("@/lib/doc-generate-core");
              await generateDocsForInvestor(
                auth.client,
                inv,
                alloc.round_id,
                auth.email
              );
              console.log(`[ALLOC-APPROVE] Auto-generated docs for ${investor.email}`);
            }
          }
        }
      } catch (err: any) {
        console.error("[ALLOC-APPROVE] Doc generation failed:", err.message);
      }
    }

    return NextResponse.json({
      ...data,
      _message: "Allocation approved.",
    });
  }

  // ── Reject the allocation ──
  const { data, error } = await auth.client
    .from("allocations")
    .update({
      approval_status: "rejected",
      approved_by: auth.email,
      approved_at: now,
      rejection_reason: reason || null,
    })
    .eq("id", allocation_id)
    .select("*, saft_rounds(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Notify
  if (investor) {
    const { notifyAllocationRejected } = await import("@/lib/admin-notify");
    await notifyAllocationRejected(
      auth.client,
      investor,
      alloc.saft_rounds?.name || "Unknown",
      Number(alloc.token_amount),
      auth.email,
      reason || ""
    );
  }

  return NextResponse.json({
    ...data,
    _message: "Allocation rejected.",
  });
}
