/**
 * tests/fixtures/auth.fixtures.ts
 *
 * Pre-seeded test credentials and auth helpers for Helix Health Portal.
 * All accounts exist in the seed data (password: TestPass123!).
 */

// ─── Test Credentials ─────────────────────────────────────────────────────────

export interface TestCredentials {
  email: string;
  password: string;
  role: string;
}

export const TEST_CREDENTIALS: Record<string, TestCredentials> = {
  admin: {
    email:    'admin@helixhealthportal.test',
    password: 'TestPass123!',
    role:     'admin',
  },
  provider: {
    email:    'provider@helixhealthportal.test',
    password: 'TestPass123!',
    role:     'provider',
  },
  cardiologist: {
    email:    'cardiologist@helixhealthportal.test',
    password: 'TestPass123!',
    role:     'provider',
  },
  dermatologist: {
    email:    'dermatologist@helixhealthportal.test',
    password: 'TestPass123!',
    role:     'provider',
  },
  orthopedic: {
    email:    'orthopedic@helixhealthportal.test',
    password: 'TestPass123!',
    role:     'provider',
  },
  nurse: {
    email:    'nurse@helixhealthportal.test',
    password: 'TestPass123!',
    role:     'nurse',
  },
  billing: {
    email:    'billing@helixhealthportal.test',
    password: 'TestPass123!',
    role:     'billing',
  },
  patient1: {
    email:    'patient1@helixhealthportal.test',
    password: 'TestPass123!',
    role:     'patient',
  },
  patient2: {
    email:    'patient2@helixhealthportal.test',
    password: 'TestPass123!',
    role:     'patient',
  },
  patient3: {
    email:    'patient03@helixhealthportal.test',
    password: 'TestPass123!',
    role:     'patient',
  },
};

// ─── Invalid / Edge-case Credentials ─────────────────────────────────────────

export const INVALID_CREDENTIALS = {
  wrongPassword: {
    email:    'patient1@helixhealthportal.test',
    password: 'WrongPass999!',
  },
  unknownEmail: {
    email:    'nobody@helixhealthportal.test',
    password: 'TestPass123!',
  },
  malformedEmail: {
    email:    'not-an-email',
    password: 'TestPass123!',
  },
  emptyPassword: {
    email:    'patient1@helixhealthportal.test',
    password: '',
  },
  sqlInjection: {
    email:    "' OR '1'='1",
    password: "' OR '1'='1",
  },
};

// ─── Token helpers ────────────────────────────────────────────────────────────

/**
 * Builds an expired JWT-like string for testing token rejection.
 * NOT a real JWT — just a structurally valid base64url string.
 */
export function buildExpiredTokenStub(): string {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: 99999,
    roles: ['patient'],
    iat: Math.floor(Date.now() / 1000) - 3600, // issued 1 hour ago
    exp: Math.floor(Date.now() / 1000) - 1800, // expired 30 min ago
  })).toString('base64url');
  return `${header}.${payload}.INVALID_SIGNATURE`;
}

/**
 * Builds a malformed (non-JWT) authorization header value.
 */
export function buildMalformedToken(): string {
  return 'not.a.real.jwt.at.all';
}

// ─── MFA test constants ───────────────────────────────────────────────────────

/**
 * TOTP secret used when seeding MFA-enabled test accounts.
 * Students set up a real TOTP secret here via the db/seed.ts MFA setup step,
 * or use the mock TOTP service in tests (which accepts any 6-digit code "000000"
 * when NODE_ENV=test).
 */
export const MFA_TEST_BYPASS_CODE = '000000'; // accepted by mock TOTP in test mode
export const MFA_TEST_SECRET_BASE32 = 'JBSWY3DPEHPK3PXP'; // example base32 secret

// ─── Registration payload factories ──────────────────────────────────────────

let _emailCounter = 1;

/**
 * Builds a unique registration payload suitable for POST /api/auth/register.
 */
export function buildRegistrationPayload(overrides: Partial<{
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}> = {}): { email: string; password: string; firstName: string; lastName: string } {
  const n = _emailCounter++;
  return {
    email:     `test.user.${n}.${Date.now()}@helixhealthportal.test`,
    password:  'TestPass123!',
    firstName: `TEST_NewUser`,
    lastName:  `${n}`,
    ...overrides,
  };
}
