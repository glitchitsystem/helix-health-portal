/**
 * tests/fixtures/api.helpers.ts
 *
 * HTTP-level test helpers for integration and E2E tests.
 *
 * For integration tests: uses supertest against the Express app directly.
 * For E2E tests:        uses Playwright Page to complete the login flow.
 *
 * Usage (Jest integration):
 *   import { getAuthToken, authenticatedRequest } from '../fixtures/api.helpers';
 *   const token = await getAuthToken('patient1');
 *   const res   = await authenticatedRequest('provider').get('/api/patients');
 *
 * Usage (Playwright E2E):
 *   import { playwrightLogin } from '../fixtures/api.helpers';
 *   await playwrightLogin(page, 'provider');
 */

import request from 'supertest';
import { TEST_CREDENTIALS, type TestCredentials } from './auth.fixtures';

// ─── App import (lazy to avoid circular deps in unit tests) ───────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
let _app: import('express').Application | null = null;
const getApp = (): import('express').Application => {
  if (!_app) _app = (require('../../server/src/app').createApp as () => import('express').Application)();
  return _app;
};

// ─── Token cache (per test run — not persisted across Jest workers) ───────────

const _tokenCache = new Map<string, string>();

// ─── Auth token ───────────────────────────────────────────────────────────────

/**
 * Logs in as the specified role and returns the JWT access token.
 * Caches the token within a single test run to avoid repeated round-trips.
 *
 * @param role - Key from TEST_CREDENTIALS (e.g. 'admin', 'provider', 'patient1')
 */
export async function getAuthToken(role: keyof typeof TEST_CREDENTIALS): Promise<string> {
  if (_tokenCache.has(role)) return _tokenCache.get(role)!;

  const creds: TestCredentials = TEST_CREDENTIALS[role];
  const app = getApp();

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: creds.email, password: creds.password })
    .expect(200);

  const token: string = res.body?.data?.accessToken ?? res.body?.accessToken;
  if (!token) throw new Error(`Login failed for role "${role}": ${JSON.stringify(res.body)}`);

  _tokenCache.set(role, token);
  return token;
}

/**
 * Clears the token cache. Call in afterAll() to ensure clean state.
 */
export function clearTokenCache(): void {
  _tokenCache.clear();
}

// ─── Authenticated supertest agent ────────────────────────────────────────────

/**
 * Returns a supertest request agent pre-authenticated as the given role.
 * The agent is not cached — create once per test suite.
 *
 * Usage:
 *   const agent = await authenticatedRequest('provider');
 *   const res   = await agent.get('/api/patients').expect(200);
 */
export async function authenticatedRequest(
  role: keyof typeof TEST_CREDENTIALS,
): Promise<ReturnType<typeof request.agent>> {
  const token = await getAuthToken(role);
  const app   = getApp();
  const agent = request.agent(app);
  // Attach token to every subsequent request via the agent's default header
  agent.set('Authorization', `Bearer ${token}`);
  return agent;
}

/**
 * Builds a supertest request with an Authorization header but without an agent.
 * Use this for one-off requests that don't need session state.
 */
export function withToken(
  app: ReturnType<typeof getApp>,
  _token: string,
): ReturnType<typeof request> {
  return request(app);
}

// ─── Resource creation helpers ────────────────────────────────────────────────

/**
 * Creates a test patient via the API and returns the patient record.
 * Requires an admin or provider token.
 */
export async function createTestPatientViaApi(
  role: 'admin' | 'provider' = 'admin',
  payload: Record<string, unknown> = {},
): Promise<{ id: number; mrn: string; [key: string]: unknown }> {
  const agent = await authenticatedRequest(role);

  const defaultPayload = {
    mrn:       `MRN-TEST-API-${Date.now()}`,
    firstName: 'TEST_ApiPatient',
    lastName:  `${Date.now()}`,
    dob:       '1985-06-15',
    gender:    'male',
    email:     `api.patient.${Date.now()}@helixhealthportal.test`,
    password:  'TestPass123!',
  };

  const res = await agent
    .post('/api/admin/patients')
    .send({ ...defaultPayload, ...payload })
    .expect(201);

  return res.body?.data ?? res.body;
}

/**
 * Creates a prescription for an existing patient via the API.
 * Requires a provider token.
 */
export async function createPrescriptionViaApi(
  patientId: number,
  payload: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const agent = await authenticatedRequest('provider');

  const defaultPayload = {
    drug_name:  'Doxycycline',
    dosage:     '100mg',
    frequency:  'once daily',
    start_date: new Date().toISOString().slice(0, 10),
  };

  const res = await agent
    .post(`/api/patients/${patientId}/prescriptions`)
    .send({ ...defaultPayload, ...payload })
    .expect(201);

  return res.body?.data ?? res.body;
}

// ─── Playwright helpers ───────────────────────────────────────────────────────

/**
 * Completes the Helix Health Portal login flow using Playwright.
 * Navigates to /login, fills credentials, submits.
 * Assumes MFA is NOT enabled for test accounts (or is bypassed in test mode).
 *
 * Usage (tests/e2e/*.spec.ts):
 *   import { playwrightLogin } from '../fixtures/api.helpers';
 *   test.beforeEach(async ({ page }) => {
 *     await playwrightLogin(page, 'provider');
 *   });
 */
export async function playwrightLogin(
  page: import('@playwright/test').Page,
  role: keyof typeof TEST_CREDENTIALS,
): Promise<void> {
  const creds = TEST_CREDENTIALS[role];
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(creds.email);
  await page.getByLabel(/password/i).fill(creds.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  // Wait for redirect away from /login
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

/**
 * Completes logout via the UI.
 */
export async function playwrightLogout(
  page: import('@playwright/test').Page,
): Promise<void> {
  // Try clicking a logout button/link
  const logoutBtn = page.getByRole('button', { name: /log out|sign out/i });
  if (await logoutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await logoutBtn.click();
  } else {
    await page.goto('/login');
  }
  await page.waitForURL(/\/login/, { timeout: 5000 });
}
