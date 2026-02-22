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

/** Allocation linking an investor to a round */
export interface Allocation {
  id: string;
  investor_id: string;
  round_id: string;
  token_amount: number;
  notes: string | null;
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
  role: "admin" | "super_admin";
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
