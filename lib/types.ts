// ============================================================
// Investor Portal — Type Definitions
// All database row types and derived shapes live here.
// ============================================================

/** Investor record from the `investors` table */
export interface Investor {
  id: string;
  email: string;
  full_name: string;
  kyc_status: "unverified" | "pending" | "verified";
  wallet_address: string | null;
  sumsub_applicant_id: string | null;
  kyc_verified_at: string | null;
  pq_status: PqStatus;
  pq_data: PqFormData | null;
  pq_submitted_at: string | null;
  pq_review: PqReviewData | null;
  pq_reviewed_by: string | null;
  pq_reviewed_at: string | null;
  pq_notes: string | null;
  pq_update_prompted_at: string | null;
  docs_sent_at: string | null;
  created_at: string;
}

/** SAFT round from the `saft_rounds` table */
export interface SaftRound {
  id: string;
  name: string;
  token_price: number | null;
  tge_unlock_pct: number;
  cliff_months: number;
  vesting_months: number;
  /** Optional round closing date. NULL = no close date. After this: no new investors, no signing, no new capital calls. */
  closing_date: string | null;
  created_at: string;
}

/** Payment status for an allocation */
export type PaymentStatus = "unpaid" | "invoiced" | "partial" | "paid" | "grant" | "transferred_out";

/** Accepted payment methods (matches PQ Section D) */
export type PaymentMethod = "wire" | "usdt" | "usdc" | "credit_card";

/** PQ review lifecycle */
export type PqStatus = "not_sent" | "sent" | "submitted" | "approved" | "rejected";

/** Allocation linking an investor to a round */
export interface Allocation {
  id: string;
  investor_id: string;
  round_id: string;
  token_amount: number;
  notes: string | null;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  amount_usd: number | null;
  amount_received_usd: number | null;
  payment_date: string | null;
  tx_reference: string | null;
  // Approval workflow (staff proposals require manager approval)
  approval_status: "pending" | "approved" | "rejected";
  proposed_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  /** Payment due date — set when capital call issued. NULL = no deadline. */
  payment_deadline: string | null;
  created_at: string;
}

/** Allocation joined with its round details — used on the dashboard */
export interface AllocationWithRound extends Allocation {
  saft_rounds: SaftRound;
}

/** Admin user record */
export interface AdminUser {
  id: string;
  email: string;
  role: "super_admin" | "admin" | "manager" | "staff";
  created_at: string;
}

/** Investor with their allocations — used in admin views */
export interface InvestorWithAllocations extends Investor {
  allocations: (Allocation & { saft_rounds: SaftRound })[];
}

/** Shape of a single row in the CSV import */
export interface CsvImportRow {
  email: string;
  full_name: string;
  round_name: string;
  token_amount: string | number;
}

/** Vesting chart data point */
export interface VestingDataPoint {
  month: number;
  label: string;
  unlocked: number;
}

/** Email event audit record */
export interface EmailEvent {
  id: string;
  investor_id: string;
  email_type: string;
  sent_by: string | null;
  sent_at: string;
  metadata: Record<string, any> | null;
}

// ─── PQ FORM DATA (investor submission) ─────────────────────

/** Section A: Investor identification */
export interface PqSectionA {
  investor_type: "individual" | "entity";
  legal_name: string;
  jurisdiction_of_residence: string;
  // Entity-specific
  entity_type?: string;
  entity_jurisdiction?: string;
  beneficial_owner_name?: string;
  beneficial_owner_nationality?: string;
}

/** Section B: Non-U.S. Person certification (6 attestations) */
export interface PqSectionB {
  not_us_citizen: boolean;
  not_us_resident: boolean;
  not_us_partnership: boolean;
  not_us_estate: boolean;
  not_us_trust: boolean;
  not_purchasing_for_us_person: boolean;
}

/** Section C: Investor qualification by jurisdiction */
export interface PqSectionC {
  qualification_type:
    | "hk_professional_investor"
    | "sg_accredited_investor"
    | "bvi_qualified"
    | "uae_difc_qualified"
    | "other_qualified";
  other_jurisdiction_details?: string;
}

/** Section D: Source of funds + AML */
export interface PqSectionD {
  /** If true, tokens are a grant — investment amount, payment method, source of funds are N/A */
  is_grant?: boolean;
  investment_amount_usd: number;
  payment_method: PaymentMethod;
  source_of_funds: string;
  sanctions_confirmation: boolean;
}

/** Section E: Investment contract & transfer restrictions */
export interface PqSectionE {
  understands_investment_contract: boolean;
  understands_transfer_restrictions: boolean;
  understands_holding_period: boolean;
  understands_no_hedging: boolean;
  understands_separation: boolean;
  understands_separation_not_guaranteed: boolean;
  accepts_indemnification: boolean;
  // Legacy (pre-restructuring)
  understands_restricted_security?: boolean;
  understands_transfer_conditions?: boolean;
}

/** Section F: General representations */
export interface PqSectionF {
  has_read_ppm: boolean;
  has_read_saft: boolean;
  has_read_cis: boolean;
  has_investment_experience: boolean;
  no_reliance_on_company: boolean;
}

/** Section G: Commodity-protocol token acknowledgments */
export interface PqSectionG {
  understands_not_equity: boolean;
  understands_commodity_redemption: boolean;
  understands_protocol_utility: boolean;
  understands_entity_separation: boolean;
  understands_commodity_risks: boolean;
}

/** Complete PQ form data (what the investor submits) */
export interface PqFormData {
  section_a: PqSectionA;
  section_b: PqSectionB;
  section_c: PqSectionC;
  section_d: PqSectionD;
  section_e: PqSectionE;
  section_f: PqSectionF;
  section_g?: PqSectionG;
  signature_name: string;
  signature_date: string;
}

// ─── PQ REVIEW (admin checklist) ────────────────────────────

/** Per-section review result */
export interface PqSectionReview {
  approved: boolean;
  notes: string;
}

/** Complete admin review checklist */
export interface PqReviewData {
  section_a: PqSectionReview;
  section_b: PqSectionReview;
  section_c: PqSectionReview;
  section_d: PqSectionReview;
  section_e: PqSectionReview;
  section_f: PqSectionReview;
  section_g?: PqSectionReview;
  overall_notes: string;
}

/** Default empty review */
export function emptyPqReview(): PqReviewData {
  const section = (): PqSectionReview => ({ approved: false, notes: "" });
  return {
    section_a: section(),
    section_b: section(),
    section_c: section(),
    section_d: section(),
    section_e: section(),
    section_f: section(),
    section_g: section(),
    overall_notes: "",
  };
}

// ─── DISPLAY LABELS ─────────────────────────────────────────

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  invoiced: "Invoiced",
  partial: "Partial",
  paid: "Paid",
  grant: "Grant",
  transferred_out: "Transferred",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  wire: "USD Wire",
  usdt: "USDT",
  usdc: "USDC",
  credit_card: "Credit Card",
};

export const PQ_STATUS_LABELS: Record<PqStatus, string> = {
  not_sent: "Not Sent",
  sent: "Sent",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
};

export const PQ_SECTION_LABELS: Record<string, string> = {
  section_a: "A — Investor Identification",
  section_b: "B — Non-U.S. Person Certification",
  section_c: "C — Investor Qualification",
  section_d: "D — Source of Funds & AML",
  section_e: "E — Investment Contract & Transfer Restrictions",
  section_f: "F — General Representations",
  section_g: "G — Commodity-Protocol Acknowledgments",
};

export const QUALIFICATION_LABELS: Record<string, string> = {
  hk_professional_investor: "Hong Kong Professional Investor",
  sg_accredited_investor: "Singapore Accredited Investor",
  bvi_qualified: "BVI Qualified Purchaser",
  uae_difc_qualified: "UAE / DIFC Qualified Investor",
  other_qualified: "Other Qualified Investor",
};

// ─── DOCUMENT TYPES ─────────────────────────────────────────

export type DocType = "saft" | "ppm" | "cis" | "novation";
export type DocStatus = "pending" | "viewed" | "signed" | "superseded" | "terminated";

/** Template stored in doc_templates */
export interface DocTemplate {
  id: string;
  doc_type: DocType;
  round_id: string | null;
  file_name: string;
  storage_path: string;
  placeholders: string[] | null;
  is_active: boolean;
  uploaded_by: string | null;
  created_at: string;
}

/** Generated document for an investor */
export interface InvestorDocument {
  id: string;
  investor_id: string;
  doc_type: DocType;
  round_id: string | null;
  template_id: string | null;
  storage_path: string | null;
  html_content: string | null;
  doc_hash: string | null;
  status: DocStatus;
  signed_at: string | null;
  signature_name: string | null;
  signature_ip: string | null;
  signature_ua: string | null;
  signed_pdf_path: string | null;
  variables: Record<string, any> | null;
  reissuance_item_id: string | null;
  created_at: string;
}

/** Signing audit event */
export interface SigningEvent {
  id: string;
  document_id: string;
  investor_id: string;
  event_type: "generated" | "viewed" | "signed" | "downloaded" | "voided" | "superseded" | "terminated";
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  saft: "SAFT Agreement",
  ppm: "Private Placement Memorandum",
  cis: "Confidential Information Statement",
  novation: "Termination & Novation Agreement",
};

export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  pending: "Pending",
  viewed: "Viewed",
  signed: "Signed",
  superseded: "Superseded",
  terminated: "Terminated",
};

/** Standard SAFT placeholders auto-filled from investor + round data */
export const SAFT_PLACEHOLDERS = [
  "investor_name",
  "investor_email",
  "investor_address",
  "investor_jurisdiction",
  "investment_amount_usd",
  "token_amount",
  "token_price",
  "round_name",
  "payment_method",
  "date",
] as const;

/** Novation agreement placeholders — filled from reissuance batch data */
export const NOVATION_PLACEHOLDERS = [
  "investor_name",
  "round_name",
  "old_entity",
  "new_entity",
  "new_jurisdiction",
  "reason",
  "original_saft_date",
  "date",
] as const;
