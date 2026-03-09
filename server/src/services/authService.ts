/**
 * Auth service — pure business-logic functions for authentication flows.
 * Route handlers delegate to these so the logic is easily unit-testable.
 */

import bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import { getDb } from '../db/database';
import { User, AuthEventType, JwtPayload } from '../types';

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// ─── Password utilities ───────────────────────────────────────────────────────

/**
 * Hashes a plaintext password using bcrypt.
 *
 * @param password - Plaintext password.
 * @returns Bcrypt hash string.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Compares a plaintext password against a stored bcrypt hash.
 *
 * @param password - Plaintext candidate password.
 * @param hash     - Stored bcrypt hash.
 * @returns true if they match.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validates that a password meets minimum complexity requirements.
 * Rules: ≥ 8 chars, at least one uppercase, one lowercase, one digit, one special char.
 *
 * @param password - Candidate password.
 * @returns null on success, or an error message string.
 */
export function validatePasswordComplexity(password: string): string | null {
  if (password.length < 8)          return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password))      return 'Password must contain an uppercase letter';
  if (!/[a-z]/.test(password))      return 'Password must contain a lowercase letter';
  if (!/[0-9]/.test(password))      return 'Password must contain a digit';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password must contain a special character';
  return null;
}

// ─── User helpers ─────────────────────────────────────────────────────────────

/**
 * Looks up a user by email (case-insensitive).
 *
 * @param email - Email to look up.
 * @returns The user row, or undefined.
 */
export function findUserByEmail(email: string): User | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;
}

/**
 * Returns the list of role names assigned to a user.
 *
 * @param userId - User id.
 * @returns Array of role name strings.
 */
export function getUserRoles(userId: number): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT r.name FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ?`,
    )
    .all(userId) as { name: string }[];
  return rows.map((r) => r.name);
}

/**
 * Builds the JWT payload for a user (id, email, roles).
 *
 * @param user - The user row from the database.
 * @returns JwtPayload ready to be signed.
 */
export function buildJwtPayload(user: User): Omit<JwtPayload, 'iat' | 'exp'> {
  const roles = getUserRoles(user.id);
  return { sub: user.id, email: user.email, roles };
}

// ─── Lockout helpers ──────────────────────────────────────────────────────────

/**
 * Checks whether a user is currently locked out due to too many failed logins.
 *
 * @param user - The user row (must include locked_until).
 * @returns true if locked out.
 */
export function isLockedOut(user: User): boolean {
  if (!user.locked_until) return false;
  return new Date(user.locked_until) > new Date();
}

/**
 * Increments a user's failed login counter and applies a lockout if the
 * threshold is reached.
 *
 * @param userId - User id.
 */
export function recordFailedLogin(userId: number): void {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User;
  const newCount = user.failed_login_attempts + 1;

  if (newCount >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
    db.prepare(
      `UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?`,
    ).run(newCount, lockedUntil, userId);
  } else {
    db.prepare(`UPDATE users SET failed_login_attempts = ? WHERE id = ?`).run(newCount, userId);
  }
}

/**
 * Resets the failed login counter and clears any lockout on successful auth.
 *
 * @param userId - User id.
 */
export function resetFailedLogins(userId: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?`,
  ).run(userId);
}

// ─── Audit helpers ────────────────────────────────────────────────────────────

/**
 * Writes an entry to the auth audit log.
 *
 * @param eventType  - The type of auth event.
 * @param userId     - The user id (nullable for pre-auth events).
 * @param ipAddress  - Client IP address.
 * @param userAgent  - Client user-agent string.
 * @param metadata   - Additional key/value data to JSON-serialise.
 */
export function logAuthEvent(
  eventType: AuthEventType | string,
  userId: number | null,
  ipAddress: string | null,
  userAgent: string | null,
  metadata?: Record<string, unknown>,
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_log_auth (user_id, event_type, ip_address, user_agent, metadata)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(userId, eventType, ipAddress, userAgent, metadata ? JSON.stringify(metadata) : null);
}

// ─── Registration helpers ─────────────────────────────────────────────────────

/**
 * Creates a new user row and assigns the specified roles.
 *
 * @param email        - Email address.
 * @param passwordHash - Pre-hashed password.
 * @param roleNames    - Role names to assign (must already exist in `roles`).
 * @returns The newly created user's id.
 */
export function createUser(
  email: string,
  passwordHash: string,
  roleNames: string[],
): number {
  const db = getDb();

  const { lastInsertRowid } = db
    .prepare(`INSERT INTO users (email, password_hash) VALUES (?, ?)`)
    .run(email.toLowerCase(), passwordHash);
  const userId = Number(lastInsertRowid);

  for (const roleName of roleNames) {
    const role = db.prepare(`SELECT id FROM roles WHERE name = ?`).get(roleName) as
      | { id: number }
      | undefined;
    if (role) {
      db.prepare(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)`).run(
        userId,
        role.id,
      );
    }
  }

  return userId;
}

/**
 * Creates a patient record (and demographics placeholder) linked to a user.
 *
 * @param userId - User id.
 * @param mrn    - Medical Record Number (must be unique).
 * @returns The new patient id.
 */
export function createPatientRecord(userId: number, mrn: string): number {
  const db = getDb();
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO patients (user_id, mrn) VALUES (?, ?)`)
    .run(userId, mrn);
  const patientId = Number(lastInsertRowid);

  // Insert empty demographics row so later UPDATEs always find a row
  db.prepare(
    `INSERT INTO patient_demographics (patient_id, first_name, last_name)
     VALUES (?, '', '')`,
  ).run(patientId);

  return patientId;
}

/**
 * Generates a unique numeric MRN in the format MRN-TEST-XXXXX.
 */
export function generateMrn(): string {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) as cnt FROM patients`)
    .get() as { cnt: number };
  const seq = String(row.cnt + 1).padStart(5, '0');
  return `MRN-TEST-${seq}`;
}

// ─── MFA helpers ──────────────────────────────────────────────────────────────

/**
 * Generates a new TOTP secret and stores it (disabled) for the user.
 *
 * @param userId - User id.
 * @returns The base32 secret and otpauth URI for QR rendering.
 */
export async function setupMfa(
  userId: number,
  userEmail: string,
): Promise<{ secret: string; otpauthUri: string; qrCodeDataUrl: string }> {
  const db = getDb();
  const secret = authenticator.generateSecret();
  const otpauthUri = authenticator.keyuri(userEmail, 'HelixHealthPortal', secret);
  const qrCodeDataUrl = await qrcode.toDataURL(otpauthUri);

  // Upsert — overwrite any previous un-enabled secret
  db.prepare(
    `INSERT INTO mfa_secrets (user_id, secret, is_enabled)
     VALUES (?, ?, 0)
     ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret, is_enabled = 0`,
  ).run(userId, secret);

  return { secret, otpauthUri, qrCodeDataUrl };
}

/**
 * Validates a TOTP code against the stored secret. If correct, marks MFA as
 * enabled for the user.
 *
 * @param userId - User id.
 * @param code   - 6-digit TOTP code from the authenticator app.
 * @returns true if the code was valid and MFA was enabled.
 */
export function verifyAndEnableMfa(userId: number, code: string): boolean {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM mfa_secrets WHERE user_id = ?`)
    .get(userId) as { secret: string; is_enabled: number } | undefined;

  if (!row) return false;

  const valid = authenticator.verify({ token: code, secret: row.secret });
  if (valid) {
    db.prepare(`UPDATE mfa_secrets SET is_enabled = 1 WHERE user_id = ?`).run(userId);
  }
  return valid;
}

/**
 * Validates a TOTP code without changing the enabled state (used during login).
 *
 * @param userId - User id.
 * @param code   - 6-digit TOTP code.
 * @returns true if the code is valid.
 */
export function validateMfaCode(userId: number, code: string): boolean {
  const db = getDb();
  const row = db
    .prepare(`SELECT secret, is_enabled FROM mfa_secrets WHERE user_id = ?`)
    .get(userId) as { secret: string; is_enabled: number } | undefined;

  if (!row || !row.is_enabled) return false;
  return authenticator.verify({ token: code, secret: row.secret });
}

/**
 * Returns whether a user has MFA enabled.
 *
 * @param userId - User id.
 */
export function hasMfaEnabled(userId: number): boolean {
  const db = getDb();
  const row = db
    .prepare(`SELECT is_enabled FROM mfa_secrets WHERE user_id = ?`)
    .get(userId) as { is_enabled: number } | undefined;
  return (row?.is_enabled ?? 0) === 1;
}
