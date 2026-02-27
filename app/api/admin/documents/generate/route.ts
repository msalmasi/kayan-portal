import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin-auth";
import {
  fillDocxTemplate,
  docxToHtml,
  hashContent,
  SaftVariables,
} from "@/lib/doc-generator";
import { sendEmail, composeDocumentsReadyEmail } from "@/lib/email";

/**
 * POST /api/admin/documents/generate
 * Generate the full document set for an investor.
 *
 * Body: { investor_id, round_id }
 *
 * 1. Fetches SAFT template for the round → fills variables → stores docx + HTML
 * 2. Links PPM for the round (static PDF, no generation needed)
 * 3. Links CIS (global static PDF)
 * 4. Creates investor_document records for each
 * 5. Sends "documents ready" email to investor
 */
export async function POST(request: NextRequest) {
  const auth = await getAdminAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!auth.canWrite) {
    return NextResponse.json({ error: "Staff cannot generate documents" }, { status: 403 });
  }

  const { investor_id, round_id } = await request.json();
  if (!investor_id || !round_id) {
    return NextResponse.json({ error: "investor_id and round_id required" }, { status: 400 });
  }

  // ── Fetch investor, round, and PQ data ──
  const { data: investor, error: invErr } = await auth.client
    .from("investors")
    .select("*")
    .eq("id", investor_id)
    .single();

  if (invErr || !investor) {
    return NextResponse.json({ error: "Investor not found" }, { status: 404 });
  }

  const { data: round, error: roundErr } = await auth.client
    .from("saft_rounds")
    .select("*")
    .eq("id", round_id)
    .single();

  if (roundErr || !round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  // ── Check if docs already generated for this investor + round ──
  const { data: existing } = await auth.client
    .from("investor_documents")
    .select("id")
    .eq("investor_id", investor_id)
    .eq("round_id", round_id)
    .eq("doc_type", "saft");

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: "Documents already generated for this investor + round. Void existing docs first." },
      { status: 409 }
    );
  }

  // ── Fetch templates ──
  const { data: saftTemplate } = await auth.client
    .from("doc_templates")
    .select("*")
    .eq("doc_type", "saft")
    .eq("round_id", round_id)
    .eq("is_active", true)
    .single();

  const { data: ppmTemplate } = await auth.client
    .from("doc_templates")
    .select("*")
    .eq("doc_type", "ppm")
    .eq("round_id", round_id)
    .eq("is_active", true)
    .single();

  const { data: cisTemplate } = await auth.client
    .from("doc_templates")
    .select("*")
    .eq("doc_type", "cis")
    .is("round_id", null)
    .eq("is_active", true)
    .single();

  if (!saftTemplate) {
    return NextResponse.json(
      { error: `No active SAFT template found for round "${round.name}"` },
      { status: 404 }
    );
  }

  // ── Get investment amount from PQ or allocation ──
  let investmentAmountUsd = 0;
  let tokenAmount = 0;

  // Try PQ data first
  if (investor.pq_data?.section_d?.investment_amount_usd) {
    investmentAmountUsd = investor.pq_data.section_d.investment_amount_usd;
    tokenAmount = round.token_price
      ? Math.floor(investmentAmountUsd / Number(round.token_price))
      : 0;
  }

  // Fall back to allocation data
  if (!investmentAmountUsd) {
    const { data: alloc } = await auth.client
      .from("allocations")
      .select("token_amount, amount_usd")
      .eq("investor_id", investor_id)
      .eq("round_id", round_id)
      .single();

    if (alloc) {
      tokenAmount = Number(alloc.token_amount);
      investmentAmountUsd = Number(alloc.amount_usd) || tokenAmount * Number(round.token_price || 0);
    }
  }

  // ── Build variables ──
  const variables: SaftVariables = {
    investor_name: investor.full_name,
    investor_email: investor.email,
    investor_jurisdiction:
      investor.pq_data?.section_a?.jurisdiction_of_residence || "—",
    investment_amount_usd: investmentAmountUsd
      ? `$${investmentAmountUsd.toLocaleString()}`
      : "—",
    token_amount: tokenAmount ? tokenAmount.toLocaleString() : "—",
    token_price: round.token_price ? `$${Number(round.token_price)}` : "—",
    round_name: round.name,
    date: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  };

  // ── Download SAFT template from storage ──
  const { data: templateFile, error: dlErr } = await auth.client.storage
    .from("documents")
    .download(saftTemplate.storage_path);

  if (dlErr || !templateFile) {
    return NextResponse.json(
      { error: `Failed to download SAFT template: ${dlErr?.message}` },
      { status: 500 }
    );
  }

  // ── Fill template + convert to HTML ──
  let filledDocx: Buffer;
  let htmlContent: string;
  try {
    const templateBuffer = Buffer.from(await templateFile.arrayBuffer());
    filledDocx = fillDocxTemplate(templateBuffer, variables);
    htmlContent = await docxToHtml(filledDocx);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Template processing failed: ${err.message}` },
      { status: 500 }
    );
  }

  // Hash the generated content for integrity verification
  const docHash = hashContent(htmlContent);

  // ── Store filled SAFT docx in storage ──
  const filledPath = `generated/${investor_id}/${round_id}/SAFT-${investor.full_name.replace(/\s+/g, "_")}-${Date.now()}.docx`;
  await auth.client.storage
    .from("documents")
    .upload(filledPath, filledDocx, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

  // ── Create investor_document records ──
  const docsToInsert = [
    {
      investor_id,
      doc_type: "saft",
      round_id,
      template_id: saftTemplate.id,
      storage_path: filledPath,
      html_content: htmlContent,
      doc_hash: docHash,
      status: "pending",
      variables,
    },
  ];

  // PPM (if template exists)
  if (ppmTemplate) {
    docsToInsert.push({
      investor_id,
      doc_type: "ppm",
      round_id,
      template_id: ppmTemplate.id,
      storage_path: ppmTemplate.storage_path,
      html_content: null as any,
      doc_hash: null as any,
      status: "pending",
      variables: null as any,
    });
  }

  // CIS (if template exists)
  if (cisTemplate) {
    docsToInsert.push({
      investor_id,
      doc_type: "cis",
      round_id: null as any,
      template_id: cisTemplate.id,
      storage_path: cisTemplate.storage_path,
      html_content: null as any,
      doc_hash: null as any,
      status: "pending",
      variables: null as any,
    });
  }

  const { data: docs, error: insertErr } = await auth.client
    .from("investor_documents")
    .insert(docsToInsert)
    .select();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // ── Log generation events ──
  const saftDoc = docs?.find((d: any) => d.doc_type === "saft");
  if (saftDoc) {
    await auth.client.from("signing_events").insert({
      document_id: saftDoc.id,
      investor_id,
      event_type: "generated",
      metadata: { round: round.name, variables, template: saftTemplate.file_name },
    });
  }

  // ── Send "documents ready" email ──
  const { subject, html } = composeDocumentsReadyEmail(investor.full_name, round.name);
  const emailSent = await sendEmail(investor.email, subject, html);

  await auth.client.from("email_events").insert({
    investor_id,
    email_type: "documents_ready",
    sent_by: auth.email,
    metadata: {
      round_id,
      round_name: round.name,
      docs_generated: docs?.length || 0,
      sent_successfully: emailSent,
    },
  });

  return NextResponse.json({
    success: true,
    documents: docs,
    email_sent: emailSent,
  });
}
