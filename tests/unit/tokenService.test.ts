jest.mock('../../server/src/db/database');

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { getDb } from '../../server/src/db/database';
import {
  issueAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
  issueSignedToken,
  verifySignedToken,
  hashToken,
} from '../../server/src/services/tokenService';
import { JwtPayload, RefreshToken } from '../../server/src/types';

const mockGetDb = getDb as jest.Mock;

const PAYLOAD: Omit<JwtPayload, 'iat' | 'exp'> = {
  sub: 1,
  email: 'patient@example.com',
  roles: ['patient'],
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Access Tokens ──────────────────────────────────────────────────────────

describe('issueAccessToken / verifyAccessToken', () => {
  it('issueAccessToken returns a JWT that verifyAccessToken can decode back to the original payload', () => {
    // Act
    const token = issueAccessToken(PAYLOAD);
    const decoded = verifyAccessToken(token);

    // Assert
    expect(decoded.sub).toBe(PAYLOAD.sub);
    expect(decoded.email).toBe(PAYLOAD.email);
    expect(decoded.roles).toEqual(PAYLOAD.roles);
    expect(decoded.exp).toBeDefined();
  });

  it('verifyAccessToken throws when given an invalid token', () => {
    // Act & Assert
    expect(() => verifyAccessToken('not-a-valid-token')).toThrow(jwt.JsonWebTokenError);
  });

  it('verifyAccessToken throws when given a token signed with a different secret', () => {
    // Arrange
    const foreignToken = jwt.sign(PAYLOAD, 'some-other-secret', { expiresIn: '15m' });

    // Act & Assert
    expect(() => verifyAccessToken(foreignToken)).toThrow(jwt.JsonWebTokenError);
  });
});

// ─── Refresh Tokens ─────────────────────────────────────────────────────────

describe('issueRefreshToken', () => {
  it('issueRefreshToken stores the hashed token and returns the raw UUID', () => {
    // Arrange
    const runMock = jest.fn().mockReturnValue({ lastInsertRowid: 1 });
    mockGetDb.mockReturnValue({
      prepare: jest.fn().mockReturnValue({ run: runMock }),
    });

    // Act
    const raw = issueRefreshToken(7);

    // Assert — raw token is a UUID, distinct from the stored hash
    expect(raw).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    const expectedHash = hashToken(raw);
    expect(runMock).toHaveBeenCalledWith(7, expectedHash, expect.any(String));
  });
});

describe('rotateRefreshToken', () => {
  function makeRow(overrides: Partial<RefreshToken> = {}): RefreshToken {
    return {
      id: 1,
      user_id: 7,
      token_hash: hashToken('raw-token'),
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      revoked_at: null,
      created_at: new Date().toISOString(),
      ...overrides,
    };
  }

  it('rotateRefreshToken throws when no matching token exists', () => {
    // Arrange
    mockGetDb.mockReturnValue({
      prepare: jest.fn().mockReturnValue({ get: jest.fn().mockReturnValue(undefined) }),
    });

    // Act & Assert
    expect(() => rotateRefreshToken('raw-token')).toThrow('Invalid refresh token');
  });

  it('rotateRefreshToken throws when the token has already been revoked', () => {
    // Arrange
    const row = makeRow({ revoked_at: new Date().toISOString() });
    mockGetDb.mockReturnValue({
      prepare: jest.fn().mockReturnValue({ get: jest.fn().mockReturnValue(row) }),
    });

    // Act & Assert
    expect(() => rotateRefreshToken('raw-token')).toThrow('Refresh token has been revoked');
  });

  it('rotateRefreshToken throws when the token has expired', () => {
    // Arrange
    const row = makeRow({ expires_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() });
    mockGetDb.mockReturnValue({
      prepare: jest.fn().mockReturnValue({ get: jest.fn().mockReturnValue(row) }),
    });

    // Act & Assert
    expect(() => rotateRefreshToken('raw-token')).toThrow('Refresh token has expired');
  });

  it('rotateRefreshToken revokes the old token and issues a new one for a valid token', () => {
    // Arrange
    const row = makeRow();
    const updateRun = jest.fn();
    const insertRun = jest.fn().mockReturnValue({ lastInsertRowid: 2 });

    mockGetDb.mockReturnValue({
      prepare: jest.fn((sql: string) => {
        if (sql.includes('SELECT * FROM refresh_tokens')) {
          return { get: jest.fn().mockReturnValue(row) };
        }
        if (sql.includes('UPDATE refresh_tokens SET revoked_at')) {
          return { run: updateRun };
        }
        return { run: insertRun };
      }),
    });

    // Act
    const result = rotateRefreshToken('raw-token');

    // Assert
    expect(result.userId).toBe(7);
    expect(result.newRefreshToken).toMatch(/^[0-9a-f-]{36}$/i);
    expect(updateRun).toHaveBeenCalledWith(expect.any(String), row.id);
    expect(insertRun).toHaveBeenCalled();
  });
});

describe('revokeRefreshToken', () => {
  it('revokeRefreshToken marks the matching token as revoked by its hash', () => {
    // Arrange
    const runMock = jest.fn();
    mockGetDb.mockReturnValue({
      prepare: jest.fn().mockReturnValue({ run: runMock }),
    });

    // Act
    revokeRefreshToken('raw-token');

    // Assert
    expect(runMock).toHaveBeenCalledWith(expect.any(String), hashToken('raw-token'));
  });
});

describe('revokeAllUserRefreshTokens', () => {
  it('revokeAllUserRefreshTokens revokes every active token for the user', () => {
    // Arrange
    const runMock = jest.fn();
    mockGetDb.mockReturnValue({
      prepare: jest.fn().mockReturnValue({ run: runMock }),
    });

    // Act
    revokeAllUserRefreshTokens(7);

    // Assert
    expect(runMock).toHaveBeenCalledWith(expect.any(String), 7);
  });
});

// ─── Signed One-off Tokens ──────────────────────────────────────────────────

describe('issueSignedToken / verifySignedToken', () => {
  it('issueSignedToken returns a token that verifySignedToken decodes back to the original payload', () => {
    // Act
    const token = issueSignedToken({ purpose: 'verify-email', userId: 7 });
    const decoded = verifySignedToken(token);

    // Assert
    expect(decoded.purpose).toBe('verify-email');
    expect(decoded.userId).toBe(7);
    expect(decoded.exp).toBeDefined();
  });

  it('issueSignedToken honours a custom expiry', () => {
    // Act
    const token = issueSignedToken({ purpose: 'reset' }, '1h');
    const decoded = jwt.decode(token) as { iat: number; exp: number };

    // Assert — ~1 hour between iat and exp
    expect(decoded.exp! - decoded.iat!).toBe(60 * 60);
  });

  it('verifySignedToken throws on an invalid token', () => {
    // Act & Assert
    expect(() => verifySignedToken('garbage')).toThrow(jwt.JsonWebTokenError);
  });
});

// ─── Helpers ────────────────────────────────────────────────────────────────

describe('hashToken', () => {
  it('hashToken returns the SHA-256 hex digest of the input', () => {
    // Arrange
    const expected = crypto.createHash('sha256').update('raw-token').digest('hex');

    // Act
    const result = hashToken('raw-token');

    // Assert
    expect(result).toBe(expected);
  });

  it('hashToken is deterministic for the same input', () => {
    // Act & Assert
    expect(hashToken('same-value')).toBe(hashToken('same-value'));
  });
});
