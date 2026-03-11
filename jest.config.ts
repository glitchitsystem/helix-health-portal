/**
 * jest.config.ts — Root Jest configuration (runs unit + integration).
 *
 * Run all tests:        npx jest
 * Run unit only:        npx jest --config jest.unit.config.ts
 * Run integration only: npx jest --config jest.integration.config.ts
 * Watch mode:           npx jest --watch
 */

import type { Config } from 'jest';

const config: Config = {
  projects: [
    '<rootDir>/jest.unit.config.ts',
    '<rootDir>/jest.integration.config.ts',
  ],
  // Coverage is collected at the project level; this root config is for running both.
  verbose: true,
};

export default config;
