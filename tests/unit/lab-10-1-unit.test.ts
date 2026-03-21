/**
 * tests/unit/lab-10-1-unit.test.ts
 *
 * LAB 10.1 — Debugging Bug Hunt (Unit layer)
 * Bug 1 of 5
 *
 * Run this file with:
 *   npx jest --config jest.unit.config.ts lab-10-1-unit --verbose
 *
 * Or with the VS Code debugger:
 *   Open this file → F5 → "Debug Jest: Unit Tests"
 *
 * Instructions:
 *   One test below fails. Your task is to:
 *   1. Run the tests and observe the failure
 *   2. Use the VS Code debugger or Claude to diagnose the root cause
 *   3. Fix the bug (it may be in this file OR in the application code)
 *   4. Document your debugging process as described in the lab instructions
 *
 * No hints until you have formed a hypothesis. Then check the lab document.
 */

import {
  validatePrescriptionDosage,
  parseDosageMg,
  resolveFrequencyPerDay,
} from '../../server/src/services/prescriptionValidation';

// ─── BUG 1 ────────────────────────────────────────────────────────────────────

describe('prescriptionValidation › validatePrescriptionDosage', () => {
  // This test passes — it is the reference case for a clearly safe dose.
  test('metformin at a safely sub-maximum dose (500mg twice daily = 1000mg/day) is valid', () => {
    const result = validatePrescriptionDosage('metformin', '500mg', 'twice daily');
    expect(result.valid).toBe(true);
    expect(result.dailyDoseMg).toBe(1000);
  });

  // This test passes — it is the reference case for a clearly excessive dose.
  test('metformin substantially over maximum (1500mg twice daily = 3000mg/day) is invalid', () => {
    const result = validatePrescriptionDosage('metformin', '1500mg', 'twice daily');
    expect(result.valid).toBe(false);
    expect(result.dailyDoseMg).toBe(3000);
    expect(result.maxDailyMg).toBe(2550);
    expect(result.error).toMatch(/exceeds/i);
  });

  // This test passes — unknown drug should not block prescription creation.
  test('drug not in the known list bypasses numeric validation and returns valid', () => {
    const result = validatePrescriptionDosage('amoxicillin', '500mg', 'three times daily');
    expect(result.valid).toBe(true);
  });

  /**
   * BUG 1 — THIS TEST FAILS.
   *
   * Background:
   *   The MAX_DAILY_DOSES_MG limit for metformin is 2550mg/day.
   *   A prescription of metformin 1275mg twice daily computes to:
   *     1275mg × 2 (doses/day) = 2550mg/day
   *   This is EXACTLY equal to the maximum.
   *
   * Expected behaviour:
   *   A prescription AT the maximum should be REJECTED.
   *   The maximum is a hard ceiling — "up to but not including" 2550mg is safe;
   *   2550mg itself is at the limit and must not be dispensed.
   *   The test assertion (valid: false) is CORRECT.
   *
   * Your task:
   *   Run the test. Observe the actual output. Identify which value is wrong.
   *   The bug is NOT in the test — the assertion is clinically correct.
   *   Use the debugger to step into validatePrescriptionDosage and observe
   *   exactly what the boundary comparison does with 2550 vs 2550.
   */
  test('metformin at the exact maximum boundary (1275mg twice daily = 2550mg/day) should be rejected', () => {
    const result = validatePrescriptionDosage('metformin', '1275mg', 'twice daily');
    // Daily dose: 1275mg × 2 = 2550mg/day — exactly equals MAX_DAILY_DOSES_MG.metformin
    expect(result.valid).toBe(false);       // A dose AT the ceiling must be rejected
    expect(result.dailyDoseMg).toBe(2550);
    expect(result.maxDailyMg).toBe(2550);
  });
});

// ─── Supporting function tests (all pass) ─────────────────────────────────────

describe('prescriptionValidation › parseDosageMg', () => {
  test('parses "500mg" correctly', () => {
    expect(parseDosageMg('500mg')).toBe(500);
  });

  test('parses "10 mg" (with space) correctly', () => {
    expect(parseDosageMg('10 mg')).toBe(10);
  });

  test('parses "1275mg" correctly', () => {
    expect(parseDosageMg('1275mg')).toBe(1275);
  });

  test('returns null for a non-mg dosage string', () => {
    expect(parseDosageMg('2 tablets')).toBeNull();
    expect(parseDosageMg('5ml')).toBeNull();
    expect(parseDosageMg('')).toBeNull();
  });
});

describe('prescriptionValidation › resolveFrequencyPerDay', () => {
  test('resolves "twice daily" to 2', () => {
    expect(resolveFrequencyPerDay('twice daily')).toBe(2);
  });

  test('resolves "bid" to 2', () => {
    expect(resolveFrequencyPerDay('bid')).toBe(2);
  });

  test('returns null for an unrecognised frequency', () => {
    expect(resolveFrequencyPerDay('every other day')).toBeNull();
  });
});
