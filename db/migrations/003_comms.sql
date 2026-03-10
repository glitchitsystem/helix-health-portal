-- =============================================================================
-- Helix Health Portal — Migration 003: Prescriptions & Communications
-- All tables use IF NOT EXISTS for idempotency.
-- =============================================================================

-- =============================================================================
-- PRESCRIPTIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS prescriptions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id        INTEGER NOT NULL REFERENCES patients(id)  ON DELETE CASCADE,
  prescriber_id     INTEGER NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
  drug_name         TEXT    NOT NULL,
  drug_ndc          TEXT,                    -- National Drug Code
  dosage            TEXT    NOT NULL,
  frequency         TEXT    NOT NULL,
  route             TEXT    NOT NULL DEFAULT 'oral'
                            CHECK (route IN ('oral','intravenous','intramuscular','subcutaneous','topical','inhaled','sublingual','transdermal','other')),
  quantity          INTEGER NOT NULL DEFAULT 30,
  refills_remaining INTEGER NOT NULL DEFAULT 0,
  start_date        TEXT    NOT NULL,        -- ISO-8601 date
  end_date          TEXT,                    -- ISO-8601 date; NULL = indefinite
  status            TEXT    NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','discontinued','expired','on_hold','pending')),
  is_controlled     INTEGER NOT NULL DEFAULT 0 CHECK (is_controlled IN (0, 1)),
  schedule_class    TEXT    CHECK (schedule_class IN ('II','III','IV','V')),
  pharmacy_name     TEXT,
  pharmacy_phone    TEXT,
  notes             TEXT,
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id   ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_prescriber_id ON prescriptions(prescriber_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status        ON prescriptions(status);

-- =============================================================================
-- DRUG INTERACTIONS LOG
-- =============================================================================

CREATE TABLE IF NOT EXISTS drug_interactions_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id  INTEGER NOT NULL REFERENCES patients(id)  ON DELETE CASCADE,
  drug_a      TEXT    NOT NULL,
  drug_b      TEXT    NOT NULL,
  severity    TEXT    NOT NULL CHECK (severity IN ('mild','moderate','severe')),
  description TEXT    NOT NULL,
  checked_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  checked_by  INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_drug_interactions_patient_id ON drug_interactions_log(patient_id);

-- =============================================================================
-- REFILL REQUESTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS refill_requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  patient_id      INTEGER NOT NULL REFERENCES patients(id)      ON DELETE CASCADE,
  requested_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  status          TEXT    NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','denied','cancelled')),
  pharmacy_notes  TEXT,
  reviewed_by     INTEGER REFERENCES providers(id) ON DELETE SET NULL,
  reviewed_at     TEXT,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_refill_requests_prescription_id ON refill_requests(prescription_id);
CREATE INDEX IF NOT EXISTS idx_refill_requests_patient_id      ON refill_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_refill_requests_status          ON refill_requests(status);

-- =============================================================================
-- SECURE MESSAGING
-- =============================================================================

CREATE TABLE IF NOT EXISTS message_threads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subject     TEXT    NOT NULL,
  created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1))
);

CREATE TABLE IF NOT EXISTS message_thread_participants (
  thread_id    INTEGER NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id)           ON DELETE CASCADE,
  joined_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_read_at TEXT,
  PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_thread_participants_user_id   ON message_thread_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_thread_participants_thread_id ON message_thread_participants(thread_id);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id   INTEGER NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id   INTEGER NOT NULL REFERENCES users(id)           ON DELETE RESTRICT,
  body        TEXT    NOT NULL,
  is_priority INTEGER NOT NULL DEFAULT 0 CHECK (is_priority IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);

CREATE TABLE IF NOT EXISTS message_attachments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id   INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename     TEXT    NOT NULL,
  file_type    TEXT    NOT NULL,
  file_size    INTEGER NOT NULL,
  storage_path TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id ON message_attachments(message_id);

-- =============================================================================
-- NOTIFICATIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL,   -- 'new_message' | 'appointment_reminder' | 'lab_result' | 'refill_approved' | 'refill_denied' | 'appointment_cancelled' | 'appointment_rescheduled'
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  data_json  TEXT,               -- JSON blob for deep-linking (e.g. {"thread_id": 3})
  is_read    INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  read_at    TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT    NOT NULL,
  in_app_enabled    INTEGER NOT NULL DEFAULT 1 CHECK (in_app_enabled IN (0, 1)),
  email_enabled     INTEGER NOT NULL DEFAULT 1 CHECK (email_enabled IN (0, 1)),
  sms_enabled       INTEGER NOT NULL DEFAULT 0 CHECK (sms_enabled IN (0, 1)),
  PRIMARY KEY (user_id, notification_type)
);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE TRIGGER IF NOT EXISTS trg_prescriptions_updated_at
  AFTER UPDATE ON prescriptions
  FOR EACH ROW
BEGIN
  UPDATE prescriptions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_message_threads_updated_at
  AFTER INSERT ON messages
  FOR EACH ROW
BEGIN
  UPDATE message_threads SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.thread_id;
END;
