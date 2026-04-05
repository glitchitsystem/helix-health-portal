/**
 * Auth routes — POST /api/auth/*
 *
 * All endpoints follow the pattern:
 *  1. Validate input
 *  2. Delegate to service functions
 *  3. Issue tokens / respond
 *  4. Log the event
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  findUserByEmail,
  buildJwtPayload,
  hashPassword,
  verifyPassword,
  validatePasswordComplexity,
  isLockedOut,
  recordFailedLogin,
  resetFailedLogins,
  logAuthEvent,
  createUser,
  createPatientRecord,
  generateMrn,
  setupMfa,
  verifyAndEnableMfa,
  validateMfaCode,
  hasMfaEnabled,
} from '../services/authService';
import {
  issueAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  issueSignedToken,
  verifySignedToken,
} from '../services/tokenService';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/emailService';
import { validateToken } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { getDb } from '../db/database';
import { createError } from '../middleware/errorHandler';

const router = Router();

// ─── POST /register ───────────────────────────────────────────────────────────

/**
 * Register a new patient account.
 * Body: { email: string; password: string }
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      return next(createError('email and password are required', 400));
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return next(createError('Invalid email address', 400));
    }

    const complexityError = validatePasswordComplexity(password);
    if (complexityError) return next(createError(complexityError, 400));

    if (findUserByEmail(email)) {
      // Return the same message to prevent user enumeration
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const passwordHash = await hashPassword(password);
    const userId = createUser(email, passwordHash, ['patient']);
    const mrn = generateMrn();
    createPatientRecord(userId, mrn);

    // Issue a short-lived email verification token and mock-send it
    const verifyToken = issueSignedToken({ userId, purpose: 'email_verify' }, '24h');
    sendVerificationEmail(email, verifyToken);

    logAuthEvent('register', userId, req.ip ?? null, req.headers['user-agent'] ?? null, {
      email,
      mrn,
    });

    return res.status(201).json({
      success: true,
      data: {
        message:
          'Registration successful. Please check your email (console) to verify your account.',
        userId,
        mrn,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /login ──────────────────────────────────────────────────────────────

/**
 * Authenticate with email + password.
 * Returns access token, refresh token, and a flag indicating if MFA is required.
 * Body: { email: string; password: string }
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    const ip = req.ip ?? null;
    const ua = req.headers['user-agent'] ?? null;

    if (!email || !password) {
      return next(createError('email and password are required', 400));
    }

    const user = findUserByEmail(email);

    if (!user) {
      logAuthEvent('login_failure', null, ip, ua, { reason: 'user_not_found', email });
      return next(createError('Invalid credentials', 401));
    }

    // Account checks
    if (!user.is_active) {
      logAuthEvent('login_failure', user.id, ip, ua, { reason: 'account_inactive' });
      return next(createError('Account is disabled. Please contact support.', 403));
    }

    if (isLockedOut(user)) {
      logAuthEvent('account_locked', user.id, ip, ua, {});
      return next(createError('Account temporarily locked. Too many failed login attempts.', 429));
    }

    const passwordMatch = await verifyPassword(password, user.password_hash);

    if (!passwordMatch) {
      recordFailedLogin(user.id);
      logAuthEvent('login_failure', user.id, ip, ua, { reason: 'bad_password' });
      return next(createError('Invalid credentials', 401));
    }

    if (!user.email_verified) {
      logAuthEvent('login_failure', user.id, ip, ua, { reason: 'email_not_verified' });
      return next(createError('Please verify your email address before logging in.', 403));
    }

    resetFailedLogins(user.id);

    // If MFA is enabled, return a short-lived MFA challenge token instead of
    // full tokens — the client must complete /api/auth/mfa/validate next.
    if (hasMfaEnabled(user.id)) {
      const mfaChallengeToken = issueSignedToken({ userId: user.id, purpose: 'mfa_challenge' }, '5m');
      logAuthEvent('login_success', user.id, ip, ua, { mfa_required: true });
      return res.json({
        success: true,
        data: { mfaRequired: true, mfaChallengeToken },
      });
    }

    const payload = buildJwtPayload(user);
    const accessToken = issueAccessToken(payload);
    const refreshToken = issueRefreshToken(user.id);

    logAuthEvent('login_success', user.id, ip, ua, { mfa_required: false });

    return res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, roles: payload.roles },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /logout ─────────────────────────────────────────────────────────────

/**
 * Revoke the provided refresh token.
 * Body: { refreshToken: string }
 */
router.post('/logout', validateToken, (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (refreshToken) {
      revokeRefreshToken(refreshToken);
    }
    logAuthEvent('logout', req.user?.sub ?? null, req.ip ?? null, req.headers['user-agent'] ?? null);
    return res.json({ success: true, data: { message: 'Logged out successfully' } });
  } catch (err) {
    next(err);
  }
});

// ─── POST /refresh ────────────────────────────────────────────────────────────

/**
 * Exchange a valid refresh token for a new access token + rotated refresh token.
 * Body: { refreshToken: string }
 */
router.post('/refresh', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) return next(createError('refreshToken is required', 400));

    const { userId, newRefreshToken } = rotateRefreshToken(refreshToken);

    const user = getDb()
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(userId) as { id: number; email: string } | undefined;

    if (!user) return next(createError('User not found', 404));

    const roles = (
      getDb()
        .prepare(
          `SELECT r.name FROM roles r
           JOIN user_roles ur ON ur.role_id = r.id
           WHERE ur.user_id = ?`,
        )
        .all(userId) as { name: string }[]
    ).map((r) => r.name);

    const accessToken = issueAccessToken({ sub: userId, email: user.email, roles });

    logAuthEvent(
      'token_refresh',
      userId,
      req.ip ?? null,
      req.headers['user-agent'] ?? null,
    );

    return res.json({
      success: true,
      data: { accessToken, refreshToken: newRefreshToken },
    });
  } catch (err) {
    if (err instanceof Error) {
      return next(createError(err.message, 401));
    }
    next(err);
  }
});

// ─── GET /me ──────────────────────────────────────────────────────────────────

/**
 * Returns the authenticated user's profile plus linked patient/provider IDs.
 * This is used by the client to resolve patient-scoped routes for the current
 * session without needing a separate patient lookup call.
 */
router.get('/me', validateToken, (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const userId = req.user!.sub;

    const patient = db.prepare(
      `SELECT p.id, p.mrn, d.first_name, d.last_name
       FROM patients p
       LEFT JOIN patient_demographics d ON d.patient_id = p.id
       WHERE p.user_id = ?`,
    ).get(userId) as
      | { id: number; mrn: string; first_name: string | null; last_name: string | null }
      | undefined;

    const provider = db.prepare(
      'SELECT id FROM providers WHERE user_id = ?',
    ).get(userId) as { id: number } | undefined;

    return res.json({
      success: true,
      data: {
        id: req.user!.sub,
        email: req.user!.email,
        roles: req.user!.roles,
        patient_id: patient?.id ?? null,
        patient: patient
          ? {
              id: patient.id,
              mrn: patient.mrn,
              first_name: patient.first_name,
              last_name: patient.last_name,
            }
          : null,
        provider_id: provider?.id ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /mfa/setup ──────────────────────────────────────────────────────────

/**
 * Generate a TOTP secret and return a QR-code data URL.
 * Requires a valid access token.
 */
router.post('/mfa/setup', validateToken, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user!;
    const { secret, otpauthUri, qrCodeDataUrl } = await setupMfa(user.sub, user.email);

    logAuthEvent('mfa_setup', user.sub, req.ip ?? null, req.headers['user-agent'] ?? null);

    return res.json({
      success: true,
      data: { secret, otpauthUri, qrCodeDataUrl },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /mfa/verify ─────────────────────────────────────────────────────────

/**
 * Verify a TOTP code and enable MFA on the account.
 * Requires a valid access token.
 * Body: { code: string }
 */
router.post('/mfa/verify', validateToken, (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { code } = req.body as { code?: string };
    if (!code) return next(createError('code is required', 400));

    const user = req.user!;
    const valid = verifyAndEnableMfa(user.sub, code);
    if (!valid) return next(createError('Invalid or expired TOTP code', 400));

    logAuthEvent('mfa_enabled', user.sub, req.ip ?? null, req.headers['user-agent'] ?? null);

    return res.json({ success: true, data: { message: 'MFA enabled successfully' } });
  } catch (err) {
    next(err);
  }
});

// ─── POST /mfa/validate ───────────────────────────────────────────────────────

/**
 * Complete a login by validating the TOTP code (second step for MFA users).
 * Body: { mfaChallengeToken: string; code: string }
 */
router.post('/mfa/validate', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { mfaChallengeToken, code } = req.body as {
      mfaChallengeToken?: string;
      code?: string;
    };

    if (!mfaChallengeToken || !code) {
      return next(createError('mfaChallengeToken and code are required', 400));
    }

    let payload: Record<string, unknown>;
    try {
      payload = verifySignedToken(mfaChallengeToken);
    } catch {
      return next(createError('Invalid or expired MFA challenge token', 401));
    }

    if (payload.purpose !== 'mfa_challenge') {
      return next(createError('Invalid token purpose', 401));
    }

    const userId = payload.userId as number;
    const valid = validateMfaCode(userId, code);
    if (!valid) {
      logAuthEvent(
        'login_failure',
        userId,
        req.ip ?? null,
        req.headers['user-agent'] ?? null,
        { reason: 'bad_mfa_code' },
      );
      return next(createError('Invalid TOTP code', 401));
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as
      | { id: number; email: string }
      | undefined;
    if (!user) return next(createError('User not found', 404));

    const roles = (
      db
        .prepare(
          `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?`,
        )
        .all(userId) as { name: string }[]
    ).map((r) => r.name);

    const accessToken = issueAccessToken({ sub: userId, email: user.email, roles });
    const refreshToken = issueRefreshToken(userId);

    logAuthEvent('mfa_validated', userId, req.ip ?? null, req.headers['user-agent'] ?? null);

    return res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: { id: userId, email: user.email, roles },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /password-reset/request ────────────────────────────────────────────

/**
 * Request a password-reset link (mocked — logged to console).
 * Body: { email: string }
 */
router.post('/password-reset/request', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) return next(createError('email is required', 400));

    const user = findUserByEmail(email);
    // Always respond 200 to prevent user enumeration
    if (!user) {
      return res.json({
        success: true,
        data: { message: 'If that email is registered, a reset link has been sent.' },
      });
    }

    const resetToken = issueSignedToken(
      { userId: user.id, purpose: 'password_reset' },
      '30m',
    );
    sendPasswordResetEmail(email, resetToken);

    logAuthEvent(
      'password_reset_request',
      user.id,
      req.ip ?? null,
      req.headers['user-agent'] ?? null,
    );

    return res.json({
      success: true,
      data: { message: 'If that email is registered, a reset link has been sent.' },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /password-reset/confirm ────────────────────────────────────────────

/**
 * Confirm a password reset using the token from the email link.
 * Body: { token: string; newPassword: string }
 */
router.post('/password-reset/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, newPassword } = req.body as { token?: string; newPassword?: string };
    if (!token || !newPassword) {
      return next(createError('token and newPassword are required', 400));
    }

    let payload: Record<string, unknown>;
    try {
      // COURSE_BUG [Section 10 - Auth]: Manual expiry pre-check uses > instead of >=.
      // A token that has reached exactly its 30-minute expiry boundary still has
      // timeRemaining === 0.  The check `timeRemaining > 0` treats it as expired
      // one instant early.  In practice this rounds to approximately one second
      // depending on clock resolution.
      // Fix: change > 0  to  >= 0.
      const rawDecoded = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString('utf8'),
      ) as { iat?: number };
      if (rawDecoded.iat) {
        const RESET_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
        const timeRemaining = rawDecoded.iat * 1000 + RESET_EXPIRY_MS - Date.now();
        if (!(timeRemaining > 0)) { // COURSE_BUG: should be >= 0
          return next(createError('Reset token has expired', 401));
        }
      }
      payload = verifySignedToken(token);
    } catch {
      return next(createError('Invalid or expired reset token', 401));
    }

    if (payload.purpose !== 'password_reset') {
      return next(createError('Invalid token purpose', 401));
    }

    const complexityError = validatePasswordComplexity(newPassword);
    if (complexityError) return next(createError(complexityError, 400));

    const userId = payload.userId as number;
    const newHash = await hashPassword(newPassword);
    const db = getDb();
    db.prepare(
      `UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?`,
    ).run(newHash, userId);

    // Revoke all existing refresh tokens to force re-login everywhere
    revokeAllUserRefreshTokens(userId);

    logAuthEvent(
      'password_reset_confirm',
      userId,
      req.ip ?? null,
      req.headers['user-agent'] ?? null,
    );

    return res.json({
      success: true,
      data: { message: 'Password reset successful. Please log in with your new password.' },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
