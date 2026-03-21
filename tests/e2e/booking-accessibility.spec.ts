/**
 * tests/e2e/booking-accessibility.spec.ts
 *
 * Regression accessibility test suite for the Appointment Booking wizard.
 * Pre-built worked example — see Lab 12.1 Exercise 2 for the student exercise
 * (login page accessibility tests → tests/e2e/accessibility.spec.ts).
 *
 * VIOLATION HISTORY — discovered with booking-a11y-discovery.spec.ts on 2026-03-21:
 *
 *   Step 1 & 2:
 *     [FIXED] color-contrast (serious) — subtitle paragraph used text-gray-500 (#6b7280)
 *             on white (#ffffff) = 4.48:1, below WCAG AA minimum of 4.5:1.
 *             Fix: changed to text-gray-600 (#4b5563) = 7.6:1.
 *
 *   Step 3:
 *     [FIXED] heading-order (moderate) — "Appointment Summary" was an <h3> following the
 *             page <h1> with no <h2> in between, violating WCAG 1.3.1 & 2.4.6.
 *             Fix: changed to <h2>.
 *
 * Pre-emptive fixes applied to AppointmentBooking.tsx before discovery scan:
 *   - <input type="date">: added id="appt-date" + label htmlFor="appt-date" (axe: label)
 *   - <textarea>: added id="appt-notes" + label htmlFor="appt-notes" (axe: label)
 *   - <textarea>: added aria-describedby="appt-notes-hint" + hint paragraph
 *   - Time slot buttons: added aria-disabled + aria-label="HH:MM — unavailable" for
 *     disabled slots (axe: aria-allowed-attr, usability)
 *   - Provider buttons: added aria-pressed={selectedProvider?.id === p.id} (WCAG 4.1.2)
 *   - Color dot span: added aria-hidden="true" (WCAG 1.1.1 — decorative image)
 *   - Step indicator: wrapped in <nav aria-label="Booking progress"><ol>/<li>
 *   - Step indicator circles: added aria-current="step" on active step (WCAG 2.4.8)
 *
 * Run:
 *   BASE_URL=http://localhost:5173 npx playwright test accessibility --project=chromium
 *   BASE_URL=http://localhost:5173 npx playwright test --grep "@a11y" --project=chromium
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { scanPage, formatViolations } from './shared/a11y.helpers';

// ──────────────────────────────────────────────────────────────────────────────
// Auth helper
// ──────────────────────────────────────────────────────────────────────────────

async function loginAsPatient(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForSelector('#email', { timeout: 10_000 });
  await page.fill('#email', 'patient1@helixhealthportal.test');
  await page.fill('#password', 'TestPass123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(
    (url) => !url.toString().includes('/login') && url.pathname !== '/',
    { timeout: 15_000 },
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

test.describe('Appointment Booking — accessibility regression @a11y', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsPatient(page);
  });

  // ── Step 1: Appointment type selector ─────────────────────────────────────

  test('Step 1 — type selector: zero critical axe violations', async ({ page }) => {
    await page.goto('/appointments/book');
    await page.waitForSelector('.grid button', { timeout: 10_000 });

    const { critical, violations } = await scanPage(page, 'main, #root');

    // Zero critical violations (impact: critical)
    expect(critical, formatViolations(violations)).toHaveLength(0);
  });

  test('Step 1 — type selector: zero serious axe violations', async ({ page }) => {
    await page.goto('/appointments/book');
    await page.waitForSelector('.grid button', { timeout: 10_000 });

    const { serious, violations } = await scanPage(page, 'main, #root');

    // Serious violations include the now-fixed color-contrast on the subtitle
    expect(serious, formatViolations(violations)).toHaveLength(0);
  });

  test('Step 1 — appointment type cards are labelled and keyboard-accessible', async ({ page }) => {
    await page.goto('/appointments/book');
    await page.waitForSelector('.grid button', { timeout: 10_000 });

    // Scope the label scan to the type card grid only
    const { violations } = await scanPage(page, '.grid');
    const labelViolations = violations.filter((v) => v.id === 'label' || v.id === 'button-name');
    expect(labelViolations, formatViolations(labelViolations)).toHaveLength(0);
  });

  // ── Step 2: Provider + date picker ────────────────────────────────────────

  test('Step 2 — provider & date picker: zero critical axe violations', async ({ page }) => {
    await page.goto('/appointments/book');

    // Advance to Step 2
    await page.waitForSelector('.grid button', { timeout: 10_000 });
    await page.locator('.grid button').first().click();

    // Select a provider to reveal the date picker
    await page.waitForSelector('.grid button', { timeout: 10_000 });
    await page.locator('.grid button').first().click();
    await page.waitForSelector('#appt-date', { timeout: 10_000 });

    const { critical, violations } = await scanPage(page, 'main, #root');
    expect(critical, formatViolations(violations)).toHaveLength(0);
  });

  test('Step 2 — date input has programmatically associated label', async ({ page }) => {
    await page.goto('/appointments/book');
    await page.waitForSelector('.grid button', { timeout: 10_000 });
    await page.locator('.grid button').first().click();
    await page.waitForSelector('.grid button', { timeout: 10_000 });
    await page.locator('.grid button').first().click();
    await page.waitForSelector('#appt-date', { timeout: 10_000 });

    // axe label rule must be zero for the date input specifically
    const { violations } = await scanPage(page, '#appt-date, label[for="appt-date"]');
    const labelViolations = violations.filter((v) => v.id === 'label');
    expect(labelViolations, formatViolations(labelViolations)).toHaveLength(0);
  });

  test('Step 2 — date input is reachable by keyboard tab', async ({ page }) => {
    await page.goto('/appointments/book');
    await page.waitForSelector('.grid button', { timeout: 10_000 });
    await page.locator('.grid button').first().click();
    await page.waitForSelector('.grid button', { timeout: 10_000 });
    await page.locator('.grid button').first().click();
    await page.waitForSelector('#appt-date', { timeout: 10_000 });

    // Tab through focusable elements until we hit the date input
    await page.keyboard.press('Tab');
    let found = false;
    for (let i = 0; i < 20; i++) {
      const focusedId = await page.evaluate(() => document.activeElement?.id ?? '');
      if (focusedId === 'appt-date') { found = true; break; }
      await page.keyboard.press('Tab');
    }
    expect(found, 'date input was not reachable via keyboard Tab').toBe(true);
  });

  // ── Step 3: Confirmation form ──────────────────────────────────────────────

  test('Step 3 — confirmation form: zero critical axe violations', async ({ page }) => {
    await page.goto('/appointments/book');

    // Navigate through Steps 1 and 2
    await page.waitForSelector('.grid button', { timeout: 10_000 });
    await page.locator('.grid button').first().click();
    await page.waitForSelector('.grid button', { timeout: 10_000 });
    await page.locator('.grid button').first().click();
    await page.waitForSelector('#appt-date', { timeout: 10_000 });

    // Wait for slots and click the first available one
    await page.waitForTimeout(2000);
    const slot = page.locator('button:not([disabled])').filter({ hasText: /\d+:\d+/ }).first();

    if (await slot.count() === 0) {
      // Try a date 5 days out to find open slots
      const future = new Date();
      future.setDate(future.getDate() + 5);
      await page.fill('#appt-date', future.toISOString().slice(0, 10));
      await page.waitForTimeout(2000);
    }

    await slot.first().click();
    await page.waitForSelector('#appt-notes', { timeout: 8_000 });

    const { critical, violations } = await scanPage(page, 'main, #root');
    expect(critical, formatViolations(violations)).toHaveLength(0);
  });

  test('Step 3 — notes textarea has programmatically associated label', async ({ page }) => {
    await page.goto('/appointments/book');
    await page.waitForSelector('.grid button', { timeout: 10_000 });
    await page.locator('.grid button').first().click();
    await page.waitForSelector('.grid button', { timeout: 10_000 });
    await page.locator('.grid button').first().click();
    await page.waitForSelector('#appt-date', { timeout: 10_000 });

    await page.waitForTimeout(2000);
    const slot = page.locator('button:not([disabled])').filter({ hasText: /\d+:\d+/ }).first();
    if (await slot.count() === 0) {
      const future = new Date();
      future.setDate(future.getDate() + 5);
      await page.fill('#appt-date', future.toISOString().slice(0, 10));
      await page.waitForTimeout(2000);
    }
    await slot.first().click();
    await page.waitForSelector('#appt-notes', { timeout: 8_000 });

    const { violations } = await scanPage(page, '#appt-notes, label[for="appt-notes"]');
    const labelViolations = violations.filter((v) => v.id === 'label');
    expect(labelViolations, formatViolations(labelViolations)).toHaveLength(0);
  });

  test('Step 3 — heading order is valid (h1 → h2, no skip)', async ({ page }) => {
    await page.goto('/appointments/book');
    await page.waitForSelector('.grid button', { timeout: 10_000 });
    await page.locator('.grid button').first().click();
    await page.waitForSelector('.grid button', { timeout: 10_000 });
    await page.locator('.grid button').first().click();
    await page.waitForSelector('#appt-date', { timeout: 10_000 });

    await page.waitForTimeout(2000);
    const slot = page.locator('button:not([disabled])').filter({ hasText: /\d+:\d+/ }).first();
    if (await slot.count() === 0) {
      const future = new Date();
      future.setDate(future.getDate() + 5);
      await page.fill('#appt-date', future.toISOString().slice(0, 10));
      await page.waitForTimeout(2000);
    }
    await slot.first().click();
    await page.waitForSelector('#appt-notes', { timeout: 8_000 });

    const { violations } = await scanPage(page, 'main, #root');
    const headingViolations = violations.filter((v) => v.id === 'heading-order');
    expect(headingViolations, formatViolations(headingViolations)).toHaveLength(0);
  });

  // ── Step indicator ─────────────────────────────────────────────────────────

  test('step indicator navigation landmark has an accessible label', async ({ page }) => {
    await page.goto('/appointments/book');
    await page.waitForSelector('nav[aria-label]', { timeout: 10_000 });

    const navLabel = await page.locator('nav[aria-label="Booking progress"]').count();
    expect(navLabel, '<nav aria-label="Booking progress"> not found').toBe(1);
  });

  test('current step has aria-current="step"', async ({ page }) => {
    await page.goto('/appointments/book');
    await page.waitForSelector('[aria-current="step"]', { timeout: 10_000 });

    // On load, Step 1 is current
    const currentLabel = await page.locator('[aria-current="step"]').getAttribute('aria-label');
    expect(currentLabel).toContain('Step 1');
    expect(currentLabel).toContain('current');
  });
});
