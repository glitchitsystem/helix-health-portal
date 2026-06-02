export function calculatePatientResponsibility(
  chargeAmount: number,
  insuranceCoveragePercent: number,
  deductibleRemaining: number,
): number {
  if (chargeAmount <= 0) return 0;

  const clampedCoverage = Math.min(insuranceCoveragePercent, 100);
  const insurancePayment = (clampedCoverage / 100) * chargeAmount;
  const patientShare = chargeAmount - insurancePayment;

  return Math.min(patientShare, patientShare + deductibleRemaining);
}
