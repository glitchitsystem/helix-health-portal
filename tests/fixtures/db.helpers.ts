/**
 * tests/fixtures/db.helpers.ts
 *
 * Database helpers for integration and unit test setup/teardown.
 * Uses better-sqlite3 directly (synchronous) — safe to call in beforeEach hooks.
 *
 * Assumes the test database path is set via TEST_DB_PATH env var,
 * defaulting to db/helix.test.db relative to the repo root.
 */

import path from 'path';
import fs   from 'fs';
import Database from 'better-sqlite3';
import type { CompletePatientRecord } from './patients.fixtures';

// ─── Paths ────────────────────────────────────────────────────────────────────

const ROOT        = path.resolve(__dirname, '..', '..');
const SCHEMA_PATH = path.join(ROOT, 'db', 'schema.sql');
const MIGS_DIR    = path.join(ROOT, 'db', 'migrations');
const TEST_DB     = process.env['TEST_DB_PATH'] ?? path.join(ROOT, 'db', 'helix.test.db');

// ─── Singleton connection ─────────────────────────────────────────────────────

let _testDb: Database.Database | null = null;

export function getTestDb(): Database.Database {
  if (!_testDb) {
    _testDb = new Database(TEST_DB);
    _testDb.pragma('journal_mode = WAL');
    _testDb.pragma('foreign_keys = ON');
  }
  return _testDb;
}

export function closeTestDb(): void {
  if (_testDb) {
    _testDb.close();
    _testDb = null;
  }
}

// ─── Schema application ───────────────────────────────────────────────────────

/**
 * Applies schema.sql + all migrations to the test DB (IF NOT EXISTS — idempotent).
 */
export function applySchema(): void {
  const db = getTestDb();
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf-8'));

  if (fs.existsSync(MIGS_DIR)) {
    const migFiles = fs.readdirSync(MIGS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();
    for (const mf of migFiles) {
      db.exec(fs.readFileSync(path.join(MIGS_DIR, mf), 'utf-8'));
    }
  }
}

// ─── Reset ────────────────────────────────────────────────────────────────────

/**
 * Drops and recreates all tables from schema.sql.
 * Call in beforeEach for isolated integration tests.
 *
 * WARNING: Deletes ALL data. Use only in test environments.
 */
export function resetTestDb(): void {
  const db = getTestDb();

  // Drop all tables in reverse dependency order
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
    .all() as Array<{ name: string }>;

  db.pragma('foreign_keys = OFF');
  for (const { name } of tables) {
    db.exec(`DROP TABLE IF EXISTS "${name}"`);
  }
  db.pragma('foreign_keys = ON');

  // Re-apply schema
  applySchema();
}

// ─── Minimal seed ─────────────────────────────────────────────────────────────

/**
 * Seeds just enough data to authenticate as each role.
 * Returns user IDs for use in tests.
 */
export function seedMinimalData(): {
  adminId: number;
  providerId: number;
  nurseId: number;
  billingId: number;
  patientId: number;
  patientDbId: number;
} {
  const db = getTestDb();

  // Synchronous bcrypt hash using known test value (precomputed for TestPass123!)
  // This avoids async bcrypt in sync test setup.
  // REGENERATE with: bcrypt.hashSync('TestPass123!', 12)
  const HASH = '$2b$12$tH4qgVbsbUXLm72ef/hZjOks4lNS0N2lz8DeT31ese4fmAh5hVsqC';

  const insertUser = db.prepare(
    `INSERT OR IGNORE INTO users (email, password_hash, email_verified, is_active)
     VALUES (?, ?, 1, 1) RETURNING id`,
  );
  const lookupUser = db.prepare('SELECT id FROM users WHERE email = ?');

  // Insert-or-lookup: RETURNING id is empty when the row already exists
  // (INSERT OR IGNORE skips the insert), so fall back to a SELECT.
  const upsertUser = (email: string): { id: number } =>
    (insertUser.get(email, HASH) ?? lookupUser.get(email)) as { id: number };

  const insertRole = (userId: number, roleName: string) => {
    const role = db.prepare('SELECT id FROM roles WHERE name = ?').get(roleName) as { id: number } | undefined;
    if (role) {
      db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, role.id);
    }
  };

  // Seed roles (idempotent)
  const rolesData = [
    [1, 'admin',    'Full system access'],
    [2, 'provider', 'Physician / clinician'],
    [3, 'nurse',    'Nursing staff'],
    [4, 'billing',  'Billing and accounts team'],
    [5, 'patient',  'Registered patient'],
  ];
  const insertRole_ = db.prepare(
    `INSERT OR IGNORE INTO roles (id, name, description) VALUES (?, ?, ?)`,
  );
  for (const [id, name, description] of rolesData) {
    insertRole_.run(id, name, description);
  }

  const adminResult    = upsertUser('admin@helixhealthportal.test');
  const providerResult = upsertUser('provider@helixhealthportal.test');
  const nurseResult    = upsertUser('nurse@helixhealthportal.test');
  const billingResult  = upsertUser('billing@helixhealthportal.test');
  const patientResult  = upsertUser('patient1@helixhealthportal.test');
  const patient2Result = upsertUser('patient2@helixhealthportal.test');

  insertRole(adminResult.id,    'admin');
  insertRole(providerResult.id, 'provider');
  insertRole(nurseResult.id,    'nurse');
  insertRole(billingResult.id,  'billing');
  insertRole(patientResult.id,  'patient');
  insertRole(patient2Result.id, 'patient');

  // Provider record
  db.prepare(
    `INSERT OR IGNORE INTO providers (user_id, npi, license_number)
     VALUES (?, '0000000001', 'LIC-TEST-PROVIDER-001')`,
  ).run(providerResult.id);

  // Patient 1 record
  const patRow = db.prepare(
    `INSERT OR IGNORE INTO patients (user_id, mrn)
     VALUES (?, 'MRN-TEST-00001') RETURNING id`,
  ).get(patientResult.id) as { id: number } | undefined;

  const patientDbId = patRow?.id ??
    (db.prepare('SELECT id FROM patients WHERE user_id = ?').get(patientResult.id) as { id: number }).id;

  db.prepare(
    `INSERT INTO patient_demographics (patient_id, first_name, last_name)
     VALUES (?, 'TEST_Patient', 'One')
     ON CONFLICT(patient_id) DO NOTHING`,
  ).run(patientDbId);

  // Patient 2 record
  const pat2Row = db.prepare(
    `INSERT OR IGNORE INTO patients (user_id, mrn)
     VALUES (?, 'MRN-TEST-00002') RETURNING id`,
  ).get(patient2Result.id) as { id: number } | undefined;

  const patient2DbId = pat2Row?.id ??
    (db.prepare('SELECT id FROM patients WHERE user_id = ?').get(patient2Result.id) as { id: number }).id;

  db.prepare(
    `INSERT INTO patient_demographics (patient_id, first_name, last_name)
     VALUES (?, 'TEST_Patient', 'Two')
     ON CONFLICT(patient_id) DO NOTHING`,
  ).run(patient2DbId);

  // Appointment type (required for appointment inserts in tests)
  db.prepare(
    `INSERT OR IGNORE INTO appointment_types (id, name, duration_minutes, is_active)
     VALUES (1, 'General Consultation', 30, 1)`,
  ).run();

  // Reset lockout state so failed attempts from previous runs don't block logins
  db.prepare(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL
     WHERE email LIKE '%helixhealthportal.test'`,
  ).run();

  return {
    adminId:     adminResult.id,
    providerId:  providerResult.id,
    nurseId:     nurseResult.id,
    billingId:   billingResult.id,
    patientId:   patientResult.id,
    patientDbId,
  };
}

// ─── Mock factory ─────────────────────────────────────────────────────────────

export function buildMockDb(overrides?: {
  runResult?: unknown;
  getAllResult?: unknown[];
  getResult?: unknown;
}) {
  const mockRun = jest
    .fn()
    .mockReturnValue(overrides?.runResult ?? { changes: 1 });
  const mockAll = jest.fn().mockReturnValue(overrides?.getAllResult ?? []);
  const mockGet = jest.fn().mockReturnValue(overrides?.getResult ?? undefined);

  return {
    prepare: jest.fn().mockReturnValue({
      run: mockRun,
      all: mockAll,
      get: mockGet,
    }),
    _mocks: { run: mockRun, all: mockAll, get: mockGet },
  };
}

// ─── Query helpers ────────────────────────────────────────────────────────────

/**
 * Returns the patients.id for a given user email.
 */
export function getTestPatientId(email: string): number {
  const db = getTestDb();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
  if (!user) throw new Error(`No user found with email: ${email}`);
  const patient = db.prepare('SELECT id FROM patients WHERE user_id = ?').get(user.id) as { id: number } | undefined;
  if (!patient) throw new Error(`No patient record for user: ${email}`);
  return patient.id;
}

/**
 * Returns the providers.id for a given user email.
 */
export function getTestProviderId(email: string): number {
  const db = getTestDb();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
  if (!user) throw new Error(`No user found with email: ${email}`);
  const provider = db.prepare('SELECT id FROM providers WHERE user_id = ?').get(user.id) as { id: number } | undefined;
  if (!provider) throw new Error(`No provider record for user: ${email}`);
  return provider.id;
}

/**
 * Returns all rows from a table (useful for assertions).
 */
export function getAllRows<T = Record<string, unknown>>(table: string): T[] {
  const db = getTestDb();
  return db.prepare(`SELECT * FROM "${table}"`).all() as T[];
}

/**
 * Counts rows in a table matching optional WHERE clause.
 */
export function countRows(table: string, where?: string, params?: unknown[]): number {
  const db = getTestDb();
  const sql = `SELECT COUNT(*) as n FROM "${table}"${where ? ` WHERE ${where}` : ''}`;
  const row = db.prepare(sql).get(...(params ?? [])) as { n: number };
  return row.n;
}

// ─── Complete patient scenario ────────────────────────────────────────────────

/**
 * Seeds a fully-populated patient scenario: user, role assignment, patient record,
 * demographics, insurance plan, and appointment. Idempotent on email/MRN collisions.
 */
export function seedCompletePatientScenario(
  record: CompletePatientRecord,
  providerDbId: number,
  appointmentTypeId: number,
): {
  userDbId: number;
  patientDbId: number;
  insuranceId: number;
  appointmentId: number;
} {
  const db = getTestDb();
  const HASH = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGGaFS3QB1RwzP7nPxKhO7hLe9W';

  // Step A — create user row
  db.prepare(
    `INSERT OR IGNORE INTO users (email, password_hash, email_verified, is_active)
     VALUES (?, ?, 1, 1)`,
  ).run(record.demographics.email, HASH);

  // Step B — get user id
  const userRow = db.prepare('SELECT id FROM users WHERE email = ?').get(record.demographics.email) as Record<string, unknown>;
  const userDbId = userRow['id'] as number;

  // Step C — assign patient role
  const roleRow = db.prepare('SELECT id FROM roles WHERE name = ?').get('patient') as Record<string, unknown> | undefined;
  if (roleRow) {
    db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userDbId, roleRow['id'] as number);
  }

  // Step D — create patients row
  db.prepare('INSERT OR IGNORE INTO patients (user_id, mrn) VALUES (?, ?)').run(userDbId, record.demographics.mrn);
  const patientRow = db.prepare('SELECT id FROM patients WHERE user_id = ?').get(userDbId) as Record<string, unknown>;
  const patientDbId = patientRow['id'] as number;

  // Step E — create patient_demographics row
  db.prepare(
    `INSERT INTO patient_demographics (
       patient_id, first_name, last_name, dob, gender,
       phone, address_line1, city, state, zip
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(patient_id) DO NOTHING`,
  ).run(
    patientDbId,
    record.demographics.firstName,
    record.demographics.lastName,
    record.demographics.dob,
    record.demographics.gender,
    record.demographics.phone,
    record.demographics.addressLine1,
    record.demographics.city,
    record.demographics.state,
    record.demographics.zip,
  );

  // Step F — create insurance_plans row
  const insuranceResult = db.prepare(
    `INSERT INTO insurance_plans (
       patient_id, insurer_name, plan_name, member_id, group_number,
       effective_date, expiration_date, is_primary,
       copay_amount, deductible_amount, deductible_met
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    patientDbId,
    record.insurance.insurer_name,
    record.insurance.plan_name,
    record.insurance.member_id,
    record.insurance.group_number,
    record.insurance.effective_date,
    record.insurance.expiration_date,
    record.insurance.is_primary ? 1 : 0,
    record.insurance.copay_amount,
    record.insurance.deductible_amount,
    record.insurance.deductible_met ? 1 : 0,
  );
  const insuranceId = Number(insuranceResult.lastInsertRowid);

  // Step G — create appointments row
  const appointmentResult = db.prepare(
    `INSERT INTO appointments (
       patient_id, provider_id, appointment_type_id,
       scheduled_at, status, location, notes, duration_minutes
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 30)`,
  ).run(
    patientDbId,
    providerDbId,
    appointmentTypeId,
    record.appointment.scheduledAt,
    record.appointment.status,
    record.appointment.location ?? null,
    record.appointment.notes ?? null,
  );
  const appointmentId = Number(appointmentResult.lastInsertRowid);

  return { userDbId, patientDbId, insuranceId, appointmentId };
}

/**
 * Deletes all records created by seedCompletePatientScenario in FK-safe order.
 */
export function cleanupCompletePatientScenario(ids: {
  userDbId: number;
  patientDbId: number;
  insuranceId: number;
  appointmentId: number;
}): void {
  const db = getTestDb();
  db.prepare('DELETE FROM appointment_reminders WHERE appointment_id = ?').run(ids.appointmentId);
  db.prepare('DELETE FROM appointments           WHERE id = ?').run(ids.appointmentId);
  db.prepare('DELETE FROM insurance_plans        WHERE id = ?').run(ids.insuranceId);
  db.prepare('DELETE FROM patient_demographics   WHERE patient_id = ?').run(ids.patientDbId);
  db.prepare('DELETE FROM patients               WHERE id = ?').run(ids.patientDbId);
  db.prepare('DELETE FROM user_roles             WHERE user_id = ?').run(ids.userDbId);
  db.prepare('DELETE FROM users                  WHERE id = ?').run(ids.userDbId);
}

// ─── Prescription + refill request factory ───────────────────────────────────

export function createTestPrescriptionWithRefillRequest(
  patientId: number,
  providerId: number,
  overrides?: Partial<{ drug_name: string; dosage: string; status: string }>,
): { prescriptionId: number; refillRequestId: number } {
  const db = getTestDb();

  const drug_name = overrides?.drug_name ?? 'TEST_Metformin';
  const dosage    = overrides?.dosage    ?? '500mg';
  const status    = overrides?.status    ?? 'active';

  const today = new Date().toISOString().slice(0, 10);

  const rx = db.prepare(
    `INSERT INTO prescriptions
       (patient_id, prescriber_id, drug_name, dosage, frequency,
        start_date, status, refills_remaining)
     VALUES (?, ?, ?, ?, 'twice daily', ?, ?, 1)
     RETURNING id`,
  ).get(patientId, providerId, drug_name, dosage, today, status) as { id: number };

  const refill = db.prepare(
    `INSERT INTO prescription_refill_requests
       (prescription_id, patient_id, requested_at, status)
     VALUES (?, ?, datetime('now'), 'pending')
     RETURNING id`,
  ).get(rx.id, patientId) as { id: number };

  return { prescriptionId: rx.id, refillRequestId: refill.id };
}
