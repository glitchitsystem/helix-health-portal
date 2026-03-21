/**
 * Prescription dosage validation service.
 * Contains business rules for validating prescription dosages before they
 * are written to the database.
 *
 * TESTABILITY: All functions are pure — no side effects, no DB access.
 * Students write unit tests against these functions in Section 10.
 */

/**
 * Known maximum daily doses (mg) by drug name (lowercase).
 * This list is intentionally limited for course use.
 */
export const MAX_DAILY_DOSES_MG: Record<string, number> = {
  metformin:    2550,
  lisinopril:     40,
  atorvastatin:   80,
  amlodipine:     10,
  omeprazole:     40,
  levothyroxine: 300,
  warfarin:       15,
  aspirin:      4000,
  ibuprofen:    3200,
  acetaminophen: 4000,
};

/**
 * Maps plain-English frequency strings to doses-per-day.
 */
export const FREQUENCY_TO_DAILY: Record<string, number> = {
  'once daily':   1,
  'qd':           1,
  'twice daily':  2,
  'bid':          2,
  'three times daily': 3,
  'tid':          3,
  'four times daily':  4,
  'qid':          4,
  'every 6 hours':     4,
  'every 8 hours':     3,
  'every 12 hours':    2,
};

/**
 * Result of a dosage validation check.
 */
export interface DosageValidationResult {
  valid: boolean;
  dailyDoseMg?: number;
  maxDailyMg?: number;
  error?: string;
}

/**
 * Parses a dosage string such as "500mg" or "10 mg" into a numeric milligram value.
 *
 * @param dosage - Free-text dosage string from the prescription form.
 * @returns The numeric dose in mg, or null if unparseable.
 */
export function parseDosageMg(dosage: string): number | null {
  const match = dosage.toLowerCase().match(/^([\d.]+)\s*mg/);
  if (!match) return null;
  const parsed = parseFloat(match[1]);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Resolves the number of doses per day from a frequency string.
 *
 * @param frequency - Frequency label (e.g. "twice daily", "bid").
 * @returns Doses per day, or null if frequency is unrecognised.
 */
export function resolveFrequencyPerDay(frequency: string): number | null {
  return FREQUENCY_TO_DAILY[frequency.toLowerCase().trim()] ?? null;
}

/**
 * Validates that a prescription's dosage does not exceed the known maximum
 * daily dose for the given drug.
 *
 * @param drugName   - Normalised (lowercase) drug name.
 * @param dosage     - Dosage string (e.g. "500mg").
 * @param frequency  - Frequency string (e.g. "twice daily").
 * @returns Validation result with details.
 *
 * @example
 * validatePrescriptionDosage('metformin', '1000mg', 'twice daily');
 * // → { valid: false, dailyDoseMg: 2000, maxDailyMg: 2550 }
 * // Note: 2000 < 2550 so this is actually valid.
 *
 * validatePrescriptionDosage('metformin', '1275mg', 'twice daily');
 * // → boundary case: 2550mg == maxDailyMg —— COURSE_BUG: passes when it should fail.
 */
export function validatePrescriptionDosage(
  drugName: string,
  dosage: string,
  frequency: string,
): DosageValidationResult {
  const drugKey = drugName.toLowerCase().trim();
  const maxDailyMg = MAX_DAILY_DOSES_MG[drugKey];

  // Drug not in our known list — skip validation
  if (maxDailyMg === undefined) {
    return { valid: true };
  }

  const doseMg = parseDosageMg(dosage);
  if (doseMg === null) {
    // Cannot parse dosage — skip numeric validation, warn in notes
    return { valid: true };
  }

  const perDay = resolveFrequencyPerDay(frequency);
  if (perDay === null) {
    // Unknown frequency — skip numeric validation
    return { valid: true };
  }

  const dailyDoseMg = doseMg * perDay;

  // COURSE_BUG [Section 10 - Unit]: Uses > instead of >=.
  // A prescription at exactly the maximum daily dose boundary (e.g. metformin 1275mg BID = 2550mg/day)
  // incorrectly passes validation because 2550 > 2550 is false.
  // Fix: change > to >=
  if (dailyDoseMg > maxDailyMg) {
    return {
      valid: false,
      dailyDoseMg,
      maxDailyMg,
      error: `Computed daily dose ${dailyDoseMg}mg exceeds the maximum allowed ${maxDailyMg}mg/day for ${drugKey}.`,
    };
  }

  return { valid: true, dailyDoseMg, maxDailyMg };
}

/**
 * Controlled substance schedule classification.
 * Schedule II = highest abuse potential with accepted medical use.
 * Schedule III–IV = lower potential. Schedule V = lowest.
 * Unscheduled = not a controlled substance.
 */
export type ControlledSchedule = 'II' | 'III' | 'IV' | 'V' | 'unscheduled';

/**
 * Known controlled substance schedules by drug name (lowercase).
 * Source: DEA Schedule of Controlled Substances (teaching subset only).
 */
export const CONTROLLED_SUBSTANCE_SCHEDULES: Record<string, ControlledSchedule> = {
  // Schedule II — highest medical use, high abuse potential
  oxycodone:        'II',
  hydrocodone:      'II',
  fentanyl:         'II',
  adderall:         'II',
  methylphenidate:  'II',
  morphine:         'II',
  methadone:        'II',

  // Schedule III
  codeine:          'III',
  ketamine:         'III',
  buprenorphine:    'III',

  // Schedule IV
  alprazolam:       'IV',
  diazepam:         'IV',
  clonazepam:       'IV',
  lorazepam:        'IV',
  zolpidem:         'IV',
  tramadol:         'IV',

  // Schedule V
  pregabalin:       'V',
  gabapentin:       'V',
};

/**
 * Returns the DEA controlled substance schedule for a drug, or 'unscheduled'
 * if the drug is not a controlled substance (or not in our teaching list).
 *
 * @param drugName - Drug name (case-insensitive, trimmed).
 * @returns The schedule string, or 'unscheduled'.
 */
export function getControlledSchedule(drugName: string): ControlledSchedule {
  const key = drugName.toLowerCase().trim();
  return CONTROLLED_SUBSTANCE_SCHEDULES[key] ?? 'unscheduled';
}

/**
 * Returns true if the drug is a federally controlled substance (any schedule II–V).
 *
 * @param drugName - Drug name (case-insensitive, trimmed).
 * @returns true if controlled, false if unscheduled.
 */
export function isControlledSubstance(drugName: string): boolean {
  return getControlledSchedule(drugName) !== 'unscheduled';
}

/**
 * Returns true if the drug requires additional prescriber authorisation
 * (Schedule II drugs require a separate DEA Form 222 and cannot be
 * phoned in or e-faxed in most US states).
 *
 * @param drugName - Drug name (case-insensitive, trimmed).
 * @returns true if Schedule II, false otherwise.
 */
export function requiresScheduleIIAuthorisation(drugName: string): boolean {
  return getControlledSchedule(drugName) === 'II';
}
