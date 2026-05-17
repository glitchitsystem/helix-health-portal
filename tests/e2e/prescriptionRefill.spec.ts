import { test, expect } from '@playwright/test';
import { playwrightLogin } from '../fixtures/api.helpers.js';

test.describe('Patient requests a prescription refill', () => {
  test.beforeEach(async ({ page }) => {
    await playwrightLogin(page, 'patient1');
    await page.goto('/prescriptions');
  });

  test('clicking "Request Refill" on a prescription card shows a confirmation message', async ({ page }) => {
    // Cards are plain divs — locate via the Request Refill button and walk up to the card wrapper
    const refillButton = page.getByRole('button', { name: /request refill/i }).first();
    await expect(refillButton).toBeVisible();

    const firstCard = refillButton.locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]');

    // Act
    await refillButton.click();

    // Assert — a confirmation message appears in (or near) the card
    await expect(
      firstCard.getByRole('status').or(firstCard.getByText(/refill requested|request sent|submitted/i)),
    ).toBeVisible();
  });
});
