export function isRefillEligible(
  lastFillDate: Date,
  daysSupply: number,
  refillsRemaining: number
): boolean {
  if (refillsRemaining <= 0) return false;

  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSinceFill = (Date.now() - lastFillDate.getTime()) / msPerDay;
  const threshold = daysSupply * 0.8;

  return daysSinceFill >= threshold;
}
