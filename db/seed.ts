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

// Apply any migrations in db/migrations/ (idempotent — all use IF NOT EXISTS)
const migsDir = path.resolve(__dirname, 'migrations');
if (fs.existsSync(migsDir)) {
  const migFiles = fs.readdirSync(migsDir).filter(f => f.endsWith('.sql')).sort();
  for (const mf of migFiles) {
    db.exec(fs.readFileSync(path.join(migsDir, mf), 'utf-8'));
  }
}

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
  .then(() => seedPhase2())
  .then(() => {
    console.log('\n✅  Seed complete!\n');
    db.close();
  })
  .catch((err) => {
    console.error('\n❌  Seed failed:', err);
    db.close();
    process.exit(1);
  });

// ─── Phase 2: Clinical Seed Data ─────────────────────────────────────────────

function seedPhase2(): void {
  console.log('\n  Seeding Phase 2 clinical data…');

  // ── Helper: look up IDs ──────────────────────────────────────────────────
  function userId(email: string): number {
    return (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number }).id;
  }
  function patientId(email: string): number {
    const uid = userId(email);
    return (db.prepare('SELECT id FROM patients WHERE user_id = ?').get(uid) as { id: number }).id;
  }
  function providerId(email: string): number {
    const uid = userId(email);
    return (db.prepare('SELECT id FROM providers WHERE user_id = ?').get(uid) as { id: number }).id;
  }

  const pid1 = patientId('patient1@helixhealthportal.test');
  const pid2 = patientId('patient2@helixhealthportal.test');
  const prov = providerId('provider@helixhealthportal.test');          // providers.id
  const provUserId = userId('provider@helixhealthportal.test');        // users.id

  // ── Appointment Types ───────────────────────────────────────────────────
  console.log('\n    Seeding appointment types…');
  const apptTypes: Array<{ name: string; duration: number; color: string; telehealth: number }> = [
    { name: 'Annual Physical',     duration: 60, color: '#22c55e', telehealth: 0 },
    { name: 'Follow-up',           duration: 30, color: '#6366f1', telehealth: 0 },
    { name: 'Telehealth Consult',  duration: 30, color: '#3b82f6', telehealth: 1 },
    { name: 'Urgent Care',         duration: 45, color: '#ef4444', telehealth: 0 },
  ];
  for (const t of apptTypes) {
    db.prepare(`
      INSERT INTO appointment_types (name, duration_minutes, color_hex, is_telehealth)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE
        SET duration_minutes = excluded.duration_minutes,
            color_hex = excluded.color_hex,
            is_telehealth = excluded.is_telehealth
    `).run(t.name, t.duration, t.color, t.telehealth);
  }
  const typeId = (name: string) =>
    (db.prepare('SELECT id FROM appointment_types WHERE name = ?').get(name) as { id: number }).id;
  console.log(`      ✔  ${apptTypes.length} appointment types`);

  // ── Appointments ────────────────────────────────────────────────────────
  console.log('\n    Seeding appointments…');
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400_000).toISOString();
  const daysAhead = (n: number) => new Date(now.getTime() + n * 86400_000).toISOString();

  const appointments: Array<{
    patient_id: number; provider_id: number; type: string;
    scheduled_at: string; status: string; location?: string;
  }> = [
    // Patient 1 — past appointments
    { patient_id: pid1, provider_id: prov, type: 'Annual Physical',    scheduled_at: daysAgo(90),  status: 'completed', location: 'Room 101' },
    { patient_id: pid1, provider_id: prov, type: 'Follow-up',          scheduled_at: daysAgo(60),  status: 'completed', location: 'Room 101' },
    { patient_id: pid1, provider_id: prov, type: 'Telehealth Consult', scheduled_at: daysAgo(30),  status: 'completed' },
    { patient_id: pid1, provider_id: prov, type: 'Urgent Care',        scheduled_at: daysAgo(14),  status: 'cancelled', location: 'Room 102' },
    // Patient 1 — upcoming
    { patient_id: pid1, provider_id: prov, type: 'Follow-up',          scheduled_at: daysAhead(7), status: 'scheduled', location: 'Room 101' },
    // Patient 2 — past appointments
    { patient_id: pid2, provider_id: prov, type: 'Annual Physical',    scheduled_at: daysAgo(75),  status: 'completed', location: 'Room 103' },
    { patient_id: pid2, provider_id: prov, type: 'Follow-up',          scheduled_at: daysAgo(45),  status: 'completed', location: 'Room 103' },
    { patient_id: pid2, provider_id: prov, type: 'Telehealth Consult', scheduled_at: daysAgo(20),  status: 'no_show' },
    // Patient 2 — upcoming
    { patient_id: pid2, provider_id: prov, type: 'Telehealth Consult', scheduled_at: daysAhead(3), status: 'confirmed' },
    { patient_id: pid2, provider_id: prov, type: 'Annual Physical',    scheduled_at: daysAhead(14), status: 'scheduled', location: 'Room 103' },
  ];

  const apptIds: number[] = [];
  for (const a of appointments) {
    const atId = typeId(a.type);
    const existing = db.prepare(
      'SELECT id FROM appointments WHERE patient_id = ? AND provider_id = ? AND scheduled_at = ?'
    ).get(a.patient_id, a.provider_id, a.scheduled_at) as { id: number } | undefined;

    if (existing) {
      apptIds.push(existing.id);
    } else {
      const { lastInsertRowid } = db.prepare(`
        INSERT INTO appointments
          (patient_id, provider_id, appointment_type_id, scheduled_at, duration_minutes, status, location)
        VALUES (?, ?, ?, ?, (SELECT duration_minutes FROM appointment_types WHERE id = ?), ?, ?)
      `).run(a.patient_id, a.provider_id, atId, a.scheduled_at, atId, a.status, a.location ?? null);
      apptIds.push(Number(lastInsertRowid));
    }
  }
  console.log(`      ✔  ${appointments.length} appointments`);

  // ── Per-patient clinical data ────────────────────────────────────────────
  for (const [patEmail, pid] of [
    ['patient1@helixhealthportal.test', pid1],
    ['patient2@helixhealthportal.test', pid2],
  ] as Array<[string, number]>) {
    console.log(`\n    Seeding clinical data for ${patEmail}…`);

    // Diagnoses
    const diagnoses = [
      { icd10_code: 'E11.9', icd10_description: 'Type 2 Diabetes Mellitus without complications', status: 'active', severity: 'moderate', onset_date: '2020-03-15' },
      { icd10_code: 'I10',   icd10_description: 'Essential (Primary) Hypertension',                status: 'active', severity: 'mild',     onset_date: '2019-07-01' },
      { icd10_code: 'E78.5', icd10_description: 'Hyperlipidemia, Unspecified',                     status: 'active', severity: 'mild',     onset_date: '2021-01-10' },
    ];
    for (const d of diagnoses) {
      const ex = db.prepare('SELECT id FROM diagnoses WHERE patient_id = ? AND icd10_code = ?').get(pid, d.icd10_code);
      if (!ex) {
        db.prepare(`
          INSERT INTO diagnoses (patient_id, icd10_code, icd10_description, status, severity, onset_date, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(pid, d.icd10_code, d.icd10_description, d.status, d.severity, d.onset_date, provUserId);
      }
    }
    console.log(`      ✔  3 diagnoses`);

    // Medications
    const meds = [
      { name: 'Metformin',  dosage: '500 mg',  frequency: 'Twice daily',  route: 'oral', start_date: '2020-04-01' },
      { name: 'Lisinopril', dosage: '10 mg',   frequency: 'Once daily',   route: 'oral', start_date: '2019-08-15' },
    ];
    for (const m of meds) {
      const ex = db.prepare('SELECT id FROM medications WHERE patient_id = ? AND name = ?').get(pid, m.name);
      if (!ex) {
        db.prepare(`
          INSERT INTO medications (patient_id, name, dosage, frequency, route, start_date, status, prescriber_id, created_by)
          VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
        `).run(pid, m.name, m.dosage, m.frequency, m.route, m.start_date, prov, provUserId);
      }
    }
    console.log(`      ✔  2 medications`);

    // Allergy
    const alg = db.prepare('SELECT id FROM allergies WHERE patient_id = ? AND allergen = ?').get(pid, 'Penicillin');
    if (!alg) {
      db.prepare(`
        INSERT INTO allergies (patient_id, allergen, reaction_type, severity, status, created_by)
        VALUES (?, 'Penicillin', 'anaphylaxis', 'severe', 'active', ?)
      `).run(pid, provUserId);
    }
    console.log(`      ✔  1 allergy`);

    // Vitals — 5 monthly readings (5, 4, 3, 2, 1 months ago)
    const today = new Date();
    for (let mo = 5; mo >= 1; mo--) {
      const dt = new Date(today);
      dt.setMonth(dt.getMonth() - mo);
      const recorded_at = dt.toISOString();
      const ex = db.prepare('SELECT id FROM vitals WHERE patient_id = ? AND recorded_at = ?').get(pid, recorded_at);
      if (!ex) {
        db.prepare(`
          INSERT INTO vitals
            (patient_id, recorded_at, bp_systolic, bp_diastolic, heart_rate, temperature, weight_kg, o2_saturation, recorded_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          pid, recorded_at,
          120 + mo,         // systolic varies slightly
          80 + mo,          // diastolic
          72 + mo,          // heart rate
          37.1,
          82 - mo * 0.2,
          98,
          provUserId,       // vitals.recorded_by → users.id
        );
      }
    }
    console.log(`      ✔  5 vital readings`);

    // Lab Results — 2 normal, 1 flagged
    const labs: Array<{
      test_name: string; value: string; unit: string;
      ref_low: number | null; ref_high: number | null;
      collected_at: string; status: string;
    }> = [
      { test_name: 'Complete Blood Count', value: '5.2',  unit: 'million/µL', ref_low: 4.5,  ref_high: 5.9, collected_at: daysAgo(30), status: 'final'        },
      { test_name: 'Creatinine',           value: '0.98', unit: 'mg/dL',      ref_low: 0.7,  ref_high: 1.3, collected_at: daysAgo(30), status: 'final'        },
      { test_name: 'HbA1c',               value: '7.8',  unit: '%',          ref_low: null, ref_high: 7.0, collected_at: daysAgo(30), status: 'flagged_high' },
    ];
    for (const l of labs) {
      const ex = db.prepare('SELECT id FROM lab_results WHERE patient_id = ? AND test_name = ? AND collected_at = ?').get(pid, l.test_name, l.collected_at);
      if (!ex) {
        db.prepare(`
          INSERT INTO lab_results
            (patient_id, test_name, value, unit, reference_range_low, reference_range_high, collected_at, status, ordered_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(pid, l.test_name, l.value, l.unit, l.ref_low, l.ref_high, l.collected_at, l.status, prov);
      }
    }
    console.log(`      ✔  3 lab results (1 flagged)`);

    // Clinical Notes — 1 locked (>24h old), 1 editable (now)
    const lockedAt  = daysAgo(2);
    const editableAt = new Date().toISOString();

    for (const [created_at, is_locked, subjective] of [
      [lockedAt,   1, 'Patient reports fatigue and increased thirst. Routine follow-up for diabetes management.'],
      [editableAt, 0, 'Patient here for blood pressure review and medication adjustment.'],
    ] as Array<[string, number, string]>) {
      const ex = db.prepare(
        'SELECT id FROM clinical_notes WHERE patient_id = ? AND provider_id = ? AND subjective = ?'
      ).get(pid, prov, subjective);
      if (!ex) {
        db.prepare(`
          INSERT INTO clinical_notes
            (patient_id, provider_id, note_type,
             subjective, objective, assessment, plan, is_locked, created_at, updated_at)
          VALUES (?, ?, 'progress', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          pid, prov, subjective,
          'BP 128/82 mmHg, HR 76 bpm, Weight 80 kg. HbA1c 7.8%.',
          'Type 2 DM: suboptimal glycemic control. HTN: stable.',
          'Increase Metformin to 1000 mg twice daily. Follow up in 4 weeks.',
          is_locked, created_at, created_at,
        );
      }
    }
    console.log(`      ✔  2 clinical notes (1 locked)`);
  }

  // ── Waitlist entry for patient 2 ─────────────────────────────────────────
  const ex = db.prepare('SELECT id FROM waitlist WHERE patient_id = ?').get(pid2);
  if (!ex) {
    const telehealthTypeId = typeId('Telehealth Consult');
    db.prepare(`
      INSERT INTO waitlist (patient_id, provider_id, appointment_type_id, notes, status)
      VALUES (?, ?, ?, 'Flexible on timing', 'waiting')
    `).run(pid2, prov, telehealthTypeId);
    console.log(`\n    ✔  1 waitlist entry for patient2`);
  }

  console.log('\n  ✅  Phase 2 seed complete');
}
