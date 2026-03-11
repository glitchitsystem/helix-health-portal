/**
 * tests/fixtures/patients.fixtures.ts
 *
 * Factory functions for generating synthetic patient data.
 * Uses @faker-js/faker for realistic-looking but obviously synthetic values.
 *
 * Install: npm install --save-dev @faker-js/faker
 */

import { faker } from '@faker-js/faker';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PatientDemographics {
  firstName:   string;
  lastName:    string;
  email:       string;
  dob:         string;  // YYYY-MM-DD
  gender:      'male' | 'female' | 'other';
  phone:       string;
  addressLine1: string;
  city:        string;
  state:       string;
  zip:         string;
  mrn:         string;
  ssn:         string;  // format: 000-00-XXXX (synthetic)
}

export interface PatientWithConditions extends PatientDemographics {
  diagnoses:   Array<{ icd10Code: string; description: string; status: 'active' | 'resolved' }>;
  medications: Array<{ name: string; dosage: string; frequency: string }>;
  allergies:   Array<{ allergen: string; reaction: string; severity: 'mild' | 'moderate' | 'severe' }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _mrnCounter = 90000;
let _ssnCounter = 9000;

function nextMrn(): string {
  return `MRN-TEST-${String(++_mrnCounter).padStart(5, '0')}`;
}

function nextSsn(): string {
  return `000-00-${String(++_ssnCounter).padStart(4, '0')}`;
}

// ─── Factories ────────────────────────────────────────────────────────────────

/**
 * Builds a synthetic patient demographics payload.
 * All names use realistic-sounding but obviously synthetic values.
 */
export function buildPatient(
  overrides: Partial<PatientDemographics> = {},
): PatientDemographics {
  const sex = faker.helpers.arrayElement(['male', 'female'] as const);
  return {
    firstName:    `TEST_${faker.person.firstName(sex)}`,
    lastName:     `TEST_${faker.person.lastName()}`,
    email:        `test.${faker.internet.username().toLowerCase()}.${Date.now()}@helixhealthportal.test`,
    dob:          faker.date.birthdate({ min: 18, max: 85, mode: 'age' }).toISOString().slice(0, 10),
    gender:       sex,
    phone:        `555-${faker.string.numeric(3)}-${faker.string.numeric(4)}`,
    addressLine1: `${faker.location.buildingNumber()} ${faker.location.street()}`,
    city:         faker.location.city(),
    state:        faker.location.state({ abbreviated: true }),
    zip:          faker.location.zipCode('#####'),
    mrn:          nextMrn(),
    ssn:          nextSsn(),
    ...overrides,
  };
}

/**
 * Builds a patient with a realistic set of chronic conditions.
 */
export function buildPatientWithConditions(
  conditions: 'diabetes' | 'cardiac' | 'psychiatric' | 'rheumatology' = 'diabetes',
  overrides: Partial<PatientDemographics> = {},
): PatientWithConditions {
  const base = buildPatient(overrides);

  const conditionMap: Record<string, PatientWithConditions['diagnoses']> = {
    diabetes: [
      { icd10Code: 'E11.9', description: 'Type 2 Diabetes Mellitus without complications', status: 'active' },
      { icd10Code: 'E78.5', description: 'Hyperlipidemia, Unspecified', status: 'active' },
    ],
    cardiac: [
      { icd10Code: 'I50.9', description: 'Heart failure, unspecified', status: 'active' },
      { icd10Code: 'I10',   description: 'Essential (Primary) Hypertension', status: 'active' },
    ],
    psychiatric: [
      { icd10Code: 'F33.1', description: 'Major depressive disorder, recurrent, moderate', status: 'active' },
      { icd10Code: 'F41.1', description: 'Generalized anxiety disorder', status: 'active' },
    ],
    rheumatology: [
      { icd10Code: 'M05.79', description: 'Rheumatoid arthritis with rheumatoid factor', status: 'active' },
      { icd10Code: 'M32.9',  description: 'Systemic lupus erythematosus, unspecified', status: 'active' },
    ],
  };

  const medMap: Record<string, PatientWithConditions['medications']> = {
    diabetes: [
      { name: 'Metformin',    dosage: '1000mg', frequency: 'twice daily' },
      { name: 'Glipizide',    dosage: '10mg',   frequency: 'once daily' },
      { name: 'Rosuvastatin', dosage: '20mg',   frequency: 'once daily at bedtime' },
    ],
    cardiac: [
      { name: 'Metoprolol',  dosage: '50mg', frequency: 'twice daily' },
      { name: 'Furosemide',  dosage: '40mg', frequency: 'once daily' },
      { name: 'Warfarin',    dosage: '5mg',  frequency: 'once daily' },
    ],
    psychiatric: [
      { name: 'Sertraline', dosage: '100mg', frequency: 'once daily' },
      { name: 'Quetiapine', dosage: '50mg',  frequency: 'once daily at bedtime' },
    ],
    rheumatology: [
      { name: 'Methotrexate',    dosage: '15mg',  frequency: 'once weekly' },
      { name: 'Hydroxychloroquine', dosage: '200mg', frequency: 'twice daily' },
      { name: 'Prednisone',      dosage: '5mg',   frequency: 'once daily' },
    ],
  };

  return {
    ...base,
    diagnoses: conditionMap[conditions],
    medications: medMap[conditions],
    allergies: [
      { allergen: 'Penicillin', reaction: 'anaphylaxis', severity: 'severe' },
    ],
  };
}

/**
 * Builds an array of N unique patient demographics objects.
 */
export function buildPatientList(count: number): PatientDemographics[] {
  return Array.from({ length: count }, () => buildPatient());
}

// ─── Known seed patients (for stable test references) ─────────────────────────

export const SEED_PATIENTS = {
  patient1: {
    email: 'patient1@helixhealthportal.test',
    mrn:   'MRN-TEST-00001',
    name:  'TEST_Patient One',
  },
  patient2: {
    email: 'patient2@helixhealthportal.test',
    mrn:   'MRN-TEST-00002',
    name:  'TEST_Patient Two',
  },
  patient3: {
    email: 'patient03@helixhealthportal.test',
    mrn:   'MRN-TEST-00003',
    name:  'TEST_Patient Three',
  },
} as const;
