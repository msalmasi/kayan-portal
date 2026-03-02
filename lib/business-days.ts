/**
 * Add N business days to a date (skips weekends, no holiday calendar).
 *
 * @param start - Starting date
 * @param days  - Number of business days to add
 * @returns Date that is `days` business days after `start`
 */
export function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;

  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    // Skip Saturday (6) and Sunday (0)
    if (dow !== 0 && dow !== 6) {
      added++;
    }
  }

  return result;
}
