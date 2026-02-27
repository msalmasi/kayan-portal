import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import {
  sendEmail,
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

  // Generate signed download URLs for each document
  const docsWithUrls = await Promise.all(
    (documents || []).map(async (doc: any) => {
      let download_url: string | null = null;
      let signed_pdf_url: string | null = null;

      // Filled SAFT docx or static PPM/CIS PDF
      if (doc.storage_path) {
        const { data } = await auth.client.storage
          .from("documents")
          .createSignedUrl(doc.storage_path, 3600);
        download_url = data?.signedUrl || null;
      }

      // Certificate of Execution PDF (signed SAFTs only)
      if (doc.signed_pdf_path) {
        const { data } = await auth.client.storage
          .from("documents")
          .createSignedUrl(doc.signed_pdf_path, 3600);
        signed_pdf_url = data?.signedUrl || null;
      }

      return { ...doc, download_url, signed_pdf_url };
    })
  );

  return NextResponse.json({
    ...investor,
    email_events: emails || [],
    investor_documents: docsWithUrls,
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

    // Auto-generate document sets for each round with an allocation
    try {
      const { generateDocsForInvestor } = await import("@/lib/doc-generate-core");

      const { data: fullInv } = await auth.client
        .from("investors")
        .select("*")
        .eq("id", params.id)
        .single();

      const { data: allocations } = await auth.client
        .from("allocations")
        .select("round_id")
        .eq("investor_id", params.id)
        .eq("approval_status", "approved");

      if (fullInv && allocations && allocations.length > 0) {
        const uniqueRounds = Array.from(new Set(allocations.map((a: any) => a.round_id)));
        for (const rid of uniqueRounds) {
          // Skip if already signed
          const { data: existing } = await auth.client
            .from("investor_documents")
            .select("id, status")
            .eq("investor_id", params.id)
            .eq("round_id", rid)
            .eq("doc_type", "saft");

          if (existing?.some((d: any) => d.status === "signed")) continue;

          // Check SAFT template exists
          const { data: tmpl } = await auth.client
            .from("doc_templates")
            .select("id")
            .eq("doc_type", "saft")
            .eq("round_id", rid)
            .eq("is_active", true)
            .single();

          if (!tmpl) continue;

          await generateDocsForInvestor(auth.client, fullInv, rid, auth.email);
        }
      }
    } catch (err: any) {
      console.error("[ADMIN] Auto-generate docs failed:", err.message);
    }
  }

  // ── Check capital call readiness on PQ approval ──
  // Uses shared helper that checks all 3 gates: PQ approved + allocation + SAFT signed
  let capitalCallResult: any = null;
  if (updates.pq_status === "approved") {
    const { checkAndSendCapitalCall } = await import("@/lib/capital-call");
    capitalCallResult = await checkAndSendCapitalCall(
      auth.client,
      params.id,
      "pq_approved",
      updates.pq_reviewed_by || auth.email
    );
  }

  return NextResponse.json({
    ...data,
    capital_call_sent: capitalCallResult?.sent || false,
    capital_call_status: capitalCallResult || null,
    docs_sent: docsSent,
  });
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
