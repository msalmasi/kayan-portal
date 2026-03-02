import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";

// ─── Role hierarchy helper ──────────────────────────────────
// staff < manager < admin < super_admin
const ROLE_RANK: Record<string, number> = {
  staff: 0,
  manager: 1,
  admin: 2,
  super_admin: 3,
};

function isManagerOrAbove(role: string): boolean {
  return (ROLE_RANK[role] ?? 0) >= ROLE_RANK.manager;
}

/**
 * POST /api/admin/allocations
 * Create a new allocation.
 *
 * - Manager+ → allocation is created with approval_status = "approved"
 * - Staff    → allocation is created with approval_status = "pending"
 *              and a notification is sent to managers for review
 */
export async function POST(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Validate required fields
  if (!body.investor_id || !body.round_id || !body.token_amount) {
    return NextResponse.json(
      { error: "investor_id, round_id, and token_amount are required" },
      { status: 400 }
    );
  }

  // Block allocation to closed rounds
  const { data: round } = await auth.client
    .from("saft_rounds")
    .select("closing_date")
    .eq("id", body.round_id)
    .single();

  if (round?.closing_date && new Date(round.closing_date) < new Date()) {
    return NextResponse.json(
      { error: "This round has closed. New allocations cannot be added." },
      { status: 410 }
    );
  }

  // Staff proposes (pending); manager+ approves immediately
  const isManager = isManagerOrAbove(auth.role);
  const approvalStatus = isManager ? "approved" : "pending";

  const insertData: Record<string, any> = {
    investor_id: body.investor_id,
    round_id: body.round_id,
    token_amount: body.token_amount,
    notes: body.notes || null,
    approval_status: approvalStatus,
    proposed_by: auth.email,
  };

  // Manager+ allocations are self-approved
  if (isManager) {
    insertData.approved_by = auth.email;
    insertData.approved_at = new Date().toISOString();
  }

  const { data, error } = await auth.client
    .from("allocations")
    .insert(insertData)
    .select("*, saft_rounds(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // If staff proposed it, notify managers
  if (!isManager) {
    try {
      const { data: investor } = await auth.client
        .from("investors")
        .select("id, full_name, email")
        .eq("id", body.investor_id)
        .single();

      if (investor) {
        const { notifyAllocationProposed } = await import("@/lib/admin-notify");
        await notifyAllocationProposed(
          auth.client,
          investor,
          data.saft_rounds?.name || "Unknown",
          body.token_amount,
          auth.email
        );
      }
    } catch (err: any) {
      console.error("[ALLOC] Notification failed:", err.message);
    }
  }

  // Prompt investor to update PQ if they have an approved one
  try {
    const { data: investor } = await auth.client
      .from("investors")
      .select("id, full_name, email, pq_status, pq_submitted_at")
      .eq("id", body.investor_id)
      .single();

    if (investor?.pq_status === "approved") {
      // Send email prompting PQ update
      const { sendEmail, composePqUpdatePromptEmail } = await import("@/lib/email");
      const roundName = data.saft_rounds?.name || "a new round";
      const { subject, html } = composePqUpdatePromptEmail(
        investor.full_name,
        roundName,
        body.token_amount
      );
      await sendEmail(investor.email, subject, html);

      // Mark the timestamp so dashboard can show a banner
      await auth.client
        .from("investors")
        .update({ pq_update_prompted_at: new Date().toISOString() })
        .eq("id", investor.id);
    }
  } catch (err: any) {
    console.error("[ALLOC] PQ update prompt failed:", err.message);
  }

  return NextResponse.json({
    ...data,
    _approval_status: approvalStatus,
    _message: isManager
      ? "Allocation created and approved."
      : "Allocation proposed — awaiting manager approval.",
  });
}

/**
 * PATCH /api/admin/allocations
 * Edit an existing allocation. Manager+ only.
 * Staff cannot edit allocations (even their own pending ones).
 *
 * Body: { id: string, token_amount?: number, notes?: string, round_id?: string }
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isManagerOrAbove(auth.role)) {
    return NextResponse.json(
      { error: "Only managers and above can edit allocations" },
      { status: 403 }
    );
  }

  const body = await request.json();
  if (!body.id) {
    return NextResponse.json({ error: "Allocation id is required" }, { status: 400 });
  }

  const allowed = ["token_amount", "notes", "round_id"];
  const updates: Record<string, any> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await auth.client
    .from("allocations")
    .update(updates)
    .eq("id", body.id)
    .select("*, saft_rounds(*)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

/**
 * DELETE /api/admin/allocations?id=<allocation_id>
 * Remove an allocation. Manager+ only.
 * Staff cannot delete allocations.
 */
export async function DELETE(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isManagerOrAbove(auth.role)) {
    return NextResponse.json(
      { error: "Only managers and above can remove allocations" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing allocation id" }, { status: 400 });
  }

  const { error } = await auth.client.from("allocations").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
