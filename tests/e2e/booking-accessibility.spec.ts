import { test, expect } from "@playwright/test";
import { LoginPage } from "./pages/LoginPage";
import { AppointmentBookingPage } from "./pages/AppointmentBookingPage";
import { scanPage, formatViolations } from "./shared/a11y.helpers";

const PATIENT = {
  email: "patient1@helixhealthportal.test",
  password: "TestPass123!",
};

test.describe("Booking wizard — accessibility", () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAndWait(PATIENT.email, PATIENT.password);
  });

  test("step 1 (Choose Type) has no critical or serious violations", async ({
    page,
  }) => {
    const bookingPage = new AppointmentBookingPage(page);
    await bookingPage.goto();

    const { critical, serious } = await scanPage(page, "main");

    expect(critical, formatViolations(critical)).toHaveLength(0);
    expect(serious, formatViolations(serious)).toHaveLength(0);
  });

  test("step 2 (Pick Time) has no critical or serious violations", async ({
    page,
  }) => {
    const bookingPage = new AppointmentBookingPage(page);
    await bookingPage.goto();
    await bookingPage.selectAppointmentType("Follow-up");

    const { critical, serious } = await scanPage(page, "main");

    expect(critical, formatViolations(critical)).toHaveLength(0);
    expect(serious, formatViolations(serious)).toHaveLength(0);
  });

  test("step 3 (Confirm) has no critical or serious violations", async ({
    page,
  }) => {
    const bookingPage = new AppointmentBookingPage(page);
    await bookingPage.goto();
    await bookingPage.selectAppointmentType("Follow-up");

    // Pick first available provider and time slot to reach the confirm step
    await page.locator("button[aria-pressed]").first().click();
    await page
      .getByRole("button", { name: /\d{1,2}:\d{2}|\bam\b|\bpm\b/i })
      .first()
      .click();

    const { critical, serious } = await scanPage(page, "main");

    expect(critical, formatViolations(critical)).toHaveLength(0);
    expect(serious, formatViolations(serious)).toHaveLength(0);
  });
});
