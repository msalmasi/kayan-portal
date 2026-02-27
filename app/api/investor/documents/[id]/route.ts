import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { generateSignedPdf, hashContent, SigningData } from "@/lib/doc-generator";
import { sendEmail } from "@/lib/email";

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

  // Get investor
  const { data: investor } = await admin
    .from("investors")
    .select("*")
    .ilike("email", user.email)
    .single();

  if (!investor) return null;

  // Get document (must belong to this investor)
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
 * Returns document details.
 * - For SAFT: includes html_content for in-portal viewing
 * - For PPM/CIS: includes a signed download URL
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getDocContext(params.id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { doc, admin, investor } = ctx;

  // For PPM/CIS, generate a signed URL for the PDF
  let downloadUrl: string | null = null;
  if (doc.doc_type !== "saft" && doc.storage_path) {
    const { data } = await admin.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 3600); // 1 hour
    downloadUrl = data?.signedUrl || null;
  }

  // For SAFT, also provide a signed URL for the filled docx download
  let docxDownloadUrl: string | null = null;
  if (doc.doc_type === "saft" && doc.storage_path) {
    const { data } = await admin.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 3600);
    docxDownloadUrl = data?.signedUrl || null;
  }

  // Signed certificate URL
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
  });
}

/**
 * PATCH /api/investor/documents/[id]
 * Mark document as "viewed". Logged in audit trail.
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getDocContext(params.id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { doc, admin, investor } = ctx;
  const headersList = headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ua = headersList.get("user-agent") || "unknown";

  // Only update if currently pending
  if (doc.status === "pending") {
    await admin
      .from("investor_documents")
      .update({ status: "viewed" })
      .eq("id", doc.id);
  }

  // Log view event
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
 * Captures: typed signature, timestamp, IP, user agent, document hash.
 * Generates Certificate of Execution PDF.
 * Stores signed PDF in Supabase Storage.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getDocContext(params.id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { doc, admin, investor } = ctx;
  const headersList = headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const ua = headersList.get("user-agent") || "unknown";

  // Can only sign SAFT documents
  if (doc.doc_type !== "saft") {
    return NextResponse.json({ error: "Only SAFT documents require signing" }, { status: 400 });
  }

  // Can't sign if already signed
  if (doc.status === "signed") {
    return NextResponse.json({ error: "Document already signed" }, { status: 400 });
  }

  const { signature_name } = await request.json();
  if (!signature_name?.trim()) {
    return NextResponse.json({ error: "Signature name is required" }, { status: 400 });
  }

  const signedAt = new Date().toISOString();

  // ── Generate Certificate of Execution PDF ──
  const signingData: SigningData = {
    signatureName: signature_name.trim(),
    signedAt,
    ipAddress: ip,
    userAgent: ua,
    documentHash: doc.doc_hash || "—",
    investorName: investor.full_name,
    investorEmail: investor.email,
    documentTitle: `SAFT Agreement — ${doc.saft_rounds?.name || "Token Purchase"}`,
    roundName: doc.saft_rounds?.name || "—",
  };

  let signedPdfPath: string | null = null;
  try {
    const pdfBytes = await generateSignedPdf(signingData);

    // Store in Supabase Storage
    signedPdfPath = `signed/${investor.id}/${doc.round_id}/Certificate-${Date.now()}.pdf`;
    await admin.storage
      .from("documents")
      .upload(signedPdfPath, pdfBytes, {
        contentType: "application/pdf",
      });
  } catch (err: any) {
    console.error("[SIGNING] PDF generation failed:", err);
    // Non-fatal — the signing still goes through, we just don't have a PDF
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

  return NextResponse.json({
    success: true,
    status: "signed",
    signed_at: signedAt,
    certificate_generated: !!signedPdfPath,
  });
}
