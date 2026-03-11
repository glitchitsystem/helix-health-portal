/**
 * tests/fixtures/prescriptions.fixtures.ts
 *
 * Factory functions and constants for prescription test data.
 * Designed to exercise the prescriptionValidation service (Bug 1 in Section 10).
 */

import { faker } from '@faker-js/faker';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PrescriptionPayload {
  drug_name:          string;
  drug_ndc?:          string;
  dosage:             string;      // e.g. "500mg"
  frequency:          string;      // e.g. "twice daily"
  route?:             string;
  quantity?:          number;
  refills_remaining?: number;
  start_date:         string;      // YYYY-MM-DD
  end_date?:          string;
  status?:            string;
  is_controlled?:     number;      // 0 | 1
  schedule_class?:    string;      // 'II' | 'III' | 'IV' | 'V'
  pharmacy_name?:     string;
  pharmacy_phone?:    string;
  notes?:             string;
}

// ─── Known drug-interaction pairs (for seeding conflict scenarios) ─────────────

export const KNOWN_INTERACTION_PAIRS: Array<[string, string, 'mild' | 'moderate' | 'severe']> = [
  ['Warfarin',      'Aspirin',         'severe'  ],
  ['Warfarin',      'Ibuprofen',       'severe'  ],
  ['Metformin',     'Alcohol',         'moderate'],
  ['Simvastatin',   'Amiodarone',      'severe'  ],
  ['Clopidogrel',   'Omeprazole',      'moderate'],
  ['Fluoxetine',    'Tramadol',        'severe'  ],
  ['Lithium',       'Ibuprofen',       'moderate'],
  ['Methotrexate',  'Trimethoprim',    'severe'  ],
];

// ─── Dosage constants (mirrors MAX_DAILY_DOSES_MG in prescriptionValidation.ts) ─

export const MAX_SAFE_DAILY_DOSES_MG: Record<string, number> = {
  metformin:     2000,
  lisinopril:      40,
  atorvastatin:    80,
  amlodipine:      10,
  metoprolol:     200,
  omeprazole:      40,
  sertraline:     200,
  amoxicillin:    3000,
  ibuprofen:      3200,
  acetaminophen:  4000,
};

// ─── Factories ────────────────────────────────────────────────────────────────

/**
 * Builds a valid, non-controlled prescription payload.
 */
export function buildPrescription(
  overrides: Partial<PrescriptionPayload> = {},
): PrescriptionPayload {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - faker.number.int({ min: 1, max: 30 }));

  return {
    drug_name:         'Amoxicillin',
    dosage:            '500mg',
    frequency:         'three times daily',
    route:             'oral',
    quantity:          21,
    refills_remaining: 0,
    start_date:        startDate.toISOString().slice(0, 10),
    status:            'active',
    is_controlled:     0,
    pharmacy_name:     'TEST Pharmacy CVS #1234',
    pharmacy_phone:    '555-000-0001',
    notes:             'Take with food.',
    ...overrides,
  };
}

/**
 * Builds a prescription with a dosage at exactly the max limit.
 * Used to test Bug 1: validatePrescriptionDosage() uses > instead of >=,
 * so a prescription exactly at the limit is incorrectly accepted.
 *
 * Fix: Change `>` to `>=` in prescriptionValidation.ts.
 */
export function buildAtMaxDosePrescription(): PrescriptionPayload {
  // Metformin: 1000mg twice daily = 2000mg/day = exactly the max
  // Bug 1: this should FAIL validation (>= max), but currently PASSES (> max)
  return buildPrescription({
    drug_name: 'Metformin',
    dosage:    '1000mg',
    frequency: 'twice daily',
    notes:     'At exact max dose — should be rejected by validatePrescriptionDosage() after fixing Bug 1.',
  });
}

/**
 * Builds a prescription that clearly exceeds the max daily dose.
 * Should always fail validation (even with Bug 1 present).
 */
export function buildOverMaxDosePrescription(): PrescriptionPayload {
  // Metformin: 1500mg twice daily = 3000mg/day > 2000mg max
  return buildPrescription({
    drug_name: 'Metformin',
    dosage:    '1500mg',
    frequency: 'twice daily',
    notes:     'Exceeds max dose — should fail validation.',
  });
}

/**
 * Builds a controlled substance prescription (Schedule III).
 */
export function buildControlledSubstancePrescription(
  overrides: Partial<PrescriptionPayload> = {},
): PrescriptionPayload {
  const startDate = new Date().toISOString().slice(0, 10);
  return buildPrescription({
    drug_name:      'Codeine',
    drug_ndc:       '0121-0766-08',
    dosage:         '30mg',
    frequency:      'every 6 hours as needed',
    quantity:       20,
    refills_remaining: 0,
    start_date:     startDate,
    is_controlled:  1,
    schedule_class: 'III',
    notes:          'Post-procedure pain. Do not exceed prescribed dose.',
    ...overrides,
  });
}

/**
 * Builds a prescription payload that will trigger the drug-interaction check
 * (Warfarin vs an existing Aspirin active medication on the patient record).
 */
export function buildInteractingDrugPrescription(
  overrides: Partial<PrescriptionPayload> = {},
): PrescriptionPayload {
  return buildPrescription({
    drug_name: 'Warfarin',
    dosage:    '5mg',
    frequency: 'once daily',
    notes:     'INTERACTION TEST: patient should already have Aspirin in active meds.',
    ...overrides,
  });
}

/**
 * Builds a minimal required-fields-only prescription (no optional fields).
 */
export function buildMinimalPrescription(): PrescriptionPayload {
  const startDate = new Date().toISOString().slice(0, 10);
  return {
    drug_name:  'Doxycycline',
    dosage:     '100mg',
    frequency:  'once daily',
    start_date: startDate,
  };
}

/**
 * Builds an invalid prescription missing required fields.
 * Suitable for testing 400 validation responses.
 */
export function buildInvalidPrescription(
  missingField: 'drug_name' | 'dosage' | 'frequency' | 'start_date',
): Partial<PrescriptionPayload> {
  const valid = buildMinimalPrescription() as Record<string, unknown>;
  delete valid[missingField];
  return valid as Partial<PrescriptionPayload>;
}

// ─── Refill request factory ───────────────────────────────────────────────────

export interface RefillRequestPayload {
  notes?: string;
}

export function buildRefillRequest(
  overrides: Partial<RefillRequestPayload> = {},
): RefillRequestPayload {
  return {
    notes: 'Patient requests refill — running low on medication.',
    ...overrides,
  };
}
