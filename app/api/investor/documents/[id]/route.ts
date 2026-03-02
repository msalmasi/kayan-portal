import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import {
  generateSignedPdf,
  hashContent,
  fillDocxTemplate,
  docxToHtml,
  SigningData,
  SaftVariables,
  MissingVariable,
} from "@/lib/doc-generator";
import { pauseGuardWithReissuanceBypass } from "@/lib/platform-pause";

/**
 * Helper: verify the request comes from the investor who owns the document.
 */
async function getDocContext(docId: string) {
  const cookieStore = cookies();

  const userSupabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user?.email) return null;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: investor } = await admin
    .from("investors")
    .select("*")
    .ilike("email", user.email)
    .single();

  if (!investor) return null;

  const { data: doc } = await admin
    .from("investor_documents")
    .select("*, saft_rounds(name)")
    .eq("id", docId)
    .eq("investor_id", investor.id)
    .single();

  if (!doc) return null;

  return { investor, doc, admin, userEmail: user.email };
}

/**
 * GET /api/investor/documents/[id]
 * Returns document details including missing_variables.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getDocContext(params.id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { doc, admin } = ctx;

  // Signed URLs for downloads
  let downloadUrl: string | null = null;
  if (doc.doc_type !== "saft" && doc.storage_path) {
    const { data } = await admin.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 3600);
    downloadUrl = data?.signedUrl || null;
  }

  let docxDownloadUrl: string | null = null;
  if (doc.doc_type === "saft" && doc.storage_path) {
    const { data } = await admin.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 3600);
    docxDownloadUrl = data?.signedUrl || null;
  }

  let signedPdfUrl: string | null = null;
  if (doc.signed_pdf_path) {
    const { data } = await admin.storage
      .from("documents")
      .createSignedUrl(doc.signed_pdf_path, 3600);
    signedPdfUrl = data?.signedUrl || null;
  }

  return NextResponse.json({
    id: doc.id,
    doc_type: doc.doc_type,
    round_name: doc.saft_rounds?.name || null,
    round_id: doc.round_id,
    status: doc.status,
    html_content: doc.doc_type === "saft" ? doc.html_content : null,
    doc_hash: doc.doc_hash,
    signed_at: doc.signed_at,
    signature_name: doc.signature_name,
    created_at: doc.created_at,
    download_url: downloadUrl,
    docx_download_url: docxDownloadUrl,
    signed_pdf_url: signedPdfUrl,
    variables: doc.variables,
    missing_variables: doc.missing_variables || [],
    template_id: doc.template_id,
  });
}

/**
 * PATCH /api/investor/documents/[id]
 * Two uses:
 *   1. Mark as "viewed" (no body needed)
 *   2. Fill missing variables (body: { filled_variables: { key: value } })
 *
 * When missing variables are filled, the SAFT is re-rendered with
 * the completed data and the document hash is updated.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getDocContext(params.id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ── Pause guard (reissuance docs bypass) ──
  const pauseBlocked = await pauseGuardWithReissuanceBypass(ctx.admin, params.id);
  if (pauseBlocked) return pauseBlocked;

  const { doc, admin, investor } = ctx;
  const headersList = headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ua = headersList.get("user-agent") || "unknown";

  // Parse body (may be empty for simple view tracking)
  let body: any = {};
  try { body = await request.json(); } catch { /* empty body = view tracking */ }

  // ── Fill missing variables ──
  if (body.filled_variables && doc.doc_type === "saft" && doc.status !== "signed") {
    const filled: Record<string, string> = body.filled_variables;
    const currentVars: SaftVariables = doc.variables || {};
    const currentMissing: MissingVariable[] = doc.missing_variables || [];

    // Merge filled values into existing variables
    const updatedVars = { ...currentVars };
    for (const [key, value] of Object.entries(filled)) {
      if (typeof value === "string" && value.trim()) {
        updatedVars[key] = value.trim();
      }
    }

    // Recalculate which variables are still missing
    const stillMissing = currentMissing.filter(
      (m) => !updatedVars[m.key] || updatedVars[m.key] === "" || updatedVars[m.key] === "—"
    );

    // Re-render the SAFT with updated variables
    let newHtml = doc.html_content;
    let newHash = doc.doc_hash;

    if (doc.template_id) {
      try {
        // Fetch template to re-render
        const { data: template } = await admin
          .from("doc_templates")
          .select("storage_path")
          .eq("id", doc.template_id)
          .single();

        if (template) {
          const { data: templateFile } = await admin.storage
            .from("documents")
            .download(template.storage_path);

          if (templateFile) {
            const templateBuffer = Buffer.from(await templateFile.arrayBuffer());
            const filledDocx = fillDocxTemplate(templateBuffer, updatedVars);
            newHtml = await docxToHtml(filledDocx);
            newHash = hashContent(newHtml);

            // Also re-upload the filled docx
            if (doc.storage_path) {
              await admin.storage
                .from("documents")
                .update(doc.storage_path, filledDocx, {
                  contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                  upsert: true,
                });
            }
          }
        }
      } catch (err: any) {
        console.error("[FILL] Re-render failed, keeping existing HTML:", err.message);
      }
    }

    // Update document record
    await admin
      .from("investor_documents")
      .update({
        variables: updatedVars,
        missing_variables: stillMissing,
        html_content: newHtml,
        doc_hash: newHash,
        status: doc.status === "pending" ? "viewed" : doc.status,
      })
      .eq("id", doc.id);

    // Log event
    await admin.from("signing_events").insert({
      document_id: doc.id,
      investor_id: investor.id,
      event_type: "viewed",
      ip_address: ip,
      user_agent: ua,
      metadata: { action: "filled_variables", filled: Object.keys(filled), still_missing: stillMissing.map((m) => m.key) },
    });

    return NextResponse.json({
      success: true,
      html_content: newHtml,
      doc_hash: newHash,
      missing_variables: stillMissing,
      variables: updatedVars,
    });
  }

  // ── Simple view tracking ──
  if (doc.status === "pending") {
    await admin
      .from("investor_documents")
      .update({ status: "viewed" })
      .eq("id", doc.id);
  }

  await admin.from("signing_events").insert({
    document_id: doc.id,
    investor_id: investor.id,
    event_type: "viewed",
    ip_address: ip,
    user_agent: ua,
  });

  return NextResponse.json({ success: true, status: "viewed" });
}

/**
 * POST /api/investor/documents/[id]
 * Sign the SAFT document.
 *
 * Body: { signature_name: string }
 *
 * Blocks signing if missing_variables still has unfilled entries.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getDocContext(params.id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ── Pause guard (reissuance docs bypass) ──
  const paused = await pauseGuardWithReissuanceBypass(ctx.admin, params.id);
  if (paused) return paused;

  const { doc, admin, investor } = ctx;
  const headersList = headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ua = headersList.get("user-agent") || "unknown";

  // Allow signing for both SAFTs and novation agreements
  if (doc.doc_type !== "saft" && doc.doc_type !== "novation") {
    return NextResponse.json({ error: "Only SAFT and novation documents require signing" }, { status: 400 });
  }
  if (doc.status === "signed") {
    return NextResponse.json({ error: "Document already signed" }, { status: 400 });
  }

  // Block signing if the round has closed (SAFTs only — novation bypasses this)
  if (doc.doc_type === "saft" && doc.round_id) {
    const { data: round } = await admin
      .from("saft_rounds")
      .select("closing_date")
      .eq("id", doc.round_id)
      .single();

    if (round?.closing_date && new Date(round.closing_date) < new Date()) {
      return NextResponse.json(
        { error: "This round has closed. Documents can no longer be signed." },
        { status: 410 }
      );
    }
  }

  // Block signing if there are still missing variables
  const missing: MissingVariable[] = doc.missing_variables || [];
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Please fill in all required fields first: ${missing.map((m) => m.label).join(", ")}` },
      { status: 400 }
    );
  }

  const { signature_name } = await request.json();
  if (!signature_name?.trim()) {
    return NextResponse.json({ error: "Signature name is required" }, { status: 400 });
  }

  const signedAt = new Date().toISOString();

  // ── Generate Certificate of Execution PDF ──
  const docTitle = doc.doc_type === "novation"
    ? `Termination & Novation Agreement — ${doc.saft_rounds?.name || "Entity Change"}`
    : `SAFT Agreement — ${doc.saft_rounds?.name || "Token Purchase"}`;

  const signingData: SigningData = {
    signatureName: signature_name.trim(),
    signedAt,
    ipAddress: ip,
    userAgent: ua,
    documentHash: doc.doc_hash || "—",
    investorName: investor.full_name,
    investorEmail: investor.email,
    documentTitle: docTitle,
    roundName: doc.saft_rounds?.name || "—",
  };

  let signedPdfPath: string | null = null;
  try {
    const pdfBytes = await generateSignedPdf(signingData);
    signedPdfPath = `signed/${investor.id}/${doc.round_id}/Certificate-${Date.now()}.pdf`;
    await admin.storage
      .from("documents")
      .upload(signedPdfPath, pdfBytes, { contentType: "application/pdf" });
  } catch (err: any) {
    console.error("[SIGNING] PDF generation failed:", err);
  }

  // ── Update document record ──
  await admin
    .from("investor_documents")
    .update({
      status: "signed",
      signed_at: signedAt,
      signature_name: signature_name.trim(),
      signature_ip: ip,
      signature_ua: ua,
      signed_pdf_path: signedPdfPath,
    })
    .eq("id", doc.id);

  // ── Log signing event ──
  await admin.from("signing_events").insert({
    document_id: doc.id,
    investor_id: investor.id,
    event_type: "signed",
    ip_address: ip,
    user_agent: ua,
    metadata: {
      signature_name: signature_name.trim(),
      document_hash: doc.doc_hash,
      final_variables: doc.variables,
      signed_pdf_path: signedPdfPath,
    },
  });

  // ── Log email event for audit ──
  await admin.from("email_events").insert({
    investor_id: investor.id,
    email_type: "saft_signed",
    sent_by: investor.email,
    metadata: {
      document_id: doc.id,
      round_name: doc.saft_rounds?.name,
      signature_name: signature_name.trim(),
      signed_at: signedAt,
    },
  });

  // ── Check if capital call should fire ──
  // SAFT signed may be the last gate (if PQ was already approved)
  let capitalCallSent = false;
  let novationTriggeredNewSaft = false;

  if (doc.doc_type === "novation") {
    // ── REISSUANCE PHASE B: Novation signed → terminate old SAFT, generate new one ──
    try {
      const { onNovationSigned } = await import("@/lib/reissuance");
      const result = await onNovationSigned(admin, doc.id, investor.id);
      novationTriggeredNewSaft = result.new_saft_generated;
    } catch (err: any) {
      console.error("[SIGNING] Novation post-signing hook failed:", err.message);
    }
  } else {
    // ── Standard SAFT or reissued SAFT ──
    // Check if this is a reissued SAFT (Phase C completion)
    if (doc.reissuance_item_id) {
      try {
        const { onReissuedSaftSigned } = await import("@/lib/reissuance");
        await onReissuedSaftSigned(admin, doc.id, investor.id);
      } catch (err: any) {
        console.error("[SIGNING] Reissuance completion hook failed:", err.message);
      }
    }

    // Normal capital call check
    try {
      const { checkAndSendCapitalCall } = await import("@/lib/capital-call");
      const result = await checkAndSendCapitalCall(
        admin,
        investor.id,
        "saft_signed",
        investor.email
      );
      capitalCallSent = result.sent;
    } catch (err: any) {
      console.error("[SIGNING] Capital call check failed:", err.message);
    }
  }

  // ── Notify admins ──
  try {
    if (doc.doc_type === "saft") {
      const { notifySaftSigned } = await import("@/lib/admin-notify");
      await notifySaftSigned(
        admin,
        investor,
        doc.saft_rounds?.name || "Unknown Round",
        capitalCallSent
      );
    }
  } catch (err: any) {
    console.error("[SIGNING] Notification failed:", err.message);
  }

  return NextResponse.json({
    success: true,
    status: "signed",
    doc_type: doc.doc_type,
    signed_at: signedAt,
    certificate_generated: !!signedPdfPath,
    capital_call_sent: capitalCallSent,
    new_saft_generated: novationTriggeredNewSaft,
  });
}
