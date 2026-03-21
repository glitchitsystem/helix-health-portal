/**
 * tests/e2e/shared/a11y.helpers.ts
 *
 * Shared axe-core / Playwright accessibility helpers used across all a11y specs.
 *
 * Usage:
 *   import { scanPage, formatViolations } from './shared/a11y.helpers';
 */

import { Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface A11yViolation {
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  nodes: Array<{
    target: string[];
    html: string;
    failureSummary: string;
  }>;
}

export interface A11yScanResult {
  violations: A11yViolation[];
  critical: A11yViolation[];
  serious: A11yViolation[];
  moderate: A11yViolation[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Core helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Run a full-page axe-core scan (or a scoped scan with `include`).
 *
 * @param page    - Playwright Page object, already navigated to the target URL.
 * @param include - Optional CSS selector — restricts the scan to a subtree.
 * @param exclude - Optional CSS selector — excludes a subtree (e.g. third-party widgets).
 */
export async function scanPage(
  page: Page,
  include?: string,
  exclude?: string,
): Promise<A11yScanResult> {
  let builder = new AxeBuilder({ page });

  if (include) builder = builder.include(include);
  if (exclude) builder = builder.exclude(exclude);

  const results = await builder.analyze();

  // Cast because axe-core Result type is compatible; avoid importing the full
  // axe-core package separately just for its types.
  const violations = results.violations as A11yViolation[];

  return {
    violations,
    critical: violations.filter((v) => v.impact === 'critical'),
    serious:  violations.filter((v) => v.impact === 'serious'),
    moderate: violations.filter((v) => v.impact === 'moderate'),
  };
}

/**
 * Format axe violations into a human-readable failure message.
 *
 * Pass as the optional message argument to Playwright's expect:
 *   expect(critical, formatViolations(critical)).toHaveLength(0);
 */
export function formatViolations(violations: A11yViolation[]): string {
  if (violations.length === 0) return 'No violations';

  return (
    `\n\n${violations.length} axe-core violation(s) found:\n` +
    violations
      .map((v, i) => {
        const selector = v.nodes.map((n) => n.target.join(' ')).join('\n    ');
        const summary  = v.nodes[0]?.failureSummary ?? '';
        return (
          `\n[${i + 1}] ${v.id} — impact: ${v.impact ?? 'unknown'}\n` +
          `    Rule: ${v.help}\n` +
          `    See:  ${v.helpUrl}\n` +
          `    Affected element(s):\n    ${selector}\n` +
          (summary ? `    Fix:  ${summary.split('\n')[0]}\n` : '')
        );
      })
      .join('')
  );
}

/**
 * Print every violation to the console — useful in discovery scans before
 * assertions are added.
 */
export function logViolations(violations: A11yViolation[], label = 'Scan results'): void {
  if (violations.length === 0) {
    console.log(`✅  ${label}: no violations`);
    return;
  }
  console.log(formatViolations(violations));
}
