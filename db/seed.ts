/**
 * db/seed.ts — Seed the Helix Health Portal database with test data.
 *
 * Run via:  npm run db:setup    (preferred, from the repo root)
 *           npm run seed        (direct alias)
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
  .then(() => seedPhase3())
  .then(() => seedPhase4())
  .then(() => seedPhase5())
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

// ─── Phase 3: Prescriptions & Communications ─────────────────────────────────

function seedPhase3(): void {
  console.log('\n⚙️   Phase 3 seed — prescriptions & communications…');

  // ── Resolve user / patient ids ─────────────────────────────────────────────
  const u = (email: string): number =>
    (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as any)?.id;
  const p = (userId: number): number =>
    (db.prepare('SELECT id FROM patients WHERE user_id = ?').get(userId) as any)?.id;
  const provId = (userId: number): number =>
    (db.prepare('SELECT id FROM providers WHERE user_id = ?').get(userId) as any)?.id;

  const provUserId  = u('provider@helixhealthportal.test');
  const adminUserId = u('admin@helixhealthportal.test');
  const pat1UserId  = u('patient1@helixhealthportal.test');
  const pat2UserId  = u('patient2@helixhealthportal.test');
  const pid1        = p(pat1UserId);
  const pid2        = p(pat2UserId);
  const providerId  = provId(provUserId);   // providers.id (FK for prescriptions)

  if (!provUserId || !pid1 || !pid2 || !providerId) {
    console.warn('  ⚠  Phase 3 seed skipped — prerequisite users not found.');
    return;
  }

  const now = new Date().toISOString();
  function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }
  function daysAhead(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().split('T')[0];
  }

  // ── Prescriptions — 2 active per patient + 1 controlled ───────────────────
  console.log('\n  💊  Prescriptions…');

  const prescriptions: Array<{
    patient_id: number; prescriber_id: number;
    drug_name: string; drug_ndc: string | null;
    dosage: string; frequency: string; route: string;
    quantity: number; refills_remaining: number;
    start_date: string; end_date: string | null;
    status: string; is_controlled: number; schedule_class: string | null;
    pharmacy_name: string | null; pharmacy_phone: string | null;
    notes: string | null;
  }> = [
    // Patient 1 — Metformin
    {
      patient_id: pid1, prescriber_id: providerId,
      drug_name: 'Metformin', drug_ndc: '0093-1048-01',
      dosage: '1000mg', frequency: 'twice daily', route: 'oral',
      quantity: 60, refills_remaining: 5,
      start_date: daysAgo(90).split('T')[0], end_date: daysAhead(275),
      status: 'active', is_controlled: 0, schedule_class: null,
      pharmacy_name: 'TEST Pharmacy CVS #1234', pharmacy_phone: '555-000-0001',
      notes: 'Take with food to reduce GI side effects.',
    },
    // Patient 1 — Lisinopril
    {
      patient_id: pid1, prescriber_id: providerId,
      drug_name: 'Lisinopril', drug_ndc: '0093-1062-01',
      dosage: '10mg', frequency: 'once daily', route: 'oral',
      quantity: 30, refills_remaining: 3,
      start_date: daysAgo(60).split('T')[0], end_date: daysAhead(305),
      status: 'active', is_controlled: 0, schedule_class: null,
      pharmacy_name: 'TEST Pharmacy CVS #1234', pharmacy_phone: '555-000-0001',
      notes: null,
    },
    // Patient 1 — Codeine (controlled, Schedule III)
    {
      patient_id: pid1, prescriber_id: providerId,
      drug_name: 'Codeine', drug_ndc: '0121-0766-08',
      dosage: '30mg', frequency: 'every 6 hours as needed', route: 'oral',
      quantity: 20, refills_remaining: 0,
      start_date: daysAgo(5).split('T')[0], end_date: daysAhead(25),
      status: 'active', is_controlled: 1, schedule_class: 'III',
      pharmacy_name: 'TEST Pharmacy Walgreens #5678', pharmacy_phone: '555-000-0002',
      notes: 'For post-procedure pain management. Do not exceed prescribed dose.',
    },
    // Patient 2 — Atorvastatin
    {
      patient_id: pid2, prescriber_id: providerId,
      drug_name: 'Atorvastatin', drug_ndc: '0071-0155-23',
      dosage: '20mg', frequency: 'once daily at bedtime', route: 'oral',
      quantity: 30, refills_remaining: 6,
      start_date: daysAgo(120).split('T')[0], end_date: daysAhead(245),
      status: 'active', is_controlled: 0, schedule_class: null,
      pharmacy_name: 'TEST Pharmacy Rite Aid #9012', pharmacy_phone: '555-000-0003',
      notes: null,
    },
    // Patient 2 — Omeprazole
    {
      patient_id: pid2, prescriber_id: providerId,
      drug_name: 'Omeprazole', drug_ndc: '0093-5154-98',
      dosage: '20mg', frequency: 'once daily before breakfast', route: 'oral',
      quantity: 30, refills_remaining: 2,
      start_date: daysAgo(45).split('T')[0], end_date: daysAhead(320),
      status: 'active', is_controlled: 0, schedule_class: null,
      pharmacy_name: 'TEST Pharmacy Rite Aid #9012', pharmacy_phone: '555-000-0003',
      notes: null,
    },
  ];

  const rxIds: number[] = [];
  for (const rx of prescriptions) {
    const ex = db.prepare(
      'SELECT id FROM prescriptions WHERE patient_id = ? AND drug_name = ? AND start_date = ?',
    ).get(rx.patient_id, rx.drug_name, rx.start_date);
    if (!ex) {
      const result = db.prepare(`
        INSERT INTO prescriptions
          (patient_id, prescriber_id, drug_name, drug_ndc, dosage, frequency,
           route, quantity, refills_remaining, start_date, end_date, status,
           is_controlled, schedule_class, pharmacy_name, pharmacy_phone, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        rx.patient_id, rx.prescriber_id, rx.drug_name, rx.drug_ndc,
        rx.dosage, rx.frequency, rx.route, rx.quantity, rx.refills_remaining,
        rx.start_date, rx.end_date, rx.status, rx.is_controlled,
        rx.schedule_class, rx.pharmacy_name, rx.pharmacy_phone, rx.notes,
      );
      rxIds.push(result.lastInsertRowid as number);
    } else {
      rxIds.push((ex as any).id);
    }
  }
  console.log(`      ✔  ${prescriptions.length} prescriptions (1 controlled, Schedule III)`);

  // ── Drug interaction pre-seeded log entry: Warfarin ↔ Aspirin ────────────
  const existingInteraction = db.prepare(
    'SELECT id FROM drug_interactions_log WHERE patient_id = ? AND drug_a = ? AND drug_b = ?',
  ).get(pid1, 'Warfarin', 'Aspirin');
  if (!existingInteraction) {
    db.prepare(`
      INSERT INTO drug_interactions_log
        (patient_id, drug_a, drug_b, severity, description, checked_by, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      pid1, 'Warfarin', 'Aspirin', 'severe',
      'Concurrent use significantly increases risk of major bleeding.',
      provUserId, daysAgo(10),
    );
    console.log('      ✔  1 drug interaction log entry (Warfarin ↔ Aspirin, severe)');
  }

  // ── Message Threads ───────────────────────────────────────────────────────
  console.log('\n  ✉️   Message threads…');

  function createThread(
    subject: string, createdBy: number, participantIds: number[],
    firstMessage: string, createdAt: string,
  ): number {
    const ex = db.prepare(
      'SELECT id FROM message_threads WHERE subject = ? AND created_by = ?',
    ).get(subject, createdBy);
    if (ex) return (ex as any).id;

    const threadResult = db.prepare(`
      INSERT INTO message_threads (subject, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(subject, createdBy, createdAt, createdAt);
    const threadId = threadResult.lastInsertRowid as number;

    // Add all participants (including creator)
    const allParticipants = [...new Set([createdBy, ...participantIds])];
    for (const uid of allParticipants) {
      db.prepare(`
        INSERT OR IGNORE INTO message_thread_participants (thread_id, user_id)
        VALUES (?, ?)
      `).run(threadId, uid);
    }

    // Insert the first message
    db.prepare(`
      INSERT INTO messages (thread_id, sender_id, body, created_at)
      VALUES (?, ?, ?, ?)
    `).run(threadId, createdBy, firstMessage, createdAt);

    return threadId;
  }

  // Thread 1: patient1 → provider — HbA1c question
  createThread(
    'Question about my HbA1c results',
    pat1UserId,
    [provUserId],
    'Hello Dr., I received my latest HbA1c results showing 7.8%. I\'m a bit worried — could we discuss what steps I should take to bring this down? I\'ve been trying to follow the diet recommendations but finding it difficult.',
    daysAgo(5),
  );

  // Thread 2: patient2 → provider — medication side effects
  createThread(
    'Medication side effects',
    pat2UserId,
    [provUserId],
    'Hi, I started the Atorvastatin last month and I\'ve been experiencing some muscle soreness, especially in my legs. Is this a normal side effect? Should I be concerned? The soreness is making it hard to exercise.',
    daysAgo(3),
  );

  // Thread 3: admin broadcast — system maintenance
  createThread(
    'System maintenance notice',
    adminUserId,
    [provUserId, pat1UserId, pat2UserId],
    'Dear Helix Health Portal users, we will be performing scheduled system maintenance this Sunday from 2:00 AM to 4:00 AM EST. During this window the portal will be unavailable. We apologize for any inconvenience. Please save any work in progress before this time.',
    daysAgo(1),
  );

  console.log('      ✔  3 message threads created');

  // ── Notifications — 5 per major user ──────────────────────────────────────
  console.log('\n  🔔  Notifications…');

  function insertNotification(
    userId: number, type: string, title: string, body: string,
    dataJson: string | null, isRead: number, createdAt: string,
  ) {
    const ex = db.prepare(
      'SELECT id FROM notifications WHERE user_id = ? AND type = ? AND title = ? AND created_at = ?',
    ).get(userId, type, title, createdAt);
    if (!ex) {
      db.prepare(`
        INSERT INTO notifications (user_id, type, title, body, data_json, is_read, read_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId, type, title, body, dataJson, isRead,
        isRead ? createdAt : null,
        createdAt,
      );
    }
  }

  // Patient 1 notifications
  insertNotification(pat1UserId, 'appointment_reminder',
    'Appointment Tomorrow',
    'You have an appointment scheduled for tomorrow at 10:00 AM with your care team.',
    JSON.stringify({ appointment_id: 1 }), 0, daysAgo(1));
  insertNotification(pat1UserId, 'lab_result',
    'Lab Results Available',
    'Your HbA1c and Complete Blood Count results are now available.',
    JSON.stringify({ lab_result_id: 1 }), 1, daysAgo(5));
  insertNotification(pat1UserId, 'new_message',
    'New Message from Provider',
    'You have received a reply to your question about HbA1c results.',
    JSON.stringify({ thread_id: 1 }), 0, daysAgo(4));
  insertNotification(pat1UserId, 'refill_approved',
    'Refill Request Approved',
    'Your refill request for Metformin has been approved by your provider.',
    JSON.stringify({ prescription_id: rxIds[0] ?? 1 }), 1, daysAgo(10));
  insertNotification(pat1UserId, 'appointment_cancelled',
    'Appointment Cancelled',
    'Your appointment scheduled for last Tuesday has been cancelled. Please reschedule at your convenience.',
    JSON.stringify({ appointment_id: 2 }), 0, daysAgo(8));

  // Patient 2 notifications
  insertNotification(pat2UserId, 'appointment_reminder',
    'Appointment Reminder',
    'Reminder: you have a Telehealth Consult scheduled in 24 hours.',
    JSON.stringify({ appointment_id: 3 }), 0, daysAgo(1));
  insertNotification(pat2UserId, 'new_message',
    'New Message from Provider',
    'Your provider has replied regarding your medication side effects.',
    JSON.stringify({ thread_id: 2 }), 0, daysAgo(2));
  insertNotification(pat2UserId, 'lab_result',
    'Lab Results Ready',
    'Your latest lab panel results are now available for review.',
    JSON.stringify({ lab_result_id: 2 }), 1, daysAgo(7));
  insertNotification(pat2UserId, 'refill_denied',
    'Refill Request Denied',
    'Your refill request has been reviewed. Please contact your care team for more information.',
    JSON.stringify({ prescription_id: rxIds[3] ?? 2 }), 1, daysAgo(14));
  insertNotification(pat2UserId, 'appointment_rescheduled',
    'Appointment Rescheduled',
    'Your upcoming appointment has been moved to next week. Check appointments for details.',
    JSON.stringify({ appointment_id: 4 }), 0, daysAgo(3));

  // Provider notifications
  insertNotification(provUserId, 'new_message',
    'New Message from Patient',
    'TEST Patient One has sent you a message regarding HbA1c results.',
    JSON.stringify({ thread_id: 1 }), 1, daysAgo(5));
  insertNotification(provUserId, 'new_message',
    'New Message from Patient',
    'TEST Patient Two has sent you a message regarding medication side effects.',
    JSON.stringify({ thread_id: 2 }), 0, daysAgo(3));
  insertNotification(provUserId, 'appointment_reminder',
    'Upcoming Appointments',
    'You have 3 patient appointments scheduled for tomorrow.',
    null, 1, daysAgo(1));
  insertNotification(provUserId, 'lab_result',
    'Lab Results Flagged',
    'A flagged lab result for patient TEST_Patient One requires your review.',
    JSON.stringify({ lab_result_id: 1 }), 0, daysAgo(5));
  insertNotification(provUserId, 'refill_approved',
    'Refill Processed',
    'A refill request for Metformin (TEST Patient One) has been successfully processed.',
    JSON.stringify({ prescription_id: rxIds[0] ?? 1 }), 1, daysAgo(10));

  // Admin notifications
  insertNotification(adminUserId, 'new_message',
    'System Broadcast Sent',
    'Your maintenance notice has been delivered to all active users.',
    JSON.stringify({ thread_id: 3 }), 1, daysAgo(1));
  insertNotification(adminUserId, 'appointment_cancelled',
    'Appointment Cancellation Alert',
    'A patient appointment was cancelled with short notice. Review scheduling queue.',
    null, 0, daysAgo(8));
  insertNotification(adminUserId, 'lab_result',
    'Critical Lab Alert',
    'A critical lab result has been flagged for immediate provider review.',
    JSON.stringify({ lab_result_id: 1 }), 1, daysAgo(5));
  insertNotification(adminUserId, 'refill_denied',
    'Refill Denial Logged',
    'A controlled substance refill request was denied. Audit log updated.',
    JSON.stringify({ prescription_id: rxIds[2] ?? 3 }), 0, daysAgo(3));
  insertNotification(adminUserId, 'appointment_reminder',
    'Staff Schedule Reminder',
    'Monthly care team schedule review is due by end of week.',
    null, 0, daysAgo(2));

  console.log('      ✔  5 notifications each for patient1, patient2, provider, admin');

  console.log('\n  ✅  Phase 3 seed complete');
}

// ─── Phase 4: Billing Seed Data ───────────────────────────────────────────────

function seedPhase4(): void {
  console.log('\n  Seeding Phase 4 billing data…');

  function userId(email: string): number {
    return (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number }).id;
  }
  function patientId(email: string): number {
    const uid = userId(email);
    return (db.prepare('SELECT id FROM patients WHERE user_id = ?').get(uid) as { id: number }).id;
  }

  const pid1 = patientId('patient1@helixhealthportal.test');
  const pid2 = patientId('patient2@helixhealthportal.test');

  // ── Helpers ─────────────────────────────────────────────────────────────
  function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }
  function daysFromNow(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // ── Insurance Plans ──────────────────────────────────────────────────────
  console.log('\n    Seeding insurance plans…');

  const insStmt = db.prepare(`
    INSERT INTO insurance_plans
      (patient_id, insurer_name, plan_name, member_id, group_number,
       effective_date, expiration_date, copay_amount, deductible_amount,
       deductible_met, is_primary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Patient 1 — primary + secondary
  insStmt.run(pid1, 'BlueShield', 'Gold PPO', 'MBR-TEST-00111', 'GRP-TEST-500',
    '2024-01-01', '2024-12-31', 20, 1000, 400, 1);
  insStmt.run(pid1, 'Medicaid', 'Supplemental Plan', 'MBR-TEST-00112', null,
    '2024-01-01', null, 0, 0, 0, 0);

  // Patient 2 — primary + secondary
  insStmt.run(pid2, 'UnitedHealth', 'Silver HMO', 'MBR-TEST-00211', 'GRP-TEST-600',
    '2024-01-01', '2024-12-31', 30, 2000, 0, 1);
  insStmt.run(pid2, 'Aetna', 'Bronze HSA', 'MBR-TEST-00212', 'GRP-TEST-601',
    '2024-01-01', '2024-12-31', 50, 3000, 0, 0);

  console.log('      ✔  2 insurance plans each for patient1, patient2');

  // ── CPT line items template ───────────────────────────────────────────────
  const CPT_ITEMS = [
    { cpt_code: '99213', description: 'Office visit – established patient',  unit_price: 150.00, ins_adj: 70.00 },
    { cpt_code: '99000', description: 'Handling fee',                        unit_price:  25.00, ins_adj:  5.00 },
    { cpt_code: '80050', description: 'General health panel',                unit_price: 200.00, ins_adj: 120.00 },
    { cpt_code: '85025', description: 'Complete blood count (CBC)',           unit_price:  85.00, ins_adj:  45.00 },
    { cpt_code: '82947', description: 'Glucose, blood test',                 unit_price:  40.00, ins_adj:  20.00 },
  ];

  function insertInvoiceWithItems(
    patId: number,
    status: 'paid' | 'pending' | 'overdue',
    dueDate: string,
    paidAt: string | null,
  ): number {
    const totalAmount  = CPT_ITEMS.reduce((s, i) => s + i.unit_price, 0);     // 500.00
    const insAmount    = CPT_ITEMS.reduce((s, i) => s + i.ins_adj, 0);        // 260.00
    const patientAmount = totalAmount - insAmount;                             // 240.00

    const inv = db.prepare(`
      INSERT INTO invoices
        (patient_id, due_date, total_amount, insurance_amount,
         patient_amount, status, paid_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(patId, dueDate, totalAmount, insAmount, patientAmount, status, paidAt);

    const invoiceId = inv.lastInsertRowid as number;

    const itemStmt = db.prepare(`
      INSERT INTO invoice_items
        (invoice_id, cpt_code, description, quantity, unit_price,
         insurance_adjustment, patient_responsibility)
      VALUES (?, ?, ?, 1, ?, ?, ?)
    `);
    for (const item of CPT_ITEMS) {
      itemStmt.run(invoiceId, item.cpt_code, item.description,
        item.unit_price, item.ins_adj, item.unit_price - item.ins_adj);
    }

    return invoiceId;
  }

  // ── Invoices ──────────────────────────────────────────────────────────────
  console.log('\n    Seeding invoices…');

  // Patient 1
  const inv1Paid    = insertInvoiceWithItems(pid1, 'paid',    daysAgo(45).slice(0,10), daysAgo(30));
  const inv1Pending = insertInvoiceWithItems(pid1, 'pending', daysFromNow(30), null);
  const inv1Overdue = insertInvoiceWithItems(pid1, 'overdue', daysAgo(15).slice(0,10), null);

  // Patient 2
  const inv2Paid    = insertInvoiceWithItems(pid2, 'paid',    daysAgo(50).slice(0,10), daysAgo(35));
  const inv2Pending = insertInvoiceWithItems(pid2, 'pending', daysFromNow(14), null);
  const inv2Overdue = insertInvoiceWithItems(pid2, 'overdue', daysAgo(10).slice(0,10), null);

  console.log('      ✔  3 invoices (paid/pending/overdue) with 5 CPT line items each for patient1, patient2');

  // ── Payments (1 per paid invoice) ─────────────────────────────────────────
  console.log('\n    Seeding payments…');

  const pmtStmt = db.prepare(`
    INSERT INTO payments
      (invoice_id, patient_id, amount, payment_method, status,
       stripe_payment_intent_id, paid_at)
    VALUES (?, ?, 240.00, 'card', 'succeeded', ?, ?)
  `);

  pmtStmt.run(inv1Paid, pid1, `pi_test_seed_pat1_${Date.now()}`, daysAgo(30));
  pmtStmt.run(inv2Paid, pid2, `pi_test_seed_pat2_${Date.now() + 1}`, daysAgo(35));

  console.log('      ✔  1 succeeded payment each for patient1 and patient2 paid invoices');

  // ── Billing Dispute (patient1 overdue invoice) ─────────────────────────────
  console.log('\n    Seeding billing dispute…');

  db.prepare(`
    INSERT INTO billing_disputes
      (invoice_id, patient_id, reason, status, submitted_at)
    VALUES (?, ?, ?, 'open', ?)
  `).run(
    inv1Overdue,
    pid1,
    'I do not recognise the CBC charge (85025). This test was not ordered during my visit.',
    daysAgo(5),
  );

  // Update invoice status to disputed
  db.prepare(`UPDATE invoices SET status = 'disputed' WHERE id = ?`).run(inv1Overdue);

  console.log('      ✔  1 open billing dispute for patient1 overdue invoice');

  // ── Payment Plan (patient2 overdue invoice) ────────────────────────────────
  console.log('\n    Seeding payment plan…');

  db.prepare(`
    INSERT INTO payment_plans
      (invoice_id, patient_id, installments_total, installments_paid,
       installment_amount, next_due_date, status)
    VALUES (?, ?, 3, 0, 80.00, ?, 'active')
  `).run(inv2Overdue, pid2, daysFromNow(30));

  console.log('      ✔  1 active payment plan (3 installments) for patient2 overdue invoice');

  console.log('\n  ✅  Phase 4 seed complete');
}

// ─── Phase 5: Extended Data for Course Testing ────────────────────────────────

async function seedPhase5(): Promise<void> {
  console.log('\n⚙️   Phase 5 seed — extended patients, providers, appointments, complex meds, vitals…');

  // ── Date helpers (local scope) ────────────────────────────────────────────
  function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }
  function daysAhead(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString();
  }
  function monthsAgo(n: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d.toISOString();
  }

  // ── Helper: resolve ids ───────────────────────────────────────────────────
  const uid = (email: string): number =>
    (db.prepare('SELECT id FROM users WHERE email = ?').get(email) as any)?.id;
  const pidFromUserId = (userId: number): number =>
    (db.prepare('SELECT id FROM patients WHERE user_id = ?').get(userId) as any)?.id;
  const provIdFromUserId = (userId: number): number =>
    (db.prepare('SELECT id FROM providers WHERE user_id = ?').get(userId) as any)?.id;
  const typeId = (name: string): number =>
    (db.prepare('SELECT id FROM appointment_types WHERE name = ?').get(name) as any)?.id;
  const specialtyId = (name: string): number | null =>
    (db.prepare('SELECT id FROM provider_specialties WHERE name = ?').get(name) as any)?.id ?? null;

  const mainProviderUserId = uid('provider@helixhealthportal.test');

  // ── 1. Extra providers ────────────────────────────────────────────────────
  console.log('\n    Seeding 3 extra providers…');

  const extraProviders: Array<{
    email: string; label: string; firstName: string; lastName: string;
    npi: string; license: string; specialty: string;
  }> = [
    {
      email: 'cardiologist@helixhealthportal.test',
      label: 'TEST_Dr_Cardiologist',
      firstName: 'TEST_Dr', lastName: 'Cardiologist',
      npi: '0000000002', license: 'LIC-TEST-CARD-002',
      specialty: 'Cardiology',
    },
    {
      email: 'dermatologist@helixhealthportal.test',
      label: 'TEST_Dr_Dermatologist',
      firstName: 'TEST_Dr', lastName: 'Dermatologist',
      npi: '0000000003', license: 'LIC-TEST-DERM-003',
      specialty: 'Dermatology',
    },
    {
      email: 'orthopedic@helixhealthportal.test',
      label: 'TEST_Dr_Orthopedic',
      firstName: 'TEST_Dr', lastName: 'Orthopedic',
      npi: '0000000004', license: 'LIC-TEST-ORTH-004',
      specialty: 'Orthopedics',
    },
  ];

  const extraProviderIds: number[] = []; // providers.id
  const extraProviderUserIds: number[] = []; // users.id

  for (const ep of extraProviders) {
    const puId = await upsertUser(ep.email, ['provider']);
    assignRoles(puId, ['provider']);

    const specId = specialtyId(ep.specialty);
    db.prepare(`
      INSERT INTO providers (user_id, npi, specialty_id, license_number)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE
        SET npi = excluded.npi, specialty_id = excluded.specialty_id,
            license_number = excluded.license_number
    `).run(puId, ep.npi, specId, ep.license);

    // Add demographics via patient_demographics? No — providers don't have patient records.
    // Store name in users table extension is not standard; just log it.
    const provDbId = provIdFromUserId(puId);
    extraProviderIds.push(provDbId);
    extraProviderUserIds.push(puId);
    console.log(`      ✔  ${ep.label}  [provider, NPI: ${ep.npi}]  (id: ${puId})`);
  }

  // ── 2. 20 extra patient accounts ──────────────────────────────────────────
  console.log('\n    Seeding 20 extra patients (TEST_Patient_03 – TEST_Patient_22)…');

  const phases5PatientIds: number[] = []; // patients.id

  const p5PatientData: Array<{
    email: string; mrnSuffix: string; first: string; last: string;
    dob: string; sex: string; ssn: string;
  }> = [
    { email: 'patient03@helixhealthportal.test', mrnSuffix: '00003', first: 'TEST_Patient', last: 'Three',        dob: '1980-04-12', sex: 'M', ssn: '000-00-0003' },
    { email: 'patient04@helixhealthportal.test', mrnSuffix: '00004', first: 'TEST_Patient', last: 'Four',         dob: '1965-09-28', sex: 'F', ssn: '000-00-0004' },
    { email: 'patient05@helixhealthportal.test', mrnSuffix: '00005', first: 'TEST_Patient', last: 'Five',         dob: '1992-01-07', sex: 'M', ssn: '000-00-0005' },
    { email: 'patient06@helixhealthportal.test', mrnSuffix: '00006', first: 'TEST_Patient', last: 'Six',          dob: '1955-11-19', sex: 'F', ssn: '000-00-0006' },
    { email: 'patient07@helixhealthportal.test', mrnSuffix: '00007', first: 'TEST_Patient', last: 'Seven',        dob: '2001-06-30', sex: 'M', ssn: '000-00-0007' },
    { email: 'patient08@helixhealthportal.test', mrnSuffix: '00008', first: 'TEST_Patient', last: 'Eight',        dob: '1978-03-14', sex: 'F', ssn: '000-00-0008' },
    { email: 'patient09@helixhealthportal.test', mrnSuffix: '00009', first: 'TEST_Patient', last: 'Nine',         dob: '1948-07-22', sex: 'M', ssn: '000-00-0009' },
    { email: 'patient10@helixhealthportal.test', mrnSuffix: '00010', first: 'TEST_Patient', last: 'Ten',          dob: '1988-12-05', sex: 'F', ssn: '000-00-0010' },
    { email: 'patient11@helixhealthportal.test', mrnSuffix: '00011', first: 'TEST_Patient', last: 'Eleven',       dob: '1970-08-17', sex: 'M', ssn: '000-00-0011' },
    { email: 'patient12@helixhealthportal.test', mrnSuffix: '00012', first: 'TEST_Patient', last: 'Twelve',       dob: '2003-02-25', sex: 'F', ssn: '000-00-0012' },
    { email: 'patient13@helixhealthportal.test', mrnSuffix: '00013', first: 'TEST_Patient', last: 'Thirteen',     dob: '1961-10-08', sex: 'M', ssn: '000-00-0013' },
    { email: 'patient14@helixhealthportal.test', mrnSuffix: '00014', first: 'TEST_Patient', last: 'Fourteen',     dob: '1995-05-16', sex: 'F', ssn: '000-00-0014' },
    { email: 'patient15@helixhealthportal.test', mrnSuffix: '00015', first: 'TEST_Patient', last: 'Fifteen',      dob: '1983-09-01', sex: 'M', ssn: '000-00-0015' },
    { email: 'patient16@helixhealthportal.test', mrnSuffix: '00016', first: 'TEST_Patient', last: 'Sixteen',      dob: '1940-04-30', sex: 'F', ssn: '000-00-0016' },
    { email: 'patient17@helixhealthportal.test', mrnSuffix: '00017', first: 'TEST_Patient', last: 'Seventeen',    dob: '1999-11-11', sex: 'M', ssn: '000-00-0017' },
    { email: 'patient18@helixhealthportal.test', mrnSuffix: '00018', first: 'TEST_Patient', last: 'Eighteen',     dob: '1975-07-04', sex: 'F', ssn: '000-00-0018' },
    { email: 'patient19@helixhealthportal.test', mrnSuffix: '00019', first: 'TEST_Patient', last: 'Nineteen',     dob: '1957-01-23', sex: 'M', ssn: '000-00-0019' },
    { email: 'patient20@helixhealthportal.test', mrnSuffix: '00020', first: 'TEST_Patient', last: 'Twenty',       dob: '2005-08-09', sex: 'F', ssn: '000-00-0020' },
    { email: 'patient21@helixhealthportal.test', mrnSuffix: '00021', first: 'TEST_Patient', last: 'TwentyOne',    dob: '1986-03-27', sex: 'M', ssn: '000-00-0021' },
    { email: 'patient22@helixhealthportal.test', mrnSuffix: '00022', first: 'TEST_Patient', last: 'TwentyTwo',    dob: '1968-06-13', sex: 'F', ssn: '000-00-0022' },
  ];

  for (const pd of p5PatientData) {
    const puId = await upsertUser(pd.email, ['patient']);
    assignRoles(puId, ['patient']);

    const mrn = `MRN-TEST-${pd.mrnSuffix}`;
    const existing = db.prepare('SELECT id FROM patients WHERE user_id = ?').get(puId) as { id: number } | undefined;
    let patDbId: number;
    if (existing) {
      db.prepare('UPDATE patients SET mrn = ? WHERE id = ?').run(mrn, existing.id);
      patDbId = existing.id;
    } else {
      const row = db.prepare('INSERT INTO patients (user_id, mrn) VALUES (?, ?)').run(puId, mrn);
      patDbId = Number(row.lastInsertRowid);
    }

    db.prepare(`
      INSERT INTO patient_demographics (patient_id, first_name, last_name, dob, gender)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(patient_id) DO UPDATE
        SET first_name = excluded.first_name, last_name = excluded.last_name,
            dob = excluded.dob, gender = excluded.gender
    `).run(patDbId, pd.first, pd.last, pd.dob, pd.sex === 'M' ? 'male' : 'female');

    phases5PatientIds.push(patDbId);
  }
  console.log(`      ✔  20 patients (patient03–patient22, all use password: TestPass123!)`);

  // ── 3. 60 appointments ────────────────────────────────────────────────────
  console.log('\n    Seeding 60 appointments…');

  // All providers (DB ids): mainProvider + 3 extra
  const allProviderIds = [
    provIdFromUserId(mainProviderUserId),
    ...extraProviderIds,
  ];

  const apptTypeNames = ['Annual Physical', 'Follow-up', 'Telehealth Consult', 'Urgent Care'];
  const statuses60 = ['scheduled', 'completed', 'cancelled', 'no_show', 'confirmed'];

  // Build a deterministic set of 60 appointments spread across 60 unique time slots
  const appointments60: Array<{
    patient_id: number; provider_id: number; type_name: string;
    scheduled_at: string; status: string;
  }> = [];

  // Past 6 months: days 1–180 ago, spread in groups of 3 per patient per provider
  // Future 4 weeks: days ahead 1–28
  const pastOffsets  = [180, 165, 150, 135, 120, 105, 90, 75, 60, 45, 30, 15, 7, 3];
  const futureOffsets = [2, 5, 9, 14, 17, 21, 25, 28];

  let apptCounter = 0;
  const usedSlots = new Set<string>();

  function addAppt(patientId: number, providerId: number, typeName: string, scheduledAt: string, status: string) {
    const slotKey = `${providerId}_${scheduledAt}`;
    if (usedSlots.has(slotKey)) return;
    usedSlots.add(slotKey);
    appointments60.push({ patient_id: patientId, provider_id: providerId, type_name: typeName, scheduled_at: scheduledAt, status });
    apptCounter++;
  }

  // Distribute: cycle through all 20 new patients and 4 providers
  for (let i = 0; i < phases5PatientIds.length && apptCounter < 60; i++) {
    const patId = phases5PatientIds[i];
    const provId = allProviderIds[i % allProviderIds.length];
    const pastOff = pastOffsets[i % pastOffsets.length];
    const futOff  = futureOffsets[i % futureOffsets.length];
    const past2   = pastOffsets[(i + 5) % pastOffsets.length];
    const typePast1 = apptTypeNames[i % apptTypeNames.length];
    const typePast2 = apptTypeNames[(i + 1) % apptTypeNames.length];
    const typeFut   = apptTypeNames[(i + 2) % apptTypeNames.length];

    // past appointment 1
    const pastStatus1 = i % 5 === 3 ? 'no_show' : (i % 5 === 4 ? 'cancelled' : 'completed');
    addAppt(patId, provId, typePast1, daysAgo(pastOff), pastStatus1);

    // past appointment 2
    const altProvId = allProviderIds[(i + 1) % allProviderIds.length];
    addAppt(patId, altProvId, typePast2, daysAgo(past2), 'completed');

    // future appointment
    const futProvId = allProviderIds[(i + 2) % allProviderIds.length];
    const futStatus = i % 3 === 0 ? 'confirmed' : 'scheduled';
    addAppt(patId, futProvId, typeFut, daysAhead(futOff), futStatus);

    if (apptCounter >= 60) break;
  }

  // Fill remaining up to 60 if needed
  if (apptCounter < 60) {
    for (let i = 0; i < phases5PatientIds.length && apptCounter < 60; i++) {
      const patId = phases5PatientIds[i];
      const provId = allProviderIds[(i + 3) % allProviderIds.length];
      const off = pastOffsets[(i + 2) % pastOffsets.length];
      addAppt(patId, provId, apptTypeNames[(i + 3) % 4], daysAgo(off - 2), 'completed');
    }
  }

  for (const a of appointments60) {
    const atId = typeId(a.type_name);
    if (!atId) continue;
    const existing = db.prepare(
      'SELECT id FROM appointments WHERE patient_id = ? AND provider_id = ? AND scheduled_at = ?',
    ).get(a.patient_id, a.provider_id, a.scheduled_at);
    if (!existing) {
      db.prepare(`
        INSERT INTO appointments
          (patient_id, provider_id, appointment_type_id, scheduled_at, duration_minutes, status)
        VALUES (?, ?, ?, ?, (SELECT duration_minutes FROM appointment_types WHERE id = ?), ?)
      `).run(a.patient_id, a.provider_id, atId, a.scheduled_at, atId, a.status);
    }
  }
  console.log(`      ✔  ${apptCounter} appointments seeded (6 months past + 4 weeks future, all statuses)`);

  // ── 4. 5 patients with complex medication lists (5+ active meds each) ─────
  console.log('\n    Seeding complex medication lists…');

  const mainProviderProviderId = provIdFromUserId(mainProviderUserId);

  const complexMedPatients: Array<{
    patientId: number; meds: Array<{ name: string; dosage: string; frequency: string; route: string; start_date: string }>;
  }> = [
    {
      patientId: phases5PatientIds[0], // patient03 — polypharmacy: cardiac
      meds: [
        { name: 'Metoprolol',     dosage: '50mg',  frequency: 'twice daily',             route: 'oral', start_date: daysAgo(365).slice(0,10) },
        { name: 'Amlodipine',     dosage: '5mg',   frequency: 'once daily',              route: 'oral', start_date: daysAgo(300).slice(0,10) },
        { name: 'Furosemide',     dosage: '40mg',  frequency: 'once daily in morning',   route: 'oral', start_date: daysAgo(250).slice(0,10) },
        { name: 'Spironolactone', dosage: '25mg',  frequency: 'once daily',              route: 'oral', start_date: daysAgo(200).slice(0,10) },
        { name: 'Warfarin',       dosage: '5mg',   frequency: 'once daily',              route: 'oral', start_date: daysAgo(180).slice(0,10) },
        { name: 'Digoxin',        dosage: '0.125mg', frequency: 'once daily',            route: 'oral', start_date: daysAgo(150).slice(0,10) },
      ],
    },
    {
      patientId: phases5PatientIds[2], // patient05 — diabetes + metabolic
      meds: [
        { name: 'Metformin',      dosage: '1000mg', frequency: 'twice daily',            route: 'oral', start_date: daysAgo(500).slice(0,10) },
        { name: 'Glipizide',      dosage: '10mg',   frequency: 'once daily before breakfast', route: 'oral', start_date: daysAgo(400).slice(0,10) },
        { name: 'Sitagliptin',    dosage: '100mg',  frequency: 'once daily',             route: 'oral', start_date: daysAgo(300).slice(0,10) },
        { name: 'Empagliflozin',  dosage: '10mg',   frequency: 'once daily',             route: 'oral', start_date: daysAgo(200).slice(0,10) },
        { name: 'Rosuvastatin',   dosage: '20mg',   frequency: 'once daily at bedtime',  route: 'oral', start_date: daysAgo(600).slice(0,10) },
        { name: 'Lisinopril',     dosage: '10mg',   frequency: 'once daily',             route: 'oral', start_date: daysAgo(700).slice(0,10) },
      ],
    },
    {
      patientId: phases5PatientIds[5], // patient08 — rheumatology
      meds: [
        { name: 'Methotrexate',    dosage: '15mg',  frequency: 'once weekly',            route: 'oral', start_date: daysAgo(730).slice(0,10) },
        { name: 'Folic Acid',      dosage: '1mg',   frequency: 'once daily',             route: 'oral', start_date: daysAgo(730).slice(0,10) },
        { name: 'Hydroxychloroquine', dosage: '200mg', frequency: 'twice daily',         route: 'oral', start_date: daysAgo(600).slice(0,10) },
        { name: 'Prednisone',      dosage: '5mg',   frequency: 'once daily',             route: 'oral', start_date: daysAgo(90).slice(0,10) },
        { name: 'Celecoxib',       dosage: '200mg', frequency: 'twice daily with meals', route: 'oral', start_date: daysAgo(180).slice(0,10) },
      ],
    },
    {
      patientId: phases5PatientIds[9], // patient12 — psychiatric
      meds: [
        { name: 'Sertraline',     dosage: '100mg', frequency: 'once daily',              route: 'oral', start_date: daysAgo(540).slice(0,10) },
        { name: 'Quetiapine',     dosage: '50mg',  frequency: 'once daily at bedtime',   route: 'oral', start_date: daysAgo(400).slice(0,10) },
        { name: 'Clonazepam',     dosage: '0.5mg', frequency: 'twice daily as needed',   route: 'oral', start_date: daysAgo(300).slice(0,10) },
        { name: 'Bupropion',      dosage: '150mg', frequency: 'once daily in morning',   route: 'oral', start_date: daysAgo(200).slice(0,10) },
        { name: 'Lithium',        dosage: '300mg', frequency: 'three times daily',       route: 'oral', start_date: daysAgo(600).slice(0,10) },
        { name: 'Lamotrigine',    dosage: '100mg', frequency: 'once daily',              route: 'oral', start_date: daysAgo(365).slice(0,10) },
      ],
    },
    {
      patientId: phases5PatientIds[14], // patient17 — HIV management
      meds: [
        { name: 'Tenofovir',      dosage: '300mg', frequency: 'once daily',              route: 'oral', start_date: daysAgo(1095).slice(0,10) },
        { name: 'Emtricitabine',  dosage: '200mg', frequency: 'once daily',              route: 'oral', start_date: daysAgo(1095).slice(0,10) },
        { name: 'Dolutegravir',   dosage: '50mg',  frequency: 'once daily',              route: 'oral', start_date: daysAgo(1095).slice(0,10) },
        { name: 'Cotrimoxazole',  dosage: '960mg', frequency: 'once daily prophylaxis',  route: 'oral', start_date: daysAgo(900).slice(0,10) },
        { name: 'Azithromycin',   dosage: '1200mg', frequency: 'once weekly prophylaxis', route: 'oral', start_date: daysAgo(800).slice(0,10) },
      ],
    },
  ];

  for (const { patientId, meds } of complexMedPatients) {
    for (const m of meds) {
      const ex = db.prepare(
        'SELECT id FROM medications WHERE patient_id = ? AND name = ?',
      ).get(patientId, m.name);
      if (!ex) {
        db.prepare(`
          INSERT INTO medications
            (patient_id, name, dosage, frequency, route, start_date, status, prescriber_id, created_by)
          VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
        `).run(patientId, m.name, m.dosage, m.frequency, m.route, m.start_date,
              mainProviderProviderId, mainProviderUserId);
      }
    }
    console.log(`      ✔  ${meds.length} medications for patient (DB id: ${patientId})`);
  }

  // ── 5. 3 patients with 12 months of monthly vitals ────────────────────────
  console.log('\n    Seeding 12-month vital histories for 3 patients…');

  const vitalsPatients = [
    phases5PatientIds[1],   // patient04
    phases5PatientIds[7],   // patient10
    phases5PatientIds[13],  // patient16
  ];

  for (const patId of vitalsPatients) {
    for (let mo = 12; mo >= 1; mo--) {
      const recorded_at = monthsAgo(mo);
      const ex = db.prepare(
        'SELECT id FROM vitals WHERE patient_id = ? AND recorded_at = ?',
      ).get(patId, recorded_at);
      if (!ex) {
        const bpVariance   = Math.round((mo % 3) * 2);
        const hrVariance   = Math.round((mo % 4) * 1.5);
        const weightKg     = +(72 + mo * 0.15).toFixed(1);
        db.prepare(`
          INSERT INTO vitals
            (patient_id, recorded_at,
             bp_systolic, bp_diastolic, heart_rate, temperature,
             weight_kg, o2_saturation, recorded_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          patId, recorded_at,
          122 + bpVariance, 80 + bpVariance,
          70 + hrVariance,
          36.8 + (mo % 2) * 0.3,
          weightKg,
          97 + (mo % 2),
          mainProviderUserId,
        );
      }
    }
    console.log(`      ✔  12 monthly vital readings for patient DB id: ${patId}`);
  }

  console.log('\n  ✅  Phase 5 seed complete');
}
