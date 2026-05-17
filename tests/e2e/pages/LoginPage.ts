import { Page, Locator } from "@playwright/test";

export class LoginPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // ── Locators ────────────────────────────────────────────────────────────────

  get emailInput(): Locator {
    return this.page.getByLabel("Email address");
  }

  get passwordInput(): Locator {
    return this.page.getByLabel("Password");
  }

  get signInButton(): Locator {
    return this.page.getByRole("button", { name: /sign in/i });
  }

  get errorMessage(): Locator {
    // Login.tsx renders errors as a div — adjust selector if role="alert" is absent
    return this.page.getByRole("alert");
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  async goto() {
    await this.page.goto("/login");
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  async loginAndWait(email: string, password: string) {
    await this.login(email, password);
    await this.page.waitForURL("/dashboard");
  }
}
