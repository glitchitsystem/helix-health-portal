/**
 * tests/integration/lab-10-1-integration.test.ts
 *
 * LAB 10.1 — Debugging Bug Hunt (Integration layer)
 * Bugs 2–5 of 5
 *
 * Run this file with:
 *   npx jest --config jest.integration.config.ts lab-10-1-integration --verbose
 *
 * Or with the VS Code debugger:
 *   Open this file → F5 → "Debug Jest: Current Test File"
 *   (Uses jest.integration.config.ts by default — see .vscode/launch.json)
 *
 * Instructions:
 *   Each describe block contains exactly one bug.
 *   The bug may be in the test code OR may require you to investigate the
 *   application code being exercised. Read the hint comment before setting
 *   a breakpoint — it will direct you to the right place to look.
 *
 *   For each bug:
 *   1. Run the test in isolation and observe the failure
 *   2. Form a hypothesis before touching any code
 *   3. Use the debugger or Claude to confirm/refute the hypothesis
 *   4. Fix the single bug — do not change anything else
 *   5. Re-run and verify the test passes
 *   6. Document your process as described in the lab instructions
 */

import request from 'supertest';
import { getTestDb } from '../fixtures/db.helpers';
import { createApp } from '../../server/src/app';
import type { Application } from 'express';

// Lazily create the app once per test file — createApp() wires up all routes.
let _app: Application | null = null;
const getApp = (): Application => {
  if (!_app) _app = createApp();
  return _app;
};

// ─── Local auth helper ────────────────────────────────────────────────────────
// Self-contained token cache — avoids importing api.helpers.ts which has
// Playwright dependencies that are outside the scope of this lab.

const _tokenCache = new Map<string, string>();

async function getAuthToken(
  email: string,
  password = 'TestPass123!',
): Promise<string> {
  const cacheKey = email;
  if (_tokenCache.has(cacheKey)) return _tokenCache.get(cacheKey)!;

  const res = await request(getApp())
    .post('/api/auth/login')
    .send({ email, password });

  const token: string = res.body?.data?.accessToken;
  if (!token) throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);

  _tokenCache.set(cacheKey, token);
  return token;
}

// ─── Resolve seeded IDs ───────────────────────────────────────────────────────
// setup.ts (via setupFilesAfterEnv) already called applySchema() and
// seedMinimalData(). Query the existing records rather than seeding again.

let seededPatientDbId: number;

beforeAll(() => {
  _tokenCache.clear();

  const db = getTestDb();
  const row = db.prepare(`
    SELECT p.id as patientDbId
    FROM patients p
    JOIN users u ON p.user_id = u.id
    WHERE u.email = 'patient1@helixhealthportal.test'
  `).get() as { patientDbId: number } | undefined;

  if (!row) throw new Error('Seed patient not found — did setup.ts run applySchema() and seedMinimalData()?');
  seededPatientDbId = row.patientDbId;
});

// ─── BUG 2 ────────────────────────────────────────────────────────────────────

describe('Auth API › POST /api/auth/login', () => {
  /**
   * BUG 2 — This test fails with an assertion error on the status code.
   *
   * The route handler is correct. The login credentials are valid.
   * The application returns the right response. The test assertion is wrong.
   *
   * How to debug:
   *   Set a breakpoint on the `expect(res.status)` line.
   *   Add `res.status` and `res.body` to the Watch panel.
   *   What status code did the server actually return?
   *   Compare it with what this test asserts — are they the same?
   *
   * Hint: Only one Express route in auth.ts sends status 201.
   * Which route is that? Is it the login route?
   */
  test('@smoke provider login with valid credentials returns an access token', async () => {
    const res = await request(getApp())
      .post('/api/auth/login')
      .send({
        email:    'provider@helixhealthportal.test',
        password: 'TestPass123!',
      });

    // BUG 2: wrong status code asserted
    expect(res.status).toBe(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.roles).toContain('provider');
  });
});

// ─── BUG 3 ────────────────────────────────────────────────────────────────────

describe('Patients API › GET /api/patients', () => {
  /**
   * BUG 3 — This test fails with 401 Unauthorized.
   *
   * The provider account exists (it was seeded by seedMinimalData()).
   * The /api/patients route requires authentication.
   * The `Authorization` header is being set — but something is wrong with it.
   *
   * How to debug:
   *   Set a breakpoint on the `.set('Authorization', ...)` line.
   *   Add `token` to the Watch panel and expand it.
   *   What is the type of `token`? What did you expect it to be?
   *   What does `Bearer ${token}` evaluate to when token has that type?
   *
   * Hint: Look at the declaration of `token` one line above.
   * What does `getAuthToken` return? What keyword should precede the call?
   */
  test('@smoke provider can list all patients', async () => {
    // BUG 3: missing `await` — token receives a Promise object, not a string
    const token = getAuthToken('provider@helixhealthportal.test');

    const res = await request(getApp())
      .get('/api/patients')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ─── BUG 4 ────────────────────────────────────────────────────────────────────

describe('Patients API › GET /api/patients/:id', () => {
  /**
   * BUG 4 — This test fails with 404 Not Found.
   *
   * The authentication is valid. The route handler is correct.
   * A provider IS authorised to read any patient record.
   * The patient being requested simply does not exist in the test database.
   *
   * How to debug:
   *   Set a breakpoint on the `const res = await request(...)` line.
   *   Add `seededPatientDbId` to the Watch panel — it holds the actual
   *   database ID of the test patient seeded by setup.ts.
   *   What patient IDs actually exist? Is 99999 one of them?
   *
   * Hint: This is a fixture/environment bug. The fix is not in the route
   * handler or in authentication. It is in how the test constructs the URL.
   * Use `seededPatientDbId` in the URL path instead of the hardcoded number.
   */
  test('provider can retrieve a specific patient by their database ID', async () => {
    const token = await getAuthToken('provider@helixhealthportal.test');

    // BUG 4: hardcoded ID 99999 — no patient with this ID exists in the test DB
    const res = await request(getApp())
      .get('/api/patients/99999')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBeDefined();
  });
});

// ─── BUG 5 ────────────────────────────────────────────────────────────────────

describe('Auth API › login response shape', () => {
  /**
   * BUG 5 — This test fails with one of:
   *   "Expected: 3, Received: 1"
   *   "Cannot read properties of undefined (reading 'split')"
   *   "Expected: \"string\", Received: \"undefined\""
   *
   * The login succeeds — res.status is 200 and the server issues a valid JWT.
   * The JWT IS in the response body. The test fails because it reads the
   * token from the wrong location in the response object.
   *
   * How to debug:
   *   Set a breakpoint on the `const token = res.body.accessToken` line.
   *   Add `res.body` to the Watch panel and expand it fully.
   *   Where is the accessToken actually located in that object?
   *   Compare that path to how the test reads it.
   *
   * Hint: Look at the login route handler in server/src/routes/auth.ts.
   * What does the successful login response JSON look like?
   * Is `accessToken` a direct property of `res.body` or is it nested?
   */
  test('successful login response contains a well-formed JWT (three dot-separated segments)', async () => {
    const res = await request(getApp())
      .post('/api/auth/login')
      .send({
        email:    'provider@helixhealthportal.test',
        password: 'TestPass123!',
      });

    expect(res.status).toBe(200);

    // BUG 5: wrong property path — token is nested at res.body.data.accessToken
    const token = res.body.accessToken;

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);  // JWT = header.payload.signature
  });
});
