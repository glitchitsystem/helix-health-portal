-- ─── Phase 4: Billing, Insurance & Payments ──────────────────────────────────
-- All tables use IF NOT EXISTS for idempotent migrations.

-- Insurance plans on file for patients
CREATE TABLE IF NOT EXISTS insurance_plans (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id        INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  insurer_name      TEXT    NOT NULL,
  plan_name         TEXT    NOT NULL,
  member_id         TEXT    NOT NULL,
  group_number      TEXT,
  effective_date    TEXT    NOT NULL,  -- ISO-8601 date
  expiration_date   TEXT,             -- NULL = no expiry on file
  is_primary        INTEGER NOT NULL DEFAULT 1 CHECK (is_primary IN (0, 1)),
  copay_amount      REAL    NOT NULL DEFAULT 0,
  deductible_amount REAL    NOT NULL DEFAULT 0,
  deductible_met    REAL    NOT NULL DEFAULT 0,
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Invoices generated after appointments
CREATE TABLE IF NOT EXISTS invoices (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id       INTEGER NOT NULL REFERENCES patients(id)      ON DELETE CASCADE,
  appointment_id   INTEGER REFERENCES appointments(id)           ON DELETE SET NULL,
  status           TEXT    NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','paid','overdue','cancelled','disputed')),
  total_amount     REAL    NOT NULL DEFAULT 0,
  insurance_amount REAL    NOT NULL DEFAULT 0,
  patient_amount   REAL    NOT NULL DEFAULT 0,
  due_date         TEXT    NOT NULL,
  paid_at          TEXT,
  created_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Line items within an invoice (CPT-coded services)
CREATE TABLE IF NOT EXISTS invoice_items (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id             INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  cpt_code               TEXT    NOT NULL,
  description            TEXT    NOT NULL,
  quantity               INTEGER NOT NULL DEFAULT 1,
  unit_price             REAL    NOT NULL,
  insurance_adjustment   REAL    NOT NULL DEFAULT 0,
  patient_responsibility REAL    NOT NULL
);

-- Payments against invoices (mocked Stripe)
CREATE TABLE IF NOT EXISTS payments (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id              INTEGER NOT NULL REFERENCES invoices(id)  ON DELETE CASCADE,
  patient_id              INTEGER NOT NULL REFERENCES patients(id)  ON DELETE CASCADE,
  amount                  REAL    NOT NULL,
  payment_method          TEXT    NOT NULL DEFAULT 'card'
                                  CHECK (payment_method IN ('card','bank_transfer','check','payment_plan')),
  stripe_payment_intent_id TEXT,
  status                  TEXT    NOT NULL DEFAULT 'succeeded'
                                  CHECK (status IN ('succeeded','failed','refunded','pending')),
  paid_at                 TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  notes                   TEXT
);

-- Instalment payment plans for large invoices
CREATE TABLE IF NOT EXISTS payment_plans (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id          INTEGER NOT NULL REFERENCES invoices(id)  ON DELETE CASCADE,
  patient_id          INTEGER NOT NULL REFERENCES patients(id)  ON DELETE CASCADE,
  installment_amount  REAL    NOT NULL,
  installments_total  INTEGER NOT NULL,
  installments_paid   INTEGER NOT NULL DEFAULT 0,
  next_due_date       TEXT    NOT NULL,
  status              TEXT    NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','completed','cancelled','overdue')),
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Patient billing disputes
CREATE TABLE IF NOT EXISTS billing_disputes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id       INTEGER NOT NULL REFERENCES invoices(id)  ON DELETE CASCADE,
  patient_id       INTEGER NOT NULL REFERENCES patients(id)  ON DELETE CASCADE,
  reason           TEXT    NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open','under_review','resolved','rejected')),
  submitted_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_at      TEXT,
  resolution_notes TEXT
);

-- ── Triggers: keep updated_at current ────────────────────────────────────────

CREATE TRIGGER IF NOT EXISTS trg_insurance_plans_updated_at
  AFTER UPDATE ON insurance_plans
  FOR EACH ROW BEGIN
    UPDATE insurance_plans SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = OLD.id;
  END;

CREATE TRIGGER IF NOT EXISTS trg_invoices_updated_at
  AFTER UPDATE ON invoices
  FOR EACH ROW BEGIN
    UPDATE invoices SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = OLD.id;
  END;
