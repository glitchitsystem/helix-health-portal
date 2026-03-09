/**
 * db/seed.ts — Seed the Helix Health Portal database with test data.
 *
 * Run via:  npm run seed        (from the repo root)
 *           npm run db:reset    (drops and re-seeds)
 *
 * All accounts use password: TestPass123!
 * All names are prefixed TEST_ to indicate synthetic data.
 */

import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';

// ─── Paths ────────────────────────────────────────────────────────────────────

const DB_PATH     = path.resolve(__dirname, 'helix.db');
const SCHEMA_PATH = path.resolve(__dirname, 'schema.sql');

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PASSWORD = 'TestPass123!';
const BCRYPT_ROUNDS    = 12;

// ─── Bootstrap DB ─────────────────────────────────────────────────────────────

console.log('🌱  Helix Health Portal — Seeding database…');
console.log(`    DB path: ${DB_PATH}`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply schema (idempotent)
const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
db.exec(schema);

// ─── Helper: upsert a user and return their id ────────────────────────────────

async function upsertUser(
  email: string,
  roleNames: string[],
  emailVerified = true,
): Promise<number> {
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as
    | { id: number }
    | undefined;

  if (existing) {
    db.prepare(
      `UPDATE users
       SET password_hash = ?, email_verified = ?, is_active = 1, failed_login_attempts = 0, locked_until = NULL
       WHERE id = ?`,
    ).run(hash, emailVerified ? 1 : 0, existing.id);
    return existing.id;
  }

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO users (email, password_hash, email_verified, is_active)
       VALUES (?, ?, ?, 1)`,
    )
    .run(email.toLowerCase(), hash, emailVerified ? 1 : 0);

  return Number(lastInsertRowid);
}

function assignRoles(userId: number, roleNames: string[]): void {
  for (const name of roleNames) {
    const role = db.prepare('SELECT id FROM roles WHERE name = ?').get(name) as
      | { id: number }
      | undefined;
    if (!role) {
      console.warn(`  ⚠️  Role '${name}' not found — skipping`);
      continue;
    }
    db.prepare(
      'INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
    ).run(userId, role.id);
  }
}

function createPatient(userId: number, mrn: string, firstName: string, lastName: string): void {
  const existing = db.prepare('SELECT id FROM patients WHERE user_id = ?').get(userId) as
    | { id: number }
    | undefined;

  let patientId: number;
  if (existing) {
    db.prepare('UPDATE patients SET mrn = ? WHERE id = ?').run(mrn, existing.id);
    patientId = existing.id;
  } else {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO patients (user_id, mrn) VALUES (?, ?)')
      .run(userId, mrn);
    patientId = Number(lastInsertRowid);
  }

  db.prepare(
    `INSERT INTO patient_demographics (patient_id, first_name, last_name)
     VALUES (?, ?, ?)
     ON CONFLICT(patient_id) DO UPDATE SET first_name = excluded.first_name, last_name = excluded.last_name`,
  ).run(patientId, firstName, lastName);
}

function createProvider(userId: number, npi: string, licenseNumber: string): void {
  const specialtyId = (
    db.prepare("SELECT id FROM provider_specialties WHERE name = 'General Practice'").get() as
      | { id: number }
      | undefined
  )?.id ?? null;

  db.prepare(
    `INSERT INTO providers (user_id, npi, specialty_id, license_number)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE
       SET npi = excluded.npi, specialty_id = excluded.specialty_id,
           license_number = excluded.license_number`,
  ).run(userId, npi, specialtyId, licenseNumber);
}

// ─── Seed: Roles ─────────────────────────────────────────────────────────────

console.log('\n  Seeding roles…');

const roles: Array<{ name: string; description: string }> = [
  { name: 'admin',    description: 'Full system access' },
  { name: 'provider', description: 'Physician / clinician' },
  { name: 'nurse',    description: 'Nursing staff' },
  { name: 'billing',  description: 'Billing and accounts team' },
  { name: 'patient',  description: 'Registered patient' },
];

for (const role of roles) {
  db.prepare(
    `INSERT INTO roles (name, description)
     VALUES (?, ?)
     ON CONFLICT(name) DO UPDATE SET description = excluded.description`,
  ).run(role.name, role.description);
  console.log(`    ✔  Role: ${role.name}`);
}

// ─── Seed: Permissions ────────────────────────────────────────────────────────

console.log('\n  Seeding permissions…');

type PermEntry = { resource: string; action: string; description: string };

const permissions: PermEntry[] = [
  { resource: 'patients',     action: 'read',   description: 'Read patient records' },
  { resource: 'patients',     action: 'write',  description: 'Create/update patient records' },
  { resource: 'patients',     action: 'delete', description: 'Delete patient records' },
  { resource: 'appointments', action: 'read',   description: 'Read appointments' },
  { resource: 'appointments', action: 'write',  description: 'Create/update appointments' },
  { resource: 'lab_results',  action: 'read',   description: 'Read lab results' },
  { resource: 'lab_results',  action: 'write',  description: 'Create/update lab results' },
  { resource: 'billing',      action: 'read',   description: 'Read billing records' },
  { resource: 'billing',      action: 'write',  description: 'Create/update billing records' },
  { resource: 'messages',     action: 'read',   description: 'Read secure messages' },
  { resource: 'messages',     action: 'write',  description: 'Send secure messages' },
  { resource: 'users',        action: 'admin',  description: 'Administer user accounts' },
  { resource: 'audit_log',    action: 'read',   description: 'Read audit logs' },
];

for (const perm of permissions) {
  db.prepare(
    `INSERT INTO permissions (resource, action, description)
     VALUES (?, ?, ?)
     ON CONFLICT(resource, action) DO UPDATE SET description = excluded.description`,
  ).run(perm.resource, perm.action, perm.description);
}
console.log(`    ✔  ${permissions.length} permissions`);

// ─── Seed: Role → Permission mappings ────────────────────────────────────────

console.log('\n  Seeding role permissions…');

/** Map role name → [resource, action] pairs */
const rolePermissions: Record<string, Array<[string, string]>> = {
  admin: permissions.map((p) => [p.resource, p.action]), // all
  provider: [
    ['patients',     'read'],
    ['patients',     'write'],
    ['appointments', 'read'],
    ['appointments', 'write'],
    ['lab_results',  'read'],
    ['lab_results',  'write'],
    ['messages',     'read'],
    ['messages',     'write'],
  ],
  nurse: [
    ['patients',     'read'],
    ['patients',     'write'],
    ['appointments', 'read'],
    ['appointments', 'write'],
    ['lab_results',  'read'],
    ['messages',     'read'],
    ['messages',     'write'],
  ],
  billing: [
    ['patients',  'read'],
    ['billing',   'read'],
    ['billing',   'write'],
    ['messages',  'read'],
    ['messages',  'write'],
  ],
  patient: [
    ['appointments', 'read'],
    ['lab_results',  'read'],
    ['billing',      'read'],
    ['messages',     'read'],
    ['messages',     'write'],
  ],
};

for (const [roleName, perms] of Object.entries(rolePermissions)) {
  const role = db.prepare('SELECT id FROM roles WHERE name = ?').get(roleName) as
    | { id: number }
    | undefined;
  if (!role) continue;

  for (const [resource, action] of perms) {
    const perm = db
      .prepare('SELECT id FROM permissions WHERE resource = ? AND action = ?')
      .get(resource, action) as { id: number } | undefined;
    if (!perm) continue;

    db.prepare(
      'INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
    ).run(role.id, perm.id);
  }
  console.log(`    ✔  ${roleName} (${perms.length} permissions)`);
}

// ─── Seed: Provider Specialties ───────────────────────────────────────────────

console.log('\n  Seeding provider specialties…');

const specialties = [
  'General Practice',
  'Cardiology',
  'Dermatology',
  'Endocrinology',
  'Gastroenterology',
  'Neurology',
  'Obstetrics & Gynecology',
  'Oncology',
  'Orthopedics',
  'Pediatrics',
  'Psychiatry',
  'Pulmonology',
  'Radiology',
  'Urology',
];

for (const name of specialties) {
  db.prepare(
    `INSERT INTO provider_specialties (name) VALUES (?)
     ON CONFLICT(name) DO NOTHING`,
  ).run(name);
}
console.log(`    ✔  ${specialties.length} specialties`);

// ─── Seed: Test Accounts ──────────────────────────────────────────────────────

console.log('\n  Seeding test accounts (password: TestPass123!)…\n');

const seedAccounts = async () => {
  // 1. Admin
  {
    const userId = await upsertUser('admin@helixhealthportal.test', ['admin']);
    assignRoles(userId, ['admin']);
    console.log(`    ✔  admin@helixhealthportal.test  [admin]  (id: ${userId})`);
  }

  // 2. Provider — Dr. TEST Provider
  {
    const userId = await upsertUser('provider@helixhealthportal.test', ['provider']);
    assignRoles(userId, ['provider']);
    createProvider(userId, '0000000001', 'LIC-TEST-PROVIDER-001');
    console.log(`    ✔  provider@helixhealthportal.test  [provider, NPI: 0000000001]  (id: ${userId})`);
  }

  // 3. Nurse
  {
    const userId = await upsertUser('nurse@helixhealthportal.test', ['nurse']);
    assignRoles(userId, ['nurse']);
    console.log(`    ✔  nurse@helixhealthportal.test  [nurse]  (id: ${userId})`);
  }

  // 4. Billing
  {
    const userId = await upsertUser('billing@helixhealthportal.test', ['billing']);
    assignRoles(userId, ['billing']);
    console.log(`    ✔  billing@helixhealthportal.test  [billing]  (id: ${userId})`);
  }

  // 5. Patient 1 — TEST Patient One
  {
    const userId = await upsertUser('patient1@helixhealthportal.test', ['patient']);
    assignRoles(userId, ['patient']);
    createPatient(userId, 'MRN-TEST-00001', 'TEST_Patient', 'One');
    console.log(`    ✔  patient1@helixhealthportal.test  [patient, MRN: MRN-TEST-00001]  (id: ${userId})`);
  }

  // 6. Patient 2 — TEST Patient Two
  {
    const userId = await upsertUser('patient2@helixhealthportal.test', ['patient']);
    assignRoles(userId, ['patient']);
    createPatient(userId, 'MRN-TEST-00002', 'TEST_Patient', 'Two');
    console.log(`    ✔  patient2@helixhealthportal.test  [patient, MRN: MRN-TEST-00002]  (id: ${userId})`);
  }
};

// ─── Run ─────────────────────────────────────────────────────────────────────

seedAccounts()
  .then(() => {
    console.log('\n✅  Seed complete!\n');
    db.close();
  })
  .catch((err) => {
    console.error('\n❌  Seed failed:', err);
    db.close();
    process.exit(1);
  });
