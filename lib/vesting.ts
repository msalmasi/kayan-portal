import { AllocationWithRound, VestingDataPoint } from "./types";

/**
 * Calculate how many tokens are unlocked at a given month after TGE.
 *
 * The unlock formula:
 *   1. At TGE (month 0): `tge_unlock_pct`% is immediately available
 *   2. During cliff: nothing additional unlocks
 *   3. After cliff: remaining tokens vest linearly over `vesting_months`
 *
 * @param tokenAmount  - Total tokens allocated
 * @param tgeUnlockPct - Percentage unlocked at TGE (e.g., 10 = 10%)
 * @param cliffMonths  - Months before linear vesting begins
 * @param vestingMonths - Duration of linear vesting after cliff
 * @param monthsSinceTGE - Current month (0 = TGE day)
 * @returns Number of tokens unlocked
 */
export function calculateUnlocked(
  tokenAmount: number,
  tgeUnlockPct: number,
  cliffMonths: number,
  vestingMonths: number,
  monthsSinceTGE: number
): number {
  // Tokens released immediately at TGE
  const tgeUnlock = tokenAmount * (tgeUnlockPct / 100);
  const remaining = tokenAmount - tgeUnlock;

  // Before TGE — nothing unlocked
  if (monthsSinceTGE < 0) return 0;

  // At TGE — only the initial unlock
  if (monthsSinceTGE === 0) return tgeUnlock;

  // During cliff period — still just the TGE unlock
  if (monthsSinceTGE <= cliffMonths) return tgeUnlock;

  // After cliff — linear vesting of the remaining tokens
  const monthsVesting = monthsSinceTGE - cliffMonths;
  const vestedAmount = Math.min(
    remaining * (monthsVesting / vestingMonths),
    remaining // Cap at 100% of remaining
  );

  return tgeUnlock + vestedAmount;
}

/**
 * Generate chart data points for an investor's combined vesting schedule.
 * Aggregates across all allocations so multi-round investors see one curve.
 *
 * @param allocations - Investor's allocations with joined round data
 * @returns Array of { month, label, unlocked } for charting
 */
export function generateVestingSchedule(
  allocations: AllocationWithRound[]
): VestingDataPoint[] {
  if (allocations.length === 0) return [];

  // Find the longest timeline across all allocations
  const maxMonth = Math.max(
    ...allocations.map(
      (a) => a.saft_rounds.cliff_months + a.saft_rounds.vesting_months
    )
  );

  // Build data points for each month from TGE to full vest
  const dataPoints: VestingDataPoint[] = [];

  for (let month = 0; month <= maxMonth; month++) {
    // Sum unlocked tokens across all allocations at this month
    const unlocked = allocations.reduce((total, alloc) => {
      const round = alloc.saft_rounds;
      return (
        total +
        calculateUnlocked(
          alloc.token_amount,
          round.tge_unlock_pct,
          round.cliff_months,
          round.vesting_months,
          month
        )
      );
    }, 0);

    dataPoints.push({
      month,
      label: month === 0 ? "TGE" : `Month ${month}`,
      unlocked: Math.round(unlocked),
    });
  }

  return dataPoints;
}

/**
 * Format large token numbers for display (e.g., 1,250,000 → "1.25M")
 */
export function formatTokenAmount(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toLocaleString();
}
