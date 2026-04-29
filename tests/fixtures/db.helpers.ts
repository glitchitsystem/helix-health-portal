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
