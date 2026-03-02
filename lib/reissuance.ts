import { SupabaseClient } from "@supabase/supabase-js";
import { generateDocsForInvestor } from "@/lib/doc-generate-core";
import {
  fillDocxTemplate,
  docxToHtml,
  hashContent,
  SaftVariables,
} from "@/lib/doc-generator";
import { sendEmail, composeNovationEmail, composeNewSaftReadyEmail } from "@/lib/email";

// ============================================================
// SAFT Re-issuance Workflow
//
// Three phases per investor+round:
//   A. Admin initiates → old SAFT superseded, novation generated
//   B. Investor signs novation → old SAFT terminated
//   C. New SAFT auto-generated → investor signs → complete
//
// One novation per round (matches SAFT-per-round pattern).
// Payments are frozen for affected rounds until new SAFT signed.
// ============================================================

/** Batch creation input */
export interface ReissuanceBatchInput {
  old_entity_name: string;
  new_entity_name: string;
  new_entity_jurisdiction?: string;
  reason: string;
  /** Round IDs to reissue. If empty, applies to ALL rounds with signed SAFTs. */
  round_ids?: string[];
}

/** Per-item status summary */
export interface ReissuanceItemStatus {
  id: string;
  investor_id: string;
  investor_name: string;
  investor_email: string;
  round_id: string;
  round_name: string;
  status: string;
  old_saft_id: string | null;
  novation_doc_id: string | null;
  new_saft_id: string | null;
}

/** Batch progress summary */
export interface ReissuanceBatchProgress {
  batch_id: string;
  status: string;
  total_items: number;
  pending_novation: number;
  novation_signed: number;
  pending_new_saft: number;
  complete: number;
  cancelled: number;
  items: ReissuanceItemStatus[];
}

// ─── PHASE A: Initiate batch ────────────────────────────────

/**
 * Create a reissuance batch and generate novation documents
 * for every investor with a signed SAFT in the target rounds.
 *
 * Steps per investor+round:
 *   1. Mark old SAFT as "superseded"
 *   2. Create novation document (HTML-based, no template needed)
 *   3. Email investor explaining the entity change
 *   4. Track in reissuance_items
 */
export async function initiateBatchReissuance(
  supabase: SupabaseClient,
  input: ReissuanceBatchInput,
  adminEmail: string
): Promise<{ batch_id: string; items_created: number }> {
  // ── Create the batch record ──
  const { data: batch, error: batchErr } = await supabase
    .from("reissuance_batches")
    .insert({
      old_entity_name: input.old_entity_name,
      new_entity_name: input.new_entity_name,
      new_entity_jurisdiction: input.new_entity_jurisdiction || null,
      reason: input.reason,
      initiated_by: adminEmail,
    })
    .select("id")
    .single();

  if (batchErr || !batch) {
    throw new Error(`Failed to create batch: ${batchErr?.message}`);
  }

  // ── Fetch the active novation template ──
  const { data: novationTemplate } = await supabase
    .from("doc_templates")
    .select("*")
    .eq("doc_type", "novation")
    .eq("is_active", true)
    .is("round_id", null)
    .single();

  if (!novationTemplate) {
    throw new Error("No active novation template found. Please upload a novation .docx template in Document Templates before initiating re-issuance.");
  }

  const { data: templateFile, error: dlErr } = await supabase.storage
    .from("documents")
    .download(novationTemplate.storage_path);

  if (dlErr || !templateFile) {
    throw new Error(`Failed to download novation template: ${dlErr?.message}`);
  }

  const templateBuffer = Buffer.from(await templateFile.arrayBuffer());

  // ── Find all signed SAFTs in target rounds ──
  let query = supabase
    .from("investor_documents")
    .select("id, investor_id, round_id, signed_at, created_at, investors(full_name, email), saft_rounds(name)")
    .eq("doc_type", "saft")
    .eq("status", "signed");

  if (input.round_ids && input.round_ids.length > 0) {
    query = query.in("round_id", input.round_ids);
  }

  const { data: signedSafts } = await query;
  if (!signedSafts || signedSafts.length === 0) {
    throw new Error("No signed SAFTs found for the specified rounds");
  }

  let itemsCreated = 0;

  for (const saft of signedSafts) {
    const investor = saft.investors as any;
    const round = saft.saft_rounds as any;

    // ── 1. Supersede the old SAFT ──
    await supabase
      .from("investor_documents")
      .update({ status: "superseded" })
      .eq("id", saft.id);

    await supabase.from("signing_events").insert({
      document_id: saft.id,
      investor_id: saft.investor_id,
      event_type: "superseded" as any,
      metadata: {
        batch_id: batch.id,
        reason: input.reason,
        superseded_by: adminEmail,
      },
    });

    // ── 2. Generate novation document from template ──
    const novationVars: SaftVariables = {
      investor_name: investor.full_name,
      investor_email: investor.email || "",
      investor_address: "",
      investor_jurisdiction: "",
      investment_amount_usd: "",
      token_amount: "",
      token_price: "",
      round_name: round.name,
      payment_method: "",
      date: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      // Novation-specific variables
      old_entity: input.old_entity_name,
      new_entity: input.new_entity_name,
      new_jurisdiction: input.new_entity_jurisdiction || "—",
      reason: input.reason,
      original_saft_date: new Date(saft.signed_at || saft.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    };

    const filledDocx = fillDocxTemplate(templateBuffer, novationVars);
    const novationHtml = await docxToHtml(filledDocx);
    const novationHash = hashContent(novationHtml);

    // Store filled docx for audit trail
    const filledPath = `generated/${saft.investor_id}/${saft.round_id}/Novation-${investor.full_name.replace(/\s+/g, "_")}-${Date.now()}.docx`;
    await supabase.storage
      .from("documents")
      .upload(filledPath, filledDocx, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

    const { data: novDoc } = await supabase
      .from("investor_documents")
      .insert({
        investor_id: saft.investor_id,
        doc_type: "novation",
        round_id: saft.round_id,
        template_id: novationTemplate.id,
        storage_path: filledPath,
        html_content: novationHtml,
        doc_hash: novationHash,
        status: "pending",
        variables: novationVars,
        reissuance_item_id: null, // circular — updated below
      })
      .select("id")
      .single();

    // ── 3. Create reissuance tracking item ──
    const { data: item } = await supabase
      .from("reissuance_items")
      .insert({
        batch_id: batch.id,
        investor_id: saft.investor_id,
        round_id: saft.round_id,
        old_saft_id: saft.id,
        novation_doc_id: novDoc?.id || null,
        status: "pending_novation",
      })
      .select("id")
      .single();

    // Link the novation doc back to the reissuance item
    if (novDoc && item) {
      await supabase
        .from("investor_documents")
        .update({ reissuance_item_id: item.id })
        .eq("id", novDoc.id);
    }

    // ── 4. Email the investor ──
    const { subject, html } = composeNovationEmail(
      investor.full_name,
      round.name,
      input.old_entity_name,
      input.new_entity_name,
      input.reason
    );
    await sendEmail(investor.email, subject, html);

    await supabase.from("email_events").insert({
      investor_id: saft.investor_id,
      email_type: "novation_required",
      sent_by: adminEmail,
      metadata: {
        batch_id: batch.id,
        round_id: saft.round_id,
        old_saft_id: saft.id,
        novation_doc_id: novDoc?.id,
      },
    });

    itemsCreated++;
  }

  return { batch_id: batch.id, items_created: itemsCreated };
}

// ─── PHASE B: After novation signed ─────────────────────────

/**
 * Called after an investor signs a novation document.
 * Terminates the old SAFT and triggers new SAFT generation.
 */
export async function onNovationSigned(
  supabase: SupabaseClient,
  novationDocId: string,
  investorId: string
): Promise<{ new_saft_generated: boolean }> {
  // ── Find the reissuance item ──
  const { data: item } = await supabase
    .from("reissuance_items")
    .select("*, reissuance_batches(new_entity_name, new_entity_jurisdiction)")
    .eq("novation_doc_id", novationDocId)
    .eq("investor_id", investorId)
    .single();

  if (!item) {
    console.error("[REISSUANCE] No reissuance item found for novation doc:", novationDocId);
    return { new_saft_generated: false };
  }

  // ── Terminate old SAFT ──
  if (item.old_saft_id) {
    await supabase
      .from("investor_documents")
      .update({ status: "terminated" })
      .eq("id", item.old_saft_id);

    await supabase.from("signing_events").insert({
      document_id: item.old_saft_id,
      investor_id: investorId,
      event_type: "terminated" as any,
      metadata: {
        terminated_by_novation: novationDocId,
        batch_id: item.batch_id,
      },
    });
  }

  // ── Update item status ──
  await supabase
    .from("reissuance_items")
    .update({ status: "novation_signed" })
    .eq("id", item.id);

  // ── Generate new SAFT ──
  // First, supersede the old PPM and CIS so the investor
  // can see they've been replaced (visible audit trail).
  // generateDocsForInvestor will skip deleting already-superseded docs.

  // Supersede PPM for this round
  const { data: oldPpm } = await supabase
    .from("investor_documents")
    .select("id")
    .eq("investor_id", investorId)
    .eq("round_id", item.round_id)
    .eq("doc_type", "ppm")
    .not("status", "in", '("superseded","terminated")')
    .limit(1);

  if (oldPpm && oldPpm.length > 0) {
    await supabase
      .from("investor_documents")
      .update({ status: "superseded" })
      .eq("id", oldPpm[0].id);

    await supabase.from("signing_events").insert({
      document_id: oldPpm[0].id,
      investor_id: investorId,
      event_type: "superseded" as any,
      metadata: {
        batch_id: item.batch_id,
        reason: "Entity change re-issuance",
      },
    });
  }

  // Supersede CIS (global, round_id is null)
  const { data: oldCis } = await supabase
    .from("investor_documents")
    .select("id")
    .eq("investor_id", investorId)
    .eq("doc_type", "cis")
    .is("round_id", null)
    .not("status", "in", '("superseded","terminated")')
    .limit(1);

  if (oldCis && oldCis.length > 0) {
    await supabase
      .from("investor_documents")
      .update({ status: "superseded" })
      .eq("id", oldCis[0].id);

    await supabase.from("signing_events").insert({
      document_id: oldCis[0].id,
      investor_id: investorId,
      event_type: "superseded" as any,
      metadata: {
        batch_id: item.batch_id,
        reason: "Entity change re-issuance",
      },
    });
  }

  // Now generate the new document set (SAFT + PPM + CIS)
  const { data: investor } = await supabase
    .from("investors")
    .select("*")
    .eq("id", investorId)
    .single();

  if (!investor) {
    console.error("[REISSUANCE] Investor not found:", investorId);
    return { new_saft_generated: false };
  }

  try {
    const result = await generateDocsForInvestor(
      supabase,
      investor,
      item.round_id,
      "system (reissuance)"
    );

    // Find the newly generated SAFT doc
    const newSaft = result.documents.find((d: any) => d.doc_type === "saft");

    if (newSaft) {
      // Link new SAFT to the reissuance item
      await supabase
        .from("investor_documents")
        .update({ reissuance_item_id: item.id })
        .eq("id", newSaft.id);

      await supabase
        .from("reissuance_items")
        .update({
          new_saft_id: newSaft.id,
          status: "pending_new_saft",
        })
        .eq("id", item.id);
    }

    // ── Notify investor that new SAFT is ready ──
    const { data: round } = await supabase
      .from("saft_rounds")
      .select("name")
      .eq("id", item.round_id)
      .single();

    const { subject, html } = composeNewSaftReadyEmail(
      investor.full_name,
      round?.name || "Token Purchase"
    );
    await sendEmail(investor.email, subject, html);

    await supabase.from("email_events").insert({
      investor_id: investorId,
      email_type: "new_saft_ready",
      sent_by: "system",
      metadata: {
        batch_id: item.batch_id,
        round_id: item.round_id,
        new_saft_id: newSaft?.id,
      },
    });

    return { new_saft_generated: !!newSaft };
  } catch (err: any) {
    console.error("[REISSUANCE] New SAFT generation failed:", err.message);
    return { new_saft_generated: false };
  }
}

// ─── PHASE C: After new SAFT signed ────────────────────────

/**
 * Called after an investor signs the re-issued SAFT.
 * Marks the reissuance item as complete.
 */
export async function onReissuedSaftSigned(
  supabase: SupabaseClient,
  saftDocId: string,
  investorId: string
): Promise<void> {
  const { data: item } = await supabase
    .from("reissuance_items")
    .select("id, batch_id")
    .eq("new_saft_id", saftDocId)
    .eq("investor_id", investorId)
    .single();

  if (!item) return; // Not a reissuance doc — normal flow

  await supabase
    .from("reissuance_items")
    .update({
      status: "complete",
      completed_at: new Date().toISOString(),
    })
    .eq("id", item.id);

  // ── Check if entire batch is complete ──
  const { data: remaining } = await supabase
    .from("reissuance_items")
    .select("id")
    .eq("batch_id", item.batch_id)
    .not("status", "in", '("complete","cancelled")');

  if (!remaining || remaining.length === 0) {
    await supabase
      .from("reissuance_batches")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", item.batch_id);
  }
}

// ─── PROGRESS TRACKING ──────────────────────────────────────

/**
 * Get detailed progress for a reissuance batch.
 */
export async function getBatchProgress(
  supabase: SupabaseClient,
  batchId: string
): Promise<ReissuanceBatchProgress | null> {
  const { data: batch } = await supabase
    .from("reissuance_batches")
    .select("id, status")
    .eq("id", batchId)
    .single();

  if (!batch) return null;

  const { data: items } = await supabase
    .from("reissuance_items")
    .select("*, investors(full_name, email), saft_rounds(name)")
    .eq("batch_id", batchId);

  if (!items) return null;

  const mapped: ReissuanceItemStatus[] = items.map((item: any) => ({
    id: item.id,
    investor_id: item.investor_id,
    investor_name: item.investors?.full_name || "Unknown",
    investor_email: item.investors?.email || "Unknown",
    round_id: item.round_id,
    round_name: item.saft_rounds?.name || "Unknown",
    status: item.status,
    old_saft_id: item.old_saft_id,
    novation_doc_id: item.novation_doc_id,
    new_saft_id: item.new_saft_id,
  }));

  return {
    batch_id: batchId,
    status: batch.status,
    total_items: items.length,
    pending_novation: items.filter((i: any) => i.status === "pending_novation").length,
    novation_signed: items.filter((i: any) => i.status === "novation_signed").length,
    pending_new_saft: items.filter((i: any) => i.status === "pending_new_saft").length,
    complete: items.filter((i: any) => i.status === "complete").length,
    cancelled: items.filter((i: any) => i.status === "cancelled").length,
    items: mapped,
  };
}

// ─── PAYMENT FREEZE CHECK ───────────────────────────────────

/**
 * Check if an investor+round has an active reissuance in progress.
 * Used by payment gates to freeze payments until new SAFT signed.
 */
export async function hasActiveReissuance(
  supabase: SupabaseClient,
  investorId: string,
  roundId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("reissuance_items")
    .select("id")
    .eq("investor_id", investorId)
    .eq("round_id", roundId)
    .in("status", ["pending_novation", "novation_signed", "pending_new_saft"])
    .limit(1);

  return (data?.length || 0) > 0;
}

// ─── HELPERS ────────────────────────────────────────────────

// (hashSimple and generateNovationHtml removed —
//  novation docs now use the template system via docxtemplater)
