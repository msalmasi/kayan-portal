/**
 * Transfer Compliance Checks
 *
 * Runs automated compliance checks for secondary token transfers:
 *   - Holding period (Rule 144 / Reg S)
 *   - Transferor qualification (KYC, PQ, non-U.S.)
 *   - Transferee qualification (when identified)
 *   - Volume / holder count impact
 */

import { getEntityConfig } from "@/lib/entity-config";

// ── Types ──

export interface TransferComplianceChecks {
  holding_period: {
    passed: boolean;
    issuance_date: string;
    months_held: number;
    required_months: number;
    note: string;
  };
  transferor: {
    kyc_valid: boolean;
    pq_approved: boolean;
    not_us_person: boolean;
  };
  transferee: {
    identified: boolean;
    kyc_valid: boolean;
    pq_approved: boolean;
    not_us_person: boolean;
    wallet_screened: boolean;
    wallet_clean: boolean;
  } | null;
  volume: {
    tokens_after_transfer: number;
    holder_count_after: number;
    pct_of_supply: number;
  };
  all_passed: boolean;
  checked_at: string;
}

export interface TransferCheckInput {
  // Transfer details
  token_amount: number;
  allocation_created_at: string;
  allocation_token_amount: number;

  // Transferor
  from_kyc_status: string;
  from_pq_status: string;
  from_pq_data: any;

  // Transferee (null if not yet identified)
  to_investor: {
    kyc_status: string;
    pq_status: string;
    pq_data: any;
  } | null;

  // Context
  total_supply: number;
  tge_date: string | null;
  current_holder_count: number;
  is_new_holder: boolean; // true if transferee doesn't already hold tokens
}

// ── Check runner ──

export function runComplianceChecks(input: TransferCheckInput): TransferComplianceChecks {
  const now = new Date();

  // ── Holding period ──
  // Use TGE date if set, otherwise allocation creation date
  const issuanceDate = input.tge_date || input.allocation_created_at;
  const issuance = new Date(issuanceDate);
  const monthsHeld = Math.floor(
    (now.getTime() - issuance.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  );

  // Check if transferor is non-U.S. (from PQ Section B)
  const pqData = input.from_pq_data || {};
  const isNested = !!pqData.section_b;
  const sectionB = isNested ? pqData.section_b : pqData;
  const fromNotUs = !!(
    sectionB.not_us_citizen &&
    sectionB.not_us_resident &&
    sectionB.not_purchasing_for_us_person
  );

  // Reg S offshore: no holding period needed if both parties are non-U.S.
  // Rule 144 U.S. resale: 12-month minimum
  const toNotUs = input.to_investor ? isNonUsPerson(input.to_investor.pq_data) : null;
  const isOffshore = fromNotUs && (toNotUs === true || toNotUs === null);
  const requiredMonths = isOffshore ? 0 : 12;
  const holdingPassed = monthsHeld >= requiredMonths;

  const holdingNote = isOffshore
    ? "Reg S offshore resale between non-U.S. persons — no holding period required"
    : monthsHeld >= 12
      ? `${monthsHeld} months held — Rule 144 holding period satisfied`
      : `${monthsHeld} of 12 months — Rule 144 holding period NOT met`;

  // ── Transferor checks ──
  const transferor = {
    kyc_valid: input.from_kyc_status === "verified",
    pq_approved: input.from_pq_status === "approved",
    not_us_person: fromNotUs,
  };

  // ── Transferee checks ──
  let transferee: TransferComplianceChecks["transferee"] = null;
  if (input.to_investor) {
    const toPqData = input.to_investor.pq_data || {};
    transferee = {
      identified: true,
      kyc_valid: input.to_investor.kyc_status === "verified",
      pq_approved: input.to_investor.pq_status === "approved",
      not_us_person: isNonUsPerson(toPqData),
      wallet_screened: false, // populated by wallet screening if available
      wallet_clean: true,
    };
  }

  // ── Volume checks ──
  const tokensAfter = input.allocation_token_amount - input.token_amount;
  const pctOfSupply = input.total_supply > 0
    ? (input.token_amount / input.total_supply) * 100
    : 0;
  const holderCountAfter = input.is_new_holder
    ? input.current_holder_count + 1
    : input.current_holder_count;

  const volume = {
    tokens_after_transfer: tokensAfter,
    holder_count_after: holderCountAfter,
    pct_of_supply: pctOfSupply,
  };

  // ── Overall ──
  const transferorPassed = transferor.kyc_valid && transferor.pq_approved;
  const transfereePassed = transferee
    ? transferee.kyc_valid && transferee.pq_approved && transferee.not_us_person
    : false;
  const amountValid = input.token_amount > 0 && input.token_amount <= input.allocation_token_amount;

  const allPassed = holdingPassed && transferorPassed && (transferee ? transfereePassed : false) && amountValid;

  return {
    holding_period: {
      passed: holdingPassed,
      issuance_date: issuanceDate,
      months_held: monthsHeld,
      required_months: requiredMonths,
      note: holdingNote,
    },
    transferor,
    transferee,
    volume,
    all_passed: allPassed,
    checked_at: now.toISOString(),
  };
}

// ── Helpers ──

/** Check if investor's PQ data indicates non-U.S. person */
function isNonUsPerson(pqData: any): boolean {
  if (!pqData) return false;
  const isNested = !!pqData.section_b;
  const b = isNested ? pqData.section_b : pqData;
  return !!(b.not_us_citizen && b.not_us_resident && b.not_purchasing_for_us_person);
}
