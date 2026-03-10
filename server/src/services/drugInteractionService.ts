/**
 * drugInteractionService.ts
 *
 * Mocked drug-drug interaction checker.
 * Maintains a hardcoded list of 10 known interaction pairs.
 * Logs every check to drug_interactions_log and returns warnings to the caller.
 *
 * IMPORTANT: This is a teaching mock — it is NOT a real clinical decision tool.
 */

import { getDb } from '../db/database';

export interface InteractionWarning {
  drug_a: string;
  drug_b: string;
  severity: 'mild' | 'moderate' | 'severe';
  description: string;
}

/**
 * Hardcoded interaction pairs.
 * Names are normalised to lowercase for matching.
 */
const KNOWN_INTERACTIONS: Array<{
  a: string;
  b: string;
  severity: 'mild' | 'moderate' | 'severe';
  description: string;
}> = [
  {
    a: 'warfarin',
    b: 'aspirin',
    severity: 'severe',
    description: 'Concurrent use significantly increases risk of major bleeding. Monitor INR closely.',
  },
  {
    a: 'metformin',
    b: 'ibuprofen',
    severity: 'moderate',
    description: 'NSAIDs may reduce renal function and increase metformin accumulation, risking lactic acidosis.',
  },
  {
    a: 'lisinopril',
    b: 'potassium',
    severity: 'moderate',
    description: 'ACE inhibitors increase serum potassium; concurrent potassium supplementation risks hyperkalemia.',
  },
  {
    a: 'simvastatin',
    b: 'amlodipine',
    severity: 'moderate',
    description: 'Amlodipine inhibits CYP3A4 metabolism of simvastatin, increasing risk of myopathy.',
  },
  {
    a: 'ssri',
    b: 'tramadol',
    severity: 'severe',
    description: 'Combination increases risk of serotonin syndrome; avoid concurrent use.',
  },
  {
    a: 'fluoxetine',
    b: 'tramadol',
    severity: 'severe',
    description: 'Fluoxetine inhibits CYP2D6 metabolism of tramadol and increases serotonin syndrome risk.',
  },
  {
    a: 'clopidogrel',
    b: 'omeprazole',
    severity: 'moderate',
    description: 'Omeprazole inhibits CYP2C19, reducing clopidogrel activation and antiplatelet effect.',
  },
  {
    a: 'digoxin',
    b: 'amiodarone',
    severity: 'severe',
    description: 'Amiodarone increases digoxin levels; risk of digoxin toxicity. Reduce digoxin dose.',
  },
  {
    a: 'methotrexate',
    b: 'aspirin',
    severity: 'severe',
    description: 'Aspirin reduces renal methotrexate clearance, increasing toxicity risk.',
  },
  {
    a: 'lithium',
    b: 'ibuprofen',
    severity: 'moderate',
    description: 'NSAIDs reduce lithium renal clearance, increasing risk of lithium toxicity.',
  },
];

/**
 * Checks a new drug against a list of already-active drug names for interactions.
 * Logs each detected interaction to the database.
 *
 * @param newDrug      The drug name being added.
 * @param activeDrugs  Names of currently active medications for this patient.
 * @param patientId    Patient ID (for logging).
 * @param checkedBy    User ID of the prescriber (for logging).
 * @returns Array of interaction warnings (empty = no interactions found).
 */
export function checkDrugInteractions(
  newDrug: string,
  activeDrugs: string[],
  patientId: number,
  checkedBy: number,
): InteractionWarning[] {
  const db = getDb();
  const warnings: InteractionWarning[] = [];
  const newNorm = newDrug.toLowerCase().trim();

  for (const activeDrug of activeDrugs) {
    const activeNorm = activeDrug.toLowerCase().trim();

    for (const pair of KNOWN_INTERACTIONS) {
      const matches =
        (pair.a === newNorm && pair.b === activeNorm) ||
        (pair.b === newNorm && pair.a === activeNorm) ||
        // partial match — handle multi-word drug names
        (newNorm.includes(pair.a) && activeNorm.includes(pair.b)) ||
        (newNorm.includes(pair.b) && activeNorm.includes(pair.a));

      if (matches) {
        const warning: InteractionWarning = {
          drug_a: newDrug,
          drug_b: activeDrug,
          severity: pair.severity,
          description: pair.description,
        };
        warnings.push(warning);

        // Log to DB
        db.prepare(
          `INSERT INTO drug_interactions_log (patient_id, drug_a, drug_b, severity, description, checked_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(patientId, newDrug, activeDrug, pair.severity, pair.description, checkedBy);

        console.log(
          `[DRUG_INTERACTION] ${pair.severity.toUpperCase()} — ${newDrug} ↔ ${activeDrug}: ${pair.description}`,
        );
      }
    }
  }

  return warnings;
}
