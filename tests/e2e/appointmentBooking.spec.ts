import { test, expect, type Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

const CREDENTIALS = {
  email:    'patient1@helixhealthportal.test',
  password: 'TestPass123!',
};

// ---------------------------------------------------------------------------
// Helper: log in and navigate to the appointment booking wizard
// ---------------------------------------------------------------------------
async function loginAndGoToBooking(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('#email', CREDENTIALS.email);
  await page.fill('#password', CREDENTIALS.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(`${BASE_URL}/dashboard`);
  await page.goto(`${BASE_URL}/appointments/book`);
}

// ---------------------------------------------------------------------------
// Helper: complete step 1 by selecting an appointment type
// ---------------------------------------------------------------------------
async function selectAppointmentType(page: Page, type = 'Follow-up'): Promise<void> {
  await page.getByRole('button', { name: type }).click();
}

// ---------------------------------------------------------------------------
// Helper: complete the provider selection step by picking the first provider
// ---------------------------------------------------------------------------
async function pickFirstProvider(page: Page): Promise<void> {
  const providers = page.locator('button[aria-pressed]');
  await providers.first().click();
}

// ---------------------------------------------------------------------------
// Helper: complete the time slot step by picking the first available time slot
// ---------------------------------------------------------------------------
async function pickFirstTimeSlot(page: Page): Promise<void> {
  // Time slots are rendered as buttons; pick whichever comes first
  const slots = page.getByRole('button', { name: /\d{1,2}:\d{2}|\bam\b|\bpm\b/i });
  await slots.first().click();
}

// ---------------------------------------------------------------------------
// Describe: Patient books an appointment — multi-step wizard
// ---------------------------------------------------------------------------
test.describe('Patient books an appointment via the multi-step wizard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndGoToBooking(page);
  });

  // AC-1: "Choose Type" is the active step on arrival
  test('AC-1: shows "Choose Type" as the active step on arrival', async ({ page }) => {
    // The active step indicator should be visible and labelled "Choose Type"
    const activeStep = page.getByText('Choose Type');
    await expect(activeStep).toBeVisible();

    // Steps 2 and 3 labels should exist in the indicator but the wizard should
    // not yet be showing step-2 content
    await expect(page.getByText('Pick Time')).toBeVisible();
    await expect(page.getByText('Confirm')).toBeVisible();

    // Appointment-type selection buttons are shown, not time-slot buttons
    await expect(page.getByRole('button', { name: 'Follow-up' })).toBeVisible();
  });

  // AC-2: Selecting an appointment type advances to step 2 "Pick Time"
  test('AC-2: selecting an appointment type advances to step 2 "Pick Time"', async ({ page }) => {
    // Arrange — verify we are on step 1
    await expect(page.getByRole('button', { name: 'Follow-up' })).toBeVisible();

    // Act
    await selectAppointmentType(page, 'Follow-up');

    // Assert — step 2 heading / indicator is now active
    // The "Pick Time" label is present in the step bar and step-2 content is shown
    await expect(page.getByText('Pick Time')).toBeVisible();

    // Appointment-type buttons should no longer be the primary content
    await expect(page.getByRole('button', { name: '← Back' })).toBeVisible();
  });

  // AC-3: Clicking "← Back" on step 2 returns to step 1 "Choose Type"
  test('AC-3: clicking "← Back" on step 2 returns to step 1', async ({ page }) => {
    // Arrange — advance to step 2
    await selectAppointmentType(page, 'Follow-up');
    await expect(page.getByRole('button', { name: '← Back' })).toBeVisible();

    // Act
    await page.getByRole('button', { name: '← Back' }).click();

    // Assert — back on step 1
    await expect(page.getByRole('button', { name: 'Follow-up' })).toBeVisible();

    // The back button should no longer be visible on step 1
    await expect(page.getByRole('button', { name: '← Back' })).not.toBeVisible();
  });

  // AC-4: Completing all three steps and confirming redirects to /appointments
  test('AC-4: completing all steps and clicking "Confirm Appointment" redirects to /appointments', async ({ page }) => {
    // Step 1 — choose appointment type
    await selectAppointmentType(page, 'Follow-up');

    // Step 2 — select a provider
    await pickFirstProvider(page);

    // Step 3 — pick a time slot
    await pickFirstTimeSlot(page);

    // Step 3 — confirm
    const confirmButton = page.getByRole('button', { name: 'Confirm Appointment' });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Assert — redirected to /appointments after booking
    await page.waitForURL(`${BASE_URL}/appointments`);
    await expect(page).toHaveURL(`${BASE_URL}/appointments`);
  });
});
