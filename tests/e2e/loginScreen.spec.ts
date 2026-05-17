import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('Login screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
  });

  test('valid patient credentials log in and redirect to /dashboard', async ({ page }) => {
    // Arrange
    await expect(page.getByRole('heading', { name: 'Helix Health Portal', level: 1 })).toBeVisible();

    // Act
    await page.getByLabel('Email address').fill('patient1@helixhealthportal.test');
    await page.getByLabel('Password').fill('TestPass123!');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Assert
    await page.waitForURL(`${BASE_URL}/dashboard`);
    await expect(page).toHaveURL(`${BASE_URL}/dashboard`);
  });

  test('wrong password shows an error message', async ({ page }) => {
    // Act
    await page.getByLabel('Email address').fill('patient1@helixhealthportal.test');
    await page.getByLabel('Password').fill('WrongPassword999!');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Assert — an error is surfaced and the user stays on /login
    await expect(page).toHaveURL(`${BASE_URL}/login`);
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('non-existent email shows an error message', async ({ page }) => {
    // Act
    await page.getByLabel('Email address').fill('nobody@helixhealthportal.test');
    await page.getByLabel('Password').fill('TestPass123!');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Assert — an error is surfaced and the user stays on /login
    await expect(page).toHaveURL(`${BASE_URL}/login`);
    await expect(page.getByRole('alert')).toBeVisible();
  });
});
