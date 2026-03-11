/**
 * tests/setup.ts
 *
 * Global Jest setup file for integration tests.
 * Runs once after the framework is initialized, before each test FILE.
 *
 * Referenced by jest.integration.config.ts via setupFilesAfterFramework.
 *
 * What it does:
 *   1. Sets required environment variables for the test run
 *   2. Applies the DB schema to the test database
 *   3. Seeds minimal data needed to authenticate as each role
 *   4. Registers an afterAll hook to close the DB connection
 */

import path from 'path';

// ── Environment ────────────────────────────────────────────────────────────────

// Point to test DB (separate from main helix.db)
process.env['NODE_ENV']        = 'test';
process.env['TEST_DB_PATH']    = process.env['TEST_DB_PATH']
  ?? path.resolve(__dirname, '..', 'db', 'helix.test.db');
process.env['DATABASE_PATH']   = process.env['TEST_DB_PATH'];

// Auth secrets (non-production values safe for CI)
process.env['JWT_SECRET']      = process.env['JWT_SECRET']      ?? 'test-jwt-secret-not-for-production';
process.env['REFRESH_SECRET']  = process.env['REFRESH_SECRET']  ?? 'test-refresh-secret-not-for-production';

// Disable real email/SMS in tests
process.env['MOCK_EMAIL']      = 'true';
process.env['MOCK_SMS']        = 'true';

// Accept TOTP code "000000" in test mode
process.env['MOCK_TOTP']       = 'true';

// ── DB Setup ──────────────────────────────────────────────────────────────────

import { applySchema, seedMinimalData, closeTestDb } from './fixtures/db.helpers';

beforeAll(() => {
  applySchema();
  seedMinimalData();
});

afterAll(() => {
  closeTestDb();
});

// ── Global test helpers ────────────────────────────────────────────────────────

// Extend Jest's expect with custom matchers if needed.
// Example:
//   expect(response.status).toBeSuccessStatus();
// Add custom matchers here or in a separate matchers file.

// Silence console.log during tests to keep output clean.
// Comment out if you want to see server logs during debugging.
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;

beforeAll(() => {
  if (process.env['VERBOSE_TESTS'] !== 'true') {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
  }
});

afterAll(() => {
  console.log  = originalConsoleLog;
  console.info = originalConsoleInfo;
});
