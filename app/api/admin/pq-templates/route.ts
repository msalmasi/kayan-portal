import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";

/**
 * GET /api/admin/pq-templates
 * List all templates (newest first), or fetch the active one.
 *
 *   ?active=true  — return only the active template
 */
export async function GET(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const activeOnly = request.nextUrl.searchParams.get("active") === "true";

  let query = auth.client
    .from("pq_templates")
    .select("*")
    .order("created_at", { ascending: false });

  if (activeOnly) query = query.eq("is_active", true).limit(1);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (activeOnly) {
    return NextResponse.json({ template: data?.[0] || null });
  }

  return NextResponse.json({ templates: data || [] });
}

/**
 * POST /api/admin/pq-templates
 *
 * Actions:
 *   { action: "create", name, sections, notes? }
 *     — Create a new template version and optionally activate it
 *
 *   { action: "activate", template_id }
 *     — Set a template as the active one (deactivates others)
 *
 *   { action: "force_resubmit", message? }
 *     — Force all approved investors to resubmit their PQ
 *       Sets pq_status → "sent" and records the prompt timestamp.
 */
export async function POST(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["admin", "super_admin"].includes(auth.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json();
  const { action } = body;

  // ── CREATE new template version ──
  if (action === "create") {
    const { name, sections, notes, activate } = body;

    if (!sections || !Array.isArray(sections) || sections.length === 0) {
      return NextResponse.json({ error: "Sections array is required" }, { status: 400 });
    }

    // Determine next version number
    const { data: latest } = await auth.client
      .from("pq_templates")
      .select("version")
      .order("version", { ascending: false })
      .limit(1);

    const nextVersion = (latest?.[0]?.version || 0) + 1;

    // If activating, deactivate all others first
    if (activate) {
      await auth.client
        .from("pq_templates")
        .update({ is_active: false })
        .eq("is_active", true);
    }

    const { data: created, error } = await auth.client
      .from("pq_templates")
      .insert({
        name: name || "Purchaser Questionnaire",
        version: nextVersion,
        sections,
        is_active: !!activate,
        created_by: auth.email,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, template: created });
  }

  // ── ACTIVATE an existing template ──
  if (action === "activate") {
    const { template_id } = body;
    if (!template_id) return NextResponse.json({ error: "template_id required" }, { status: 400 });

    // Deactivate all
    await auth.client
      .from("pq_templates")
      .update({ is_active: false })
      .eq("is_active", true);

    // Activate the selected one
    const { error } = await auth.client
      .from("pq_templates")
      .update({ is_active: true })
      .eq("id", template_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, message: "Template activated" });
  }

  // ── FORCE RESUBMIT — reset all approved PQs ──
  if (action === "force_resubmit") {
    const { message } = body;
    const now = new Date().toISOString();

    // Find all investors with approved PQs
    const { data: investors, error: fetchErr } = await auth.client
      .from("investors")
      .select("id, email, full_name")
      .eq("pq_status", "approved");

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    if (!investors || investors.length === 0) {
      return NextResponse.json({ success: true, affected: 0, message: "No approved PQs to reset" });
    }

    // Batch update: set status to "sent" and record the prompt
    const investorIds = investors.map((i: any) => i.id);

    const { error: updateErr } = await auth.client
      .from("investors")
      .update({
        pq_status: "sent",
        pq_update_prompted_at: now,
        pq_notes: message || "The Purchaser Questionnaire has been updated. Please review and resubmit.",
      })
      .in("id", investorIds);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    // Send notification emails to each investor
    try {
      const { sendEmail, composePqResubmitEmail } = await import("@/lib/email");

      await Promise.allSettled(
        investors.map((inv: any) =>
          composePqResubmitEmail(inv.full_name, message).then(({ subject, html }) =>
            sendEmail(inv.email, subject, html)
          )
        )
      );
    } catch (err: any) {
      console.error("[PQ-TEMPLATE] Resubmit emails failed:", err.message);
    }

    // Log the event
    await auth.client.from("email_events").insert({
      investor_id: null,
      email_type: "pq_force_resubmit",
      sent_by: auth.email,
      metadata: {
        affected_count: investors.length,
        investor_ids: investorIds,
        message,
      },
    });

    return NextResponse.json({
      success: true,
      affected: investors.length,
      message: `${investors.length} investor(s) prompted to resubmit`,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

/**
 * DELETE /api/admin/pq-templates
 * Delete a non-active template.
 *
 * Body: { template_id: string }
 */
export async function DELETE(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!["admin", "super_admin"].includes(auth.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { template_id } = await request.json();
  if (!template_id) return NextResponse.json({ error: "template_id required" }, { status: 400 });

  // Don't allow deleting the active template
  const { data: tpl } = await auth.client
    .from("pq_templates")
    .select("is_active")
    .eq("id", template_id)
    .single();

  if (tpl?.is_active) {
    return NextResponse.json({ error: "Cannot delete the active template" }, { status: 400 });
  }

  await auth.client.from("pq_templates").delete().eq("id", template_id);

  return NextResponse.json({ success: true });
}
