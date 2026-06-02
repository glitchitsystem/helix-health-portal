import {
  validatePasswordComplexity,
  isLockedOut,
  recordFailedLogin,
  verifyAndEnableMfa,
  validateMfaCode,
  hasMfaEnabled,
  createUser,
} from '../../server/src/services/authService';
import { getDb } from '../../server/src/db/database';
import { authenticator } from 'otplib';
import { User } from '../../server/src/types';

jest.mock('../../server/src/db/database');
jest.mock('otplib', () => ({
  authenticator: {
    verify: jest.fn(),
    generateSecret: jest.fn(),
    keyuri: jest.fn(),
  },
}));

const mockGetDb = getDb as jest.MockedFunction<typeof getDb>;
const mockAuthenticator = authenticator as jest.Mocked<typeof authenticator>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrepare(returnValue: unknown = undefined) {
  const stmt = {
    get: jest.fn().mockReturnValue(returnValue),
    all: jest.fn().mockReturnValue([]),
    run: jest.fn().mockReturnValue({ lastInsertRowid: 1 }),
  };
  return jest.fn().mockReturnValue(stmt);
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    email: 'test@example.com',
    password_hash: 'hash',
    is_active: 1,
    email_verified: 1,
    failed_login_attempts: 0,
    locked_until: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── validatePasswordComplexity ───────────────────────────────────────────────

describe('validatePasswordComplexity', () => {
  it('validatePasswordComplexity returns null when password meets all requirements', () => {
    // Arrange
    const password = 'StrongP@ss1';

    // Act
    const result = validatePasswordComplexity(password);

    // Assert
    expect(result).toBeNull();
  });

  it('validatePasswordComplexity returns error when password is shorter than 8 characters', () => {
    // Arrange
    const password = 'Sh0rt!';

    // Act
    const result = validatePasswordComplexity(password);

    // Assert
    expect(result).toBe('Password must be at least 8 characters');
  });

  it('validatePasswordComplexity returns error when password has no uppercase letter', () => {
    // Arrange
    const password = 'nouppercase1!';

    // Act
    const result = validatePasswordComplexity(password);

    // Assert
    expect(result).toBe('Password must contain an uppercase letter');
  });

  it('validatePasswordComplexity returns error when password has no lowercase letter', () => {
    // Arrange
    const password = 'NOLOWERCASE1!';

    // Act
    const result = validatePasswordComplexity(password);

    // Assert
    expect(result).toBe('Password must contain a lowercase letter');
  });

  it('validatePasswordComplexity returns error when password has no digit', () => {
    // Arrange
    const password = 'NoDigitHere!';

    // Act
    const result = validatePasswordComplexity(password);

    // Assert
    expect(result).toBe('Password must contain a digit');
  });

  it('validatePasswordComplexity returns error when password has no special character', () => {
    // Arrange
    const password = 'NoSpecial1A';

    // Act
    const result = validatePasswordComplexity(password);

    // Assert
    expect(result).toBe('Password must contain a special character');
  });
});

// ─── isLockedOut ──────────────────────────────────────────────────────────────

describe('isLockedOut', () => {
  it('isLockedOut returns false when locked_until is null', () => {
    // Arrange
    const user = makeUser({ locked_until: null });

    // Act
    const result = isLockedOut(user);

    // Assert
    expect(result).toBe(false);
  });

  it('isLockedOut returns false when locked_until is in the past', () => {
    // Arrange — lockout expired 1 hour ago
    const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const user = makeUser({ locked_until: pastDate });

    // Act
    const result = isLockedOut(user);

    // Assert
    expect(result).toBe(false);
  });

  it('isLockedOut returns true when locked_until is in the future', () => {
    // Arrange — lockout expires 15 minutes from now
    const futureDate = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const user = makeUser({ locked_until: futureDate });

    // Act
    const result = isLockedOut(user);

    // Assert
    expect(result).toBe(true);
  });
});

// ─── recordFailedLogin ────────────────────────────────────────────────────────

describe('recordFailedLogin', () => {
  it('recordFailedLogin increments the counter without setting a lockout when below the threshold', () => {
    // Arrange — user has had 3 failed attempts; threshold is 5
    const user = makeUser({ id: 1, failed_login_attempts: 3 });
    const runMock = jest.fn().mockReturnValue({});
    const db = {
      prepare: jest.fn((sql: string) => ({
        get: jest.fn().mockReturnValue(user),
        run: runMock,
      })),
    };
    mockGetDb.mockReturnValue(db as any);

    // Act
    recordFailedLogin(1);

    // Assert — the UPDATE does not include locked_until
    const updateCall = runMock.mock.calls.find((args) => args.length === 2);
    expect(updateCall).toBeDefined();
    expect(updateCall![0]).toBe(4); // new count = 4
  });

  it('recordFailedLogin sets locked_until when the failed attempt count reaches the threshold', () => {
    // Arrange — user has had 4 failed attempts; one more hits the threshold of 5
    const user = makeUser({ id: 1, failed_login_attempts: 4 });
    const runMock = jest.fn().mockReturnValue({});
    const db = {
      prepare: jest.fn((sql: string) => ({
        get: jest.fn().mockReturnValue(user),
        run: runMock,
      })),
    };
    mockGetDb.mockReturnValue(db as any);

    const before = Date.now();

    // Act
    recordFailedLogin(1);

    // Assert — run is called with (count, isoString, userId)
    const lockoutCall = runMock.mock.calls.find((args) => args.length === 3);
    expect(lockoutCall).toBeDefined();
    expect(lockoutCall![0]).toBe(5);
    const lockedUntil = new Date(lockoutCall![1] as string).getTime();
    expect(lockedUntil).toBeGreaterThanOrEqual(before + 14 * 60 * 1000);
  });
});

// ─── verifyAndEnableMfa ───────────────────────────────────────────────────────

describe('verifyAndEnableMfa', () => {
  it('verifyAndEnableMfa returns false when no MFA secret row exists for the user', () => {
    // Arrange
    const db = { prepare: makePrepare(undefined) };
    mockGetDb.mockReturnValue(db as any);

    // Act
    const result = verifyAndEnableMfa(1, '123456');

    // Assert
    expect(result).toBe(false);
  });

  it('verifyAndEnableMfa returns false when the provided TOTP code is invalid', () => {
    // Arrange
    const row = { secret: 'TESTSECRET', is_enabled: 0 };
    const db = { prepare: makePrepare(row) };
    mockGetDb.mockReturnValue(db as any);
    mockAuthenticator.verify.mockReturnValue(false);

    // Act
    const result = verifyAndEnableMfa(1, '000000');

    // Assert
    expect(result).toBe(false);
  });

  it('verifyAndEnableMfa returns true and marks MFA enabled when the TOTP code is valid', () => {
    // Arrange
    const row = { secret: 'TESTSECRET', is_enabled: 0 };
    const runMock = jest.fn();
    const db = {
      prepare: jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue(row),
        run: runMock,
      }),
    };
    mockGetDb.mockReturnValue(db as any);
    mockAuthenticator.verify.mockReturnValue(true);

    // Act
    const result = verifyAndEnableMfa(1, '123456');

    // Assert
    expect(result).toBe(true);
    expect(runMock).toHaveBeenCalledWith(1); // UPDATE ... WHERE user_id = ?
  });
});

// ─── validateMfaCode ─────────────────────────────────────────────────────────

describe('validateMfaCode', () => {
  it('validateMfaCode returns false when no MFA row exists for the user', () => {
    // Arrange
    const db = { prepare: makePrepare(undefined) };
    mockGetDb.mockReturnValue(db as any);

    // Act
    const result = validateMfaCode(1, '123456');

    // Assert
    expect(result).toBe(false);
  });

  it('validateMfaCode returns false when MFA is not yet enabled for the user', () => {
    // Arrange — secret exists but is_enabled = 0
    const row = { secret: 'TESTSECRET', is_enabled: 0 };
    const db = { prepare: makePrepare(row) };
    mockGetDb.mockReturnValue(db as any);

    // Act
    const result = validateMfaCode(1, '123456');

    // Assert
    expect(result).toBe(false);
  });

  it('validateMfaCode returns true when MFA is enabled and the code is valid', () => {
    // Arrange
    const row = { secret: 'TESTSECRET', is_enabled: 1 };
    const db = { prepare: makePrepare(row) };
    mockGetDb.mockReturnValue(db as any);
    mockAuthenticator.verify.mockReturnValue(true);

    // Act
    const result = validateMfaCode(1, '123456');

    // Assert
    expect(result).toBe(true);
  });

  it('validateMfaCode returns false when MFA is enabled but the code is wrong', () => {
    // Arrange
    const row = { secret: 'TESTSECRET', is_enabled: 1 };
    const db = { prepare: makePrepare(row) };
    mockGetDb.mockReturnValue(db as any);
    mockAuthenticator.verify.mockReturnValue(false);

    // Act
    const result = validateMfaCode(1, '000000');

    // Assert
    expect(result).toBe(false);
  });
});

// ─── hasMfaEnabled ────────────────────────────────────────────────────────────

describe('hasMfaEnabled', () => {
  it('hasMfaEnabled returns false when no MFA row exists for the user', () => {
    // Arrange
    const db = { prepare: makePrepare(undefined) };
    mockGetDb.mockReturnValue(db as any);

    // Act
    const result = hasMfaEnabled(1);

    // Assert
    expect(result).toBe(false);
  });

  it('hasMfaEnabled returns true when is_enabled is 1', () => {
    // Arrange
    const row = { is_enabled: 1 };
    const db = { prepare: makePrepare(row) };
    mockGetDb.mockReturnValue(db as any);

    // Act
    const result = hasMfaEnabled(1);

    // Assert
    expect(result).toBe(true);
  });
});

// ─── createUser ───────────────────────────────────────────────────────────────

describe('createUser', () => {
  it('createUser skips the user_roles insert when a specified role does not exist in the database', () => {
    // Arrange — INSERT for the user succeeds; role lookup returns undefined (unknown role)
    const insertRun = jest.fn().mockReturnValue({ lastInsertRowid: 42 });
    const roleRun = jest.fn();
    const db = {
      prepare: jest.fn((sql: string) => {
        if (sql.includes('INSERT INTO users')) return { run: insertRun };
        if (sql.includes('SELECT id FROM roles')) return { get: jest.fn().mockReturnValue(undefined) };
        return { run: roleRun };
      }),
    };
    mockGetDb.mockReturnValue(db as any);

    // Act
    const userId = createUser('new@example.com', 'hashedpw', ['nonexistent_role']);

    // Assert — user was created but no role row was inserted
    expect(userId).toBe(42);
    expect(roleRun).not.toHaveBeenCalled();
  });
});
