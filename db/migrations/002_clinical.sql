-- =============================================================================
-- Helix Health Portal — Migration 002: Core Clinical Features
-- Phase 2: Appointments, Medical Records, Clinical Notes, Documents
-- =============================================================================

PRAGMA foreign_keys = ON;

-- =============================================================================
-- APPOINTMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS appointment_types (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL UNIQUE,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  color_hex        TEXT    NOT NULL DEFAULT '#6366f1',  -- indigo
  is_telehealth    INTEGER NOT NULL DEFAULT 0 CHECK (is_telehealth IN (0, 1)),
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS appointments (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id          INTEGER NOT NULL REFERENCES patients(id)          ON DELETE CASCADE,
  provider_id         INTEGER NOT NULL REFERENCES providers(id)         ON DELETE RESTRICT,
  appointment_type_id INTEGER NOT NULL REFERENCES appointment_types(id) ON DELETE RESTRICT,
  status              TEXT    NOT NULL DEFAULT 'scheduled'
                              CHECK (status IN ('scheduled','confirmed','in_progress','completed','cancelled','no_show')),
  scheduled_at        TEXT    NOT NULL,  -- ISO-8601 UTC datetime
  duration_minutes    INTEGER NOT NULL DEFAULT 30,
  location            TEXT,              -- room / building for in-person
  telehealth_url      TEXT,              -- join link for telehealth
  notes               TEXT,              -- staff scheduling notes (not clinical)
  cancel_reason       TEXT,
  created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_appointments_patient_id   ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_provider_id  ON appointments(provider_id);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status       ON appointments(status);

CREATE TABLE IF NOT EXISTS appointment_reminders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id  INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  reminder_type   TEXT    NOT NULL CHECK (reminder_type IN ('email','sms','push')),
  scheduled_at    TEXT    NOT NULL,   -- when to fire the reminder
  sent_at         TEXT,               -- NULL = not yet sent
  status          TEXT    NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','sent','cancelled','failed'))
);

CREATE INDEX IF NOT EXISTS idx_appointment_reminders_appointment_id ON appointment_reminders(appointment_id);

CREATE TABLE IF NOT EXISTS waitlist (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id          INTEGER NOT NULL REFERENCES patients(id)          ON DELETE CASCADE,
  provider_id         INTEGER         REFERENCES providers(id)          ON DELETE SET NULL,
  appointment_type_id INTEGER         REFERENCES appointment_types(id)  ON DELETE SET NULL,
  requested_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  priority            INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),  -- 1 = highest
  status              TEXT    NOT NULL DEFAULT 'waiting'
                              CHECK (status IN ('waiting','offered','booked','cancelled')),
  notes               TEXT
);

-- =============================================================================
-- MEDICAL RECORDS (parent table for grouping)
-- =============================================================================

CREATE TABLE IF NOT EXISTS medical_records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id  INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  record_type TEXT    NOT NULL,  -- 'diagnosis' | 'medication' | 'allergy' | 'vitals' | 'lab_result'
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- =============================================================================
-- DIAGNOSES
-- =============================================================================

CREATE TABLE IF NOT EXISTS diagnoses (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id       INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  icd10_code       TEXT    NOT NULL,
  icd10_description TEXT   NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','resolved','chronic','inactive')),
  onset_date       TEXT,    -- ISO-8601 date
  resolved_date    TEXT,    -- ISO-8601 date; NULL = not resolved
  severity         TEXT     CHECK (severity IN ('mild','moderate','severe')),
  notes            TEXT,
  created_by       INTEGER  REFERENCES users(id) ON DELETE SET NULL,
  created_at       TEXT     NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_diagnoses_patient_id ON diagnoses(patient_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_icd10_code ON diagnoses(icd10_code);

-- =============================================================================
-- MEDICATIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS medications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id    INTEGER NOT NULL REFERENCES patients(id)   ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  dosage        TEXT    NOT NULL,  -- e.g. "10 mg"
  frequency     TEXT    NOT NULL,  -- e.g. "twice daily"
  route         TEXT    NOT NULL DEFAULT 'oral'
                        CHECK (route IN ('oral','intravenous','intramuscular','subcutaneous','topical','inhaled','sublingual','other')),
  start_date    TEXT    NOT NULL,  -- ISO-8601 date
  end_date      TEXT,              -- NULL = ongoing
  status        TEXT    NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','discontinued','completed','on_hold')),
  prescriber_id INTEGER REFERENCES providers(id) ON DELETE SET NULL,
  notes         TEXT,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_medications_patient_id ON medications(patient_id);

-- =============================================================================
-- ALLERGIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS allergies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id    INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  allergen      TEXT    NOT NULL,
  reaction_type TEXT    NOT NULL CHECK (reaction_type IN ('rash','hives','anaphylaxis','nausea','swelling','respiratory','other')),
  severity      TEXT    NOT NULL CHECK (severity IN ('mild','moderate','severe','life_threatening')),
  onset_date    TEXT,    -- ISO-8601 date; approximate
  status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','resolved')),
  notes         TEXT,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_allergies_patient_id ON allergies(patient_id);

-- =============================================================================
-- VITALS
-- =============================================================================

CREATE TABLE IF NOT EXISTS vitals (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id     INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  recorded_at    TEXT    NOT NULL,  -- ISO-8601 UTC datetime
  bp_systolic    INTEGER,           -- mmHg
  bp_diastolic   INTEGER,           -- mmHg
  heart_rate     INTEGER,           -- bpm
  temperature    REAL,              -- Celsius
  weight_kg      REAL,
  height_cm      REAL,
  o2_saturation  REAL,              -- percent, e.g. 98.5
  recorded_by    INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vitals_patient_id  ON vitals(patient_id);
CREATE INDEX IF NOT EXISTS idx_vitals_recorded_at ON vitals(recorded_at);

-- =============================================================================
-- LAB RESULTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS lab_results (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id            INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  test_name             TEXT    NOT NULL,
  test_code             TEXT,              -- LOINC or internal code
  value                 TEXT    NOT NULL,  -- store as text to accommodate non-numeric results
  unit                  TEXT,
  reference_range_low   REAL,
  reference_range_high  REAL,
  status                TEXT    NOT NULL DEFAULT 'final'
                                CHECK (status IN ('preliminary','final','corrected','flagged_high','flagged_low','critical')),
  collected_at          TEXT    NOT NULL,  -- ISO-8601 UTC datetime
  resulted_at           TEXT,              -- ISO-8601 UTC datetime
  ordered_by            INTEGER REFERENCES providers(id) ON DELETE SET NULL,
  notes                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_lab_results_patient_id   ON lab_results(patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_collected_at ON lab_results(collected_at);

-- =============================================================================
-- CLINICAL NOTES (SOAP)
-- =============================================================================

CREATE TABLE IF NOT EXISTS clinical_notes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id      INTEGER NOT NULL REFERENCES patients(id)   ON DELETE CASCADE,
  provider_id     INTEGER NOT NULL REFERENCES providers(id)  ON DELETE RESTRICT,
  appointment_id  INTEGER          REFERENCES appointments(id) ON DELETE SET NULL,
  note_type       TEXT    NOT NULL DEFAULT 'soap'
                          CHECK (note_type IN ('soap','progress','discharge','referral','procedure','other')),
  subjective      TEXT,   -- patient-reported symptoms / history
  objective       TEXT,   -- measurable findings (vitals, exam)
  assessment      TEXT,   -- diagnosis / clinical impression
  plan            TEXT,   -- treatment plan
  is_locked       INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0, 1)),
  locked_at       TEXT,   -- ISO-8601 UTC datetime; NULL = not locked
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_clinical_notes_patient_id  ON clinical_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_notes_provider_id ON clinical_notes(provider_id);

CREATE TABLE IF NOT EXISTS note_addenda (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id    INTEGER NOT NULL REFERENCES clinical_notes(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES users(id)          ON DELETE RESTRICT,
  content    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_note_addenda_note_id ON note_addenda(note_id);

CREATE TABLE IF NOT EXISTS note_templates (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT    NOT NULL,
  note_type             TEXT    NOT NULL DEFAULT 'soap'
                                CHECK (note_type IN ('soap','progress','discharge','referral','procedure','other')),
  subjective_template   TEXT,
  objective_template    TEXT,
  assessment_template   TEXT,
  plan_template         TEXT,
  created_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_shared             INTEGER NOT NULL DEFAULT 0 CHECK (is_shared IN (0, 1))  -- shared with all providers
);

-- =============================================================================
-- DOCUMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS documents (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id   INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  filename     TEXT    NOT NULL,
  file_type    TEXT    NOT NULL,   -- MIME type, e.g. 'application/pdf'
  file_size    INTEGER NOT NULL,   -- bytes
  storage_path TEXT    NOT NULL,   -- relative path on disk
  description  TEXT,
  uploaded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_patient_id ON documents(patient_id);

CREATE TABLE IF NOT EXISTS document_access_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id  INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  accessed_by  INTEGER NOT NULL REFERENCES users(id)     ON DELETE RESTRICT,
  accessed_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  access_type  TEXT    NOT NULL CHECK (access_type IN ('view','download','upload','delete'))
);

CREATE INDEX IF NOT EXISTS idx_document_access_logs_document_id ON document_access_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_document_access_logs_accessed_by ON document_access_logs(accessed_by);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE TRIGGER IF NOT EXISTS trg_appointments_updated_at
  AFTER UPDATE ON appointments
  FOR EACH ROW
BEGIN
  UPDATE appointments SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_clinical_notes_updated_at
  AFTER UPDATE ON clinical_notes
  FOR EACH ROW
BEGIN
  UPDATE clinical_notes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;
