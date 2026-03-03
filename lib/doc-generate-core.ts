import { SupabaseClient } from "@supabase/supabase-js";
import {
  fillDocxTemplate,
  docxToHtml,
  hashContent,
  detectMissingVariables,
  SaftVariables,
} from "@/lib/doc-generator";
import { sendEmail, composeDocumentsReadyEmail } from "@/lib/email";

/**
 * Generate the full document set for an investor + round.
 *
 * Shared logic used by:
 *   - POST /api/admin/documents/generate (manual trigger)
 *   - Sumsub webhook (auto on KYC approval)
 *
 * Requires: allocation must exist, SAFT template must exist.
 * Handles re-generation by voiding existing docs.
 *
 * @param supabase - Service role Supabase client
 * @param investor - Full investor record
 * @param roundId  - Round UUID
 * @param triggeredBy - Who triggered ("admin@email.com" or "system (kyc_approved)")
 */
export async function generateDocsForInvestor(
  supabase: SupabaseClient,
  investor: any,
  roundId: string,
  triggeredBy: string
): Promise<{
  documents: any[];
  missingVars: { key: string; label: string }[];
  emailSent: boolean;
  voidedCount: number;
}> {
  // ── Fetch round ──
  const { data: round, error: roundErr } = await supabase
    .from("saft_rounds")
    .select("*")
    .eq("id", roundId)
    .single();

  if (roundErr || !round) throw new Error("Round not found");

  // ── Require allocation(s) — combine if multiple in same round ──
  const { data: allocs } = await supabase
    .from("allocations")
    .select("token_amount, amount_usd")
    .eq("investor_id", investor.id)
    .eq("round_id", roundId)
    .eq("approval_status", "approved");

  if (!allocs || allocs.length === 0) {
    throw new Error("No approved allocation for this investor + round");
  }

  // Sum across all allocations in this round
  // (e.g. two strategic allocations of 50k tokens each → 100k total)
  const alloc = {
    token_amount: allocs.reduce((sum, a: any) => sum + Number(a.token_amount), 0),
    amount_usd: allocs.reduce((sum, a: any) => sum + Number(a.amount_usd || 0), 0),
  };

  // ── Fetch templates ──
  const { data: saftTemplate } = await supabase
    .from("doc_templates")
    .select("*")
    .eq("doc_type", "saft")
    .eq("round_id", roundId)
    .eq("is_active", true)
    .single();

  if (!saftTemplate) throw new Error(`No active SAFT template for round "${round.name}"`);

  const { data: ppmTemplate } = await supabase
    .from("doc_templates")
    .select("*")
    .eq("doc_type", "ppm")
    .eq("round_id", roundId)
    .eq("is_active", true)
    .single();

  const { data: cisTemplate } = await supabase
    .from("doc_templates")
    .select("*")
    .eq("doc_type", "cis")
    .is("round_id", null)
    .eq("is_active", true)
    .single();

  // ── Build variables ──
  const tokenAmount = Number(alloc.token_amount);
  const tokenPrice = Number(round.token_price || 0);
  const investmentAmountUsd = Number(alloc.amount_usd) || tokenAmount * tokenPrice;

  const variables: SaftVariables = {
    investor_name: investor.full_name || "",
    investor_email: investor.email || "",
    investor_address: "",
    investor_jurisdiction: "",
    payment_method: "",
    investment_amount_usd: investmentAmountUsd
      ? `$${investmentAmountUsd.toLocaleString()}`
      : "",
    token_amount: tokenAmount ? tokenAmount.toLocaleString() : "",
    token_price: tokenPrice ? `$${tokenPrice}` : "",
    round_name: round.name,
    date: new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  };

  // ── Detect missing variables ──
  const templatePlaceholders = (saftTemplate.placeholders as string[]) || [];
  const missingVars = detectMissingVariables(variables, templatePlaceholders);

  // ── Download + fill template ──
  const { data: templateFile, error: dlErr } = await supabase.storage
    .from("documents")
    .download(saftTemplate.storage_path);

  if (dlErr || !templateFile) {
    throw new Error(`Failed to download SAFT template: ${dlErr?.message}`);
  }

  const templateBuffer = Buffer.from(await templateFile.arrayBuffer());
  const filledDocx = fillDocxTemplate(templateBuffer, variables);
  const htmlContent = await docxToHtml(filledDocx);
  const docHash = hashContent(htmlContent);

  // ── Store filled docx ──
  const filledPath = `generated/${investor.id}/${roundId}/SAFT-${investor.full_name.replace(/\s+/g, "_")}-${Date.now()}.docx`;
  await supabase.storage
    .from("documents")
    .upload(filledPath, filledDocx, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

  // ── Void existing docs (re-generation) ──
  // Preserve docs already in terminal states (superseded/terminated) so
  // investors can see the visual history. Only delete active docs.
  const { data: existingDocs } = await supabase
    .from("investor_documents")
    .select("id, status")
    .eq("investor_id", investor.id)
    .eq("round_id", roundId);

  const { data: existingCis } = await supabase
    .from("investor_documents")
    .select("id, status")
    .eq("investor_id", investor.id)
    .eq("doc_type", "cis")
    .is("round_id", null);

  const terminalStatuses = ["superseded", "terminated"];
  const allExisting = [...(existingDocs || []), ...(existingCis || [])];
  const idsToDelete = allExisting
    .filter((d: any) => !terminalStatuses.includes(d.status))
    .map((d: any) => d.id);

  if (idsToDelete.length > 0) {
    for (const docId of idsToDelete) {
      await supabase.from("signing_events").insert({
        document_id: docId,
        investor_id: investor.id,
        event_type: "voided",
        metadata: { reason: "re-generation", voided_by: triggeredBy },
      });
    }
    await supabase
      .from("investor_documents")
      .delete()
      .in("id", idsToDelete);
  }

  // ── Insert new document records ──
  const docsToInsert: any[] = [
    {
      investor_id: investor.id,
      doc_type: "saft",
      round_id: roundId,
      template_id: saftTemplate.id,
      storage_path: filledPath,
      html_content: htmlContent,
      doc_hash: docHash,
      status: "pending",
      variables,
      missing_variables: missingVars,
    },
  ];

  if (ppmTemplate) {
    docsToInsert.push({
      investor_id: investor.id,
      doc_type: "ppm",
      round_id: roundId,
      template_id: ppmTemplate.id,
      storage_path: ppmTemplate.storage_path,
      status: "pending",
      missing_variables: [],
    });
  }

  if (cisTemplate) {
    docsToInsert.push({
      investor_id: investor.id,
      doc_type: "cis",
      round_id: null,
      template_id: cisTemplate.id,
      storage_path: cisTemplate.storage_path,
      status: "pending",
      missing_variables: [],
    });
  }

  const { data: docs, error: insertErr } = await supabase
    .from("investor_documents")
    .insert(docsToInsert)
    .select();

  if (insertErr) throw new Error(insertErr.message);

  // ── Log generation event ──
  const saftDoc = docs?.find((d: any) => d.doc_type === "saft");
  if (saftDoc) {
    await supabase.from("signing_events").insert({
      document_id: saftDoc.id,
      investor_id: investor.id,
      event_type: "generated",
      metadata: {
        round: round.name,
        variables,
        missing_variables: missingVars.map((m) => m.key),
        template: saftTemplate.file_name,
        triggered_by: triggeredBy,
        is_regeneration: idsToDelete.length > 0,
      },
    });
  }

  // ── Send "documents ready" email ──
  const { subject, html } = await composeDocumentsReadyEmail(investor.full_name, round.name);
  const emailSent = await sendEmail(investor.email, subject, html);

  await supabase.from("email_events").insert({
    investor_id: investor.id,
    email_type: "documents_ready",
    sent_by: triggeredBy,
    metadata: {
      round_id: roundId,
      round_name: round.name,
      docs_generated: docs?.length || 0,
      missing_variables: missingVars.length,
      is_regeneration: idsToDelete.length > 0,
      sent_successfully: emailSent,
    },
  });

  return {
    documents: docs || [],
    missingVars,
    emailSent,
    voidedCount: idsToDelete.length,
  };
}
