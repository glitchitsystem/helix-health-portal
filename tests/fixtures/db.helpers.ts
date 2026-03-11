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
  const HASH = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGGaFS3QB1RwzP7nPxKhO7hLe9W';

  const insertUser = db.prepare(
    `INSERT OR IGNORE INTO users (email, password_hash, email_verified, is_active)
     VALUES (?, ?, 1, 1) RETURNING id`,
  );

  const insertRole = (userId: number, roleName: string) => {
    const role = db.prepare('SELECT id FROM roles WHERE name = ?').get(roleName) as { id: number } | undefined;
    if (role) {
      db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, role.id);
    }
  };

  const adminResult    = insertUser.get('admin@helixhealthportal.test', HASH)    as { id: number };
  const providerResult = insertUser.get('provider@helixhealthportal.test', HASH) as { id: number };
  const nurseResult    = insertUser.get('nurse@helixhealthportal.test', HASH)    as { id: number };
  const billingResult  = insertUser.get('billing@helixhealthportal.test', HASH)  as { id: number };
  const patientResult  = insertUser.get('patient1@helixhealthportal.test', HASH) as { id: number };

  insertRole(adminResult.id,    'admin');
  insertRole(providerResult.id, 'provider');
  insertRole(nurseResult.id,    'nurse');
  insertRole(billingResult.id,  'billing');
  insertRole(patientResult.id,  'patient');

  // Provider record
  db.prepare(
    `INSERT OR IGNORE INTO providers (user_id, npi, license_number)
     VALUES (?, '0000000001', 'LIC-TEST-PROVIDER-001')`,
  ).run(providerResult.id);

  // Patient record
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
