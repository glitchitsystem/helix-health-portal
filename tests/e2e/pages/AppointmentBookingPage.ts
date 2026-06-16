import { Page } from '@playwright/test';

export class AppointmentBookingPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/appointments/book');
  }

  async selectAppointmentType(name: string): Promise<void> {
    await this.page.getByRole('button', { name, exact: false }).click();
  }
}
