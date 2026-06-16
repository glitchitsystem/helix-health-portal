import { Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/login');
  }

  async loginAndWait(email: string, password: string): Promise<void> {
    await this.page.getByLabel('Email address').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await Promise.all([
      this.page.waitForURL((url) => !url.pathname.includes('/login')),
      this.page.getByRole('button', { name: 'Sign in' }).click(),
    ]);
  }
}
