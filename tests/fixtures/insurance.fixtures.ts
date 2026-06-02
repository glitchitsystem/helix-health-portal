/**
 * tests/fixtures/insurance.fixtures.ts
 *
 * Factory functions for generating synthetic insurance plan data.
 * Uses @faker-js/faker for realistic-looking but obviously synthetic values.
 *
 * DATA_SAFETY_NOTICE:
 *   - All insurer names are prefixed with 'TEST ' (e.g. 'TEST BlueCross BlueShield')
 *   - All member IDs are prefixed with 'TEST-' (e.g. 'TEST-XYZ123456789')
 *   - All group numbers are prefixed with 'GRP-TEST-' (e.g. 'GRP-TEST-001234')
 *   No real insurance identifiers are used anywhere in this file.
 */

import { faker } from '@faker-js/faker';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InsurancePlanPayload {
  insurer_name:      string;
  plan_name:         string;
  member_id:         string;
  group_number:      string | null;
  effective_date:    string;  // ISO-8601 date, e.g. '2025-01-01'
  expiration_date:   string | null;
  is_primary:        0 | 1;
  copay_amount:      number;
  deductible_amount: number;
  deductible_met:    number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEST_INSURERS = [
  'TEST BlueCross BlueShield',
  'TEST Aetna',
  'TEST United Healthcare',
  'TEST Cigna',
  'TEST Humana',
  'TEST Kaiser Permanente',
] as const;

const COPAY_TIERS      = [15, 20, 25, 30, 35, 40] as const;
const DEDUCTIBLE_TIERS = [500, 1000, 1500, 2000, 3000, 5000] as const;

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Builds a synthetic insurance plan payload (no id or patient_id).
 * All identifiers are clearly synthetic — safe for test databases.
 */
export function buildInsurancePlan(
  overrides: Partial<InsurancePlanPayload> = {},
): InsurancePlanPayload {
  const deductible_amount = faker.helpers.arrayElement(DEDUCTIBLE_TIERS);
  const deductible_met    = Math.round(faker.number.float({ min: 0, max: deductible_amount }) * 100) / 100;

  return {
    insurer_name:      faker.helpers.arrayElement(TEST_INSURERS),
    plan_name:         faker.helpers.arrayElement(['PPO', 'HMO', 'EPO', 'HDHP']) + ' ' + faker.helpers.arrayElement(['Gold', 'Silver', 'Bronze', 'Platinum']),
    member_id:         'TEST-' + faker.string.alphanumeric(10).toUpperCase(),
    group_number:      'GRP-TEST-' + faker.string.numeric(6),
    effective_date:    isoDateOffset(-365),
    expiration_date:   isoDateOffset(365),
    is_primary:        1,
    copay_amount:      faker.helpers.arrayElement(COPAY_TIERS),
    deductible_amount,
    deductible_met,
    ...overrides,
  };
}

/**
 * Builds an array of N unique insurance plan payloads.
 */
export function buildInsurancePlanList(count: number): InsurancePlanPayload[] {
  return Array.from({ length: count }, () => buildInsurancePlan());
}

// ─── Named constants ──────────────────────────────────────────────────────────

/** Standard active primary insurance plan. */
export const PRIMARY_INSURANCE: InsurancePlanPayload = buildInsurancePlan();

/** Secondary insurance plan (is_primary = 0). */
export const SECONDARY_INSURANCE: InsurancePlanPayload = buildInsurancePlan({
  is_primary: 0,
});

/** Insurance plan whose expiration_date is in the past. */
export const EXPIRED_INSURANCE: InsurancePlanPayload = buildInsurancePlan({
  expiration_date: isoDateOffset(-1),
});
