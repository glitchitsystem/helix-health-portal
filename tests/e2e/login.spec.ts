import { test, expect, type Page } from '@playwright/test';
import { testUsers } from '../fixtures/auth.fixtures.js';

const { describe } = test;

// ---------------------------------------------------------------------------
// Selectors
//
// #email and #password are stable id-based selectors — preferred.
// The submit button and error message selectors below are fragile because they
// are tied to Tailwind utility classes and DOM structure.
//
// TODO: Ask the dev team to add data-testid="submit-btn" and
//       data-testid="error-message" to the relevant elements so these
//       selectors survive styling refactors.
// ---------------------------------------------------------------------------
const SELECTORS = {
  emailInput: '#email',
  passwordInput: '#password',
  // FRAGILE: tied to DOM path — replace with data-testid="submit-btn"
  submitButton: '#root > div > div > form > button',
  // FRAGILE: tied to Tailwind classes — replace with data-testid="error-message"
  errorMessage:
    '#root > div > div > form > div.rounded-lg.border.border-red-200.bg-red-50.px-4.py-3.text-sm.text-red-700',
} as const;

const BASE_URL = 'http://localhost:5173';
const LOGIN_PATH = '/login';

// ---------------------------------------------------------------------------
// Helper: navigate to login page and submit credentials
// ---------------------------------------------------------------------------
async function submitLoginForm(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  // Arrange
  await page.goto(`${BASE_URL}${LOGIN_PATH}`);

  // Act
  await page.fill(SELECTORS.emailInput, email);
  await page.fill(SELECTORS.passwordInput, password);
  await page.click(SELECTORS.submitButton);
}

// ---------------------------------------------------------------------------
// Describe: Successful login by role
// ---------------------------------------------------------------------------
describe('Login — happy path by role', () => {
  test('patient can log in and is redirected to patient dashboard', async ({ page }) => {
    // Arrange
    const { email, password, expectedRedirect } = testUsers.patient;

    // Act
    await submitLoginForm(page, email, password);

    // Assert
    await expect(page).toHaveURL(`${BASE_URL}${expectedRedirect}`);
  });

  test('provider can log in and is redirected to provider dashboard', async ({ page }) => {
    // Arrange
    const { email, password, expectedRedirect } = testUsers.provider;

    // Act
    await submitLoginForm(page, email, password);

    // Assert
    await expect(page).toHaveURL(`${BASE_URL}${expectedRedirect}`);
  });

  test('admin can log in and is redirected to admin dashboard', async ({ page }) => {
    // Arrange
    const { email, password, expectedRedirect } = testUsers.admin;

    // Act
    await submitLoginForm(page, email, password);

    // Assert
    await expect(page).toHaveURL(`${BASE_URL}${expectedRedirect}`);
  });
});

// ---------------------------------------------------------------------------
// Describe: Failed login — credential errors
// ---------------------------------------------------------------------------
describe('Login — invalid credentials', () => {
  test('wrong password shows a generic error message without revealing whether the account exists', async ({
    page,
  }) => {
    // Arrange
    const { email, password } = testUsers.wrongPassword;

    // Act
    await submitLoginForm(page, email, password);

    // Assert — user stays on the login page
    await expect(page).toHaveURL(`${BASE_URL}${LOGIN_PATH}`);

    // Assert — a visible error is shown
    const errorEl = page.locator(SELECTORS.errorMessage);
    await expect(errorEl).toBeVisible();

    // Assert — the error must NOT reveal whether the account exists or which
    // field is wrong. Both cases should return the same message to prevent
    // user enumeration (a HIPAA-relevant security control).
    const errorText = await errorEl.textContent();
    expect(errorText).not.toMatch(/password.*incorrect/i);
    expect(errorText).not.toMatch(/account.*not found/i);
    expect(errorText).not.toMatch(/email.*not registered/i);
  });

  test('empty form submission does not trigger a network request', async ({ page }) => {
    // Arrange
    await page.goto(`${BASE_URL}${LOGIN_PATH}`);
    let networkCallMade = false;
    page.on('request', (req) => {
      if (req.url().includes('/api/auth/login')) networkCallMade = true;
    });

    // Act — click submit without filling any fields
    await page.click(SELECTORS.submitButton);

    // Assert — still on login page, no API call made
    await expect(page).toHaveURL(`${BASE_URL}${LOGIN_PATH}`);
    expect(networkCallMade).toBe(false);
  });

  test('malformed email (missing @) does not submit the form', async ({ page }) => {
    // Arrange
    await page.goto(`${BASE_URL}${LOGIN_PATH}`);

    // Act
    await page.fill(SELECTORS.emailInput, 'notanemail');
    await page.fill(SELECTORS.passwordInput, 'SomePassword1!');
    await page.click(SELECTORS.submitButton);

    // Assert — browser native validation or client validation keeps user on page
    await expect(page).toHaveURL(`${BASE_URL}${LOGIN_PATH}`);
  });
});

// ---------------------------------------------------------------------------
// Describe: Account lockout after repeated failures
//
// VERIFY: Confirm with the developer that:
//   1. Lockout is enforced after exactly 5 consecutive failed attempts.
//   2. The lockout message text matches the assertion below.
//   3. Lockout resets after a time period (ask for the exact duration).
//   4. The lockout is enforced server-side (not just UI-side), so it cannot
//      be bypassed by clearing cookies or using a different browser tab.
// ---------------------------------------------------------------------------
describe('Login — account lockout', () => {
  test('account is locked after 5 consecutive failed login attempts', async ({ page }) => {
    // Arrange
    const { email } = testUsers.patient;
    const wrongPassword = 'WrongPassword999!';
    const MAX_ATTEMPTS = 5;

    // Act — submit wrong credentials MAX_ATTEMPTS times
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await submitLoginForm(page, email, wrongPassword);
    }

    // Assert — after the final failed attempt, the lockout message is shown
    // VERIFY: confirm the exact lockout message text with the developer
    const errorEl = page.locator(SELECTORS.errorMessage);
    await expect(errorEl).toBeVisible();
    await expect(errorEl).toContainText(/locked|too many attempts/i);

    // Assert — the account remains locked even with the correct password
    // VERIFY: confirm this behavior — some portals allow immediate unlock via email
    await submitLoginForm(page, email, testUsers.patient.password);
    await expect(page).toHaveURL(`${BASE_URL}${LOGIN_PATH}`);
    await expect(errorEl).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Describe: Role-based access control (post-login)
// ---------------------------------------------------------------------------
describe('Login — role isolation', () => {
  test('patient session cannot access provider dashboard', async ({ page }) => {
    // Arrange + Act — log in as patient
    const { email, password } = testUsers.patient;
    await submitLoginForm(page, email, password);
    await expect(page).toHaveURL(`${BASE_URL}${testUsers.patient.expectedRedirect}`);

    // Act — attempt to navigate directly to provider route
    await page.goto(`${BASE_URL}${testUsers.provider.expectedRedirect}`);

    // Assert — redirected away (back to login or an error page, not the provider dashboard)
    // VERIFY: confirm whether unauthorized access redirects to /login or shows a 403 page
    await expect(page).not.toHaveURL(
      `${BASE_URL}${testUsers.provider.expectedRedirect}`,
    );
  });

  test('patient session cannot access admin dashboard', async ({ page }) => {
    // Arrange + Act — log in as patient
    const { email, password } = testUsers.patient;
    await submitLoginForm(page, email, password);
    await expect(page).toHaveURL(`${BASE_URL}${testUsers.patient.expectedRedirect}`);

    // Act — attempt to navigate directly to admin route
    await page.goto(`${BASE_URL}${testUsers.admin.expectedRedirect}`);

    // Assert
    // VERIFY: confirm redirect target for unauthorized role access
    await expect(page).not.toHaveURL(
      `${BASE_URL}${testUsers.admin.expectedRedirect}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Describe: Session lifecycle
// ---------------------------------------------------------------------------
describe('Login — session lifecycle', () => {
  test('unauthenticated user visiting a protected route is redirected to login', async ({
    page,
  }) => {
    // Arrange — no login, fresh context

    // Act — attempt to access a protected page directly
    await page.goto(`${BASE_URL}${testUsers.patient.expectedRedirect}`);

    // Assert
    await expect(page).toHaveURL(`${BASE_URL}${LOGIN_PATH}`);
  });

  test('user is redirected to login after logging out', async ({ page }) => {
    // Arrange — log in first
    const { email, password } = testUsers.patient;
    await submitLoginForm(page, email, password);
    await expect(page).toHaveURL(`${BASE_URL}${testUsers.patient.expectedRedirect}`);

    // Act — log out
    // VERIFY: confirm the logout selector with the developer (button text, id, or data-testid)
    await page.click('[data-testid="logout-btn"]');

    // Assert — session is cleared and user is back at login
    await expect(page).toHaveURL(`${BASE_URL}${LOGIN_PATH}`);

    // Assert — navigating back to dashboard without re-authenticating fails
    await page.goto(`${BASE_URL}${testUsers.patient.expectedRedirect}`);
    await expect(page).toHaveURL(`${BASE_URL}${LOGIN_PATH}`);
  });
});
