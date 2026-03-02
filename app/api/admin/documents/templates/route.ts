import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import { extractPlaceholders } from "@/lib/doc-generator";

/**
 * GET /api/admin/documents/templates
 * List all document templates, optionally filtered by round_id or doc_type.
 */
export async function GET(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const roundId = searchParams.get("round_id");
  const docType = searchParams.get("doc_type");

  let query = auth.client
    .from("doc_templates")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (roundId) query = query.eq("round_id", roundId);
  if (docType) query = query.eq("doc_type", docType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data || []);
}

/**
 * POST /api/admin/documents/templates
 * Upload a new document template.
 *
 * Expects multipart form data:
 *   file: the template file (docx for SAFT, pdf for PPM/CIS)
 *   doc_type: "saft" | "ppm" | "cis"
 *   round_id: UUID (required for SAFT and PPM, omit for CIS)
 *
 * For SAFT templates, extracts {{placeholder}} keys from the docx.
 */
export async function POST(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!auth.canWrite) {
    return NextResponse.json({ error: "Staff cannot upload templates" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const docType = formData.get("doc_type") as string;
  const roundId = formData.get("round_id") as string | null;

  // ── Validation ──
  if (!file) return NextResponse.json({ error: "File is required" }, { status: 400 });
  if (!docType || !["saft", "ppm", "cis", "novation"].includes(docType)) {
    return NextResponse.json({ error: "Invalid doc_type" }, { status: 400 });
  }
  if ((docType === "saft" || docType === "ppm") && !roundId) {
    return NextResponse.json({ error: "round_id is required for SAFT and PPM" }, { status: 400 });
  }

  // Validate file type
  const fileName = file.name;
  if ((docType === "saft" || docType === "novation") && !fileName.endsWith(".docx")) {
    return NextResponse.json({ error: `${docType.toUpperCase()} template must be a .docx file` }, { status: 400 });
  }
  if ((docType === "ppm" || docType === "cis") && !fileName.endsWith(".pdf")) {
    return NextResponse.json({ error: "PPM and CIS must be .pdf files" }, { status: 400 });
  }

  // ── Read file buffer ──
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // ── Extract placeholders from docx templates (SAFT + novation) ──
  let placeholders: string[] | null = null;
  if (docType === "saft" || docType === "novation") {
    try {
      placeholders = extractPlaceholders(buffer);
    } catch (err: any) {
      return NextResponse.json(
        { error: `Failed to parse ${docType} template: ${err.message}` },
        { status: 400 }
      );
    }
  }

  // ── Upload to Supabase Storage ──
  const storagePath = `templates/${docType}/${roundId || "global"}/${Date.now()}-${fileName}`;
  const { error: uploadErr } = await auth.client.storage
    .from("documents")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadErr.message}` },
      { status: 500 }
    );
  }

  // ── Deactivate previous active template of same type+round ──
  const deactivateQuery = auth.client
    .from("doc_templates")
    .update({ is_active: false })
    .eq("doc_type", docType)
    .eq("is_active", true);

  if (docType === "cis" || docType === "novation") {
    await deactivateQuery.is("round_id", null);
  } else {
    await deactivateQuery.eq("round_id", roundId!);
  }

  // ── Insert new template record ──
  const { data, error } = await auth.client
    .from("doc_templates")
    .insert({
      doc_type: docType,
      round_id: (docType === "cis" || docType === "novation") ? null : roundId,
      file_name: fileName,
      storage_path: storagePath,
      placeholders,
      is_active: true,
      uploaded_by: auth.email,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ...data,
    message: `Template uploaded: ${fileName}`,
    placeholders_found: placeholders?.length || 0,
  });
}

/**
 * DELETE /api/admin/documents/templates?id=<template_id>
 * Soft-delete (deactivate) a template.
 */
export async function DELETE(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!auth.canWrite) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Template ID required" }, { status: 400 });

  const { error } = await auth.client
    .from("doc_templates")
    .update({ is_active: false })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
