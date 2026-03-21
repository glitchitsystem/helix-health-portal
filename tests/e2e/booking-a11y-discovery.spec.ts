/**
 * tests/e2e/booking-a11y-discovery.spec.ts
 *
 * DISCOVERY SCAN — Run once to document every axe-core violation on the
 * Appointment Booking wizard before fixes are applied. This file is intentionally
 * not a regression test: it never fails. Its job is to produce a complete
 * violation log that can be handed to the team for triage.
 *
 * Run:
 *   BASE_URL=http://localhost:5173 npx playwright test booking-a11y-discovery --project=chromium
 */

import { test, expect } from '@playwright/test';
import { scanPage, logViolations } from './shared/a11y.helpers';

// ──────────────────────────────────────────────────────────────────────────────
// Auth helper — logs in as patient and returns to the authenticated session
// ──────────────────────────────────────────────────────────────────────────────

async function loginAsPatient(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('input[type="email"]', { timeout: 10_000 });

  await page.fill('input[type="email"]', 'patient1@helixhealthportal.test');
  await page.fill('input[type="password"]', 'TestPass123!');
  await page.click('button[type="submit"]');

  // Wait until we land somewhere past the login page
  await page.waitForURL((url) => !url.toString().includes('/login') && url.toString() !== '/', {
    timeout: 15_000,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Discovery scans — one per wizard step
// ──────────────────────────────────────────────────────────────────────────────

test.describe('Appointment Booking — axe-core discovery scan @a11y', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPatient(page);
  });

  // ── Step 1: Choose Appointment Type ───────────────────────────────────────

  test('Step 1 — appointment type selector: log all violations', async ({ page }) => {
    await page.goto('/appointments/book');
    await page.waitForSelector('.grid', { timeout: 10_000 }); // type grid loaded

    const { violations } = await scanPage(page, 'main, #root');
    logViolations(violations, 'Step 1 — Choose Type');

    // Discovery test always passes — violations are logged, not asserted
    expect(true).toBe(true);
  });

  // ── Step 2: Choose Provider + Date ────────────────────────────────────────

  test('Step 2 — provider & date picker: log all violations', async ({ page }) => {
    await page.goto('/appointments/book');

    // Step 1 → Step 2: click the first appointment type card
    await page.waitForSelector('.grid button', { timeout: 10_000 });
    await page.locator('.grid button').first().click();

    // Step 2: provider list loads — wait for any provider button to appear
    // Provider buttons are the first grid on this step
    await page.waitForSelector('.grid button', { timeout: 10_000 });

    // Click the first provider to reveal the date input
    await page.locator('.grid button').first().click();

    // Now the date input appears
    await page.waitForSelector('#appt-date', { timeout: 10_000 });

    const { violations } = await scanPage(page, 'main, #root');
    logViolations(violations, 'Step 2 — Provider & Date');

    expect(true).toBe(true);
  });

  // ── Step 3: Confirm ───────────────────────────────────────────────────────

  test('Step 3 — confirmation form: log all violations', async ({ page }) => {
    await page.goto('/appointments/book');

    // Step 1 → Step 2
    await page.waitForSelector('.grid button', { timeout: 10_000 });
    await page.locator('.grid button').first().click();

    // Select first provider
    await page.waitForSelector('.grid button', { timeout: 10_000 });
    await page.locator('.grid button').first().click();

    // Date input is now visible; slots load automatically for tomorrow
    await page.waitForSelector('#appt-date', { timeout: 10_000 });

    // Wait for slot buttons (available ones are not disabled)
    await page.waitForTimeout(2000); // allow slot API to respond
    const availableSlot = page.locator('button:not([disabled])').filter({ hasText: /\d+:\d+/ }).first();
    const count = await availableSlot.count();

    if (count > 0) {
      await availableSlot.click();
      // Step 3: confirmation form with notes textarea
      await page.waitForSelector('#appt-notes', { timeout: 5_000 });
      const { violations } = await scanPage(page, 'main, #root');
      logViolations(violations, 'Step 3 — Confirm');
    } else {
      console.log('Step 3 — no available slots for tomorrow; trying next day...');
      // Advance date by 6 days to find a day with slots
      const d = new Date();
      d.setDate(d.getDate() + 6);
      await page.fill('#appt-date', d.toISOString().slice(0, 10));
      await page.waitForTimeout(2000);
      const slotRetry = page.locator('button:not([disabled])').filter({ hasText: /\d+:\d+/ }).first();
      if (await slotRetry.count() > 0) {
        await slotRetry.click();
        await page.waitForSelector('#appt-notes', { timeout: 5_000 });
        const { violations } = await scanPage(page, 'main, #root');
        logViolations(violations, 'Step 3 — Confirm');
      } else {
        console.log('Step 3 — no slots found in scan window; skipping Step 3 scan');
      }
    }

    expect(true).toBe(true);
  });
});
