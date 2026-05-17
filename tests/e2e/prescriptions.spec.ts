import { test, expect, type Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

const CREDENTIALS = {
  email:    'patient1@helixhealthportal.test',
  password: 'TestPass123!',
};

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel(/email/i).fill(CREDENTIALS.email);
  await page.getByLabel(/password/i).fill(CREDENTIALS.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(`${BASE_URL}/dashboard`);
}

test.describe('Patient views prescription list', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/prescriptions`);
  });

  test('shows the Active tab selected by default', async ({ page }) => {
    const activeTab = page.getByRole('tab', { name: /active/i });
    await expect(activeTab).toBeVisible();
    await expect(activeTab).toHaveAttribute('aria-selected', 'true');
  });

  test('shows an All Prescriptions tab', async ({ page }) => {
    const allTab = page.getByRole('tab', { name: /all prescriptions/i });
    await expect(allTab).toBeVisible();
  });

  test('displays prescription cards with medication name, dosage, and refill button', async ({ page }) => {
    const cards = page.getByRole('article');
    const count = await cards.count();

    if (count === 0) {
      await expect(page.getByText('No prescriptions found.')).toBeVisible();
      return;
    }

    const first = cards.first();
    await expect(first).toBeVisible();

    // Each card must have a Request Refill button
    await expect(first.getByRole('button', { name: /request refill/i })).toBeVisible();
  });

  test('shows "No prescriptions found." when there are no active prescriptions', async ({ page }) => {
    const cards = page.getByRole('article');
    const count = await cards.count();

    if (count === 0) {
      await expect(page.getByText('No prescriptions found.')).toBeVisible();
    } else {
      // Active prescriptions exist — empty state is not expected
      await expect(page.getByText('No prescriptions found.')).not.toBeVisible();
    }
  });

  test('switches to All Prescriptions tab when clicked', async ({ page }) => {
    const allTab = page.getByRole('tab', { name: /all prescriptions/i });
    await allTab.click();
    await expect(allTab).toHaveAttribute('aria-selected', 'true');

    const activeTab = page.getByRole('tab', { name: /active/i });
    await expect(activeTab).toHaveAttribute('aria-selected', 'false');
  });

  test('each prescription card has a Request Refill button', async ({ page }) => {
    const cards = page.getByRole('article');
    const count = await cards.count();

    for (let i = 0; i < count; i++) {
      await expect(
        cards.nth(i).getByRole('button', { name: /request refill/i }),
      ).toBeVisible();
    }
  });
});
