import { Page, Locator } from "@playwright/test";

export class AppointmentBookingPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // ── Locators ────────────────────────────────────────────────────────────────

  // Step indicators
  get stepChooseType(): Locator {
    return this.page.getByText("Choose Type");
  }

  get stepPickTime(): Locator {
    return this.page.getByText("Pick Time");
  }

  get stepConfirm(): Locator {
    return this.page.getByText("Confirm");
  }

  // Step 3 — Summary heading
  get summaryHeading(): Locator {
    return this.page.getByRole("heading", { name: "Appointment Summary" });
  }

  // Shared navigation
  get backButton(): Locator {
    return this.page.getByRole("button", { name: /← Back/ });
  }

  get confirmButton(): Locator {
    return this.page.getByRole("button", { name: /confirm appointment/i });
  }

  get bookingError(): Locator {
    return this.page.locator(
      ".text-red-700, [class*='text-red']",
    ).filter({ hasText: /no longer available|conflict/i });
  }

  get notesTextarea(): Locator {
    return this.page.getByPlaceholder(
      "Any additional information for your care team",
    );
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  async goto() {
    await this.page.goto("/appointments/book");
  }

  /** Step 1: Select an appointment type by its visible name */
  async selectAppointmentType(typeName: string) {
    await this.page.getByRole("button", { name: typeName }).click();
  }

  /** Step 2: Select a provider by their visible display name */
  async selectProvider(providerName: string) {
    await this.page.getByText(providerName).click();
  }

  /** Step 2: Set the date (YYYY-MM-DD format) */
  async setDate(dateString: string) {
    await this.page.getByLabel("Date").fill(dateString);
  }

  /** Step 2: Select a time slot by its visible label */
  async selectTimeSlot(slotLabel: string) {
    await this.page.getByText(slotLabel).click();
  }

  /** Step 3: Add optional notes */
  async addNotes(notes: string) {
    await this.notesTextarea.fill(notes);
  }

  /** Step 3: Click "Confirm Appointment" and wait for redirect */
  async confirm() {
    await this.confirmButton.click();
    await this.page.waitForURL(/\/appointments/);
  }

  async goBack() {
    await this.backButton.click();
  }
}
