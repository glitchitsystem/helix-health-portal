/**
 * jest.integration.config.ts — Integration test configuration.
 *
 * Targets Supertest-based HTTP integration tests in tests/integration/.
 * Connects to a real SQLite test database (helix.test.db).
 *
 * Run: npx jest --config jest.integration.config.ts
 *
 * Prerequisites:
 *   npm run seed  (populates the test DB before running tests)
 *   or set TEST_DB_PATH to point to a pre-seeded database.
 */

import type { Config } from 'jest';

const config: Config = {
  displayName: 'integration',
  preset:      'ts-jest',

  testEnvironment: 'node',

  // Match only integration test files
  testMatch: [
    '<rootDir>/tests/integration/**/*.test.ts',
    '<rootDir>/tests/integration/**/*.spec.ts',
  ],

  // TypeScript transform via ts-jest
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig:   '<rootDir>/server/tsconfig.json',
        diagnostics: { ignoreCodes: ['TS151001'] },
      },
    ],
  },

  // Module aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/server/src/$1',
  },

  // Setup file — resets DB and seeds minimal data before each test file
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // Coverage
  collectCoverageFrom: [
    'server/src/routes/**/*.ts',
    'server/src/middleware/**/*.ts',
    '!server/src/**/*.d.ts',
    '!**/__mocks__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      lines:    80,
    },
  },
  coverageReporters: ['lcov', 'text', 'html'],
  coverageDirectory: '<rootDir>/coverage/integration',

  // Test result reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'test-results',
        outputName: 'integration-results.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
      },
    ],
  ],

  // Integration tests can be slower (real DB I/O)
  testTimeout: 30_000,

  // Suppress console output so test results aren't buried in server logs
  silent: true,

  // Show individual test names in output
  verbose: true,

  // Run suites serially to avoid DB conflicts (one suite at a time)
  maxWorkers: 1,

  // Ensure DB is closed after all tests
  forceExit: true,

  transformIgnorePatterns: ['/node_modules/(?!(@faker-js)/)'],
};

export default config;
