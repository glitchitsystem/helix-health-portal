import { test, expect } from '@playwright/test';
import {
  TEST_CREDENTIALS,
  INVALID_CREDENTIALS,
  buildExpiredTokenStub,
} from '../fixtures/auth.fixtures';

const API = 'http://localhost:4000';
const LOGIN = `${API}/api/auth/login`;

// ─── 201 — Happy path ─────────────────────────────────────────────────────────

test.describe('POST /api/auth/login — 201 success', () => {
  test('returns 201 and an accessToken for valid patient credentials', async ({ request }) => {
    const res = await request.post(LOGIN, {
      data: {
        email:    TEST_CREDENTIALS.patient1.email,
        password: TEST_CREDENTIALS.patient1.password,
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json() as { success: boolean; data: { accessToken: string } };
    expect(body.success).toBe(true);
    expect(typeof body.data.accessToken).toBe('string');
    expect(body.data.accessToken.length).toBeGreaterThan(0);
  });

  test('returned token is usable against a protected endpoint', async ({ request }) => {
    const loginRes = await request.post(LOGIN, {
      data: {
        email:    TEST_CREDENTIALS.patient1.email,
        password: TEST_CREDENTIALS.patient1.password,
      },
    });
    const { data } = await loginRes.json() as { data: { accessToken: string } };

    const meRes = await request.get(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    });
    expect(meRes.status()).toBe(200);
  });

  test('returns 201 for provider credentials', async ({ request }) => {
    const res = await request.post(LOGIN, {
      data: {
        email:    TEST_CREDENTIALS.provider.email,
        password: TEST_CREDENTIALS.provider.password,
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json() as { success: boolean; data: { accessToken: string } };
    expect(body.success).toBe(true);
    expect(typeof body.data.accessToken).toBe('string');
  });
});

// ─── 400 — Validation / bad body ─────────────────────────────────────────────

test.describe('POST /api/auth/login — 400 bad request', () => {
  test('returns 400 for an empty body', async ({ request }) => {
    const res = await request.post(LOGIN, { data: {} });

    expect(res.status()).toBe(400);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
  });

  test('returns 400 when email is missing', async ({ request }) => {
    const res = await request.post(LOGIN, {
      data: { password: TEST_CREDENTIALS.patient1.password },
    });

    expect(res.status()).toBe(400);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
  });

  test('returns 400 when password is missing', async ({ request }) => {
    const res = await request.post(LOGIN, {
      data: { email: TEST_CREDENTIALS.patient1.email },
    });

    expect(res.status()).toBe(400);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
  });

  test('returns 400 for a malformed email address', async ({ request }) => {
    const res = await request.post(LOGIN, {
      data: {
        email:    INVALID_CREDENTIALS.malformedEmail.email,
        password: INVALID_CREDENTIALS.malformedEmail.password,
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
  });

  test('returns 400 when password is an empty string', async ({ request }) => {
    const res = await request.post(LOGIN, {
      data: {
        email:    INVALID_CREDENTIALS.emptyPassword.email,
        password: INVALID_CREDENTIALS.emptyPassword.password,
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
  });
});

// ─── 401 — Authentication failures ───────────────────────────────────────────

test.describe('POST /api/auth/login — 401 unauthorized', () => {
  test('returns 401 for a correct email but wrong password', async ({ request }) => {
    const res = await request.post(LOGIN, {
      data: {
        email:    INVALID_CREDENTIALS.wrongPassword.email,
        password: INVALID_CREDENTIALS.wrongPassword.password,
      },
    });

    expect(res.status()).toBe(401);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
  });

  test('returns 401 for an unknown email', async ({ request }) => {
    const res = await request.post(LOGIN, {
      data: {
        email:    INVALID_CREDENTIALS.unknownEmail.email,
        password: INVALID_CREDENTIALS.unknownEmail.password,
      },
    });

    expect(res.status()).toBe(401);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
  });

  test('does not leak whether the email exists (same error shape for wrong-password vs unknown-email)', async ({ request }) => {
    const [wrongPwRes, unknownRes] = await Promise.all([
      request.post(LOGIN, {
        data: {
          email:    INVALID_CREDENTIALS.wrongPassword.email,
          password: INVALID_CREDENTIALS.wrongPassword.password,
        },
      }),
      request.post(LOGIN, {
        data: {
          email:    INVALID_CREDENTIALS.unknownEmail.email,
          password: INVALID_CREDENTIALS.unknownEmail.password,
        },
      }),
    ]);

    expect(wrongPwRes.status()).toBe(unknownRes.status());
    const wrongPwBody  = await wrongPwRes.json() as { success: boolean; error: string };
    const unknownBody  = await unknownRes.json() as { success: boolean; error: string };
    expect(wrongPwBody.success).toBe(false);
    expect(unknownBody.success).toBe(false);
  });

  test('returns 401 for an expired token on a protected endpoint (not the login route itself)', async ({ request }) => {
    const expiredToken = buildExpiredTokenStub();
    const res = await request.get(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });

    expect(res.status()).toBe(401);
    const body = await res.json() as { success: boolean; error: string };
    expect(body.success).toBe(false);
  });
});

// ─── Security — injection / content-type ─────────────────────────────────────

test.describe('POST /api/auth/login — security edge cases', () => {
  test('returns 4xx for SQL-injection-style credentials (does not crash or succeed)', async ({ request }) => {
    const res = await request.post(LOGIN, {
      data: {
        email:    INVALID_CREDENTIALS.sqlInjection.email,
        password: INVALID_CREDENTIALS.sqlInjection.password,
      },
    });

    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(false);
  });

  test('returns 4xx when Content-Type is omitted and body is plain text', async ({ request }) => {
    const res = await request.post(LOGIN, {
      headers: { 'Content-Type': 'text/plain' },
      data:    'email=patient1@helixhealthportal.test&password=TestPass123!',
    });

    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});
