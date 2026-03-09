-- =============================================================================
-- Helix Health Portal — Database Schema
-- Phase 1: Foundation & Auth
-- =============================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- =============================================================================
-- AUTH & IDENTITY
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash   TEXT    NOT NULL,
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  email_verified  INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,      -- ISO-8601 datetime when lockout expires
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,   -- 'admin' | 'provider' | 'nurse' | 'billing' | 'patient'
  description TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  resource    TEXT    NOT NULL,   -- e.g. 'appointments', 'lab_results', 'billing'
  action      TEXT    NOT NULL,   -- e.g. 'read', 'write', 'delete', 'admin'
  description TEXT,
  UNIQUE (resource, action)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id     INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  role_id     INTEGER NOT NULL REFERENCES roles(id)  ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INTEGER NOT NULL REFERENCES roles(id)       ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- =============================================================================
-- TOKENS
-- =============================================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT    NOT NULL UNIQUE,  -- SHA-256 hash of the raw token
  expires_at  TEXT    NOT NULL,         -- ISO-8601
  revoked_at  TEXT,                     -- NULL = still valid
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- =============================================================================
-- MULTI-FACTOR AUTHENTICATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS mfa_secrets (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret      TEXT    NOT NULL,        -- base32-encoded TOTP secret
  is_enabled  INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- =============================================================================
-- AUDIT
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_log_auth (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type  TEXT    NOT NULL,  -- 'login_success' | 'login_failure' | 'logout' | 'password_reset' | 'mfa_enabled' | 'register' | 'token_refresh'
  ip_address  TEXT,
  user_agent  TEXT,
  metadata    TEXT,              -- JSON blob for additional fields
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_auth_user_id    ON audit_log_auth(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_auth_event_type ON audit_log_auth(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_auth_created_at ON audit_log_auth(created_at);

-- =============================================================================
-- PATIENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS patients (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  mrn         TEXT    NOT NULL UNIQUE,  -- Medical Record Number, format: MRN-TEST-XXXXX
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS patient_demographics (
  patient_id              INTEGER PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  first_name              TEXT    NOT NULL,
  last_name               TEXT    NOT NULL,
  dob                     TEXT,          -- ISO-8601 date
  gender                  TEXT,          -- 'male' | 'female' | 'other' | 'prefer_not_to_say'
  phone                   TEXT,
  address_line1           TEXT,
  address_line2           TEXT,
  city                    TEXT,
  state                   TEXT,
  zip                     TEXT,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT
);

-- =============================================================================
-- PROVIDERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS provider_specialties (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS providers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  npi            TEXT    NOT NULL UNIQUE,   -- National Provider Identifier (10-digit)
  specialty_id   INTEGER REFERENCES provider_specialties(id) ON DELETE SET NULL,
  license_number TEXT,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- =============================================================================
-- TRIGGERS: keep updated_at current
-- =============================================================================

CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
  AFTER UPDATE ON users
  FOR EACH ROW
BEGIN
  UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_patients_updated_at
  AFTER UPDATE ON patients
  FOR EACH ROW
BEGIN
  UPDATE patients SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;
