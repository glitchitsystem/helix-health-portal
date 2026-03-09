/**
 * Token service.
 * Handles JWT access token generation/verification and refresh token
 * lifecycle (creation, rotation, revocation).
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database';
import { JwtPayload, RefreshToken } from '../types';

const JWT_SECRET = process.env.JWT_SECRET ?? 'helix-dev-secret-change-in-production';
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 7;

// ─── Access Tokens ────────────────────────────────────────────────────────────

/**
 * Issues a signed JWT access token for the given user.
 *
 * @param payload - User identity payload to embed in the token.
 * @returns A signed JWT string valid for 15 minutes.
 */
export function issueAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

/**
 * Verifies and decodes a JWT access token.
 *
 * @param token - The raw JWT string.
 * @returns The decoded payload.
 * @throws jwt.JsonWebTokenError | jwt.TokenExpiredError on failure.
 */
export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as unknown as JwtPayload;
}

// ─── Refresh Tokens ───────────────────────────────────────────────────────────

/**
 * Creates a new refresh token, persists its hash to the database, and returns
 * the raw (unhashed) token to send to the client.
 *
 * @param userId - The user this refresh token belongs to.
 * @returns The raw refresh token string (UUID v4).
 */
export function issueRefreshToken(userId: number): string {
  const raw = uuidv4();
  const hash = hashToken(raw);
  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const db = getDb();
  db.prepare(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
  ).run(userId, hash, expiresAt);

  return raw;
}

/**
 * Looks up a refresh token by its raw value, validates it, revokes it (token
 * rotation), and returns the associated user_id.
 *
 * @param rawToken - The raw refresh token sent by the client.
 * @returns The user_id on success.
 * @throws Error if the token is invalid, expired, or already revoked.
 */
export function rotateRefreshToken(rawToken: string): { userId: number; newRefreshToken: string } {
  const hash = hashToken(rawToken);
  const db = getDb();

  const row = db
    .prepare(`SELECT * FROM refresh_tokens WHERE token_hash = ?`)
    .get(hash) as RefreshToken | undefined;

  if (!row) throw new Error('Invalid refresh token');
  if (row.revoked_at) throw new Error('Refresh token has been revoked');
  if (new Date(row.expires_at) < new Date()) throw new Error('Refresh token has expired');

  // Revoke the old token (rotation)
  db.prepare(`UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    row.id,
  );

  // Issue a new one
  const newRefreshToken = issueRefreshToken(row.user_id);
  return { userId: row.user_id, newRefreshToken };
}

/**
 * Revokes a single refresh token by its raw value.
 *
 * @param rawToken - The raw token sent by the client during logout.
 */
export function revokeRefreshToken(rawToken: string): void {
  const hash = hashToken(rawToken);
  const db = getDb();
  db.prepare(
    `UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?`,
  ).run(new Date().toISOString(), hash);
}

/**
 * Revokes ALL active refresh tokens for a user (e.g. after password reset).
 *
 * @param userId - The user whose tokens should be revoked.
 */
export function revokeAllUserRefreshTokens(userId: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
  ).run(new Date().toISOString(), userId);
}

/**
 * Generates a signed, time-limited token for one-off flows (email verification,
 * password reset). Encoded as a JWT so expiry is self-contained.
 *
 * @param payload - Any serialisable payload.
 * @param expiresIn - JWT expiry string (default: '30m').
 */
export function issueSignedToken(payload: Record<string, unknown>, expiresIn = '30m'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

/**
 * Verifies and decodes a signed one-off token.
 *
 * @param token - Raw token string from the client.
 * @returns The decoded payload.
 * @throws If invalid or expired.
 */
export function verifySignedToken(token: string): Record<string, unknown> {
  return jwt.verify(token, JWT_SECRET) as unknown as Record<string, unknown>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * SHA-256 hashes a raw token string. Only the hash is stored in the database.
 *
 * @param raw - The raw token value.
 * @returns Hex-encoded SHA-256 digest.
 */
export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}
