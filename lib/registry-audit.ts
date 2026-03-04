/**
 * Registry Audit Log
 *
 * The allocations table functions as a de facto token registry / transfer
 * agent system. This module provides an immutable audit trail for every
 * ownership-affecting change — allocation creation, payment application,
 * status transitions, amount adjustments, etc.
 *
 * All writes go through the service-role client so the audit log is
 * append-only and cannot be tampered with by end users.
 */

import { createClient } from "@supabase/supabase-js";

// ── Service-role client (bypasses RLS for append-only writes) ──
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── Types ──

export type RegistryAction =
  | "allocation_created"
  | "allocation_updated"
  | "allocation_deleted"
  | "payment_applied"
  | "payment_reversed"
  | "payment_claim_approved"
  | "payment_claim_rejected"
  | "payment_claim_deleted"
  | "status_changed"
  | "grant_marked"
  | "document_signed"
  | "document_generated"
  | "investor_kyc_changed"
  | "investor_pq_changed"
  | "round_created"
  | "round_updated";

export interface AuditLogEntry {
  action: RegistryAction;
  entityType: "allocation" | "payment_claim" | "investor_document" | "investor" | "saft_round";
  entityId: string;
  investorId?: string;
  roundId?: string;
  changedBy: string;             // admin email or 'system'
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Append an entry to the registry audit log.
 * Fire-and-forget — failures are logged but never break the calling flow.
 */
export async function logRegistryChange(entry: AuditLogEntry): Promise<void> {
  try {
    const supabase = getServiceClient();

    await supabase.from("registry_audit_log").insert({
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId,
      investor_id: entry.investorId || null,
      round_id: entry.roundId || null,
      changed_by: entry.changedBy,
      old_values: entry.oldValues || {},
      new_values: entry.newValues || {},
      metadata: entry.metadata || {},
      ip_address: entry.ipAddress || null,
      user_agent: entry.userAgent || null,
    });
  } catch (err: any) {
    // Never throw — audit logging must not break business logic
    console.error("[REGISTRY-AUDIT] Failed to log:", err.message, entry.action);
  }
}

// ── Convenience wrappers ──

/** Log an allocation being created or updated */
export function logAllocationChange(
  allocationId: string,
  investorId: string,
  roundId: string,
  action: "allocation_created" | "allocation_updated" | "allocation_deleted",
  changedBy: string,
  oldValues: Record<string, any>,
  newValues: Record<string, any>,
  meta?: Record<string, any>
) {
  return logRegistryChange({
    action,
    entityType: "allocation",
    entityId: allocationId,
    investorId,
    roundId,
    changedBy,
    oldValues,
    newValues,
    metadata: meta,
  });
}

/** Log a payment being applied or reversed */
export function logPaymentChange(
  allocationId: string,
  investorId: string,
  roundId: string,
  action: "payment_applied" | "payment_reversed",
  changedBy: string,
  amount: number,
  newStatus: string,
  meta?: Record<string, any>
) {
  return logRegistryChange({
    action,
    entityType: "allocation",
    entityId: allocationId,
    investorId,
    roundId,
    changedBy,
    newValues: { amount_applied: amount, payment_status: newStatus },
    metadata: meta,
  });
}

/** Log a payment claim decision */
export function logClaimDecision(
  claimId: string,
  investorId: string,
  roundId: string,
  action: "payment_claim_approved" | "payment_claim_rejected" | "payment_claim_deleted",
  changedBy: string,
  meta?: Record<string, any>
) {
  return logRegistryChange({
    action,
    entityType: "payment_claim",
    entityId: claimId,
    investorId,
    roundId,
    changedBy,
    metadata: meta,
  });
}

/** Log a document signing event */
export function logDocumentSigned(
  documentId: string,
  investorId: string,
  roundId: string,
  changedBy: string,
  meta?: Record<string, any>
) {
  return logRegistryChange({
    action: "document_signed",
    entityType: "investor_document",
    entityId: documentId,
    investorId,
    roundId,
    changedBy,
    metadata: meta,
  });
}
