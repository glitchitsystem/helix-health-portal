/**
 * jest.unit.config.ts — Unit test configuration.
 *
 * Targets pure function tests in tests/unit/ (no DB, no HTTP).
 * Also covers server-side services in server/src/services/.
 *
 * Run: npx jest --config jest.unit.config.ts
 */

import type { Config } from "jest";

const config: Config = {
  displayName: "unit",
  preset: "ts-jest",

  testEnvironment: "node",

  // Match only unit test files
  testMatch: [
    "<rootDir>/tests/unit/**/*.test.ts",
    "<rootDir>/tests/unit/**/*.spec.ts",
  ],

  // TypeScript transform via ts-jest
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/server/tsconfig.json",
        diagnostics: { ignoreCodes: ["TS151001"] },
      },
    ],
  },

  // Module aliases (match tsconfig paths if any)
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/server/src/$1",
  },

  // Setup file (none needed for unit — no DB)
  setupFilesAfterEnv: [],

  // Coverage
  collectCoverageFrom: [
    "server/src/services/**/*.ts",
    "!server/src/services/**/*.d.ts",
    "!**/__mocks__/**",
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      lines: 80,
    },
  },
  coverageReporters: ["lcov", "text", "html"],
  coverageDirectory: "<rootDir>/coverage/unit",

  // Test result reporters
  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "test-results",
        outputName: "unit-results.xml",
        classNameTemplate: "{classname}",
        titleTemplate: "{title}",
      },
    ],
  ],

  // Timeout for individual tests (unit tests should be fast)
  testTimeout: 10_000,

  // Don't transform node_modules (most packages)
  transformIgnorePatterns: ["/node_modules/(?!(@faker-js)/)"],
};

export default config;
