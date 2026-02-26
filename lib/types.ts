// ============================================================
// Kayan Portal — Type Definitions
// All database row types and derived shapes live here.
// ============================================================

/** Investor record from the `investors` table */
export interface Investor {
  id: string;
  email: string;
  full_name: string;
  kyc_status: "unverified" | "pending" | "verified";
  wallet_address: string | null;
  pq_status: PqStatus;
  pq_reviewed_by: string | null;
  pq_reviewed_at: string | null;
  pq_notes: string | null;
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
  created_at: string;
}

/** Payment status for an allocation */
export type PaymentStatus = "unpaid" | "invoiced" | "partial" | "paid";

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
  email_type: "welcome" | "capital_call" | "reminder";
  sent_by: string | null;
  sent_at: string;
  metadata: Record<string, any> | null;
}

/** Labels for display */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  invoiced: "Invoiced",
  partial: "Partial",
  paid: "Paid",
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
