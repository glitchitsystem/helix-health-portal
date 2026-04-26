import { calculatePatientResponsibility } from '../../server/src/services/billingService';

describe('calculatePatientResponsibility', () => {
  // --- Standard coverage scenarios ---

  it('calculatePatientResponsibility returns $0 when insurance covers 100%', () => {
    // Arrange
    const chargeAmount = 200;
    const insuranceCoveragePercent = 100;
    const deductibleRemaining = 0;

    // Act
    const result = calculatePatientResponsibility(chargeAmount, insuranceCoveragePercent, deductibleRemaining);

    // Assert
    expect(result).toBe(0);
  });

  it('calculatePatientResponsibility returns full charge when insurance covers 0%', () => {
    // Arrange
    const chargeAmount = 300;
    const insuranceCoveragePercent = 0;
    const deductibleRemaining = 0;

    // Act
    const result = calculatePatientResponsibility(chargeAmount, insuranceCoveragePercent, deductibleRemaining);

    // Assert
    expect(result).toBe(300);
  });

  it('calculatePatientResponsibility returns correct patient share for partial coverage', () => {
    // Arrange — 80% coverage: insurance pays $160, patient owes $40
    const chargeAmount = 200;
    const insuranceCoveragePercent = 80;
    const deductibleRemaining = 0;

    // Act
    const result = calculatePatientResponsibility(chargeAmount, insuranceCoveragePercent, deductibleRemaining);

    // Assert
    expect(result).toBe(40);
  });

  // --- Zero and boundary charge amounts ---

  it('calculatePatientResponsibility returns $0 for all outputs when charge is $0', () => {
    // Arrange
    const chargeAmount = 0;
    const insuranceCoveragePercent = 80;
    const deductibleRemaining = 100;

    // Act
    const result = calculatePatientResponsibility(chargeAmount, insuranceCoveragePercent, deductibleRemaining);

    // Assert
    expect(result).toBe(0);
  });

  // VERIFY WITH PRODUCT: Negative charges may represent credits or refunds.
  // Decision here: treat negative chargeAmount as $0 patient responsibility
  // rather than creating a negative (payment-owed-back) result, which belongs
  // in a separate refund workflow.
  it('calculatePatientResponsibility returns $0 when charge amount is negative', () => {
    // Arrange
    const chargeAmount = -150;
    const insuranceCoveragePercent = 80;
    const deductibleRemaining = 0;

    // Act
    const result = calculatePatientResponsibility(chargeAmount, insuranceCoveragePercent, deductibleRemaining);

    // Assert
    expect(result).toBe(0);
  });

  // --- Coverage percent edge cases ---

  // VERIFY WITH PRODUCT: Coverage > 100% is treated as a data error and clamped
  // to 100%, resulting in $0 patient responsibility. Confirm whether this should
  // instead throw or emit a warning for upstream data quality issues.
  it('calculatePatientResponsibility returns $0 when coverage exceeds 100%', () => {
    // Arrange
    const chargeAmount = 500;
    const insuranceCoveragePercent = 120;
    const deductibleRemaining = 0;

    // Act
    const result = calculatePatientResponsibility(chargeAmount, insuranceCoveragePercent, deductibleRemaining);

    // Assert
    expect(result).toBe(0);
  });

  // --- Deductible scenarios ---

  // VERIFY WITH PRODUCT: The stated formula Min(patientShare, patientShare + deductibleRemaining)
  // always equals patientShare when deductibleRemaining >= 0, so a remaining deductible does not
  // reduce what the patient owes. This test reflects that interpretation. If the intent is instead
  // Max(0, patientShare - deductibleAlreadyMet), the formula and this test need revisiting.
  it('calculatePatientResponsibility applies deductible remaining without reducing patient share', () => {
    // Arrange — patient 20% share = $100; deductible remaining = $60
    const chargeAmount = 500;
    const insuranceCoveragePercent = 80;
    const deductibleRemaining = 60;

    // Act
    const result = calculatePatientResponsibility(chargeAmount, insuranceCoveragePercent, deductibleRemaining);

    // Assert
    expect(result).toBe(100);
  });

  it('calculatePatientResponsibility returns patient share when deductible is fully met', () => {
    // Arrange
    const chargeAmount = 400;
    const insuranceCoveragePercent = 75;
    const deductibleRemaining = 0;

    // Act
    const result = calculatePatientResponsibility(chargeAmount, insuranceCoveragePercent, deductibleRemaining);

    // Assert — 25% of $400 = $100
    expect(result).toBe(100);
  });

  // --- Large realistic hospital bill ---

  it('calculatePatientResponsibility handles large hospital bill correctly', () => {
    // Arrange — $50,000 charge, 90% coverage, $2,000 deductible remaining
    const chargeAmount = 50000;
    const insuranceCoveragePercent = 90;
    const deductibleRemaining = 2000;

    // Act
    const result = calculatePatientResponsibility(chargeAmount, insuranceCoveragePercent, deductibleRemaining);

    // Assert — 10% of $50,000 = $5,000
    expect(result).toBe(5000);
  });

  // --- Floating point precision ---

  it('calculatePatientResponsibility handles non-integer results from fractional coverage', () => {
    // Arrange — 33.33% coverage on $100: insurance pays $33.33, patient owes $66.67
    const chargeAmount = 100;
    const insuranceCoveragePercent = 33.33;
    const deductibleRemaining = 0;

    // Act
    const result = calculatePatientResponsibility(chargeAmount, insuranceCoveragePercent, deductibleRemaining);

    // Assert — toBeCloseTo handles floating point drift
    expect(result).toBeCloseTo(66.67, 2);
  });
});
