import { Page, Locator } from "@playwright/test";

export class PrescriptionListPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // ── Locators ────────────────────────────────────────────────────────────────

  get activeTab(): Locator {
    return this.page.getByRole("button", { name: "Active" });
  }

  get allTab(): Locator {
    return this.page.getByRole("button", { name: "All Prescriptions" });
  }

  get emptyState(): Locator {
    return this.page.getByText("No prescriptions found.");
  }

  get refillButtons(): Locator {
    return this.page.getByRole("button", { name: "Request Refill" });
  }

  get refillConfirmation(): Locator {
    return this.page.locator("text=/refill/i").last();
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  async goto() {
    await this.page.goto("/prescriptions");
  }

  async selectActiveTab() {
    await this.activeTab.click();
  }

  async selectAllTab() {
    await this.allTab.click();
  }

  async requestRefillForFirst() {
    await this.refillButtons.first().click();
  }

  async isEmptyStateVisible(): Promise<boolean> {
    return this.emptyState.isVisible();
  }
}

export default PrescriptionListPage;
